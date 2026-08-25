#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""柱塞泵单路转/停：另一路保持上次下发。"""

import unittest
from unittest.mock import MagicMock

from sealien_ctrlcore_web.modules.plunger_pump.backend import (
    PLUNGER_RUN_DUTY_PCT,
    PLUNGER_STOP_DUTY_PCT,
    PlungerPumpModule,
)


class PlungerPumpRunLatchTest(unittest.TestCase):
    def setUp(self) -> None:
        self.module = PlungerPumpModule()
        self.module.cmd_pub_ = MagicMock()

    def test_run_duty_is_fifty_percent(self) -> None:
        self.assertEqual(PLUNGER_RUN_DUTY_PCT, 50)
        self.assertEqual(PLUNGER_STOP_DUTY_PCT, 0)

    def test_start_ch0_keeps_ch1_stopped(self) -> None:
        status, result = self.module.handle_post("run", {"channel": 0, "on": True})
        self.assertEqual(status, 200)
        self.assertEqual(result["duty_pct_ch0"], 50)
        self.assertEqual(result["duty_pct_ch1"], 0)

    def test_start_ch1_keeps_ch0_running(self) -> None:
        self.module.handle_post("run", {"channel": 0, "on": True})
        status, result = self.module.handle_post("run", {"channel": 1, "on": True})
        self.assertEqual(status, 200)
        self.assertEqual(result["duty_pct_ch0"], 50)
        self.assertEqual(result["duty_pct_ch1"], 50)

    def test_stop_ch0_keeps_ch1_running(self) -> None:
        self.module.handle_post("run", {"channel": 0, "on": True})
        self.module.handle_post("run", {"channel": 1, "on": True})
        status, result = self.module.handle_post("run", {"channel": 0, "on": False})
        self.assertEqual(status, 200)
        self.assertEqual(result["duty_pct_ch0"], 0)
        self.assertEqual(result["duty_pct_ch1"], 50)
        self.assertEqual(self.module.cmd_pub_.publish.call_count, 3)

    def test_invalid_channel_rejected(self) -> None:
        status, result = self.module.handle_post("run", {"channel": 2, "on": True})
        self.assertEqual(status, 400)
        self.assertFalse(result["ok"])


if __name__ == "__main__":
    unittest.main()
