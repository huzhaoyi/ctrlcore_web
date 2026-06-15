#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""USR-SAT03 卫通调试模块。"""

import queue
import threading
import time
from collections import deque
from typing import Any, Deque, Dict, List, Optional, Tuple

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import (
    UsrSat03Downlink,
    UsrSat03Gnss,
    UsrSat03Uplink,
)
from sealien_ctrlcore_web.core.base_module import WebModule

UPLINK_MAX_LEN = 70
DOWNLINK_HISTORY = 50


def _bytes_to_hex(data: List[int]) -> str:
    return " ".join(f"{int(b):02X}" for b in data)


def _bytes_to_ascii(data: List[int]) -> str:
    chars = []
    for value in data:
        byte_val = int(value) & 0xFF
        if 32 <= byte_val <= 126:
            chars.append(chr(byte_val))
        else:
            chars.append(".")
    return "".join(chars)


class UsrSat03Module(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.gnss_rx_count_ = 0
        self.downlink_rx_count_ = 0
        self.uplink_tx_count_ = 0
        self.last_gnss_mono_: Optional[float] = None
        self.last_downlink_mono_: Optional[float] = None
        self.latest_gnss_: Optional[Dict[str, Any]] = None
        self.latest_downlink_: Optional[Dict[str, Any]] = None
        self.downlink_history_: Deque[Dict[str, Any]] = deque(maxlen=DOWNLINK_HISTORY)
        self.uplink_pub_ = None
        self.uplink_queue_: queue.Queue = queue.Queue()

    def drain_publish_queue(self) -> None:
        """在 ROS 线程中发布 HTTP 线程入队的上行消息。"""
        if self.uplink_pub_ is None:
            return
        while True:
            try:
                payload = self.uplink_queue_.get_nowait()
            except queue.Empty:
                break
            msg = UsrSat03Uplink()
            msg.payload = payload
            self.uplink_pub_.publish(msg)

    @property
    def module_id(self) -> str:
        return "usr_sat03"

    @property
    def title(self) -> str:
        return "天通卫通 USR-SAT03"

    def register(self, node: Node) -> None:
        self.uplink_pub_ = node.create_publisher(UsrSat03Uplink, "/usr_sat03/uplink", 10)
        node.create_subscription(
            UsrSat03Gnss,
            "/usr_sat03/gnss",
            self._on_gnss,
            qos_profile_sensor_data,
        )
        node.create_subscription(
            UsrSat03Downlink,
            "/usr_sat03/downlink",
            self._on_downlink,
            qos_profile_sensor_data,
        )

    def _on_gnss(self, msg: UsrSat03Gnss) -> None:
        snapshot = {
            "timestamp_ms": int(msg.timestamp_ms),
            "valid": int(msg.valid),
            "dev_id": int(msg.dev_id),
            "lon_deg": float(msg.lon_deg),
            "lat_deg": float(msg.lat_deg),
            "stamp_sec": float(msg.header.stamp.sec),
        }
        with self.lock_:
            self.gnss_rx_count_ += 1
            self.last_gnss_mono_ = time.monotonic()
            self.latest_gnss_ = snapshot

    def _on_downlink(self, msg: UsrSat03Downlink) -> None:
        payload = [int(v) & 0xFF for v in msg.payload]
        entry = {
            "stamp_sec": float(msg.header.stamp.sec),
            "payload": payload,
            "hex": _bytes_to_hex(payload),
            "ascii": _bytes_to_ascii(payload),
            "len": len(payload),
        }
        with self.lock_:
            self.downlink_rx_count_ += 1
            self.last_downlink_mono_ = time.monotonic()
            self.latest_downlink_ = entry
            self.downlink_history_.appendleft(entry)

    def get_snapshot(self) -> Dict[str, Any]:
        with self.lock_:
            gnss = dict(self.latest_gnss_) if self.latest_gnss_ is not None else None
            downlink = dict(self.latest_downlink_) if self.latest_downlink_ is not None else None
            history = [dict(item) for item in self.downlink_history_]
            gnss_age = None
            down_age = None
            if self.last_gnss_mono_ is not None:
                gnss_age = round(time.monotonic() - self.last_gnss_mono_, 3)
            if self.last_downlink_mono_ is not None:
                down_age = round(time.monotonic() - self.last_downlink_mono_, 3)

            return {
                "gnss": gnss,
                "downlink": downlink,
                "downlink_history": history,
                "gnss_rx_count": self.gnss_rx_count_,
                "downlink_rx_count": self.downlink_rx_count_,
                "uplink_tx_count": self.uplink_tx_count_,
                "gnss_age_sec": gnss_age,
                "downlink_age_sec": down_age,
            }

    def is_alive(self, now_sec: float, stale_sec: float) -> bool:
        _ = now_sec
        with self.lock_:
            if self.last_gnss_mono_ is None and self.last_downlink_mono_ is None:
                return False
            last_mono = max(
                self.last_gnss_mono_ or 0.0,
                self.last_downlink_mono_ or 0.0,
            )
            return (time.monotonic() - last_mono) <= stale_sec

    def handle_post(self, action: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if action != "uplink":
            return super().handle_post(action, body)

        if self.uplink_pub_ is None:
            return 503, {"ok": False, "error": "uplink publisher not ready"}

        payload: List[int] = []
        if "text" in body:
            text = str(body.get("text", ""))
            payload = [int(b) & 0xFF for b in text.encode("utf-8")]
        elif "payload" in body:
            raw = body.get("payload")
            if not isinstance(raw, list) or len(raw) == 0:
                return 400, {"ok": False, "error": "payload must be non-empty array"}
            payload = [int(v) & 0xFF for v in raw]
        else:
            return 400, {"ok": False, "error": "need text or payload"}

        if len(payload) > UPLINK_MAX_LEN:
            return 400, {
                "ok": False,
                "error": f"payload too long: {len(payload)} (max {UPLINK_MAX_LEN})",
            }

        self.uplink_queue_.put(payload)

        with self.lock_:
            self.uplink_tx_count_ += 1
            tx_count = self.uplink_tx_count_

        return 200, {
            "ok": True,
            "len": len(payload),
            "hex": _bytes_to_hex(payload),
            "uplink_tx_count": tx_count,
        }
