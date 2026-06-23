#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HEIGHT_STATUS (mavlink_height_status_t) → /SonarAltimeterStatus 调试模块。"""

import threading
import time
from typing import Any, Dict, List, Optional

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import SonarAltimeterStatus
from sealien_ctrlcore_web.core.base_module import WebModule

HEIGHT_STATUS_CHANNEL_COUNT = 5
HEIGHT_STATUS_TOPIC = "/SonarAltimeterStatus"
HEIGHT_HARDWARE = "uart3 RS485 · GCRY-S400-FL · NMEA $SDDBT @9600 · 4Hz"


class HeightModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None

    @property
    def module_id(self) -> str:
        return "height"

    @property
    def title(self) -> str:
        return "高度计 GCRY-S400"

    def register(self, node: Node) -> None:
        node.create_subscription(
            SonarAltimeterStatus,
            "/SonarAltimeterStatus",
            self._on_height,
            qos_profile_sensor_data,
        )

    @staticmethod
    def _to_uint16_list(values: List[int]) -> List[int]:
        out: List[int] = []
        for idx in range(HEIGHT_STATUS_CHANNEL_COUNT):
            if idx < len(values):
                out.append(int(values[idx]) & 0xFFFF)
            else:
                out.append(65535)
        return out

    def _on_height(self, msg: SonarAltimeterStatus) -> None:
        snapshot = {
            "status_topic": HEIGHT_STATUS_TOPIC,
            "hardware": HEIGHT_HARDWARE,
            "mcn_topic": "sensor_gcry_altimeter",
            "timestamp_ms": int(msg.timestamp_ms),
            "near_dist": self._to_uint16_list(list(msg.near_dist_cm)),
            "near_stren": self._to_uint16_list(list(msg.near_stren)),
            "far_dist": self._to_uint16_list(list(msg.far_dist_cm)),
            "far_stren": self._to_uint16_list(list(msg.far_stren)),
            "most_dist": self._to_uint16_list(list(msg.most_dist_cm)),
            "most_stren": self._to_uint16_list(list(msg.most_stren)),
            "stamp_sec": float(msg.header.stamp.sec),
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
                    "message": f"waiting for {HEIGHT_STATUS_TOPIC}",
                    "rx_count": 0,
                    "status_topic": HEIGHT_STATUS_TOPIC,
                    "hardware": HEIGHT_HARDWARE,
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
