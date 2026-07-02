#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MIXED_IO_DATA (mavlink_mixed_io_data_t) → /MixedIoStatus 调试模块。"""

import threading
import time
from typing import Any, Dict, List, Optional

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import MixedIoStatus
from sealien_ctrlcore_web.core.base_module import WebModule

MIXED_IO_ADC_DEV_COUNT = 3
MIXED_IO_ADC_CH_COUNT = 8
MIXED_IO_ADC_TOTAL_COUNT = MIXED_IO_ADC_DEV_COUNT * MIXED_IO_ADC_CH_COUNT
MIXED_IO_ADC_ZERO_EPS_V = 1.0e-6
MIXED_IO_STATUS_TOPIC = "/MixedIoStatus"
MIXED_IO_DEV_ADDR_HEX = ["0x10", "0x11", "0x12"]
MIXED_IO_HARDWARE = (
    "ADS7128 ×3 (24 路) · PD3/PD7 软件 I2C · 分压还原 · MIXED_IO_DATA @50Hz"
)


class MixedIoModule(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None

    @property
    def module_id(self) -> str:
        return "mixed_io"

    @property
    def title(self) -> str:
        return "混合 IO · ADC"

    def register(self, node: Node) -> None:
        node.create_subscription(
            MixedIoStatus,
            MIXED_IO_STATUS_TOPIC,
            self._on_mixed_io,
            qos_profile_sensor_data,
        )

    @staticmethod
    def _adc_slice(adc_v: List[float], dev_idx: int) -> List[float]:
        base = dev_idx * MIXED_IO_ADC_CH_COUNT
        out: List[float] = []
        for ch in range(MIXED_IO_ADC_CH_COUNT):
            idx = base + ch
            if idx < len(adc_v):
                out.append(float(adc_v[idx]))
            else:
                out.append(0.0)
        return out

    @staticmethod
    def _adc_flat(adc_v: List[float]) -> List[float]:
        out: List[float] = []
        for idx in range(MIXED_IO_ADC_TOTAL_COUNT):
            if idx < len(adc_v):
                out.append(float(adc_v[idx]))
            else:
                out.append(0.0)
        return out

    @staticmethod
    def _dev_active(voltages: List[float]) -> bool:
        for value in voltages:
            if abs(float(value)) > MIXED_IO_ADC_ZERO_EPS_V:
                return True
        return False

    def _on_mixed_io(self, msg: MixedIoStatus) -> None:
        adc_list = list(msg.adc_v)
        adc_v = self._adc_flat(adc_list)
        adc_dev1_vin = self._adc_slice(adc_list, 0)
        adc_dev2_vin = self._adc_slice(adc_list, 1)
        adc_dev3_vin = self._adc_slice(adc_list, 2)
        dev_groups = [adc_dev1_vin, adc_dev2_vin, adc_dev3_vin]

        snapshot = {
            "status_topic": MIXED_IO_STATUS_TOPIC,
            "hardware": MIXED_IO_HARDWARE,
            "mcn_topic": "i2c_get_adc_result",
            "mavlink_status_msg": "MIXED_IO_DATA (id=20, 50Hz)",
            "mcu_timestamp_ms": int(msg.mcu_timestamp_ms),
            "link_ok": bool(msg.link_ok),
            "adc_v": adc_v,
            "adc_dev1_vin": adc_dev1_vin,
            "adc_dev2_vin": adc_dev2_vin,
            "adc_dev3_vin": adc_dev3_vin,
            "adc_dev_addr_hex": list(MIXED_IO_DEV_ADDR_HEX),
            "adc_dev_active": [self._dev_active(group) for group in dev_groups],
            "gpio_input_mask": int(msg.gpio_input_mask),
            "gpio_input_mask_hex": f"0x{int(msg.gpio_input_mask):016X}",
            "stamp_sec": float(msg.header.stamp.sec),
            "stamp_nanosec": int(msg.header.stamp.nanosec),
            "frame_id": str(msg.header.frame_id),
        }
        with self.lock_:
            self.rx_count_ += 1
            self.last_rx_mono_ = time.monotonic()
            snapshot["rx_count"] = self.rx_count_
            self.latest_ = snapshot

    def get_snapshot(self) -> Dict[str, Any]:
        with self.lock_:
            if self.latest_ is None:
                return {
                    "connected": False,
                    "message": f"waiting for {MIXED_IO_STATUS_TOPIC}",
                    "rx_count": 0,
                    "status_topic": MIXED_IO_STATUS_TOPIC,
                    "hardware": MIXED_IO_HARDWARE,
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
