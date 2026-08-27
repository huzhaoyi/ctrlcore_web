#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""俯仰位置环百分比：45 mm=-100%，125 mm=+100%；cmd 编码 speed_rpm=pct×10+1000。"""

import unittest

from sealien_ctrlcore_web.modules.pitch_motor.backend import (
    PITCH_CMD_PCT_OFFSET,
    pitch_clamp_pct,
    pitch_encode_cmd_rpm,
    pitch_est_pair,
    pitch_mm_to_pct,
    pitch_pct_to_mm,
)


class PitchPctMapTest(unittest.TestCase):
    def test_ends_and_mid(self) -> None:
        self.assertAlmostEqual(pitch_mm_to_pct(45.0), -100.0)
        self.assertAlmostEqual(pitch_mm_to_pct(85.0), 0.0)
        self.assertAlmostEqual(pitch_mm_to_pct(125.0), 100.0)

    def test_roundtrip(self) -> None:
        for pct in (-100.0, -50.0, 0.0, 25.0, 100.0):
            mm = pitch_pct_to_mm(pct)
            self.assertAlmostEqual(pitch_mm_to_pct(mm), pct, places=5)

    def test_clamp(self) -> None:
        self.assertEqual(pitch_clamp_pct(-120.0), -100.0)
        self.assertEqual(pitch_clamp_pct(150.0), 100.0)

    def test_cmd_encoding(self) -> None:
        self.assertEqual(pitch_encode_cmd_rpm(-100.0), 0)
        self.assertEqual(pitch_encode_cmd_rpm(0.0), int(PITCH_CMD_PCT_OFFSET))
        self.assertEqual(pitch_encode_cmd_rpm(100.0), 2000)

    def test_est_pair_keeps_mm(self) -> None:
        target_mm, actual_mm = pitch_est_pair(0.0, -100.0)
        self.assertEqual(target_mm, 85.0)
        self.assertEqual(actual_mm, 45.0)
        target_mm, actual_mm = pitch_est_pair(100.0, 50.0)
        self.assertEqual(target_mm, 125.0)
        self.assertEqual(actual_mm, 105.0)


if __name__ == "__main__":
    unittest.main()
