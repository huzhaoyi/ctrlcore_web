#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ELB105 对准预计计时状态机。"""

from typing import Any, Dict, Optional


class AlignmentTimer:
    def __init__(self, duration_sec: float = 900.0) -> None:
        self.duration_sec_ = duration_sec
        self.start_mono_: Optional[float] = None

    def update(self, status: int, now_mono: float) -> None:
        if status == 0:
            self.start_mono_ = None
        elif status in (1, 2) and self.start_mono_ is None:
            self.start_mono_ = now_mono

    def snapshot(self, status: int, now_mono: float) -> Dict[str, Any]:
        if status == 0:
            state = "idle"
            elapsed = None
            remaining = None
        elif status == 3:
            state = "complete"
            elapsed = (
                max(0.0, now_mono - self.start_mono_)
                if self.start_mono_ is not None
                else None
            )
            remaining = 0.0
        elif status in (1, 2) and self.start_mono_ is not None:
            elapsed = max(0.0, now_mono - self.start_mono_)
            remaining = max(0.0, self.duration_sec_ - elapsed)
            state = "active" if elapsed < self.duration_sec_ else "timeout"
        else:
            state = "unavailable"
            elapsed = None
            remaining = None

        return {
            "alignment_timer_state": state,
            "alignment_elapsed_sec": elapsed,
            "alignment_remaining_sec": remaining,
        }
