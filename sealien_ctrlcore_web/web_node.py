#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CtrlCore 模块化调试 Web ROS 节点。"""

import os

import rclpy
from ament_index_python.packages import get_package_share_directory
from rclpy.node import Node

from sealien_ctrlcore_web.core.registry import ModuleRegistry
from sealien_ctrlcore_web.http_server import CtrlCoreHttpServer


class CtrlCoreWebNode(Node):
    def __init__(self) -> None:
        super().__init__("ctrlcore_web_node")

        self.declare_parameter("web_host", "0.0.0.0")
        self.declare_parameter("web_port", 8081)
        self.declare_parameter("poll_stale_sec", 2.0)
        self.declare_parameter("enabled_modules", ["link", "usr_sat03"])

        self.web_host_ = self.get_parameter("web_host").get_parameter_value().string_value
        self.web_port_ = self.get_parameter("web_port").get_parameter_value().integer_value
        self.stale_sec_ = self.get_parameter("poll_stale_sec").get_parameter_value().double_value
        enabled = self.get_parameter("enabled_modules").get_parameter_value().string_array_value

        if self.stale_sec_ <= 0.0:
            self.stale_sec_ = 2.0

        self.registry_ = ModuleRegistry(list(enabled), self.stale_sec_)
        self.registry_.register_all(self)

        share_dir = get_package_share_directory("sealien_ctrlcore_web")
        self.web_root_ = os.path.join(share_dir, "web")

        self.http_ = CtrlCoreHttpServer(
            self.web_root_,
            self.web_host_,
            self.web_port_,
            self.registry_,
            self.get_logger(),
        )
        self.http_.start()

        self.publish_timer_ = self.create_timer(0.02, self._publish_timer_callback)

        self.get_logger().info(
            f"ctrlcore_web up: http://{self.web_host_}:{self.web_port_} "
            f"modules={list(enabled)}"
        )

    def _publish_timer_callback(self) -> None:
        self.registry_.drain_publish_queues()

    def destroy_node(self) -> None:
        self.http_.stop()
        super().destroy_node()


def main() -> None:
    rclpy.init()
    node = CtrlCoreWebNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
