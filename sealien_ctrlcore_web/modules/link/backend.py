#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MCU 链路心跳模块。"""

import threading
import time
from typing import Any, Dict, Optional

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import HeartbeatStatus
from sealien_ctrlcore_web.core.base_module import WebModule


class LinkModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None

    @property
    def module_id(self) -> str:
        return "link"

    @property
    def title(self) -> str:
        return "MCU 链路"

    def register(self, node: Node) -> None:
        node.create_subscription(
            HeartbeatStatus,
            "/HeartbeatStatus",
            self._on_heartbeat,
            qos_profile_sensor_data,
        )

    def _on_heartbeat(self, msg: HeartbeatStatus) -> None:
        snapshot = {
            "timestamp_ms": int(msg.timestamp_ms),
            "type": int(msg.type),
            "system_status": int(msg.system_status),
            "mavlink_version": int(msg.mavlink_version),
            "stamp_sec": float(msg.header.stamp.sec),
            "stamp_nanosec": int(msg.header.stamp.nanosec),
        }
        with self.lock_:
            self.rx_count_ += 1
            self.last_rx_mono_ = time.monotonic()
            snapshot["rx_count"] = self.rx_count_
            self.latest_ = snapshot

    def get_snapshot(self) -> Dict[str, Any]:
        with self.lock_:
            if self.latest_ is None:
                return {
                    "connected": False,
                    "message": "waiting for /HeartbeatStatus",
                    "rx_count": 0,
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
