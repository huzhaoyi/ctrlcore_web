#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CH9434A 载荷使能 EN1~EN8：/Switch + /obc/switch_cmd。

index 0~7 ↔ EN1~EN8 ↔ MAVLink SWITCH_CMD / SWITCH_STATUS。
"""

import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import SwitchCmd, SwitchStatus
from sealien_ctrlcore_web.core.base_module import WebModule

SWITCH_STATUS_TOPIC = "/Switch"
SWITCH_CMD_TOPIC = "/obc/switch_cmd"
EN_COUNT = 8
EN_GPIO_MAP: List[int] = [13, 11, 10, 9, 8, 6, 4, 2]
PAYLOAD_EN_HARDWARE = "CH9434A SPI1 · GPIO 高有效 · 默认全关"


class PayloadEnModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.cmd_tx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None
        self.cmd_pub_ = None

    @property
    def module_id(self) -> str:
        return "payload_en"

    @property
    def title(self) -> str:
        return "载荷使能 EN1~8"

    def register(self, node: Node) -> None:
        self.cmd_pub_ = node.create_publisher(SwitchCmd, SWITCH_CMD_TOPIC, 10)
        node.create_subscription(
            SwitchStatus,
            SWITCH_STATUS_TOPIC,
            self._on_status,
            qos_profile_sensor_data,
        )

    def _on_status(self, msg: SwitchStatus) -> None:
        states = [int(v) for v in msg.switch_status[:EN_COUNT]]
        while len(states) < EN_COUNT:
            states.append(0)

        snapshot = {
            "status_topic": SWITCH_STATUS_TOPIC,
            "cmd_topic": SWITCH_CMD_TOPIC,
            "mavlink_status_msg": "SWITCH_STATUS (id=9, 10Hz)",
            "mavlink_cmd_msg": "SWITCH_CMD (id=17)",
            "mcn_topic": "ch9434a_gpio_read",
            "hardware": PAYLOAD_EN_HARDWARE,
            "timestamp_ms": int(msg.timestamp_ms),
            "switch_status": states,
            "en_labels": [f"EN{i + 1}" for i in range(EN_COUNT)],
            "en_gpio": list(EN_GPIO_MAP),
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
                    "message": f"waiting for {SWITCH_STATUS_TOPIC}",
                    "rx_count": 0,
                    "cmd_tx_count": self.cmd_tx_count_,
                    "status_topic": SWITCH_STATUS_TOPIC,
                    "cmd_topic": SWITCH_CMD_TOPIC,
                    "hardware": PAYLOAD_EN_HARDWARE,
                    "switch_status": [0] * EN_COUNT,
                    "en_labels": [f"EN{i + 1}" for i in range(EN_COUNT)],
                    "en_gpio": list(EN_GPIO_MAP),
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

    def _publish_cmd(self, index: int, value: int) -> None:
        msg = SwitchCmd()
        msg.index = index
        msg.value = value
        self.cmd_pub_.publish(msg)

    def handle_post(self, action: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if self.cmd_pub_ is None:
            return 503, {"ok": False, "error": "switch publisher not ready"}

        if action == "all_off":
            with self.lock_:
                for index in range(EN_COUNT):
                    self._publish_cmd(index, 0)
                self.cmd_tx_count_ += EN_COUNT
                count = self.cmd_tx_count_
            return 200, {
                "ok": True,
                "action": "all_off",
                "cmd_tx_count": count,
            }

        if action != "cmd":
            return 404, {"ok": False, "error": f"unknown action: {action}"}

        try:
            index = int(body.get("index", -1))
            value = int(body.get("value", -1))
        except (TypeError, ValueError):
            return 400, {"ok": False, "error": "invalid index or value"}

        if index < 0 or index >= EN_COUNT:
            return 400, {"ok": False, "error": f"index must be 0..{EN_COUNT - 1}"}
        if value not in (0, 1):
            return 400, {"ok": False, "error": "value must be 0 or 1"}

        self._publish_cmd(index, value)
        with self.lock_:
            self.cmd_tx_count_ += 1
            count = self.cmd_tx_count_

        return 200, {
            "ok": True,
            "index": index,
            "value": value,
            "label": f"EN{index + 1}",
            "cmd_tx_count": count,
        }
