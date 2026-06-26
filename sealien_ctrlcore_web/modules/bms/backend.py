#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BMS 电池管理：/BmsStatus（双包，pack_id 区分）+ /obc/bms_mos_cmd（OBC 透传，敏感电源操作）。"""

import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import BmsMosCmd, BmsStatus
from sealien_ctrlcore_web.core.base_module import WebModule
from sealien_ctrlcore_web.modules.bms.bms_decode import enrich_bms_pack

BMS_STATUS_TOPIC = "/BmsStatus"
BMS_CMD_TOPIC = "/obc/bms_mos_cmd"
BMS_HARDWARE = "uart6 串口 · 通用 BMS 协议 9600 · 双电池包(0x01/0x02) · BMS_STATUS @4Hz"
VALID_PACK_IDS = (1, 2)


class BmsModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.cmd_tx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.packs_: Dict[int, Dict[str, Any]] = {}
        self.cmd_pub_ = None

    @property
    def module_id(self) -> str:
        return "bms"

    @property
    def title(self) -> str:
        return "电池管理 BMS"

    def register(self, node: Node) -> None:
        self.cmd_pub_ = node.create_publisher(BmsMosCmd, BMS_CMD_TOPIC, 10)
        node.create_subscription(
            BmsStatus,
            BMS_STATUS_TOPIC,
            self._on_status,
            qos_profile_sensor_data,
        )

    @staticmethod
    def _int_list(values: Any, count: int) -> List[int]:
        out: List[int] = []
        for idx in range(count):
            if idx < len(values):
                out.append(int(values[idx]))
            else:
                out.append(0)
        return out

    def _on_status(self, msg: BmsStatus) -> None:
        status_flags = int(msg.status_flags)
        mos_status = int(msg.mos_status)
        pack = {
            "pack_id": int(msg.pack_id),
            "comm_ok": int(msg.comm_ok),
            "soc_pct": int(msg.soc_pct),
            "cell_count": int(msg.cell_count),
            "temp_count": int(msg.temp_count),
            "cell_mv": self._int_list(list(msg.cell_mv), 16),
            "current_a": round(float(msg.current_x10) * 0.01, 2),
            "total_voltage_v": round(float(msg.total_voltage_x10) * 0.01, 2),
            "cell_v_max_mv": int(msg.cell_v_max_mv),
            "cell_v_min_mv": int(msg.cell_v_min_mv),
            "temp_c": self._int_list(list(msg.temp_c), 8),
            "cycle_count": int(msg.cycle_count),
            "design_cap_mah": int(msg.design_cap_mah),
            "full_cap_mah": int(msg.full_cap_mah),
            "remain_cap_mah": int(msg.remain_cap_mah),
            "discharge_time_min": int(msg.discharge_time_min),
            "charge_time_min": int(msg.charge_time_min),
            "status_flags": status_flags,
            "mos_status": mos_status,
            "discharging": bool(status_flags & 0x01),
            "charging": bool(status_flags & 0x02),
            "mos_temp_valid": bool(status_flags & 0x10),
            "env_temp_valid": bool(status_flags & 0x20),
            "discharge_mos_on": bool(mos_status & 0x02),
            "charge_mos_on": bool(mos_status & 0x04),
            "balance0": int(msg.balance0),
            "balance1": int(msg.balance1),
            "balance2": int(msg.balance2),
            "protect_ov": int(msg.protect_ov),
            "protect_uv": int(msg.protect_uv),
            "protect_temp": int(msg.protect_temp),
            "protect_other": int(msg.protect_other),
            "fail_status": int(msg.fail_status),
            "alarm0": int(msg.alarm0),
            "alarm1": int(msg.alarm1),
            "sw_version": int(msg.sw_version),
            "hw_version": int(msg.hw_version),
            "scheme_id": int(msg.scheme_id),
            "timestamp_ms": int(msg.timestamp_ms),
        }
        with self.lock_:
            self.rx_count_ += 1
            self.last_rx_mono_ = time.monotonic()
            self.packs_[int(msg.pack_id)] = enrich_bms_pack(pack)

    def get_snapshot(self) -> Dict[str, Any]:
        with self.lock_:
            base = {
                "status_topic": BMS_STATUS_TOPIC,
                "cmd_topic": BMS_CMD_TOPIC,
                "hardware": BMS_HARDWARE,
                "mcn_topic": "sensor_bms",
                "mavlink_status_msg": "BMS_STATUS (id=28, 4Hz)",
                "mavlink_cmd_msg": "BMS_MOS_CMD (id=29)",
                "valid_pack_ids": list(VALID_PACK_IDS),
                "rx_count": self.rx_count_,
                "cmd_tx_count": self.cmd_tx_count_,
            }
            if not self.packs_:
                base["connected"] = False
                base["message"] = f"waiting for {BMS_STATUS_TOPIC}"
                base["packs"] = []
                return base

            base["connected"] = True
            base["packs"] = [
                enrich_bms_pack(dict(self.packs_[pid]))
                for pid in sorted(self.packs_.keys())
            ]
            if self.last_rx_mono_ is not None:
                base["age_sec"] = round(time.monotonic() - self.last_rx_mono_, 3)
            return base

    def is_alive(self, now_sec: float, stale_sec: float) -> bool:
        _ = now_sec
        with self.lock_:
            if self.last_rx_mono_ is None:
                return False
            return (time.monotonic() - self.last_rx_mono_) <= stale_sec

    def handle_post(self, action: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if action != "mos":
            return 404, {"ok": False, "error": f"unknown action: {action}"}
        if self.cmd_pub_ is None:
            return 503, {"ok": False, "error": "bms publisher not ready"}

        try:
            pack_id = int(body.get("pack_id"))
            charge_en = 1 if int(body.get("charge_en", 0)) != 0 else 0
            discharge_en = 1 if int(body.get("discharge_en", 0)) != 0 else 0
        except (TypeError, ValueError):
            return 400, {"ok": False, "error": "invalid pack_id/charge_en/discharge_en"}

        if pack_id not in VALID_PACK_IDS:
            return 400, {"ok": False, "error": f"pack_id must be one of {list(VALID_PACK_IDS)}"}

        msg = BmsMosCmd()
        msg.pack_id = pack_id
        msg.charge_en = charge_en
        msg.discharge_en = discharge_en
        self.cmd_pub_.publish(msg)

        with self.lock_:
            self.cmd_tx_count_ += 1
            count = self.cmd_tx_count_

        return 200, {
            "ok": True,
            "pack_id": pack_id,
            "charge_en": charge_en,
            "discharge_en": discharge_en,
            "cmd_tx_count": count,
            "note": "充放电 MOS 控制为敏感电源操作，OBC 透传至 MCU",
        }
