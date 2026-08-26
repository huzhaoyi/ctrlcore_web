#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ELB105 惯导 SHZR04(3) 调试模块（ROS 话题，非 MAVLink）。"""

import queue
import threading
import time
from typing import Any, Dict, Optional, Tuple

from rclpy.node import Node
from rclpy.qos import QoSHistoryPolicy, QoSProfile, QoSReliabilityPolicy

from sealien_ctrlpilot_msgmanagement.msg._elb105_shzr04 import Elb105Shzr04
from sealien_ctrlpilot_msgmanagement.srv import Elb105SendAlignment
from sealien_ctrlcore_web.core.base_module import WebModule
from sealien_ctrlcore_web.modules.elb105.alignment_timer import AlignmentTimer
from sealien_ctrlcore_web.modules.elb105.dvl_update_latch import DvlUpdateLatch

ELB105_HARDWARE = (
    "OBC RS422 USB · ELB105-SHZR04(3) · 460800 · SHZR04 147B @50Hz · reliable"
)
# 与驱动 KeepLast(1) + reliable 对齐；best_effort 在部分 DDS 下会收不到数据。
ELB105_QOS = QoSProfile(
    reliability=QoSReliabilityPolicy.RELIABLE,
    history=QoSHistoryPolicy.KEEP_LAST,
    depth=1,
)
ALIGNMENT_SERVICE_TIMEOUT_SEC = 3.0

ALIGNMENT_LABELS = {
    0: "0 待机 (Standby)",
    1: "1 粗对准 (Coarse alignment)",
    2: "2 精对准 (Fine alignment)",
    3: "3 对准完成 (Aligned)",
}

DVL_UPDATE_LABELS = {
    0: "0 本帧未更新",
    1: "1 本帧已更新",
}

DVL_MODE_LABELS = {
    0: "0 无效",
    1: "1 对底",
    7: "7 对流",
}


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
        self.align_pending_lock_ = threading.Lock()
        self.align_pending_: Dict[Any, float] = {}
        self.last_align_result_: Optional[Dict[str, Any]] = None
        self.alignment_timer_ = AlignmentTimer(duration_sec=900.0)
        self.dvl_update_latch_ = DvlUpdateLatch(window_sec=1.5)

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
            ELB105_QOS,
        )
        self.align_client_ = node.create_client(
            Elb105SendAlignment, "/elb105/send_alignment"
        )

    def drain_service_queue(self) -> None:
        if self.align_client_ is None or self.node_ is None:
            return

        now_mono = time.monotonic()
        with self.align_pending_lock_:
            expired_futures = [
                future
                for future, started_mono in self.align_pending_.items()
                if now_mono - started_mono >= ALIGNMENT_SERVICE_TIMEOUT_SEC
            ]
            for future in expired_futures:
                self.align_pending_.pop(future, None)

        for future in expired_futures:
            self.align_client_.remove_pending_request(future)
            future.cancel()
            with self.lock_:
                self.last_align_result_ = {
                    "ok": False,
                    "message": "alignment service call timeout",
                }

        while True:
            try:
                body = self.align_queue_.get_nowait()
            except queue.Empty:
                return

            if not self.align_client_.wait_for_service(timeout_sec=0.0):
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
            with self.align_pending_lock_:
                self.align_pending_[future] = time.monotonic()
            future.add_done_callback(self._on_alignment_done)

    def _on_alignment_done(self, future: Any) -> None:
        with self.align_pending_lock_:
            started_mono = self.align_pending_.pop(future, None)
        if started_mono is None:
            return

        try:
            response = future.result()
            result = {
                "ok": bool(response.success),
                "message": str(response.message),
            }
        except Exception as exc:
            result = {
                "ok": False,
                "message": f"alignment service call failed: {exc}",
            }
            if self.node_ is not None:
                self.node_.get_logger().error(
                    f"ELB105 alignment service response failed: {exc}"
                )

        with self.lock_:
            self.last_align_result_ = result

    def handle_post(self, action: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if action == "align":
            self.align_queue_.put(dict(body))
            return 202, {"ok": True, "message": "alignment request queued"}
        return super().handle_post(action, body)

    def _on_shzr04(self, msg: Elb105Shzr04) -> None:
        alignment_status = int(msg.alignment_status)
        dvl_data_updated = int(msg.dvl_data_updated)
        dvl_valid_flags = int(msg.dvl_valid_flags)
        now_mono = time.monotonic()
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
            "gyro_x_degps": float(msg.gyro_x_degps),
            "gyro_y_degps": float(msg.gyro_y_degps),
            "gyro_z_degps": float(msg.gyro_z_degps),
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
            "dvl_valid_ok": dvl_valid_flags in (1, 7),
            "dvl_mode_label": DVL_MODE_LABELS.get(
                dvl_valid_flags, f"未知 ({dvl_valid_flags})"
            ),
            "stamp_sec": float(msg.header.stamp.sec),
            "stamp_nanosec": int(msg.header.stamp.nanosec),
            "frame_id": str(msg.header.frame_id),
        }
        with self.lock_:
            self.rx_count_ += 1
            self.alignment_timer_.update(alignment_status, now_mono)
            self.dvl_update_latch_.update(dvl_data_updated, now_mono)
            snapshot.update(
                self.alignment_timer_.snapshot(alignment_status, now_mono)
            )
            snapshot.update(self.dvl_update_latch_.snapshot(now_mono))
            self.last_rx_mono_ = now_mono
            snapshot["rx_count"] = self.rx_count_
            if self.last_align_result_ is not None:
                snapshot["last_align"] = dict(self.last_align_result_)
            self.latest_ = snapshot

    def get_snapshot(self) -> Dict[str, Any]:
        now_mono = time.monotonic()
        with self.lock_:
            if self.latest_ is None:
                data = {
                    "connected": False,
                    "message": f"waiting for {self.topic_name_}",
                    "rx_count": 0,
                    "topic": self.topic_name_,
                    "hardware": ELB105_HARDWARE,
                }
                data.update(self.dvl_update_latch_.snapshot(now_mono))
                if self.last_align_result_ is not None:
                    data["last_align"] = dict(self.last_align_result_)
                return data
            data = dict(self.latest_)
            data["connected"] = True
            if self.last_rx_mono_ is not None:
                data["age_sec"] = round(now_mono - self.last_rx_mono_, 3)
            alignment_status = int(data.get("alignment_status", -1))
            data.update(
                self.alignment_timer_.snapshot(alignment_status, now_mono)
            )
            data.update(self.dvl_update_latch_.snapshot(now_mono))
            return data

    def is_alive(self, now_sec: float, stale_sec: float) -> bool:
        _ = now_sec
        with self.lock_:
            if self.last_rx_mono_ is None:
                return False
            return (time.monotonic() - self.last_rx_mono_) <= stale_sec
