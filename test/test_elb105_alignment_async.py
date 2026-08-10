import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch


try:
    from sealien_ctrlpilot_msgmanagement.srv import Elb105SendAlignment
except ModuleNotFoundError:
    message_package = types.ModuleType("sealien_ctrlpilot_msgmanagement")
    message_module = types.ModuleType("sealien_ctrlpilot_msgmanagement.msg")
    message_private_module = types.ModuleType(
        "sealien_ctrlpilot_msgmanagement.msg._elb105_shzr04"
    )
    service_module = types.ModuleType("sealien_ctrlpilot_msgmanagement.srv")

    class Elb105Shzr04:
        pass

    class Elb105SendAlignment:
        class Request:
            def __init__(self):
                self.latitude_deg = 0.0
                self.longitude_deg = 0.0
                self.altitude_m = 0.0

    message_private_module.Elb105Shzr04 = Elb105Shzr04
    service_module.Elb105SendAlignment = Elb105SendAlignment
    sys.modules["sealien_ctrlpilot_msgmanagement"] = message_package
    sys.modules["sealien_ctrlpilot_msgmanagement.msg"] = message_module
    sys.modules[
        "sealien_ctrlpilot_msgmanagement.msg._elb105_shzr04"
    ] = message_private_module
    sys.modules["sealien_ctrlpilot_msgmanagement.srv"] = service_module

from sealien_ctrlcore_web.modules.elb105.backend import Elb105Module


class FakeFuture:
    def __init__(self):
        self.callbacks = []
        self.response = None
        self.exception = None
        self.cancelled = False

    def add_done_callback(self, callback):
        self.callbacks.append(callback)

    def result(self):
        if self.exception is not None:
            raise self.exception
        return self.response

    def cancel(self):
        self.cancelled = True
        for callback in self.callbacks:
            callback(self)

    def finish(self, success, message):
        self.response = SimpleNamespace(success=success, message=message)
        for callback in self.callbacks:
            callback(self)


class FakeClient:
    def __init__(self):
        self.futures = []
        self.removed = []

    def wait_for_service(self, timeout_sec):
        _ = timeout_sec
        return True

    def call_async(self, request):
        _ = request
        future = FakeFuture()
        self.futures.append(future)
        return future

    def remove_pending_request(self, future):
        self.removed.append(future)


class FakeLogger:
    def __init__(self):
        self.errors = []

    def error(self, message):
        self.errors.append(message)


class FakeNode:
    def __init__(self):
        self.logger = FakeLogger()

    def get_logger(self):
        return self.logger


class Elb105AlignmentAsyncTest(unittest.TestCase):
    def setUp(self):
        self.module = Elb105Module()
        self.module.node_ = FakeNode()
        self.module.align_client_ = FakeClient()

    def queue_alignment(self, latitude):
        status, result = self.module.handle_post(
            "align",
            {
                "latitude_deg": latitude,
                "longitude_deg": 113.525280,
                "altitude_m": 8.0,
            },
        )
        self.assertEqual(status, 202)
        self.assertTrue(result["ok"])

    def test_multiple_requests_are_in_flight_and_may_finish_out_of_order(self):
        self.queue_alignment(1.0)
        self.queue_alignment(2.0)

        with patch(
            "sealien_ctrlcore_web.modules.elb105.backend.time.monotonic",
            side_effect=[10.0, 10.1, 10.2],
        ):
            self.module.drain_service_queue()

        futures = self.module.align_client_.futures
        self.assertEqual(len(futures), 2)
        self.assertEqual(len(self.module.align_pending_), 2)

        futures[1].finish(True, "second sent")
        self.assertEqual(
            self.module.last_align_result_,
            {"ok": True, "message": "second sent"},
        )
        futures[0].finish(True, "first sent")
        self.assertEqual(
            self.module.last_align_result_,
            {"ok": True, "message": "first sent"},
        )
        self.assertEqual(len(self.module.align_pending_), 0)

    def test_one_timeout_does_not_remove_other_pending_requests(self):
        expired = FakeFuture()
        active = FakeFuture()
        expired.add_done_callback(self.module._on_alignment_done)
        active.add_done_callback(self.module._on_alignment_done)
        self.module.align_pending_ = {
            expired: 10.0,
            active: 12.0,
        }

        with patch(
            "sealien_ctrlcore_web.modules.elb105.backend.time.monotonic",
            return_value=13.1,
        ):
            self.module.drain_service_queue()

        self.assertEqual(self.module.align_client_.removed, [expired])
        self.assertTrue(expired.cancelled)
        self.assertFalse(active.cancelled)
        self.assertNotIn(expired, self.module.align_pending_)
        self.assertIn(active, self.module.align_pending_)

        previous_result = dict(self.module.last_align_result_)
        expired.finish(True, "late response")
        self.assertEqual(self.module.last_align_result_, previous_result)

    def test_future_exception_is_reported_without_leaking_pending_state(self):
        future = FakeFuture()
        future.exception = RuntimeError("service failed")
        self.module.align_pending_[future] = 10.0

        self.module._on_alignment_done(future)

        self.assertEqual(
            self.module.last_align_result_,
            {
                "ok": False,
                "message": "alignment service call failed: service failed",
            },
        )
        self.assertNotIn(future, self.module.align_pending_)
        self.assertEqual(len(self.module.node_.logger.errors), 1)


if __name__ == "__main__":
    unittest.main()
