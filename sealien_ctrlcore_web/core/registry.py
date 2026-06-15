#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Web 模块注册表。"""

from typing import Any, Dict, List, Optional, Tuple

from rclpy.node import Node

from sealien_ctrlcore_web.core.base_module import WebModule
from sealien_ctrlcore_web.modules.link.backend import LinkModule
from sealien_ctrlcore_web.modules.usr_sat03.backend import UsrSat03Module

_MODULE_CLASSES = {
    "link": LinkModule,
    "usr_sat03": UsrSat03Module,
}


class ModuleRegistry:
    def __init__(self, enabled_ids: List[str], stale_sec: float) -> None:
        self.stale_sec_ = stale_sec
        self.modules_: List[WebModule] = []
        for module_id in enabled_ids:
            cls = _MODULE_CLASSES.get(module_id)
            if cls is None:
                raise ValueError(f"unknown web module: {module_id}")
            self.modules_.append(cls())

    def register_all(self, node: Node) -> None:
        for module in self.modules_:
            module.register(node)

    def get_meta(self) -> List[Dict[str, Any]]:
        return [module.meta() for module in self.modules_]

    def get_snapshot(self, now_sec: float) -> Dict[str, Any]:
        snapshot: Dict[str, Any] = {}
        for module in self.modules_:
            data = module.get_snapshot()
            data["alive"] = module.is_alive(now_sec, self.stale_sec_)
            snapshot[module.module_id] = data
        return snapshot

    def find_module(self, module_id: str) -> Optional[WebModule]:
        for module in self.modules_:
            if module.module_id == module_id:
                return module
        return None

    def handle_post(
        self, module_id: str, action: str, body: Dict[str, Any]
    ) -> Tuple[int, Dict[str, Any]]:
        module = self.find_module(module_id)
        if module is None:
            return 404, {"ok": False, "error": f"module not enabled: {module_id}"}
        return module.handle_post(action, body)

    def drain_publish_queues(self) -> None:
        for module in self.modules_:
            if hasattr(module, "drain_publish_queue"):
                module.drain_publish_queue()
