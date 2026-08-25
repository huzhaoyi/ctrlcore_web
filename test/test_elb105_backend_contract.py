import pathlib
import unittest


class Elb105BackendContractTest(unittest.TestCase):
    def setUp(self):
        self.source = pathlib.Path(
            "sealien_ctrlcore_web/modules/elb105/backend.py"
        ).read_text(encoding="utf-8")

    def test_dvl_update_labels_match_protocol_values(self):
        self.assertIn('0: "0 本帧未更新"', self.source)
        self.assertIn('1: "1 本帧已更新"', self.source)

    def test_dvl_mode_labels_match_valid_status_values(self):
        self.assertIn('0: "0 无效"', self.source)
        self.assertIn('1: "1 对底"', self.source)
        self.assertIn('7: "7 对流"', self.source)

    def test_backend_latches_dvl_update_edges(self):
        self.assertIn("DvlUpdateLatch", self.source)
        self.assertIn(
            "self.dvl_update_latch_.update(dvl_data_updated, now_mono)",
            self.source,
        )

    def test_alignment_service_response_is_handled_asynchronously(self):
        self.assertNotIn("spin_until_future_complete", self.source)
        self.assertIn("future.add_done_callback", self.source)
        self.assertIn("_on_alignment_done", self.source)

    def test_alignment_requests_are_not_serialized_behind_one_future(self):
        self.assertIn("self.align_pending_", self.source)
        self.assertNotIn("self.align_future_", self.source)

    def test_hardware_description_uses_configured_baud_rate(self):
        self.assertIn("460800", self.source)
        self.assertNotIn("921600", self.source)

    def test_subscription_qos_matches_driver_reliable_keep_last_1(self):
        self.assertIn("QoSReliabilityPolicy.RELIABLE", self.source)
        self.assertIn("QoSHistoryPolicy.KEEP_LAST", self.source)
        self.assertIn("depth=1", self.source)
        self.assertIn("ELB105_QOS", self.source)
        self.assertNotIn("qos_profile_sensor_data", self.source)
        self.assertIn("@50Hz", self.source)


if __name__ == "__main__":
    unittest.main()
