#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""WIRE_DISPLACEMENT_STATUS → /WireDisplacementStatus 调试模块。"""

import threading
import time
from typing import Any, Dict, List, Optional

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import WireDisplacementStatus
from sealien_ctrlcore_web.core.base_module import WebModule

WIRE_DISPLACEMENT_CHANNEL_COUNT = 2
WIRE_DISPLACEMENT_TOPIC = "/WireDisplacementStatus"
WIRE_HARDWARE = (
    "WPS-250-MK30-P10 ×2 · ADS7128 · 3.3V 激励 / 250mm · WIRE_DISPLACEMENT_STATUS @50Hz"
)


class WireDisplacementModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None

    @property
    def module_id(self) -> str:
        return "wire_displacement"

    @property
    def title(self) -> str:
        return "拉线位移 WPS MK30"

    def register(self, node: Node) -> None:
        node.create_subscription(
            WireDisplacementStatus,
            WIRE_DISPLACEMENT_TOPIC,
            self._on_wire,
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

    def _on_wire(self, msg: WireDisplacementStatus) -> None:
        snapshot = {
            "status_topic": WIRE_DISPLACEMENT_TOPIC,
            "hardware": WIRE_HARDWARE,
            "mcn_topic": "sensor_wire_displacement",
            "mavlink_status_msg": "WIRE_DISPLACEMENT_STATUS (id=27, 50Hz)",
            "timestamp_ms": int(msg.timestamp_ms),
            "displacement_mm": self._to_float_list(
                list(msg.displacement_mm), WIRE_DISPLACEMENT_CHANNEL_COUNT
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
                    "message": f"waiting for {WIRE_DISPLACEMENT_TOPIC}",
                    "rx_count": 0,
                    "status_topic": WIRE_DISPLACEMENT_TOPIC,
                    "hardware": WIRE_HARDWARE,
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
