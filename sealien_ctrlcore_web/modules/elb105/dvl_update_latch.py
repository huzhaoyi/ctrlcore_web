"""DVL 低频更新脉冲锁存状态。"""

from typing import Dict, Optional, Union


class DvlUpdateLatch:
    def __init__(self, window_sec: float = 1.5) -> None:
        if window_sec <= 0.0:
            raise ValueError("window_sec must be positive")

        self.window_sec_ = float(window_sec)
        self.previous_raw_: Optional[int] = None
        self.last_update_mono_: Optional[float] = None
        self.update_count_ = 0

    def update(self, raw_value: int, now_mono: float) -> None:
        raw = int(raw_value)
        if self.previous_raw_ == 0 and raw == 1:
            self.last_update_mono_ = float(now_mono)
            self.update_count_ += 1
        self.previous_raw_ = raw

    def snapshot(
        self,
        now_mono: float,
    ) -> Dict[str, Union[str, float, int, None]]:
        if self.last_update_mono_ is None:
            return {
                "dvl_update_latch_state": "waiting",
                "dvl_update_age_sec": None,
                "dvl_update_count": self.update_count_,
            }

        age_sec = max(0.0, float(now_mono) - self.last_update_mono_)
        state = "recent" if age_sec <= self.window_sec_ else "timeout"
        return {
            "dvl_update_latch_state": state,
            "dvl_update_age_sec": round(age_sec, 3),
            "dvl_update_count": self.update_count_,
        }
