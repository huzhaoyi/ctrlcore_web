#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AUV 10Nm 舵机：/GsStatus 展示 + /obc/gs_cmd 下发（网关透传）。"""

import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import GsCmd, GsStatus
from sealien_ctrlcore_web.core.base_module import WebModule

GS_CHANNEL_COUNT = 4
GS_STATUS_TOPIC = "/GsStatus"
GS_CMD_TOPIC = "/obc/gs_cmd"

# MCU 侧机械限幅，Web/OBC 不钳位，仅用于说明
MCU_ANGLE_MIN_DEG = -45.0
MCU_ANGLE_MAX_DEG = 45.0
MCU_SPEED_MIN_DPS = 6.0
MCU_SPEED_RATED_DPS = 20.0
MCU_SPEED_WIRE_MAX_DPS = 255.0
GS_CMD_TYPE_ANGLE = 0
GS_CMD_TYPE_SPEED = 1
GS_CMD_TYPE_STOP = 2
GS_CMD_TYPE_SET_ZERO = 3
GS_HARDWARE_LABEL = "fdcan2 · HYOROCEAN 10Nm · Node 0x01~0x04 @500k"

GS_CHANNEL_META = (
    {
        "hal_name": "servo_0_out",
        "can_node": "0x01",
        "can_tx_id": "0x301",
        "can_rx_id": "0x281",
    },
    {
        "hal_name": "servo_1_out",
        "can_node": "0x02",
        "can_tx_id": "0x302",
        "can_rx_id": "0x282",
    },
    {
        "hal_name": "servo_2_out",
        "can_node": "0x03",
        "can_tx_id": "0x303",
        "can_rx_id": "0x283",
    },
    {
        "hal_name": "servo_3_out",
        "can_node": "0x04",
        "can_tx_id": "0x304",
        "can_rx_id": "0x284",
    },
)

# A0 状态字 data[4:5] bit 定义；与 MCU servo_10nm 报警掩码 0x737F 一致
# 排除 bit15 终端电阻 / bit11 停机 / bit10 保留 / bit7 未收到指令
GS_FAULT_ALARM_MASK = 0x737F

_FAULT_BITS = (
    (15, "120Ω终端电阻使能", False),
    (14, "堵转故障", True),
    (13, "过流故障", True),
    (12, "漏水故障", True),
    (11, "停机指令", False),
    (10, "保留", False),
    (9, "反向超限", True),
    (8, "正向超限", True),
    (7, "未收到指令", False),
    (6, "指令错误", True),
    (5, "电机故障", True),
    (4, "驱动过热", True),
    (3, "旋变错误2", True),
    (2, "旋变错误1", True),
    (1, "HALL错误", True),
    (0, "过欠压", True),
)

# A0 反馈帧字段说明（与 HYOROCEAN 10Nm 协议 / MCU 解析一致）
A0_PROTOCOL = {
    "frame_cmd": "0xA0",
    "byte1_dir": "0x00 正 / 0x01 负（静止）/ 0x80 运行中（无方向，MCU 沿用上次 0/1）",
    "byte2_3_turns": "int16 圈数",
    "byte4_5_fault": "uint16 状态字（res 字段，见故障位表）",
    "byte6_7_angle": "uint16 单圈角 0.01°",
    "note": "运动中 A0 第 2 字节常为 0x80，非故障；res bit15=0x8000 为终端电阻状态，非报警",
}


def _decode_fault_labels(fault: int) -> List[str]:
    fault_u = int(fault) & 0xFFFF
    if fault_u == 0:
        return ["无故障"]

    alarm_part = fault_u & GS_FAULT_ALARM_MASK
    if alarm_part == 0:
        labels: List[str] = ["无故障"]
        for bit, name, is_alarm in _FAULT_BITS:
            if is_alarm:
                continue
            if (fault_u >> bit) & 0x1:
                labels.append(f"状态:{name}")
        return labels

    labels = []
    for bit, name, is_alarm in _FAULT_BITS:
        if not is_alarm:
            continue
        if (fault_u >> bit) & 0x1:
            labels.append(f"报警:{name}")

    status_labels: List[str] = []
    for bit, name, is_alarm in _FAULT_BITS:
        if is_alarm:
            continue
        if (fault_u >> bit) & 0x1:
            status_labels.append(f"状态:{name}")
    labels.extend(status_labels)

    if not labels:
        labels.append(f"未定义位 0x{fault_u:04X}")
    return labels


