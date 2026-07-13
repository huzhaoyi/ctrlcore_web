#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""M1 天通卫通调试模块。"""

import queue
import threading
import time
from collections import deque
from typing import Any, Deque, Dict, List, Optional, Tuple

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import (
    M1CallCmd,
    M1Downlink,
    M1Incoming,
    M1LinkState,
    M1Status,
    M1Uplink,
)
from sealien_ctrlcore_web.core.base_module import WebModule

UPLINK_MAX_LEN = 70
DOWNLINK_HISTORY = 50
STATUS_TOPIC = "/m1/status"
DOWNLINK_TOPIC = "/m1/downlink"
INCOMING_TOPIC = "/m1/incoming"
UPLINK_TOPIC = "/m1/uplink"
CALL_CMD_TOPIC = "/m1/call_cmd"
LINK_STATE_TOPIC = "/m1/link_state"
M1_HARDWARE = "uart5 · M1 · 115200 8N1 · MAVLink M1_STATUS + SERIAL_CONTROL (dev=120)"

NET_STATE_NAMES = {
    0: "NONE",
    11: "UNREG",
    12: "REG",
    13: "DIALED",
    14: "SERVER",
}

CALL_STATE_NAMES = {
    0: "NONE",
    1: "IDLE",
    2: "RINGING",
    3: "DIALING",
    4: "CONNECTED",
    5: "HANGINGUP",
}

LINK_STATE_NAMES = {
    0: "DISCONNECTED",
    1: "CALL_UP",
    2: "LINK_OK",
    3: "LINK_STALE",
}

HB_AGE_NEVER = 0xFFFFFFFF


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


