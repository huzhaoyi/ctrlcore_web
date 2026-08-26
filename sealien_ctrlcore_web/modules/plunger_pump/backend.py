#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""柱塞泵 ×2 ESCON 50/5：/PlungerPumpStatus + /obc/plunger_pump_cmd。

直通语义：下发值即 ESC 占空比%，MCU 钳到 10~90%，<10 视为停泵(=10%)。
单泵调试：POST /run {channel, on}，转=50%、停=0%，另一路保持上次下发。
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
PLUNGER_RPM_MAX = 3240
PLUNGER_RUN_DUTY_PCT = 50
PLUNGER_STOP_DUTY_PCT = 0
PLUNGER_WIRE_CH = 0
PLUNGER_TRAVEL_MAX_MM = 176.29


def plunger_ch0_at_max(displacement_mm: Any) -> bool:
    """CH0 ≥ 176.29 mm 时两路柱塞泵 PWM 禁止；另一侧行程未标定。"""
    try:
        return float(displacement_mm) >= PLUNGER_TRAVEL_MAX_MM
    except (TypeError, ValueError):
        return False


class PlungerPumpModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.cmd_tx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None
        self.cmd_pub_ = None
        self.latched_duty_ = [PLUNGER_STOP_DUTY_PCT, PLUNGER_STOP_DUTY_PCT]
        self.has_latch_ = False

    @property
    def module_id(self) -> str:
        return "plunger_pump"

    @property
    def title(self) -> str:
        return "拉线位移 / 柱塞泵"

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
            "rpm_est_ch0": int(msg.rpm_est_ch0),
            "rpm_est_ch1": int(msg.rpm_est_ch1),
            "duty_cmd_ch0": int(msg.duty_cmd_ch0),
            "duty_cmd_ch1": int(msg.duty_cmd_ch1),
            "duty_out_ch0": int(msg.duty_out_ch0),
            "duty_out_ch1": int(msg.duty_out_ch1),
            "esc_duty_range": [PLUNGER_DUTY_ESC_MIN, PLUNGER_DUTY_ESC_MAX],
            "obc_duty_range": [0, PLUNGER_DUTY_OBC_MAX],
            "rpm_est_range": [0, PLUNGER_RPM_MAX],
            "rpm_note": "估算转速（占空比映射，非编码器）",
            "run_duty_pct": PLUNGER_RUN_DUTY_PCT,
            "stop_duty_pct": PLUNGER_STOP_DUTY_PCT,
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
                    "rpm_est_range": [0, PLUNGER_RPM_MAX],
                    "rpm_note": "估算转速（占空比映射，非编码器）",
                    "run_duty_pct": PLUNGER_RUN_DUTY_PCT,
                    "stop_duty_pct": PLUNGER_STOP_DUTY_PCT,
                    "wire_ch": PLUNGER_WIRE_CH,
                    "travel_max_mm": PLUNGER_TRAVEL_MAX_MM,
                    "latched_duty_ch0": self.latched_duty_[0],
                    "latched_duty_ch1": self.latched_duty_[1],
                }
            data = dict(self.latest_)
            data["connected"] = True
            data["run_duty_pct"] = PLUNGER_RUN_DUTY_PCT
            data["stop_duty_pct"] = PLUNGER_STOP_DUTY_PCT
            data["wire_ch"] = PLUNGER_WIRE_CH
            data["travel_max_mm"] = PLUNGER_TRAVEL_MAX_MM
            data["latched_duty_ch0"] = self.latched_duty_[0]
            data["latched_duty_ch1"] = self.latched_duty_[1]
            if self.last_rx_mono_ is not None:
                data["age_sec"] = round(time.monotonic() - self.last_rx_mono_, 3)
            return data

    def is_alive(self, now_sec: float, stale_sec: float) -> bool:
        _ = now_sec
        with self.lock_:
            if self.last_rx_mono_ is None:
                return False
            return (time.monotonic() - self.last_rx_mono_) <= stale_sec

    def _duty_in_range(self, duty_pct: int) -> bool:
        return 0 <= duty_pct <= PLUNGER_DUTY_OBC_MAX

    def _held_duty(self, channel: int) -> int:
        other = 1 - channel
        if self.has_latch_:
            return self.latched_duty_[other]
        if self.latest_ is not None:
            key = "duty_cmd_ch1" if channel == 0 else "duty_cmd_ch0"
            return int(self.latest_.get(key, PLUNGER_STOP_DUTY_PCT))
        return PLUNGER_STOP_DUTY_PCT

    def _publish_pair(self, duty_ch0: int, duty_ch1: int) -> int:
        msg = PlungerPumpCmd()
        msg.duty_pct_ch0 = duty_ch0
        msg.duty_pct_ch1 = duty_ch1
        self.cmd_pub_.publish(msg)
        with self.lock_:
            self.latched_duty_[0] = duty_ch0
            self.latched_duty_[1] = duty_ch1
            self.has_latch_ = True
            self.cmd_tx_count_ += 1
            return self.cmd_tx_count_

    def handle_post(self, action: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if self.cmd_pub_ is None:
            return 503, {"ok": False, "error": "plunger publisher not ready"}

        if action == "run":
            try:
                channel = int(body.get("channel"))
            except (TypeError, ValueError):
                return 400, {"ok": False, "error": "invalid channel"}
            if channel not in (0, 1):
                return 400, {"ok": False, "error": "channel must be 0 or 1"}

            on_raw = body.get("on")
            if isinstance(on_raw, bool):
                on = on_raw
            elif on_raw in (1, "1", "true", "True"):
                on = True
            elif on_raw in (0, "0", "false", "False"):
                on = False
            else:
                return 400, {"ok": False, "error": "invalid on"}

            with self.lock_:
                held = self._held_duty(channel)
            target = PLUNGER_RUN_DUTY_PCT if on else PLUNGER_STOP_DUTY_PCT
            if channel == 0:
                duty_ch0, duty_ch1 = target, held
            else:
                duty_ch0, duty_ch1 = held, target

            count = self._publish_pair(duty_ch0, duty_ch1)
            return 200, {
                "ok": True,
                "action": "run",
                "channel": channel,
                "on": on,
                "duty_pct_ch0": duty_ch0,
                "duty_pct_ch1": duty_ch1,
                "cmd_tx_count": count,
                "note": (
                    f"泵{channel} {'转' if on else '停'}"
                    f"@{target}% ；另一路保持 {held}%"
                ),
            }

        if action != "cmd":
            return 404, {"ok": False, "error": f"unknown action: {action}"}

        try:
            duty_ch0 = int(body.get("duty_pct_ch0", 0))
            duty_ch1 = int(body.get("duty_pct_ch1", 0))
        except (TypeError, ValueError):
            return 400, {"ok": False, "error": "invalid duty_pct_ch0 or duty_pct_ch1"}

        if not self._duty_in_range(duty_ch0):
            return 400, {"ok": False, "error": f"duty_pct_ch0 must be 0..{PLUNGER_DUTY_OBC_MAX}"}
        if not self._duty_in_range(duty_ch1):
            return 400, {"ok": False, "error": f"duty_pct_ch1 must be 0..{PLUNGER_DUTY_OBC_MAX}"}

        count = self._publish_pair(duty_ch0, duty_ch1)
        return 200, {
            "ok": True,
            "action": "cmd",
            "duty_pct_ch0": duty_ch0,
            "duty_pct_ch1": duty_ch1,
            "cmd_tx_count": count,
            "note": "直通：下发值=ESC 占空比%；MCU 钳到 10~90%，<10 停泵(=10%)",
        }
