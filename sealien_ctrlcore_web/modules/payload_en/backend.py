#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AUV GPIO×16：TCA9535 DEV1 · /Switch + /obc/switch_cmd。

index 0~7  ↔ DEV1 Port0 PIN0~7（24V）
index 8~15 ↔ DEV1 Port1 PIN0~7（3.3V）
index 2 抛载；index 3+4 并联声呐 24V（同开同关）。
"""

import queue
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from rclpy.node import Node
from rclpy.qos import QoSHistoryPolicy, QoSProfile, QoSReliabilityPolicy

from sealien_ctrlpilot_msgmanagement.msg import SwitchCmd, SwitchStatus
from sealien_ctrlcore_web.core.base_module import WebModule

SWITCH_STATUS_TOPIC = "/Switch"
SWITCH_CMD_TOPIC = "/obc/switch_cmd"
# 与 mavlink_bridge publisher(..., 10) 对齐
SWITCH_QOS = QoSProfile(
    reliability=QoSReliabilityPolicy.RELIABLE,
    history=QoSHistoryPolicy.KEEP_LAST,
    depth=10,
)
VALVE_COUNT = 16
JETTISON_INDEX = 2
SONAR_INDEX_A = 3
SONAR_INDEX_B = 4
VALVE_LABELS: List[str] = [
    "GPIO0(阀1高压)",
    "GPIO1(阀2低压)",
    "GPIO2(抛载)",
    "GPIO3(声呐24V·并)",
    "GPIO4(声呐24V·并)",
    "GPIO5(24V)",
    "GPIO6(24V)",
    "GPIO7(24V)",
    "GPIO8(3.3V)",
    "GPIO9(3.3V)",
    "GPIO10(3.3V)",
    "GPIO11(3.3V)",
    "GPIO12(3.3V)",
    "GPIO13(3.3V)",
    "GPIO14(3.3V)",
    "GPIO15(3.3V)",
]
VALVE_GPIO_HINTS: List[str] = [
    "DEV1 P0 PIN0 (24V)",
    "DEV1 P0 PIN1 (24V)",
    "DEV1 P0 PIN2 (24V · 抛载，拉高即丢，慎重)",
    "DEV1 P0 PIN3 (24V · 声呐并联 A，与 GPIO4 同开同关)",
    "DEV1 P0 PIN4 (24V · 声呐并联 B，与 GPIO3 同开同关)",
    "DEV1 P0 PIN5 (24V)",
    "DEV1 P0 PIN6 (24V)",
    "DEV1 P0 PIN7 (24V)",
    "DEV1 P1 PIN0 (3.3V)",
    "DEV1 P1 PIN1 (3.3V)",
    "DEV1 P1 PIN2 (3.3V)",
    "DEV1 P1 PIN3 (3.3V)",
    "DEV1 P1 PIN4 (3.3V)",
    "DEV1 P1 PIN5 (3.3V)",
    "DEV1 P1 PIN6 (3.3V)",
    "DEV1 P1 PIN7 (3.3V)",
]
PAYLOAD_EN_HARDWARE = (
    "TCA9535 软件I2C · DEV1 P0×8 24V + P1×8 3.3V · 高有效 · 默认全关"
)


class PayloadEnModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.cmd_tx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None
        self.cmd_pub_ = None
        self.cmd_queue_: queue.Queue = queue.Queue()

    @property
    def module_id(self) -> str:
        return "payload_en"

    @property
    def title(self) -> str:
        return "GPIO×16"

    def register(self, node: Node) -> None:
        self.cmd_pub_ = node.create_publisher(SwitchCmd, SWITCH_CMD_TOPIC, 10)
        node.create_subscription(
            SwitchStatus,
            SWITCH_STATUS_TOPIC,
            self._on_status,
            SWITCH_QOS,
        )

    def drain_publish_queue(self) -> None:
        """在 ROS 线程发布 HTTP 线程入队的 SWITCH_CMD，避免跨线程 publish 偶发丢令。"""
        if self.cmd_pub_ is None:
            return

        while True:
            try:
                job = self.cmd_queue_.get_nowait()
            except queue.Empty:
                break
            msg = SwitchCmd()
            msg.index = int(job["index"])
            msg.value = int(job["value"])
            self.cmd_pub_.publish(msg)

    def _on_status(self, msg: SwitchStatus) -> None:
        states = [int(v) for v in msg.switch_status[:VALVE_COUNT]]
        while len(states) < VALVE_COUNT:
            states.append(0)

        snapshot = {
            "status_topic": SWITCH_STATUS_TOPIC,
            "cmd_topic": SWITCH_CMD_TOPIC,
            "mavlink_status_msg": "SWITCH_STATUS (id=9, 10Hz, 16ch)",
            "mavlink_cmd_msg": "SWITCH_CMD (id=17, index 0..15)",
            "mcn_topic": "i2c_ctrl_gpio_result",
            "hardware": PAYLOAD_EN_HARDWARE,
            "timestamp_ms": int(msg.timestamp_ms),
            "switch_status": states,
            "valve_labels": list(VALVE_LABELS),
            "valve_gpio_hints": list(VALVE_GPIO_HINTS),
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
                    "switch_status": [0] * VALVE_COUNT,
                    "valve_labels": list(VALVE_LABELS),
                    "valve_gpio_hints": list(VALVE_GPIO_HINTS),
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

    def _enqueue_cmd(self, index: int, value: int) -> None:
        self.cmd_queue_.put({"index": int(index), "value": int(value)})

    def handle_post(self, action: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if self.cmd_pub_ is None:
            return 503, {"ok": False, "error": "switch publisher not ready"}

        if action == "all_off":
            with self.lock_:
                for index in range(VALVE_COUNT):
                    self._enqueue_cmd(index, 0)
                self.cmd_tx_count_ += VALVE_COUNT
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

        if index < 0 or index >= VALVE_COUNT:
            return 400, {"ok": False, "error": f"index must be 0..{VALVE_COUNT - 1}"}
        if value not in (0, 1):
            return 400, {"ok": False, "error": "value must be 0 or 1"}

        targets = [index]
        if index in (SONAR_INDEX_A, SONAR_INDEX_B):
            targets = [SONAR_INDEX_A, SONAR_INDEX_B]

        for target in targets:
            self._enqueue_cmd(target, value)

        with self.lock_:
            self.cmd_tx_count_ += len(targets)
            count = self.cmd_tx_count_

        return 200, {
            "ok": True,
            "index": index,
            "paired_index": targets,
            "value": value,
            "label": VALVE_LABELS[index],
            "cmd_tx_count": count,
        }
