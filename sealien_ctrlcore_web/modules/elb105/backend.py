#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ELB105 惯导 SHZR04(3) 调试模块（ROS 话题，非 MAVLink）。"""

import queue
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

import rclpy
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg._elb105_shzr04 import Elb105Shzr04
from sealien_ctrlpilot_msgmanagement.srv import Elb105SendAlignment
from sealien_ctrlcore_web.core.base_module import WebModule

ELB105_HARDWARE = "OBC RS422 USB · ELB105-SHZR04(3) · 921600 · SHZR04 147B"

ALIGNMENT_LABELS = {
    0: "0 待机 (Standby)",
    1: "1 粗对准 (Coarse alignment)",
    2: "2 精对准 (Fine alignment)",
    3: "3 对准完成 (Aligned)",
}

DVL_UPDATE_LABELS = {
    0: "0 未更新 (DVL data not updated)",
    1: "1 已更新 (DVL data updated)",
}

DVL_VALID_BIT_LABELS = {
    0x01: "Bit0 DVL 数据有效",
    0x02: "Bit1 对底高度有效",
}


def _decode_bit_flags(flags: int, bit_map: Dict[int, str], ok_label: str) -> List[str]:
    if flags == 0:
        return [ok_label]
    labels = []
    for bit_val, label in bit_map.items():
        if flags & bit_val:
            labels.append(label)
    return labels or [f"未知标志 0x{flags:02X}"]


def _decode_dvl_valid_flags(flags: int) -> List[str]:
    return _decode_bit_flags(flags, DVL_VALID_BIT_LABELS, "DVL 无效 (无有效位)")


class Elb105Module(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None
        self.topic_name_ = "/elb105/shzr04"
        self.node_: Optional[Node] = None
        self.align_client_ = None
        self.align_queue_: queue.Queue = queue.Queue()
        self.last_align_result_: Optional[Dict[str, Any]] = None

    @property
    def module_id(self) -> str:
        return "elb105"

    @property
    def title(self) -> str:
        return "ELB105 惯导"

    def register(self, node: Node) -> None:
        self.node_ = node
        self.topic_name_ = str(
            node.declare_parameter("elb105_topic", "/elb105/shzr04").value
        )
        node.create_subscription(
            Elb105Shzr04,
            self.topic_name_,
            self._on_shzr04,
            qos_profile_sensor_data,
        )
        self.align_client_ = node.create_client(
            Elb105SendAlignment, "/elb105/send_alignment"
        )

    def drain_service_queue(self) -> None:
        if self.align_client_ is None or self.node_ is None:
            return

        while True:
            try:
                body = self.align_queue_.get_nowait()
            except queue.Empty:
                break

            if not self.align_client_.wait_for_service(timeout_sec=0.5):
                with self.lock_:
                    self.last_align_result_ = {
                        "ok": False,
                        "message": "service /elb105/send_alignment unavailable",
                    }
                continue

            req = Elb105SendAlignment.Request()
            req.latitude_deg = float(body.get("latitude_deg", 22.801124))
            req.longitude_deg = float(body.get("longitude_deg", 113.525280))
            req.altitude_m = float(body.get("altitude_m", 8.0))

            future = self.align_client_.call_async(req)
            rclpy.spin_until_future_complete(self.node_, future, timeout_sec=3.0)

            with self.lock_:
                if future.result() is not None:
                    resp = future.result()
                    self.last_align_result_ = {
                        "ok": bool(resp.success),
                        "message": str(resp.message),
                    }
                else:
                    self.last_align_result_ = {
                        "ok": False,
                        "message": "alignment service call timeout",
                    }

    def handle_post(self, action: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if action == "align":
            self.align_queue_.put(dict(body))
            return 202, {"ok": True, "message": "alignment request queued"}
        return super().handle_post(action, body)

    def _on_shzr04(self, msg: Elb105Shzr04) -> None:
        alignment_status = int(msg.alignment_status)
        dvl_data_updated = int(msg.dvl_data_updated)
        dvl_valid_flags = int(msg.dvl_valid_flags)
        snapshot = {
            "topic": self.topic_name_,
            "hardware": ELB105_HARDWARE,
            "frame_seq": int(msg.frame_seq),
            "imu_time_sec": float(msg.imu_time_sec),
            "alignment_status": alignment_status,
            "alignment_label": ALIGNMENT_LABELS.get(
                alignment_status, f"未知状态 ({alignment_status})"
            ),
            "alignment_ok": alignment_status == 3,
            "gyro_x_radps": float(msg.gyro_x_radps),
            "gyro_y_radps": float(msg.gyro_y_radps),
            "gyro_z_radps": float(msg.gyro_z_radps),
            "accel_x_mps2": float(msg.accel_x_mps2),
            "accel_y_mps2": float(msg.accel_y_mps2),
            "accel_z_mps2": float(msg.accel_z_mps2),
            "pitch_deg": float(msg.pitch_deg),
            "roll_deg": float(msg.roll_deg),
            "heading_deg": float(msg.heading_deg),
            "dvl_bottom_front_mps": float(msg.dvl_bottom_front_mps),
            "dvl_bottom_right_mps": float(msg.dvl_bottom_right_mps),
            "dvl_bottom_down_mps": float(msg.dvl_bottom_down_mps),
            "dvl_water_front_mps": float(msg.dvl_water_front_mps),
            "dvl_water_right_mps": float(msg.dvl_water_right_mps),
            "dvl_water_down_mps": float(msg.dvl_water_down_mps),
            "velocity_north_mps": float(msg.velocity_north_mps),
            "velocity_east_mps": float(msg.velocity_east_mps),
            "velocity_down_mps": float(msg.velocity_down_mps),
            "dvl_data_updated": dvl_data_updated,
            "dvl_data_updated_label": DVL_UPDATE_LABELS.get(
                dvl_data_updated, f"未知 ({dvl_data_updated})"
            ),
            "longitude_deg": float(msg.longitude_deg),
            "latitude_deg": float(msg.latitude_deg),
            "dvl_bottom_height_m": float(msg.dvl_bottom_height_m),
            "imu_temperature_c": float(msg.imu_temperature_c),
            "dvl_speed_scale": float(msg.dvl_speed_scale),
            "dvl_mount_error_deg": float(msg.dvl_mount_error_deg),
            "dvl_valid_flags": dvl_valid_flags,
            "dvl_valid_flags_hex": f"0x{dvl_valid_flags:02X}",
            "dvl_valid_ok": dvl_valid_flags != 0,
            "dvl_valid_labels": _decode_dvl_valid_flags(dvl_valid_flags),
            "stamp_sec": float(msg.header.stamp.sec),
            "stamp_nanosec": int(msg.header.stamp.nanosec),
            "frame_id": str(msg.header.frame_id),
        }
        with self.lock_:
            self.rx_count_ += 1
            self.last_rx_mono_ = time.monotonic()
            snapshot["rx_count"] = self.rx_count_
            if self.last_align_result_ is not None:
                snapshot["last_align"] = dict(self.last_align_result_)
            self.latest_ = snapshot

    def get_snapshot(self) -> Dict[str, Any]:
        with self.lock_:
            if self.latest_ is None:
                data = {
                    "connected": False,
                    "message": f"waiting for {self.topic_name_}",
                    "rx_count": 0,
                    "topic": self.topic_name_,
                    "hardware": ELB105_HARDWARE,
                }
                if self.last_align_result_ is not None:
                    data["last_align"] = dict(self.last_align_result_)
                return data
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