class M1Module(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.status_rx_count_ = 0
        self.downlink_rx_count_ = 0
        self.incoming_rx_count_ = 0
        self.uplink_tx_count_ = 0
        self.call_cmd_tx_count_ = 0
        self.last_status_mono_: Optional[float] = None
        self.last_downlink_mono_: Optional[float] = None
        self.last_incoming_mono_: Optional[float] = None
        self.last_link_state_mono_: Optional[float] = None
        self.latest_status_: Optional[Dict[str, Any]] = None
        self.latest_downlink_: Optional[Dict[str, Any]] = None
        self.latest_incoming_: Optional[Dict[str, Any]] = None
        self.latest_link_state_: Optional[Dict[str, Any]] = None
        self.downlink_history_: Deque[Dict[str, Any]] = deque(maxlen=DOWNLINK_HISTORY)
        self.incoming_history_: Deque[Dict[str, Any]] = deque(maxlen=20)
        self.uplink_pub_ = None
        self.call_cmd_pub_ = None
        self.uplink_queue_: queue.Queue = queue.Queue()
        self.call_cmd_queue_: queue.Queue = queue.Queue()

    def drain_publish_queue(self) -> None:
        """在 ROS 线程中发布 HTTP 线程入队的上行/呼叫消息。"""
        if self.uplink_pub_ is not None:
            while True:
                try:
                    payload = self.uplink_queue_.get_nowait()
                except queue.Empty:
                    break
                msg = M1Uplink()
                msg.payload = payload
                self.uplink_pub_.publish(msg)

        if self.call_cmd_pub_ is not None:
            while True:
                try:
                    call_cmd = self.call_cmd_queue_.get_nowait()
                except queue.Empty:
                    break
                msg = M1CallCmd()
                msg.action = int(call_cmd["action"])
                msg.number = str(call_cmd.get("number", ""))
                self.call_cmd_pub_.publish(msg)

    @property
    def module_id(self) -> str:
        return "m1"

    @property
    def title(self) -> str:
        return "天通卫通 M1"

    def register(self, node: Node) -> None:
        self.uplink_pub_ = node.create_publisher(M1Uplink, UPLINK_TOPIC, 10)
        self.call_cmd_pub_ = node.create_publisher(M1CallCmd, CALL_CMD_TOPIC, 10)
        node.create_subscription(
            M1Status,
            STATUS_TOPIC,
            self._on_status,
            qos_profile_sensor_data,
        )
        node.create_subscription(
            M1Downlink,
            DOWNLINK_TOPIC,
            self._on_downlink,
            qos_profile_sensor_data,
        )
        node.create_subscription(
            M1Incoming,
            INCOMING_TOPIC,
            self._on_incoming,
            qos_profile_sensor_data,
        )
        node.create_subscription(
            M1LinkState,
            LINK_STATE_TOPIC,
            self._on_link_state,
            qos_profile_sensor_data,
        )

    def _on_link_state(self, msg: M1LinkState) -> None:
        age_ms = int(msg.last_peer_hb_age_ms)
        if age_ms == HB_AGE_NEVER:
            peer_hb_age_display = None
        else:
            peer_hb_age_display = age_ms

        snapshot = {
            "call_connected": bool(msg.call_connected),
            "link_ok": bool(msg.link_ok),
            "link_state": int(msg.link_state),
            "link_state_name": LINK_STATE_NAMES.get(int(msg.link_state), str(msg.link_state)),
            "last_peer_hb_age_ms": peer_hb_age_display,
            "hb_tx_count": int(msg.hb_tx_count),
            "hb_rx_count": int(msg.hb_rx_count),
            "hb_seq": int(msg.hb_seq),
            "stamp_sec": float(msg.header.stamp.sec),
        }
        with self.lock_:
            self.last_link_state_mono_ = time.monotonic()
            self.latest_link_state_ = snapshot

    def _on_status(self, msg: M1Status) -> None:
        snapshot = {
            "timestamp_ms": int(msg.timestamp_ms),
            "gnss_valid": int(msg.gnss_valid),
            "lon_deg": float(msg.lon_deg),
            "lat_deg": float(msg.lat_deg),
            "connected_ms": int(msg.connected_ms),
            "csq": int(msg.csq),
            "net_state": int(msg.net_state),
            "net_state_name": NET_STATE_NAMES.get(int(msg.net_state), str(msg.net_state)),
            "call_state": int(msg.call_state),
            "call_state_name": CALL_STATE_NAMES.get(int(msg.call_state), str(msg.call_state)),
            "tx_busy": int(msg.tx_busy),
            "buf_percent": int(msg.buf_percent),
            "dial_fail_cnt": int(msg.dial_fail_cnt),
            "hangup_fail_cnt": int(msg.hangup_fail_cnt),
            "stamp_sec": float(msg.header.stamp.sec),
        }
        with self.lock_:
            self.status_rx_count_ += 1
            self.last_status_mono_ = time.monotonic()
            self.latest_status_ = snapshot

    def _on_downlink(self, msg: M1Downlink) -> None:
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

    def _on_incoming(self, msg: M1Incoming) -> None:
        entry = {
            "stamp_sec": float(msg.header.stamp.sec),
            "number": str(msg.number),
        }
        with self.lock_:
            self.incoming_rx_count_ += 1
            self.last_incoming_mono_ = time.monotonic()
            self.latest_incoming_ = entry
            self.incoming_history_.appendleft(entry)

    def get_snapshot(self) -> Dict[str, Any]:
        with self.lock_:
            status = dict(self.latest_status_) if self.latest_status_ is not None else None
            downlink = dict(self.latest_downlink_) if self.latest_downlink_ is not None else None
            incoming = dict(self.latest_incoming_) if self.latest_incoming_ is not None else None
            link_state = dict(self.latest_link_state_) if self.latest_link_state_ is not None else None
            history = [dict(item) for item in self.downlink_history_]
            incoming_history = [dict(item) for item in self.incoming_history_]
            status_age = None
            down_age = None
            link_age = None
            if self.last_status_mono_ is not None:
                status_age = round(time.monotonic() - self.last_status_mono_, 3)
            if self.last_downlink_mono_ is not None:
                down_age = round(time.monotonic() - self.last_downlink_mono_, 3)
            if self.last_link_state_mono_ is not None:
                link_age = round(time.monotonic() - self.last_link_state_mono_, 3)

            return {
                "status_topic": STATUS_TOPIC,
                "downlink_topic": DOWNLINK_TOPIC,
                "incoming_topic": INCOMING_TOPIC,
                "uplink_topic": UPLINK_TOPIC,
                "call_cmd_topic": CALL_CMD_TOPIC,
                "link_state_topic": LINK_STATE_TOPIC,
                "hardware": M1_HARDWARE,
                "mcn_topic": "sensor_m1",
                "auto_answer": True,
                "status": status,
                "downlink": downlink,
                "incoming": incoming,
                "link_state": link_state,
                "downlink_history": history,
                "incoming_history": incoming_history,
                "status_rx_count": self.status_rx_count_,
                "downlink_rx_count": self.downlink_rx_count_,
                "incoming_rx_count": self.incoming_rx_count_,
                "uplink_tx_count": self.uplink_tx_count_,
                "call_cmd_tx_count": self.call_cmd_tx_count_,
                "status_age_sec": status_age,
                "downlink_age_sec": down_age,
                "link_state_age_sec": link_age,
            }

    def is_alive(self, now_sec: float, stale_sec: float) -> bool:
        _ = now_sec
        with self.lock_:
            if self.last_status_mono_ is None and self.last_downlink_mono_ is None:
                return False
            last_mono = max(
                self.last_status_mono_ or 0.0,
                self.last_downlink_mono_ or 0.0,
            )
            return (time.monotonic() - last_mono) <= stale_sec

    def handle_post(self, action: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if action == "uplink":
            return self._handle_uplink(body)
        if action == "call_cmd":
            return self._handle_call_cmd(body)
        return super().handle_post(action, body)

    def _handle_uplink(self, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
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

    def _handle_call_cmd(self, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if self.call_cmd_pub_ is None:
            return 503, {"ok": False, "error": "call_cmd publisher not ready"}

        action = int(body.get("action", 0))
        number = str(body.get("number", ""))

        if action not in (
            M1CallCmd.M1_CALL_ACTION_DIAL,
            M1CallCmd.M1_CALL_ACTION_ANSWER,
            M1CallCmd.M1_CALL_ACTION_HANGUP,
        ):
            return 400, {"ok": False, "error": "invalid action (1=dial 2=answer 3=hangup)"}

        if action == M1CallCmd.M1_CALL_ACTION_DIAL and not number:
            return 400, {"ok": False, "error": "dial requires number"}

        self.call_cmd_queue_.put({"action": action, "number": number})

        with self.lock_:
            self.call_cmd_tx_count_ += 1
            tx_count = self.call_cmd_tx_count_

        return 200, {
            "ok": True,
            "action": action,
            "number": number,
            "call_cmd_tx_count": tx_count,
            "note": "AUV auto-answers incoming calls on MCU side",
        }
