#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LoRa RX 链路状态：/lora/rx_status。"""

import threading
import time
from typing import Any, Dict, Optional

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import LoraRxStatus
from sealien_ctrlcore_web.core.base_module import WebModule

LORA_STATUS_TOPIC = "/lora/rx_status"
LORA_HARDWARE = "OBC USB-RS232 · E90-DTU LoRa RX · 9600 8N1 · /joy"


class LoraModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None
        self.topic_name_ = LORA_STATUS_TOPIC

    @property
    def module_id(self) -> str:
        return "lora"

    @property
    def title(self) -> str:
        return "LoRa 遥控"

    def register(self, node: Node) -> None:
        self.topic_name_ = str(
            node.declare_parameter("lora_status_topic", LORA_STATUS_TOPIC).value
        )
        node.create_subscription(
            LoraRxStatus,
            self.topic_name_,
            self._on_status,
            qos_profile_sensor_data,
        )

    def _on_status(self, msg: LoraRxStatus) -> None:
        snapshot = {
            "status_topic": self.topic_name_,
            "hardware": LORA_HARDWARE,
            "serial_open": bool(msg.serial_open),
            "link_up": bool(msg.link_up),
            "port": str(msg.port),
            "profile": str(msg.profile),
            "last_seq": int(msg.last_seq),
            "rx_ok_count": int(msg.rx_ok_count),
            "rx_drop_count": int(msg.rx_drop_count),
            "stamp_sec": float(msg.header.stamp.sec),
            "stamp_nanosec": int(msg.header.stamp.nanosec),
        }
        with self.lock_:
            self.rx_count_ += 1
            self.last_rx_mono_ = time.monotonic()
            snapshot["status_rx_count"] = self.rx_count_
            self.latest_ = snapshot

    def get_snapshot(self) -> Dict[str, Any]:
        with self.lock_:
            if self.latest_ is None:
                return {
                    "connected": False,
                    "message": f"waiting for {self.topic_name_}",
                    "status_rx_count": 0,
                    "serial_open": False,
                    "link_up": False,
                    "status_topic": self.topic_name_,
                    "hardware": LORA_HARDWARE,
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
