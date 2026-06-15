#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Web 模块抽象基类。"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple

from rclpy.node import Node


class WebModule(ABC):
    """每个调试面板对应一个 WebModule 实现。"""

    @property
    @abstractmethod
    def module_id(self) -> str:
        """模块唯一 ID，与前端 manifest 对齐。"""

    @property
    @abstractmethod
    def title(self) -> str:
        """面板标题。"""

    @abstractmethod
    def register(self, node: Node) -> None:
        """创建 ROS 订阅/发布。"""

    @abstractmethod
    def get_snapshot(self) -> Dict[str, Any]:
        """返回当前模块 JSON 快照。"""

    def handle_post(self, action: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        """处理 POST /api/modules/<id>/<action>。"""
        return 404, {"ok": False, "error": f"unknown action: {action}"}

    def is_alive(self, now_sec: float, stale_sec: float) -> bool:
        """模块数据是否在有效期内。"""
        _ = now_sec
        _ = stale_sec
        return True

    def meta(self) -> Dict[str, Any]:
        return {
            "id": self.module_id,
            "title": self.title,
        }
