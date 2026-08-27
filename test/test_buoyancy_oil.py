#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""浮力驱动油量百分比：MCU 标定 0 mm=0%，176.29 mm=100%；网页只显示话题值。"""

import unittest
from types import SimpleNamespace

from sealien_ctrlcore_web.modules.plunger_pump.backend import (
    BUOYANCY_OIL_TOPIC,
    PLUNGER_OIL_EMPTY_MM,
    PLUNGER_OIL_FULL_MM,
    PLUNGER_TRAVEL_MAX_MM,
    PlungerPumpModule,
    plunger_oil_pct_from_mm,
)


class BuoyancyOilContractTest(unittest.TestCase):
    def test_full_oil_matches_ch0_stop(self) -> None:
        self.assertEqual(PLUNGER_OIL_EMPTY_MM, 0.0)
        self.assertEqual(PLUNGER_OIL_FULL_MM, 176.29)
        self.assertEqual(PLUNGER_TRAVEL_MAX_MM, PLUNGER_OIL_FULL_MM)

    def test_oil_pct_empty_half_full_and_clamp(self) -> None:
        self.assertAlmostEqual(plunger_oil_pct_from_mm(0.0), 0.0)
        self.assertAlmostEqual(plunger_oil_pct_from_mm(88.145), 50.0, places=3)
        self.assertAlmostEqual(plunger_oil_pct_from_mm(176.29), 100.0)
        self.assertAlmostEqual(plunger_oil_pct_from_mm(-1.0), 0.0)
        self.assertAlmostEqual(plunger_oil_pct_from_mm(200.0), 100.0)

    def test_topic_and_title(self) -> None:
        module = PlungerPumpModule()
        self.assertEqual(BUOYANCY_OIL_TOPIC, "/BuoyancyOilStatus")
        self.assertEqual(module.title, "浮力驱动")

    def test_snapshot_uses_mcu_oil_pct(self) -> None:
        module = PlungerPumpModule()
        msg = SimpleNamespace(
            timestamp_ms=42,
            oil_pct=70.0,
            valid=1,
            header=SimpleNamespace(
                stamp=SimpleNamespace(sec=1, nanosec=2),
                frame_id="base_link",
            ),
        )
        module._on_oil(msg)
        data = module.get_snapshot()
        self.assertTrue(data["oil_connected"])
        self.assertEqual(data["oil_topic"], "/BuoyancyOilStatus")
        self.assertEqual(data["oil_pct"], 70.0)
        self.assertEqual(data["oil_valid"], 1)
        self.assertEqual(data["oil_timestamp_ms"], 42)

    def test_waiting_snapshot_has_oil_topic(self) -> None:
        module = PlungerPumpModule()
        data = module.get_snapshot()
        self.assertFalse(data["oil_connected"])
        self.assertEqual(data["oil_topic"], "/BuoyancyOilStatus")


if __name__ == "__main__":
    unittest.main()
