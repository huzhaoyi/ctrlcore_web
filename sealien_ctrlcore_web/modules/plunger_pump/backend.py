#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""柱塞泵 ×2 ESCON 50/5：/PlungerPumpStatus + /obc/plunger_pump_cmd。

直通语义：下发值即 ESC 占空比%，MCU 钳到 10~90%，<10 视为停泵(=10%)。
"""

import threading
import time
from typing import Any, Dict, Optional, Tuple

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import PlungerPumpCmd, PlungerPumpStatus
from sealien_ctrlcore_web.core.base_module import WebModule

PLUNGER_STATUS_TOPIC = "/PlungerPumpStatus"
PLUNGER_CMD_TOPIC = "/obc/plunger_pump_cmd"
PLUNGER_HARDWARE = "pwm3 PC8/PC9 · ESCON 50/5 ×2 · DigIN1 PWM @1kHz · Studio 常使能"
PLUNGER_DUTY_OBC_MAX = 100
PLUNGER_DUTY_ESC_MIN = 10
PLUNGER_DUTY_ESC_MAX = 90


class PlungerPumpModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.cmd_tx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None
        self.cmd_pub_ = None

    @property
    def module_id(self) -> str:
        return "plunger_pump"

    @property
    def title(self) -> str:
        return "柱塞泵 ESCON"

    def register(self, node: Node) -> None:
        self.cmd_pub_ = node.create_publisher(PlungerPumpCmd, PLUNGER_CMD_TOPIC, 10)
        node.create_subscription(
            PlungerPumpStatus,
            PLUNGER_STATUS_TOPIC,
            self._on_status,
            qos_profile_sensor_data,
        )

    def _on_status(self, msg: PlungerPumpStatus) -> None:
        snapshot = {
            "status_topic": PLUNGER_STATUS_TOPIC,
            "cmd_topic": PLUNGER_CMD_TOPIC,
            "mavlink_status_msg": "PLUNGER_PUMP_STATUS (id=25, 5Hz)",
            "mavlink_cmd_msg": "PLUNGER_PUMP_CMD (id=26)",
            "mcn_topic": "plunger_pump",
            "hardware": PLUNGER_HARDWARE,
            "timestamp_ms": int(msg.timestamp_ms),
            "duty_cmd_ch0": int(msg.duty_cmd_ch0),
            "duty_cmd_ch1": int(msg.duty_cmd_ch1),
            "duty_out_ch0": int(msg.duty_out_ch0),
            "duty_out_ch1": int(msg.duty_out_ch1),
            "esc_duty_range": [PLUNGER_DUTY_ESC_MIN, PLUNGER_DUTY_ESC_MAX],
            "obc_duty_range": [0, PLUNGER_DUTY_OBC_MAX],
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
                    "message": f"waiting for {PLUNGER_STATUS_TOPIC}",
                    "rx_count": 0,
                    "cmd_tx_count": self.cmd_tx_count_,
                    "status_topic": PLUNGER_STATUS_TOPIC,
                    "cmd_topic": PLUNGER_CMD_TOPIC,
                    "hardware": PLUNGER_HARDWARE,
                    "esc_duty_range": [PLUNGER_DUTY_ESC_MIN, PLUNGER_DUTY_ESC_MAX],
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
            return 503, {"ok": False, "error": "plunger publisher not ready"}

        try:
            duty_ch0 = int(body.get("duty_pct_ch0", 0))
            duty_ch1 = int(body.get("duty_pct_ch1", 0))
        except (TypeError, ValueError):
            return 400, {"ok": False, "error": "invalid duty_pct_ch0 or duty_pct_ch1"}

        if duty_ch0 < 0 or duty_ch0 > PLUNGER_DUTY_OBC_MAX:
            return 400, {"ok": False, "error": f"duty_pct_ch0 must be 0..{PLUNGER_DUTY_OBC_MAX}"}
        if duty_ch1 < 0 or duty_ch1 > PLUNGER_DUTY_OBC_MAX:
            return 400, {"ok": False, "error": f"duty_pct_ch1 must be 0..{PLUNGER_DUTY_OBC_MAX}"}

        msg = PlungerPumpCmd()
        msg.duty_pct_ch0 = duty_ch0
        msg.duty_pct_ch1 = duty_ch1
        self.cmd_pub_.publish(msg)

        with self.lock_:
            self.cmd_tx_count_ += 1
            count = self.cmd_tx_count_

        return 200, {
            "ok": True,
            "duty_pct_ch0": duty_ch0,
            "duty_pct_ch1": duty_ch1,
            "cmd_tx_count": count,
            "note": "直通：下发值=ESC 占空比%；MCU 钳到 10~90%，<10 停泵(=10%)",
        }