def _decode_speed_label(speed_dps: float, online: bool) -> str:
    if not online:
        return "—"
    spd = float(speed_dps)
    if spd <= 0.0:
        return "—"
    return f"{spd:.0f} °/s"


def _build_channel_snapshot(
    index: int,
    angle_deg: float,
    forward_speed: float,
    reverse_speed: float,
    res: int,
    online: bool,
) -> Dict[str, Any]:
    meta = GS_CHANNEL_META[index]
    fault = int(res)
    return {
        "index": index,
        "label": f"舵机 {index}",
        "hal_name": meta["hal_name"],
        "can_node": meta["can_node"],
        "can_tx_id": meta["can_tx_id"],
        "can_rx_id": meta["can_rx_id"],
        "online": bool(online),
        "online_label": "在线" if online else "离线",
        "angle_deg": float(angle_deg),
        "forward_speed_feedback": float(forward_speed),
        "reverse_speed_feedback": float(reverse_speed),
        "forward_speed_label": _decode_speed_label(forward_speed, bool(online)),
        "reverse_speed_label": _decode_speed_label(reverse_speed, bool(online)),
        "res": fault,
        "res_hex": f"0x{fault & 0xFFFF:04X}",
        "res_ok": (fault & GS_FAULT_ALARM_MASK) == 0,
        "res_labels": _decode_fault_labels(fault) if online else ["未接入"],
    }


class GsModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.cmd_tx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None
        self.cmd_pub_ = None

    @property
    def module_id(self) -> str:
        return "gs"

    @property
    def title(self) -> str:
        return "10Nm 舵机"

    def register(self, node: Node) -> None:
        self.cmd_pub_ = node.create_publisher(GsCmd, GS_CMD_TOPIC, 10)
        node.create_subscription(
            GsStatus,
            GS_STATUS_TOPIC,
            self._on_gs_status,
            qos_profile_sensor_data,
        )

    def _on_gs_status(self, msg: GsStatus) -> None:
        channels = [
            _build_channel_snapshot(
                i,
                msg.angle_deg[i],
                msg.forward_speed_feedback[i],
                msg.reverse_speed_feedback[i],
                msg.res[i],
                int(msg.step[i]) != 0,
            )
            for i in range(GS_CHANNEL_COUNT)
        ]

        snapshot = {
            "status_topic": GS_STATUS_TOPIC,
            "cmd_topic": GS_CMD_TOPIC,
            "mavlink_status_msg": "GS_STATUS (id=3, 20Hz)",
            "mavlink_cmd_msg": "GS_CMD (id=15, 单次下发)",
            "mcn_topic": "gs_servo",
            "hardware": GS_HARDWARE_LABEL,
            "timestamp_ms": int(msg.timestamp_ms),
            "timestamp_label": "MCU rt_tick_get_millisecond()，状态帧时间戳",
            "angle_deg": [ch["angle_deg"] for ch in channels],
            "forward_speed_feedback": [ch["forward_speed_feedback"] for ch in channels],
            "reverse_speed_feedback": [ch["reverse_speed_feedback"] for ch in channels],
            "online": [ch["online"] for ch in channels],
            "online_count": sum(1 for ch in channels if ch["online"]),
            "channel_count": GS_CHANNEL_COUNT,
            "res": [ch["res"] for ch in channels],
            "channels": channels,
            "mcu_angle_limit_deg": [MCU_ANGLE_MIN_DEG, MCU_ANGLE_MAX_DEG],
            "mcu_speed_min_dps": MCU_SPEED_MIN_DPS,
            "mcu_speed_rated_dps": MCU_SPEED_RATED_DPS,
            "mcu_speed_wire_max_dps": MCU_SPEED_WIRE_MAX_DPS,
            "mcu_speed_limit_dps": [MCU_SPEED_MIN_DPS, MCU_SPEED_RATED_DPS],
            "a0_protocol": A0_PROTOCOL,
            "fault_alarm_mask_hex": f"0x{GS_FAULT_ALARM_MASK:04X}",
            "index_node_map": [
                f"index {i} → Node {GS_CHANNEL_META[i]['can_node']}"
                for i in range(GS_CHANNEL_COUNT)
            ],
            "stamp_sec": float(msg.header.stamp.sec),
            "stamp_nanosec": int(msg.header.stamp.nanosec),
            "frame_id": str(msg.header.frame_id),
        }
        with self.lock_:
            self.rx_count_ += 1
            self.last_rx_mono_ = time.monotonic()
            snapshot["rx_count"] = self.rx_count_
            snapshot["cmd_tx_count"] = self.cmd_tx_count_
            self.latest_ = snapshot

    def get_snapshot(self) -> Dict[str, Any]:
        with self.lock_:
            if self.latest_ is None:
                return {
                    "connected": False,
                    "message": f"waiting for {GS_STATUS_TOPIC}",
                    "rx_count": 0,
                    "cmd_tx_count": self.cmd_tx_count_,
                    "status_topic": GS_STATUS_TOPIC,
                    "cmd_topic": GS_CMD_TOPIC,
                    "hardware": GS_HARDWARE_LABEL,
                    "mcu_angle_limit_deg": [MCU_ANGLE_MIN_DEG, MCU_ANGLE_MAX_DEG],
                    "mcu_speed_min_dps": MCU_SPEED_MIN_DPS,
                    "mcu_speed_rated_dps": MCU_SPEED_RATED_DPS,
                    "mcu_speed_wire_max_dps": MCU_SPEED_WIRE_MAX_DPS,
                    "mcu_speed_limit_dps": [MCU_SPEED_MIN_DPS, MCU_SPEED_RATED_DPS],
                }
            data = dict(self.latest_)
            data["connected"] = True
            if self.last_rx_mono_ is not None:
                data["age_sec"] = round(time.monotonic() - self.last_rx_mono_, 3)
            return data

    def is_alive(self, now_sec: float, stale_sec: float) -> bool:
        _ = now_sec
        with self.lock_:
            if self.last_rx_mono_ is None:
                return False
            return (time.monotonic() - self.last_rx_mono_) <= stale_sec

    def _parse_index(self, body: Dict[str, Any]) -> Tuple[Optional[int], Optional[Tuple[int, Dict[str, Any]]]]:
        if "index" not in body:
            return None, (400, {"ok": False, "error": "need index (0..3)"})

        index = int(body["index"])
        if index < 0 or index >= GS_CHANNEL_COUNT:
            return None, (400, {"ok": False, "error": "index out of range (0..3)"})

        return index, None

    def _publish_gs_cmd(self, msg: GsCmd) -> int:
        self.cmd_pub_.publish(msg)

        with self.lock_:
            self.cmd_tx_count_ += 1
            return self.cmd_tx_count_

    def _handle_simple_cmd(
        self,
        body: Dict[str, Any],
        cmd_type: int,
        action_label: str,
    ) -> Tuple[int, Dict[str, Any]]:
        if self.cmd_pub_ is None:
            return 503, {"ok": False, "error": "gs cmd publisher not ready"}

        index, err = self._parse_index(body)
        if err is not None:
            return err

        msg = GsCmd()
        msg.index = index
        msg.cmd_type = cmd_type

        cmd_tx_count = self._publish_gs_cmd(msg)

        return 200, {
            "ok": True,
            "index": index,
            "cmd_type": cmd_type,
            "cmd_tx_count": cmd_tx_count,
            "note": f"已发布 {GS_CMD_TOPIC}，OBC 透传 GS_CMD {action_label}",
        }

    def _handle_cmd(self, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if self.cmd_pub_ is None:
            return 503, {"ok": False, "error": "gs cmd publisher not ready"}

        index, err = self._parse_index(body)
        if err is not None:
            return err

        cmd_type = int(body.get("cmd_type", GS_CMD_TYPE_ANGLE))
        msg = GsCmd()
        msg.index = index
        msg.cmd_type = cmd_type

        if cmd_type == GS_CMD_TYPE_ANGLE:
            if "angle_deg" not in body:
                return 400, {"ok": False, "error": "need angle_deg"}
            angle_deg = float(body["angle_deg"])
            msg.angle_deg = angle_deg
            note = (
                f"已发布 {GS_CMD_TOPIC}，OBC 透传 GS_CMD 角度；"
                f"MCU 限幅 [{MCU_ANGLE_MIN_DEG}, {MCU_ANGLE_MAX_DEG}] deg"
            )
        elif cmd_type == GS_CMD_TYPE_SPEED:
            if ("forward_speed" not in body) or ("reverse_speed" not in body):
                return 400, {"ok": False, "error": "need forward_speed and reverse_speed"}
            forward_speed = float(body["forward_speed"])
            reverse_speed = float(body["reverse_speed"])
            if (forward_speed < MCU_SPEED_MIN_DPS) or (reverse_speed < MCU_SPEED_MIN_DPS):
                return 400, {
                    "ok": False,
                    "error": f"speed must be >= {MCU_SPEED_MIN_DPS:.0f} deg/s",
                }
            if (forward_speed > MCU_SPEED_WIRE_MAX_DPS) or (reverse_speed > MCU_SPEED_WIRE_MAX_DPS):
                return 400, {
                    "ok": False,
                    "error": f"speed must be <= {MCU_SPEED_WIRE_MAX_DPS:.0f} deg/s (CAN byte)",
                }
            msg.forward_speed = forward_speed
            msg.reverse_speed = reverse_speed
            note = (
                f"已发布 {GS_CMD_TOPIC}，OBC 透传 GS_CMD 转速；"
                f"最低 {MCU_SPEED_MIN_DPS:.0f} °/s，额定 {MCU_SPEED_RATED_DPS:.0f} °/s"
            )
            if (forward_speed > MCU_SPEED_RATED_DPS) or (reverse_speed > MCU_SPEED_RATED_DPS):
                note += "；超过额定转速，请谨慎"
        elif cmd_type == GS_CMD_TYPE_STOP:
            note = f"已发布 {GS_CMD_TOPIC}，OBC 透传 GS_CMD 停止（C2 停机）"
        elif cmd_type == GS_CMD_TYPE_SET_ZERO:
            note = (
                f"已发布 {GS_CMD_TOPIC}，OBC 透传 GS_CMD 设零点（C4 01）；"
                "当前机械位置将写入为零点"
            )
        else:
            return 400, {
                "ok": False,
                "error": "cmd_type must be 0=angle, 1=speed, 2=stop, 3=set_zero",
            }

        cmd_tx_count = self._publish_gs_cmd(msg)

        return 200, {
            "ok": True,
            "index": index,
            "cmd_type": cmd_type,
            "angle_deg": float(msg.angle_deg),
            "forward_speed": float(msg.forward_speed),
            "reverse_speed": float(msg.reverse_speed),
            "cmd_tx_count": cmd_tx_count,
            "note": note,
        }

    def handle_post(self, action: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if action == "cmd":
            return self._handle_cmd(body)
        if action == "stop":
            return self._handle_simple_cmd(body, GS_CMD_TYPE_STOP, "停止")
        if action == "set_zero":
            return self._handle_simple_cmd(body, GS_CMD_TYPE_SET_ZERO, "设零点")
        if action == "cfg":
            return 404, {
                "ok": False,
                "error": "限位/ID/波特率等产线配置走 MCU API，网页不提供",
            }
        return super().handle_post(action, body)
