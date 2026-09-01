#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""controller 运动闭环只读监视：手柄指令 / 状态 / 控制器输出 / 执行反馈。"""

from __future__ import annotations

import math
import threading
import time
from typing import Any, Dict, List, Optional

from nav_msgs.msg import Odometry
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from std_msgs.msg import Float32MultiArray

from sealien_ctrlcore_web.core.base_module import WebModule
from sealien_ctrlpilot_msgmanagement.msg import (
    GsStatus,
    TaskPosCmd,
    ThrusterStatus,
    TwistCmd,
)

TWIST_CMD_TOPIC = "/obc/twist_cmd"
ROV_ODOM_TOPIC = "/msg_adapter/rov_odom"
PID_OUTPUT_TOPIC = "/controller/pid_output_cmd"
GS_OUTPUT_TOPIC = "/controller/gs_cmd_output"
THRUSTER_STATUS_TOPIC = "/ThrusterStatus"
GS_STATUS_TOPIC = "/GsStatus"

PILOT_MODE_NAMES = {
    0: "NONE",
    1: "MANUAL",
    9: "MISSION",
}


def _quat_to_rpy_deg(x: float, y: float, z: float, w: float) -> Dict[str, float]:
    sinr_cosp = 2.0 * (w * x + y * z)
    cosr_cosp = 1.0 - 2.0 * (x * x + y * y)
    roll = math.atan2(sinr_cosp, cosr_cosp)

    sinp = 2.0 * (w * y - z * x)
    if abs(sinp) >= 1.0:
        pitch = math.copysign(math.pi / 2.0, sinp)
    else:
        pitch = math.asin(sinp)

    siny_cosp = 2.0 * (w * z + x * y)
    cosy_cosp = 1.0 - 2.0 * (y * y + z * z)
    yaw = math.atan2(siny_cosp, cosy_cosp)

    rad2deg = 180.0 / math.pi
    return {
        "roll_deg": roll * rad2deg,
        "pitch_deg": pitch * rad2deg,
        "yaw_deg": yaw * rad2deg,
    }


def _age_sec(last_mono: Optional[float]) -> Optional[float]:
    if last_mono is None:
        return None
    return round(time.monotonic() - last_mono, 3)


class ControllerMonitorModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.twist_: Optional[Dict[str, Any]] = None
        self.odom_: Optional[Dict[str, Any]] = None
        self.pid_out_: Optional[Dict[str, Any]] = None
        self.gs_out_: Optional[Dict[str, Any]] = None
        self.thruster_: Optional[Dict[str, Any]] = None
        self.gs_status_: Optional[Dict[str, Any]] = None

        self.twist_rx_ = 0
        self.odom_rx_ = 0
        self.pid_rx_ = 0
        self.gs_out_rx_ = 0
        self.thruster_rx_ = 0
        self.gs_status_rx_ = 0

        self.twist_mono_: Optional[float] = None
        self.odom_mono_: Optional[float] = None
        self.pid_mono_: Optional[float] = None
        self.gs_out_mono_: Optional[float] = None
        self.thruster_mono_: Optional[float] = None
        self.gs_status_mono_: Optional[float] = None

    @property
    def module_id(self) -> str:
        return "controller_monitor"

    @property
    def title(self) -> str:
        return "运动闭环监视 Motion Monitor"

    def register(self, node: Node) -> None:
        node.create_subscription(
            TwistCmd, TWIST_CMD_TOPIC, self._on_twist, qos_profile_sensor_data
        )
        node.create_subscription(
            Odometry, ROV_ODOM_TOPIC, self._on_odom, qos_profile_sensor_data
        )
        node.create_subscription(
            TaskPosCmd, PID_OUTPUT_TOPIC, self._on_pid, qos_profile_sensor_data
        )
        node.create_subscription(
            Float32MultiArray, GS_OUTPUT_TOPIC, self._on_gs_out, qos_profile_sensor_data
        )
        node.create_subscription(
            ThrusterStatus,
            THRUSTER_STATUS_TOPIC,
            self._on_thruster,
            qos_profile_sensor_data,
        )
        node.create_subscription(
            GsStatus, GS_STATUS_TOPIC, self._on_gs_status, qos_profile_sensor_data
        )

    def _on_twist(self, msg: TwistCmd) -> None:
        mode = int(msg.ctrl_mode)
        snapshot = {
            "topic": TWIST_CMD_TOPIC,
            "x": float(msg.x),
            "y": float(msg.y),
            "z": float(msg.z),
            "roll": float(msg.roll),
            "pitch": float(msg.pitch),
            "yaw": float(msg.yaw),
            "lock_status": int(msg.lock_status),
            "ctrl_mode": mode,
            "ctrl_mode_name": PILOT_MODE_NAMES.get(mode, f"UNKNOWN({mode})"),
            "unlocked": int(msg.lock_status) == 0,
        }
        with self.lock_:
            self.twist_rx_ += 1
            self.twist_mono_ = time.monotonic()
            snapshot["rx_count"] = self.twist_rx_
            self.twist_ = snapshot

    def _on_odom(self, msg: Odometry) -> None:
        q = msg.pose.pose.orientation
        rpy = _quat_to_rpy_deg(float(q.x), float(q.y), float(q.z), float(q.w))
        snapshot = {
            "topic": ROV_ODOM_TOPIC,
            "pos_x": float(msg.pose.pose.position.x),
            "pos_y": float(msg.pose.pose.position.y),
            "pos_z": float(msg.pose.pose.position.z),
            "vel_x": float(msg.twist.twist.linear.x),
            "vel_y": float(msg.twist.twist.linear.y),
            "vel_z": float(msg.twist.twist.linear.z),
            "rate_x": float(msg.twist.twist.angular.x),
            "rate_y": float(msg.twist.twist.angular.y),
            "rate_z": float(msg.twist.twist.angular.z),
            **rpy,
        }
        with self.lock_:
            self.odom_rx_ += 1
            self.odom_mono_ = time.monotonic()
            snapshot["rx_count"] = self.odom_rx_
            self.odom_ = snapshot

    def _on_pid(self, msg: TaskPosCmd) -> None:
        snapshot = {
            "topic": PID_OUTPUT_TOPIC,
            "x": float(msg.x),
            "y": float(msg.y),
            "z": float(msg.z),
            "roll": float(msg.roll),
            "pitch": float(msg.pitch),
            "yaw": float(msg.yaw),
        }
        with self.lock_:
            self.pid_rx_ += 1
            self.pid_mono_ = time.monotonic()
            snapshot["rx_count"] = self.pid_rx_
            self.pid_out_ = snapshot

    def _on_gs_out(self, msg: Float32MultiArray) -> None:
        values: List[float] = [float(v) for v in list(msg.data)]
        while len(values) < 4:
            values.append(0.0)
        snapshot = {
            "topic": GS_OUTPUT_TOPIC,
            "angle_deg": values[:4],
        }
        with self.lock_:
            self.gs_out_rx_ += 1
            self.gs_out_mono_ = time.monotonic()
            snapshot["rx_count"] = self.gs_out_rx_
            self.gs_out_ = snapshot

    def _on_thruster(self, msg: ThrusterStatus) -> None:
        speed = list(msg.speed_rpm)
        snapshot = {
            "topic": THRUSTER_STATUS_TOPIC,
            "power_lock": int(msg.power_lock),
            "speed_rpm_0": int(speed[0]) if len(speed) > 0 else 0,
            "timestamp_ms": int(msg.timestamp_ms),
        }
        with self.lock_:
            self.thruster_rx_ += 1
            self.thruster_mono_ = time.monotonic()
            snapshot["rx_count"] = self.thruster_rx_
            self.thruster_ = snapshot

    def _on_gs_status(self, msg: GsStatus) -> None:
        angles = [float(v) for v in list(msg.angle_deg)]
        steps = [int(v) for v in list(msg.step)]
        while len(angles) < 4:
            angles.append(0.0)
        while len(steps) < 4:
            steps.append(0)
        snapshot = {
            "topic": GS_STATUS_TOPIC,
            "angle_deg": angles[:4],
            "step": steps[:4],
            "timestamp_ms": int(msg.timestamp_ms),
        }
        with self.lock_:
            self.gs_status_rx_ += 1
            self.gs_status_mono_ = time.monotonic()
            snapshot["rx_count"] = self.gs_status_rx_
            self.gs_status_ = snapshot

    def get_snapshot(self) -> Dict[str, Any]:
        with self.lock_:
            sources = {
                "twist_cmd": {
                    "connected": self.twist_ is not None,
                    "age_sec": _age_sec(self.twist_mono_),
                    "rx_count": self.twist_rx_,
                    "data": dict(self.twist_) if self.twist_ is not None else None,
                },
                "rov_odom": {
                    "connected": self.odom_ is not None,
                    "age_sec": _age_sec(self.odom_mono_),
                    "rx_count": self.odom_rx_,
                    "data": dict(self.odom_) if self.odom_ is not None else None,
                },
                "pid_output": {
                    "connected": self.pid_out_ is not None,
                    "age_sec": _age_sec(self.pid_mono_),
                    "rx_count": self.pid_rx_,
                    "data": dict(self.pid_out_) if self.pid_out_ is not None else None,
                },
                "gs_output": {
                    "connected": self.gs_out_ is not None,
                    "age_sec": _age_sec(self.gs_out_mono_),
                    "rx_count": self.gs_out_rx_,
                    "data": dict(self.gs_out_) if self.gs_out_ is not None else None,
                },
                "thruster_status": {
                    "connected": self.thruster_ is not None,
                    "age_sec": _age_sec(self.thruster_mono_),
                    "rx_count": self.thruster_rx_,
                    "data": dict(self.thruster_) if self.thruster_ is not None else None,
                },
                "gs_status": {
                    "connected": self.gs_status_ is not None,
                    "age_sec": _age_sec(self.gs_status_mono_),
                    "rx_count": self.gs_status_rx_,
                    "data": dict(self.gs_status_) if self.gs_status_ is not None else None,
                },
            }

            any_connected = any(src["connected"] for src in sources.values())
            return {
                "connected": any_connected,
                "read_only": True,
                "message": (
                    "只读监视：不下发任何运动指令 / read-only, no motion commands"
                    if any_connected
                    else "等待话题数据 / waiting for controller · adapter · actuator topics"
                ),
                "topics": {
                    "twist_cmd": TWIST_CMD_TOPIC,
                    "rov_odom": ROV_ODOM_TOPIC,
                    "pid_output": PID_OUTPUT_TOPIC,
                    "gs_output": GS_OUTPUT_TOPIC,
                    "thruster_status": THRUSTER_STATUS_TOPIC,
                    "gs_status": GS_STATUS_TOPIC,
                },
                "sources": sources,
            }

    def is_alive(self, now_sec: float, stale_sec: float) -> bool:
        _ = now_sec
        with self.lock_:
            monos = [
                self.twist_mono_,
                self.odom_mono_,
                self.pid_mono_,
                self.gs_out_mono_,
                self.thruster_mono_,
                self.gs_status_mono_,
            ]
            fresh = [
                m for m in monos if m is not None and (time.monotonic() - m) <= stale_sec
            ]
            return len(fresh) > 0

    def handle_post(self, action: str, body: Dict[str, Any]):
        _ = body
        return 403, {
            "ok": False,
            "error": f"controller_monitor is read-only; rejected action={action}",
        }
