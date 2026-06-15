#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HTTP 服务：静态文件 + 模块化 REST API。"""

import json
import mimetypes
import os
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Dict, Optional, Tuple
from urllib.parse import urlparse

from sealien_ctrlcore_web.core.registry import ModuleRegistry


class ReuseAddrHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


SnapshotProvider = Callable[[], Dict[str, Any]]
MetaProvider = Callable[[], list]
PostHandler = Callable[[str, str, Dict[str, Any]], Tuple[int, Dict[str, Any]]]


class CtrlCoreHttpServer:
    def __init__(
        self,
        web_root: str,
        host: str,
        port: int,
        registry: ModuleRegistry,
        logger: Any,
    ) -> None:
        self.web_root_ = web_root
        self.host_ = host
        self.port_ = port
        self.registry_ = registry
        self.logger_ = logger
        self.server_: Optional[ReuseAddrHTTPServer] = None
        self.thread_: Optional[threading.Thread] = None

    def _safe_join(self, url_path: str) -> Optional[str]:
        rel = url_path.lstrip("/")
        if rel == "":
            rel = "index.html"
        candidate = os.path.normpath(os.path.join(self.web_root_, rel))
        root_norm = os.path.normpath(self.web_root_)
        if not candidate.startswith(root_norm):
            return None
        return candidate

    def start(self) -> None:
        registry = self.registry_
        web_root = self.web_root_
        logger = self.logger_
        safe_join = self._safe_join

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, fmt: str, *args: Any) -> None:
                logger.debug((fmt % args) if args else fmt)

            def _send_json(self, code: int, payload: Dict[str, Any]) -> None:
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def _send_file(self, path: str) -> None:
                if not os.path.isfile(path):
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return
                content_type, _ = mimetypes.guess_type(path)
                if content_type is None:
                    content_type = "application/octet-stream"
                if path.endswith(".js"):
                    content_type = "application/javascript; charset=utf-8"
                elif path.endswith(".css"):
                    content_type = "text/css; charset=utf-8"
                elif path.endswith(".html"):
                    content_type = "text/html; charset=utf-8"
                elif path.endswith(".json"):
                    content_type = "application/json; charset=utf-8"
                with open(path, "rb") as fp:
                    data = fp.read()
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _read_json_body(self) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                try:
                    body = json.loads(raw.decode("utf-8"))
                except json.JSONDecodeError:
                    return None, "invalid json"
                if not isinstance(body, dict):
                    return None, "body must be object"
                return body, None

            def do_GET(self) -> None:
                parsed = urlparse(self.path)
                if parsed.path == "/api/meta":
                    self._send_json(
                        HTTPStatus.OK,
                        {
                            "ok": True,
                            "modules": registry.get_meta(),
                            "server_time": time.time(),
                        },
                    )
                    return
                if parsed.path == "/api/snapshot":
                    now_sec = time.time()
                    link_alive = False
                    snapshot = registry.get_snapshot(now_sec)
                    link_data = snapshot.get("link", {})
                    if isinstance(link_data, dict):
                        link_alive = bool(link_data.get("alive", False))
                    self._send_json(
                        HTTPStatus.OK,
                        {
                            "ok": True,
                            "server_time": now_sec,
                            "link_ok": link_alive,
                            "modules": snapshot,
                        },
                    )
                    return

                file_path = safe_join(parsed.path)
                if file_path is not None and os.path.isfile(file_path):
                    self._send_file(file_path)
                    return

                if parsed.path in ("/", "/index.html"):
                    index_path = os.path.join(web_root, "index.html")
                    self._send_file(index_path)
                    return

                self.send_error(HTTPStatus.NOT_FOUND)

            def do_POST(self) -> None:
                parsed = urlparse(self.path)
                parts = [part for part in parsed.path.split("/") if part]
                if len(parts) != 4 or parts[0] != "api" or parts[1] != "modules":
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return

                module_id = parts[2]
                action = parts[3]
                body, err = self._read_json_body()
                if err is not None:
                    self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": err})
                    return

                try:
                    code, result = registry.handle_post(module_id, action, body or {})
                except Exception as exc:
                    logger.error(f"POST {parsed.path} failed: {exc}")
                    self._send_json(
                        HTTPStatus.INTERNAL_SERVER_ERROR,
                        {"ok": False, "error": "internal error"},
                    )
                    return
                self._send_json(code, result)

        self.server_ = ReuseAddrHTTPServer((self.host_, self.port_), Handler)
        self.thread_ = threading.Thread(target=self.server_.serve_forever, daemon=True)
        self.thread_.start()

    def stop(self) -> None:
        if self.server_ is not None:
            self.server_.shutdown()
            self.server_ = None
        if self.thread_ is not None:
            self.thread_.join(timeout=2.0)
            self.thread_ = None
