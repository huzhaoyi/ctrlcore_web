import unittest

from sealien_ctrlcore_web.modules.elb105.alignment_timer import AlignmentTimer


class AlignmentTimerTest(unittest.TestCase):
    def test_starts_on_alignment_and_does_not_reset_between_active_states(self):
        timer = AlignmentTimer(duration_sec=900.0)
        timer.update(0, 10.0)
        timer.update(1, 20.0)
        self.assertEqual(timer.snapshot(1, 30.0)["alignment_remaining_sec"], 890.0)

        timer.update(2, 40.0)
        self.assertEqual(timer.snapshot(2, 50.0)["alignment_remaining_sec"], 870.0)

    def test_reports_timeout_completion_and_reset(self):
        timer = AlignmentTimer(duration_sec=900.0)
        timer.update(1, 100.0)
        self.assertEqual(timer.snapshot(1, 999.0)["alignment_timer_state"], "active")
        self.assertEqual(timer.snapshot(1, 1000.0)["alignment_timer_state"], "timeout")

        timer.update(3, 1001.0)
        self.assertEqual(timer.snapshot(3, 1001.0)["alignment_timer_state"], "complete")

        timer.update(0, 1010.0)
        self.assertEqual(timer.snapshot(0, 1010.0)["alignment_timer_state"], "idle")
        timer.update(2, 1020.0)
        self.assertEqual(timer.snapshot(2, 1030.0)["alignment_remaining_sec"], 890.0)

    def test_unknown_status_has_no_estimated_time(self):
        timer = AlignmentTimer(duration_sec=900.0)
        timer.update(9, 20.0)
        self.assertEqual(
            timer.snapshot(9, 30.0),
            {
                "alignment_timer_state": "unavailable",
                "alignment_elapsed_sec": None,
                "alignment_remaining_sec": None,
            },
        )


if __name__ == "__main__":
    unittest.main()
