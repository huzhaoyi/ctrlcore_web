#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DEPTH_STATUS (mavlink_depth_status_t) → /DepthStatus 调试模块。"""

import threading
import time
from typing import Any, Dict, List, Optional

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import DepthStatus
from sealien_ctrlcore_web.core.base_module import WebModule

DEPTH_STATUS_CHANNEL_COUNT = 4
DEPTH_STATUS_TOPIC = "/DepthStatus"
DEPTH_HARDWARE = (
    "Keller 21Y · ADS7128 ADC dev2 ch1 · 0–10V / 0–250 bar · DEPTH_STATUS @50Hz"
)


class DepthModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None

    @property
    def module_id(self) -> str:
        return "depth"

    @property
    def title(self) -> str:
        return "深度计 Keller 21Y"

    def register(self, node: Node) -> None:
        node.create_subscription(
            DepthStatus,
            DEPTH_STATUS_TOPIC,
            self._on_depth,
            qos_profile_sensor_data,
        )

    @staticmethod
    def _to_float_list(values: List[float], count: int) -> List[float]:
        out: List[float] = []
        for idx in range(count):
            if idx < len(values):
                out.append(float(values[idx]))
            else:
                out.append(0.0)
        return out

    def _on_depth(self, msg: DepthStatus) -> None:
        snapshot = {
            "status_topic": DEPTH_STATUS_TOPIC,
            "hardware": DEPTH_HARDWARE,
            "mcn_topic": "sensor_keller_depth",
            "mavlink_status_msg": "DEPTH_STATUS (id=7, 50Hz)",
            "timestamp_ms": int(msg.timestamp_ms),
            "depth_m": self._to_float_list(list(msg.depth_m), DEPTH_STATUS_CHANNEL_COUNT),
            "temperature_c": self._to_float_list(
                list(msg.temperature_c), DEPTH_STATUS_CHANNEL_COUNT
            ),
            "stamp_sec": float(msg.header.stamp.sec),
            "stamp_nanosec": int(msg.header.stamp.nanosec),
            "frame_id": str(msg.header.frame_id),
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
                    "message": f"waiting for {DEPTH_STATUS_TOPIC}",
                    "rx_count": 0,
                    "status_topic": DEPTH_STATUS_TOPIC,
                    "hardware": DEPTH_HARDWARE,
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
