#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TD10A 推进器：/ThrusterStatus 展示 + 模拟 /thruster_command、/obc/thruster_lock 下发。"""

import queue
import threading
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from std_msgs.msg import Bool

from sealien_ctrlpilot_actuator.msg import ThrusterCommand
from sealien_ctrlpilot_msgmanagement.msg import ThrusterStatus
from sealien_ctrlcore_web.core.base_module import WebModule

PWM_NEUTRAL = 1500
PWM_MIN = 1000
PWM_MAX = 2000
PWM_CHANNEL_COUNT = 16
THRUSTER_ACTIVE_COUNT = 1
THRUSTER_ARRAY_SIZE = 12
THRUSTER_STATUS_TOPIC = "/ThrusterStatus"
THRUSTER_CMD_TOPIC = "/thruster_command"
THRUSTER_LOCK_TOPIC = "/obc/thruster_lock"
THRUSTER_HARDWARE = "fdcan2 · TD10A · main_out · Node 0x01 @500k"

THRUSTER0_META = {
    "hal_name": "main_out",
    "can_bus": "fdcan2",
    "can_node": "0x01",
    "can_tx_id": "0x301",
    "can_rx_id": "0x281",
    "driver": "td10a",
}


def _decode_status_label(code: int) -> str:
    if code == 1:
        return "1 在线（QV 查询成功，遥测有效）"
    if code == 0:
        return "0 离线（QV 失败或无应答）"
    return f"{code} 未知状态码"


def _decode_fault_labels(fault: int) -> List[str]:
    fault_u = int(fault) & 0xFF
    if fault_u == 0:
        return ["无故障（EF=0）"]
    return [f"EF 故障字节 0x{fault_u:02X}（TD10A EF 指令，详见手册）"]


def _decode_power_lock(lock: int) -> Dict[str, Any]:
    locked = int(lock) != 0
    return {
        "raw": int(lock),
        "locked": locked,
        "label": "1 上锁（禁止 TC/推力）" if locked else "0 解锁（允许运行）",
    }


def _pwm_to_percent(speed: int) -> float:
    clamped = max(PWM_MIN, min(PWM_MAX, int(speed)))
    return (clamped - PWM_NEUTRAL) * 100.0 / 500.0


def _build_channel_snapshot(
    index: int,
    speed_rpm: int,
    power_w: int,
    temperature_c: int,
    status_code: int,
    error_code: int,
) -> Dict[str, Any]:
    active = index < THRUSTER_ACTIVE_COUNT
    meta = THRUSTER0_META if index == 0 else {}
    return {
        "index": index,
        "active": active,
        "label": f"推进器 {index}" + (" · AUV 主推进" if index == 0 else " · 未使用"),
        "hal_name": meta.get("hal_name", "—"),
        "can_bus": meta.get("can_bus", "—"),
        "can_node": meta.get("can_node", "—"),
        "can_tx_id": meta.get("can_tx_id", "—"),
        "can_rx_id": meta.get("can_rx_id", "—"),
        "speed_rpm": int(speed_rpm),
        "speed_label": f"{int(speed_rpm)} rpm（QV，正/负=转向约定）",
        "power_w": int(power_w),
        "power_label": f"{int(power_w)} W（QC×QP 估算，MAVLink float→ROS int16）",
        "temperature_c": int(temperature_c),
        "temperature_label": f"{int(temperature_c)} °C（QT 查询）",
        "thruster_status_code": int(status_code),
        "status_label": _decode_status_label(int(status_code)),
        "status_ok": int(status_code) == 1,
        "thruster_error_code": int(error_code),
        "fault_hex": f"0x{int(error_code) & 0xFF:02X}",
        "fault_ok": int(error_code) == 0,
        "fault_labels": _decode_fault_labels(int(error_code)),
    }


@dataclass
class _ThrusterCmdJob:
    pwm: list


@dataclass
class _ThrusterLockJob:
    locked: bool


class ThrusterModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.cmd_tx_count_ = 0
        self.lock_tx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None
        self.last_cmd_speed_: int = PWM_NEUTRAL

        self.cmd_pub_ = None
        self.lock_pub_ = None
        self.cmd_queue_: queue.Queue = queue.Queue()
        self.lock_queue_: queue.Queue = queue.Queue()

    @property
    def module_id(self) -> str:
        return "thruster"

    @property
    def title(self) -> str:
        return "TD10A 推进器"

    def register(self, node: Node) -> None:
        self.cmd_pub_ = node.create_publisher(ThrusterCommand, THRUSTER_CMD_TOPIC, 10)
        self.lock_pub_ = node.create_publisher(Bool, THRUSTER_LOCK_TOPIC, 10)
        node.create_subscription(
            ThrusterStatus,
            THRUSTER_STATUS_TOPIC,
            self._on_thruster,
            qos_profile_sensor_data,
        )

    def drain_publish_queue(self) -> None:
        if self.cmd_pub_ is None or self.lock_pub_ is None:
            return

        while True:
            try:
                job = self.cmd_queue_.get_nowait()
            except queue.Empty:
                break
            msg = ThrusterCommand()
            msg.pwm = [int(v) for v in job.pwm]
            msg.thrusts = []
            msg.thruster_unlocked = True
            self.cmd_pub_.publish(msg)

        while True:
            try:
                job = self.lock_queue_.get_nowait()
            except queue.Empty:
                break
            lock_msg = Bool()
            lock_msg.data = bool(job.locked)
            self.lock_pub_.publish(lock_msg)

    @staticmethod
    def _clamp_speed(speed: int) -> int:
        return max(PWM_MIN, min(PWM_MAX, int(speed)))

    @staticmethod
    def _percent_to_speed(percent: float) -> int:
        clamped = max(-100.0, min(100.0, float(percent)))
        speed = PWM_NEUTRAL + int(clamped * 500.0 / 100.0)
        return ThrusterModule._clamp_speed(speed)

    def _build_pwm(self, speed: int) -> list:
        pwm = [PWM_NEUTRAL] * PWM_CHANNEL_COUNT
        pwm[0] = self._clamp_speed(speed)
        return pwm

    def _enqueue_cmd(self, speed: int) -> None:
        clamped = self._clamp_speed(speed)
        self.cmd_queue_.put(_ThrusterCmdJob(pwm=self._build_pwm(clamped)))
        with self.lock_:
            self.last_cmd_speed_ = clamped
            self.cmd_tx_count_ += 1

    def _enqueue_lock(self, locked: bool) -> None:
        self.lock_queue_.put(_ThrusterLockJob(locked=bool(locked)))
        with self.lock_:
            self.lock_tx_count_ += 1

    def _on_thruster(self, msg: ThrusterStatus) -> None:
        channels = [
            _build_channel_snapshot(
                i,
                msg.speed_rpm[i],
                msg.power_w[i],
                msg.temperature_c[i],
                msg.thruster_status_code[i],
                msg.thruster_error_code[i],
            )
            for i in range(THRUSTER_ARRAY_SIZE)
        ]
        power_lock = _decode_power_lock(int(msg.power_lock))

        snapshot = {
            "status_topic": THRUSTER_STATUS_TOPIC,
            "cmd_topic": THRUSTER_CMD_TOPIC,
            "lock_topic": THRUSTER_LOCK_TOPIC,
            "hardware": THRUSTER_HARDWARE,
            "mcn_topic": "thruster",
            "mavlink_status_msg": "THRUSTER_STATUS (id=2, 20Hz)",
            "mavlink_cmd_msg": "THRUSTER_CMD (id=10) · THRUSTER_LOCK (id=11)",
            "active_thruster_count": THRUSTER_ACTIVE_COUNT,
            "timestamp_ms": int(msg.timestamp_ms),
            "timestamp_label": "MCU td10a.state.timestamp_ms",
            "power_lock": power_lock["raw"],
            "power_lock_label": power_lock["label"],
            "power_lock_ok": not power_lock["locked"],
            "speed_rpm": [int(v) for v in msg.speed_rpm],
            "power_w": [int(v) for v in msg.power_w],
            "temperature_c": [int(v) for v in msg.temperature_c],
            "thruster_status_code": [int(v) for v in msg.thruster_status_code],
            "thruster_error_code": [int(v) for v in msg.thruster_error_code],
            "channels": channels,
            "stamp_sec": float(msg.header.stamp.sec),
            "stamp_nanosec": int(msg.header.stamp.nanosec),
            "frame_id": str(msg.header.frame_id),
        }
        with self.lock_:
            self.rx_count_ += 1
            self.last_rx_mono_ = time.monotonic()
            snapshot["rx_count"] = self.rx_count_
            snapshot["cmd_tx_count"] = self.cmd_tx_count_
            snapshot["lock_tx_count"] = self.lock_tx_count_
            snapshot["last_cmd_speed"] = self.last_cmd_speed_
            snapshot["last_cmd_percent"] = round(_pwm_to_percent(self.last_cmd_speed_), 1)
            self.latest_ = snapshot

    def get_snapshot(self) -> Dict[str, Any]:
        with self.lock_:
            if self.latest_ is None:
                return {
                    "connected": False,
                    "message": f"waiting for {THRUSTER_STATUS_TOPIC}",
                    "rx_count": 0,
                    "cmd_tx_count": self.cmd_tx_count_,
                    "lock_tx_count": self.lock_tx_count_,
                    "last_cmd_speed": self.last_cmd_speed_,
                    "last_cmd_percent": round(_pwm_to_percent(self.last_cmd_speed_), 1),
                    "status_topic": THRUSTER_STATUS_TOPIC,
                    "hardware": THRUSTER_HARDWARE,
                    "pwm_range": [PWM_MIN, PWM_NEUTRAL, PWM_MAX],
                }
            data = dict(self.latest_)
            data["connected"] = True
            if self.last_rx_mono_ is not None:
                data["age_sec"] = round(time.monotonic() - self.last_rx_mono_, 3)
            data["pwm_range"] = [PWM_MIN, PWM_NEUTRAL, PWM_MAX]
            return data

    def is_alive(self, now_sec: float, stale_sec: float) -> bool:
        _ = now_sec
        with self.lock_:
            if self.last_rx_mono_ is None:
                return False
            return (time.monotonic() - self.last_rx_mono_) <= stale_sec

    def handle_post(self, action: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if self.cmd_pub_ is None or self.lock_pub_ is None:
            return 503, {"ok": False, "error": "thruster publishers not ready"}

        if action == "cmd":
            speed: Optional[int] = None
            if "speed" in body:
                speed = self._clamp_speed(int(body["speed"]))
            elif "percent" in body:
                speed = self._percent_to_speed(body["percent"])
            else:
                return 400, {"ok": False, "error": "need speed (1000~2000) or percent (-100~100)"}

            self._enqueue_cmd(speed)
            with self.lock_:
                cmd_tx_count = self.cmd_tx_count_
            return 200, {
                "ok": True,
                "speed": speed,
                "percent": round(_pwm_to_percent(speed), 1),
                "pwm0": speed,
                "cmd_tx_count": cmd_tx_count,
                "note": (
                    f"已排队 {THRUSTER_CMD_TOPIC} → MAVLink THRUSTER_CMD；"
                    f"MCU PWM {speed} → TC {_pwm_to_percent(speed):+.0f}%"
                ),
            }

        if action == "neutral":
            self._enqueue_cmd(PWM_NEUTRAL)
            with self.lock_:
                cmd_tx_count = self.cmd_tx_count_
            return 200, {
                "ok": True,
                "speed": PWM_NEUTRAL,
                "percent": 0.0,
                "cmd_tx_count": cmd_tx_count,
            }

        if action == "lock":
            if "lock" not in body:
                return 400, {"ok": False, "error": "need lock (0 or 1)"}
            raw = body["lock"]
            if isinstance(raw, bool):
                locked = raw
            else:
                locked = int(raw) != 0
            self._enqueue_lock(locked)
            with self.lock_:
                lock_tx_count = self.lock_tx_count_
            return 200, {
                "ok": True,
                "lock": 1 if locked else 0,
                "lock_tx_count": lock_tx_count,
            }

        return super().handle_post(action, body)
