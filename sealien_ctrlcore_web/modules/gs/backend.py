#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AUV 10Nm 舵机：/GsStatus 展示 + /obc/gs_cmd 下发（网关透传，角度限幅在 MCU）。"""

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

# MCU 侧机械限幅（servo_config_auv.h），Web/OBC 不钳位，仅用于说明
MCU_ANGLE_MIN_DEG = -45.0
MCU_ANGLE_MAX_DEG = 45.0

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


def _decode_fault_labels(fault: int) -> List[str]:
    fault_u = int(fault) & 0xFFFF
    if fault_u == 0:
        return ["无故障"]
    return [f"故障码 0x{fault_u:04X}（A0 应答 data[4:5]，详见 HYOROCEAN 10Nm 手册）"]


def _decode_step_label(step: int) -> str:
    if step == 0:
        return "0 预留（当前未使用）"
    return f"{step} 预留字段非零"


def _build_channel_snapshot(
    index: int,
    angle_deg: float,
    step: int,
    res: int,
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
        "angle_deg": float(angle_deg),
        "step": int(step),
        "step_label": _decode_step_label(int(step)),
        "res": fault,
        "res_hex": f"0x{fault & 0xFFFF:04X}",
        "res_ok": fault == 0,
        "res_labels": _decode_fault_labels(fault),
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
                msg.step[i],
                msg.res[i],
            )
            for i in range(GS_CHANNEL_COUNT)
        ]

        snapshot = {
            "status_topic": GS_STATUS_TOPIC,
            "cmd_topic": GS_CMD_TOPIC,
            "mavlink_status_msg": "GS_STATUS (id=3, 20Hz)",
            "mavlink_cmd_msg": "GS_CMD (id=15, 单次下发)",
            "mcn_topic": "gs_servo",
            "hardware": "fdcan1 · HYOROCEAN 10Nm · Node 0x01~0x04 @125k",
            "timestamp_ms": int(msg.timestamp_ms),
            "timestamp_label": "MCU rt_tick_get_millisecond()，状态帧时间戳",
            "angle_deg": [ch["angle_deg"] for ch in channels],
            "step": [ch["step"] for ch in channels],
            "res": [ch["res"] for ch in channels],
            "channels": channels,
            "mcu_angle_limit_deg": [MCU_ANGLE_MIN_DEG, MCU_ANGLE_MAX_DEG],
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
                    "hardware": "fdcan1 · HYOROCEAN 10Nm · Node 0x01~0x04 @125k",
                    "mcu_angle_limit_deg": [MCU_ANGLE_MIN_DEG, MCU_ANGLE_MAX_DEG],
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

    def handle_post(self, action: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if self.cmd_pub_ is None:
            return 503, {"ok": False, "error": "gs publisher not ready"}

        if action != "cmd":
            return super().handle_post(action, body)

        if "index" not in body or "angle_deg" not in body:
            return 400, {"ok": False, "error": "need index (0..3) and angle_deg"}

        index = int(body["index"])
        if index < 0 or index >= GS_CHANNEL_COUNT:
            return 400, {"ok": False, "error": "index out of range (0..3)"}

        angle_deg = float(body["angle_deg"])
        msg = GsCmd()
        msg.index = index
        msg.angle_deg = angle_deg
        self.cmd_pub_.publish(msg)

        with self.lock_:
            self.cmd_tx_count_ += 1
            cmd_tx_count = self.cmd_tx_count_

        return 200, {
            "ok": True,
            "index": index,
            "angle_deg": angle_deg,
            "cmd_tx_count": cmd_tx_count,
            "note": (
                f"已发布 {GS_CMD_TOPIC}，OBC 网关透传 MAVLink GS_CMD；"
                f"MCU 限幅 [{MCU_ANGLE_MIN_DEG}, {MCU_ANGLE_MAX_DEG}] deg"
            ),
        }
