import test from "node:test";
import assert from "node:assert/strict";

import {
  assessDvlModeDisplay,
  assessDvlUpdateDisplay,
  dvlLinkOnline,
} from "../web/modules/elb105/dvl_health.mjs";

test("dvl link stays online when valid flags flicker to zero but updates exist", () => {
  const data = {
    alive: true,
    dvl_valid_flags: 0,
    dvl_mode_label: "0 无效",
    dvl_valid_ok: false,
    dvl_update_latch_state: "timeout",
    dvl_update_age_sec: 2.5,
    dvl_update_count: 42,
  };

  assert.equal(dvlLinkOnline(data), true);
  assert.equal(assessDvlModeDisplay(data).state, "idle");
  assert.equal(assessDvlModeDisplay(data).ok, true);
  assert.equal(assessDvlUpdateDisplay(data).state, "slow");
  assert.equal(assessDvlUpdateDisplay(data).ok, true);
  assert.match(assessDvlUpdateDisplay(data).text, /低频更新/);
});

test("dvl without history remains offline when mode and latch are invalid", () => {
  const data = {
    alive: true,
    dvl_valid_flags: 0,
    dvl_mode_label: "0 无效",
    dvl_valid_ok: false,
    dvl_update_latch_state: "waiting",
    dvl_update_count: 0,
  };

  assert.equal(dvlLinkOnline(data), false);
  assert.equal(assessDvlModeDisplay(data).state, "invalid");
  assert.equal(assessDvlUpdateDisplay(data).state, "waiting");
});

test("dvl timeout without link history stays faulted", () => {
  const data = {
    alive: true,
    dvl_valid_flags: 0,
    dvl_update_latch_state: "timeout",
    dvl_update_age_sec: 3.0,
    dvl_update_count: 0,
  };

  assert.equal(assessDvlUpdateDisplay(data).state, "timeout");
  assert.equal(assessDvlUpdateDisplay(data).ok, false);
});
