#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""柱塞泵 CH0 拉线上限：≥176.29 mm 禁止两路 PWM（双泵共用拉线）。"""

import unittest

from sealien_ctrlcore_web.modules.plunger_pump.backend import (
    PLUNGER_TRAVEL_MAX_MM,
    plunger_ch0_at_max,
)


class PlungerCh0LimitTest(unittest.TestCase):
    def test_limit_is_measured_stop(self) -> None:
        self.assertEqual(PLUNGER_TRAVEL_MAX_MM, 176.29)

    def test_below_limit_allows_pwm(self) -> None:
        self.assertFalse(plunger_ch0_at_max(176.28))
        self.assertFalse(plunger_ch0_at_max(0.0))

    def test_at_or_above_limit_blocks_pwm(self) -> None:
        self.assertTrue(plunger_ch0_at_max(176.29))
        self.assertTrue(plunger_ch0_at_max(180.0))

    def test_limit_is_shared_by_both_pumps(self) -> None:
        """双泵并联同一根 CH0：上限判定与通道无关，两路都应停。"""
        self.assertTrue(plunger_ch0_at_max(176.29))

    def test_invalid_reading_does_not_block(self) -> None:
        self.assertFalse(plunger_ch0_at_max(None))
        self.assertFalse(plunger_ch0_at_max("bad"))


if __name__ == "__main__":
    unittest.main()
