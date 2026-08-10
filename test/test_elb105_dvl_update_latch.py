import unittest

from sealien_ctrlcore_web.modules.elb105.dvl_update_latch import DvlUpdateLatch


class DvlUpdateLatchTest(unittest.TestCase):
    def test_waits_until_first_zero_to_one_update_event(self):
        latch = DvlUpdateLatch(window_sec=1.5)

        latch.update(0, 10.0)

        self.assertEqual(
            latch.snapshot(10.5),
            {
                "dvl_update_latch_state": "waiting",
                "dvl_update_age_sec": None,
                "dvl_update_count": 0,
            },
        )

    def test_counts_only_zero_to_one_edges(self):
        latch = DvlUpdateLatch(window_sec=1.5)

        latch.update(0, 10.0)
        latch.update(1, 11.0)
        latch.update(1, 11.2)
        self.assertEqual(latch.snapshot(11.3)["dvl_update_count"], 1)
        self.assertAlmostEqual(latch.snapshot(11.3)["dvl_update_age_sec"], 0.3)

        latch.update(0, 11.4)
        latch.update(1, 12.0)
        self.assertEqual(latch.snapshot(12.0)["dvl_update_count"], 2)
        self.assertEqual(latch.snapshot(12.0)["dvl_update_age_sec"], 0.0)

    def test_first_one_waits_for_an_observed_zero_to_one_edge(self):
        latch = DvlUpdateLatch(window_sec=1.5)

        latch.update(1, 10.0)
        self.assertEqual(latch.snapshot(10.1)["dvl_update_count"], 0)
        self.assertEqual(
            latch.snapshot(10.1)["dvl_update_latch_state"],
            "waiting",
        )

        latch.update(0, 10.2)
        latch.update(1, 10.3)
        self.assertEqual(latch.snapshot(10.3)["dvl_update_count"], 1)

    def test_unknown_raw_values_do_not_create_false_edges(self):
        latch = DvlUpdateLatch(window_sec=1.5)

        latch.update(0, 10.0)
        latch.update(1, 10.1)
        latch.update(7, 10.2)
        latch.update(1, 10.3)

        self.assertEqual(latch.snapshot(10.3)["dvl_update_count"], 1)
        self.assertAlmostEqual(latch.snapshot(10.3)["dvl_update_age_sec"], 0.2)

    def test_recent_window_includes_exact_boundary_then_times_out(self):
        latch = DvlUpdateLatch(window_sec=1.5)
        latch.update(0, 9.9)
        latch.update(1, 10.0)

        self.assertEqual(
            latch.snapshot(11.5)["dvl_update_latch_state"],
            "recent",
        )
        self.assertEqual(
            latch.snapshot(11.5001)["dvl_update_latch_state"],
            "timeout",
        )

    def test_negative_age_is_clamped_if_monotonic_clock_moves_back(self):
        latch = DvlUpdateLatch(window_sec=1.5)
        latch.update(0, 9.9)
        latch.update(1, 10.0)

        self.assertEqual(latch.snapshot(9.0)["dvl_update_age_sec"], 0.0)


if __name__ == "__main__":
    unittest.main()
