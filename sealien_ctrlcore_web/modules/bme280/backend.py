#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""板载 BME280：/Bme280Status 展示（字段解析，只读）。"""

import threading
import time
from typing import Any, Dict, List, Optional

from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sealien_ctrlpilot_msgmanagement.msg import Bme280Status
from sealien_ctrlcore_web.core.base_module import WebModule

BME280_STATUS_TOPIC = "/Bme280Status"
BME280_HARDWARE = "SPI2 · BME280 · chip_id=0x60"


def _decode_humidity_label(rh: float) -> str:
    if rh < 0.0 or rh > 100.0:
        return f"超量程 {rh:.1f} %RH（检查传感器或标定）"
    if rh < 20.0:
        return f"{rh:.1f} %RH · 偏干"
    if rh > 80.0:
        return f"{rh:.1f} %RH · 偏湿"
    return f"{rh:.1f} %RH · 正常区间"


def _build_fields(
    timestamp_ms: int,
    temperature_c: float,
    humidity_rh: float,
    press_hpa: float,
) -> List[Dict[str, Any]]:
    return [
        {
            "id": "timestamp_ms",
            "label": "timestamp_ms",
            "description": "MCU rt_tick_get_millisecond()，与 MCN sensor_BME280 一致",
            "value": str(timestamp_ms),
            "raw": timestamp_ms,
        },
        {
            "id": "temperature_c",
            "label": "temperature_c",
            "description": "Bosch 补偿温度 cal_temperature，单位 °C（SPI2 BME280）",
            "value": f"{temperature_c:.2f}",
            "raw": temperature_c,
            "unit": "°C",
            "range_hint": "典型 -40 ~ +85 °C",
        },
        {
            "id": "humidity_rh",
            "label": "humidity_rh",
            "description": "Bosch 补偿相对湿度 cal_humidity，单位 %RH",
            "value": f"{humidity_rh:.2f}",
            "raw": humidity_rh,
            "unit": "%RH",
            "range_hint": "0 ~ 100 %RH",
            "parse_label": _decode_humidity_label(humidity_rh),
        },
        {
            "id": "press_hpa",
            "label": "press_hpa",
            "description": "Bosch 补偿气压 cal_pressure，单位 hPa（1 hPa = 100 Pa）",
            "value": f"{press_hpa:.2f}",
            "raw": press_hpa,
            "unit": "hPa",
            "range_hint": "典型 300 ~ 1100 hPa",
        },
    ]


class Bme280Module(WebModule):
    def __init__(self) -> None:
        self.lock_ = threading.Lock()
        self.rx_count_ = 0
        self.last_rx_mono_: Optional[float] = None
        self.latest_: Optional[Dict[str, Any]] = None

    @property
    def module_id(self) -> str:
        return "bme280"

    @property
    def title(self) -> str:
        return "板载 BME280"

    def register(self, node: Node) -> None:
        node.create_subscription(
            Bme280Status,
            BME280_STATUS_TOPIC,
            self._on_bme280,
            qos_profile_sensor_data,
        )

    def _on_bme280(self, msg: Bme280Status) -> None:
        temp = float(msg.temperature_c)
        humi = float(msg.humidity_rh)
        press = float(msg.press_hpa)
        ts = int(msg.timestamp_ms)

        snapshot = {
            "status_topic": BME280_STATUS_TOPIC,
            "mavlink_msg": "BEM280 (id=8, 1Hz)",
            "mcn_topic": "sensor_BME280",
            "hardware": BME280_HARDWARE,
            "timestamp_ms": ts,
            "timestamp_label": "下位机采样时刻（ms tick）",
            "temperature_c": temp,
            "humidity_rh": humi,
            "press_hpa": press,
            "fields": _build_fields(ts, temp, humi, press),
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
                    "message": f"waiting for {BME280_STATUS_TOPIC}",
                    "rx_count": 0,
                    "status_topic": BME280_STATUS_TOPIC,
                    "hardware": BME280_HARDWARE,
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
