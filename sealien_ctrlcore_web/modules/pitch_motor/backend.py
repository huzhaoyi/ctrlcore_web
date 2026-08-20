#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BLD005-LR 俯仰电机：/PitchMotorStatus + /obc/pitch_cmd（OBC 透传，限幅在 MCU）。"""

import threading
import time
from typing import Any, Dict, Optional, Tuple

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import PitchMotorCmd, PitchMotorStatus
from sealien_ctrlcore_web.core.base_module import WebModule

PITCH_STATUS_TOPIC = "/PitchMotorStatus"
PITCH_CMD_TOPIC = "/obc/pitch_cmd"

MCU_RPM_MIN = 150
MCU_RPM_MAX = 3000

PITCH_ZERO_MM = 45.0
PITCH_TRAVEL_MAX_MM = 125.0
PITCH_S_MAX_MM = PITCH_TRAVEL_MAX_MM - PITCH_ZERO_MM
PITCH_MM_SCALE = 10.0

RUN_CMD_STOP = 0
RUN_CMD_FWD = 1
RUN_CMD_REV = 2
RUN_CMD_DISPLACE_ZERO = 3

FAULT_LABELS = {
    0: "正常",
    1: "IPM 过热",
    2: "过压",
    3: "IPM 过流",
    4: "过流",
    5: "欠压",
    6: "霍尔",
    7: "堵转",
    8: "多种报警",
}

RUN_LABELS = {
    0: "停止",
    1: "正转",
    2: "反转",
    3: "相对零位位移",
}


class PitchMotorModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.cmd_tx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None
        self.cmd_pub_ = None

    @property
    def module_id(self) -> str:
        return "pitch_motor"

    @property
    def title(self) -> str:
        return "俯仰电机 BLD005"

    def register(self, node: Node) -> None:
        self.cmd_pub_ = node.create_publisher(PitchMotorCmd, PITCH_CMD_TOPIC, 10)
        node.create_subscription(
            PitchMotorStatus,
            PITCH_STATUS_TOPIC,
            self._on_status,
            qos_profile_sensor_data,
        )

    def _on_status(self, msg: PitchMotorStatus) -> None:
        fault = int(msg.fault)
        run_state = int(msg.run_state)
        snapshot = {
            "status_topic": PITCH_STATUS_TOPIC,
            "cmd_topic": PITCH_CMD_TOPIC,
            "mavlink_status_msg": "PITCH_STATUS (id=23, 5Hz)",
            "mavlink_cmd_msg": "PITCH_CMD (id=24)",
            "mcn_topic": "pitch_motor",
            "hardware": "uart4 RS485 · BLD005-LR Modbus RTU 9600",
            "timestamp_ms": int(msg.timestamp_ms),
            "speed_set_rpm": int(msg.speed_set_rpm),
            "speed_actual_rpm": int(msg.speed_actual_rpm),
            "run_state": run_state,
            "run_label": RUN_LABELS.get(run_state, f"未知 {run_state}"),
            "fault": fault,
            "fault_label": FAULT_LABELS.get(fault, f"未知 {fault}"),
            "bus_voltage_v": round(float(msg.bus_voltage_x10) * 0.1, 1),
            "bus_current_a": round(float(msg.bus_current_x100) * 0.01, 2),
            "cpu_temp_c": int(msg.cpu_temp_c),
            "mcu_rpm_limit": [MCU_RPM_MIN, MCU_RPM_MAX],
            "pitch_zero_mm": PITCH_ZERO_MM,
            "pitch_travel_max_mm": PITCH_TRAVEL_MAX_MM,
            "pitch_s_max_mm": PITCH_S_MAX_MM,
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
                    "message": f"waiting for {PITCH_STATUS_TOPIC}",
                    "rx_count": 0,
                    "cmd_tx_count": self.cmd_tx_count_,
                    "status_topic": PITCH_STATUS_TOPIC,
                    "cmd_topic": PITCH_CMD_TOPIC,
                    "hardware": "uart4 RS485 · BLD005-LR",
                    "mcu_rpm_limit": [MCU_RPM_MIN, MCU_RPM_MAX],
                    "pitch_zero_mm": PITCH_ZERO_MM,
                    "pitch_travel_max_mm": PITCH_TRAVEL_MAX_MM,
                    "pitch_s_max_mm": PITCH_S_MAX_MM,
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
        if action != "cmd":
            return 404, {"ok": False, "error": f"unknown action: {action}"}
        if self.cmd_pub_ is None:
            return 503, {"ok": False, "error": "pitch publisher not ready"}

        try:
            run_cmd = int(body.get("run_cmd", 0))
        except (TypeError, ValueError):
            return 400, {"ok": False, "error": "invalid run_cmd"}

        if run_cmd not in (RUN_CMD_STOP, RUN_CMD_FWD, RUN_CMD_REV, RUN_CMD_DISPLACE_ZERO):
            return 400, {"ok": False, "error": "run_cmd must be 0/1/2/3"}

        speed_rpm = MCU_RPM_MIN
        s_mm = None
        target_mm = None

        if run_cmd == RUN_CMD_DISPLACE_ZERO:
            try:
                if "displacement_mm" in body:
                    s_mm = float(body.get("displacement_mm"))
                else:
                    s_mm = float(body.get("speed_rpm", 0)) / PITCH_MM_SCALE
            except (TypeError, ValueError):
                return 400, {"ok": False, "error": "invalid displacement_mm"}

            if s_mm < 0.0:
                s_mm = 0.0
            if s_mm > PITCH_S_MAX_MM:
                s_mm = PITCH_S_MAX_MM
            target_mm = PITCH_ZERO_MM + s_mm
            speed_rpm = int(round(s_mm * PITCH_MM_SCALE))
        else:
            try:
                speed_rpm = int(body.get("speed_rpm", MCU_RPM_MIN))
            except (TypeError, ValueError):
                return 400, {"ok": False, "error": "invalid speed_rpm"}

        msg = PitchMotorCmd()
        msg.speed_rpm = speed_rpm
        msg.run_cmd = run_cmd
        self.cmd_pub_.publish(msg)

        with self.lock_:
            self.cmd_tx_count_ += 1
            count = self.cmd_tx_count_

        resp: Dict[str, Any] = {
            "ok": True,
            "speed_rpm": speed_rpm,
            "run_cmd": run_cmd,
            "run_label": RUN_LABELS.get(run_cmd, str(run_cmd)),
            "cmd_tx_count": count,
            "note": "OBC 透传；零位 45 mm，往前朝 125 mm；软限位始终开启",
        }
        if s_mm is not None:
            resp["displacement_mm"] = round(s_mm, 2)
        if target_mm is not None:
            resp["target_mm"] = round(target_mm, 2)
        return 200, resp
