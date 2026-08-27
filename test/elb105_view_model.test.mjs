import test from "node:test";
import assert from "node:assert/strict";

import {
  alignmentLabel,
  buildAlignmentRequest,
  buildElb105ViewModel,
} from "../web/modules/elb105/view_model.mjs";

test("alignment states use SHZR04 values 0 through 3", () => {
  assert.equal(alignmentLabel(0), "0 待机 (Standby)");
  assert.equal(alignmentLabel(1), "1 粗对准 (Coarse alignment)");
  assert.equal(alignmentLabel(2), "2 精对准 (Fine alignment)");
  assert.equal(alignmentLabel(3), "3 对准完成 (Aligned)");
  assert.equal(alignmentLabel(9), "未知状态 (9)");
});

test("maps the actual SHZR04 snapshot fields", () => {
  const view = buildElb105ViewModel({
    connected: true,
    rx_count: 42,
    age_sec: 0.004,
    topic: "/elb105/shzr04",
    hardware: "SHZR04 147B",
    frame_seq: 123,
    imu_time_sec: 456.789,
    frame_id: "imu_link",
    alignment_status: 3,
    alignment_label: "3 对准完成 (Aligned)",
    heading_deg: 12.345,
    pitch_deg: -1.25,
    roll_deg: 2.5,
    gyro_x_degps: 0.1,
    gyro_y_degps: -0.2,
    gyro_z_degps: 0.3,
    accel_x_mps2: 1.1,
    accel_y_mps2: 2.2,
    accel_z_mps2: -9.81,
    latitude_deg: 22.801124,
    longitude_deg: 113.52528,
    velocity_north_mps: 0.4,
    velocity_east_mps: -0.5,
    velocity_down_mps: 0.6,
    dvl_bottom_front_mps: 0.7,
    dvl_bottom_right_mps: -0.8,
    dvl_bottom_down_mps: 0.9,
    dvl_water_front_mps: 1.0,
    dvl_water_right_mps: -1.1,
    dvl_water_down_mps: 1.2,
    dvl_bottom_height_m: 3.4,
    dvl_data_updated: 1,
    dvl_data_updated_label: "1 本帧已更新",
    dvl_update_latch_state: "recent",
    dvl_update_age_sec: 0.234,
    dvl_update_count: 8,
    dvl_valid_flags: 7,
    dvl_valid_flags_hex: "0x07",
    dvl_valid_ok: true,
    dvl_mode_label: "7 对流",
    imu_temperature_c: 42.5,
    dvl_speed_scale: 1.0,
    dvl_mount_error_deg: -0.25,
    stamp_sec: 100,
    stamp_nanosec: 250000000,
  });

  assert.equal(view.connected_text, "在线");
  assert.equal(view.frame_seq, "123");
  assert.equal(view.alignment_text, "3 对准完成 (Aligned)");
  assert.equal(view.alignment_ok, true);
  assert.equal(view.heading, "12.35");
  assert.equal(view.pitch, "-1.25");
  assert.equal(view.gyro_y, "-0.2000");
  assert.equal(view.accel_z, "-9.8100");
  assert.equal(view.latitude, "+22.801124");
  assert.equal(view.longitude, "+113.525280");
  assert.equal(view.velocity_east, "-0.500");
  assert.equal(view.dvl_bottom_right, "-0.800");
  assert.equal(view.dvl_update_text, "更新正常 · 距今 0.23s · 累计 8 次");
  assert.equal(view.dvl_update_state, "recent");
  assert.equal(view.dvl_update_count, "8");
  assert.equal(view.dvl_valid_text, "7 对流");
  assert.equal(view.dvl_valid_state, "valid");
  assert.equal(view.dvl_valid_hex, "0x07");
  assert.equal(view.temperature, "42.50");
  assert.equal(view.stamp, "100.250000000");
});

test("missing values render as placeholders instead of zero", () => {
  const view = buildElb105ViewModel({ connected: false });

  assert.equal(view.connected_text, "等待中");
  assert.equal(view.heading, "--");
  assert.equal(view.latitude, "--");
  assert.equal(view.frame_seq, "--");
  assert.equal(view.stamp, "--");
  assert.equal(view.alignment_text, "--");
  assert.equal(view.dvl_update_text, "--");
  assert.equal(view.dvl_valid_hex, "--");
});

test("invalid DVL does not hide independent inertial data", () => {
  const view = buildElb105ViewModel({
    connected: true,
    heading_deg: 88.0,
    alignment_status: 2,
    dvl_data_updated: 0,
    dvl_data_updated_label: "0 本帧未更新",
    dvl_update_latch_state: "waiting",
    dvl_update_age_sec: null,
    dvl_update_count: 0,
    dvl_valid_flags: 0,
    dvl_valid_flags_hex: "0x00",
    dvl_valid_ok: false,
    dvl_mode_label: "0 无效",
  });

  assert.equal(view.heading, "88.00");
  assert.equal(view.alignment_text, "2 精对准 (Fine alignment)");
  assert.equal(view.dvl_update_ok, false);
  assert.equal(view.dvl_update_text, "等待首次更新");
  assert.equal(view.dvl_valid_text, "0 无效");
});

test("alignment request accepts finite in-range coordinates", () => {
  assert.deepEqual(buildAlignmentRequest("22.801124", "113.525280", "8.0"), {
    ok: true,
    body: {
      latitude_deg: 22.801124,
      longitude_deg: 113.52528,
      altitude_m: 8.0,
    },
  });
});

test("alignment request rejects invalid or out-of-range coordinates", () => {
  assert.equal(buildAlignmentRequest("abc", "113.5", "8").ok, false);
  assert.equal(buildAlignmentRequest("91", "113.5", "8").ok, false);
  assert.equal(buildAlignmentRequest("22.8", "181", "8").ok, false);
  assert.equal(buildAlignmentRequest("22.8", "113.5", "NaN").ok, false);
});

test("DVL update latch maps waiting, recent, timeout, and offline", () => {
  assert.deepEqual(
    [
      { alive: true, dvl_update_latch_state: "waiting", dvl_update_count: 0 },
      {
        alive: true,
        dvl_update_latch_state: "recent",
        dvl_update_age_sec: 0.234,
        dvl_update_count: 3,
      },
      {
        alive: true,
        dvl_update_latch_state: "timeout",
        dvl_update_age_sec: 2.1,
        dvl_update_count: 3,
        dvl_valid_flags: 1,
        dvl_valid_ok: true,
      },
      {
        alive: false,
        dvl_update_latch_state: "recent",
        dvl_update_age_sec: 0.1,
        dvl_update_count: 3,
      },
    ].map((value) => {
      const view = buildElb105ViewModel(value);
      return [view.dvl_update_text, view.dvl_update_state, view.dvl_update_ok];
    }),
    [
      ["等待首次更新", "waiting", false],
      ["更新正常 · 距今 0.23s · 累计 3 次", "recent", true],
      ["低频更新 · 末次脉冲 2.10s 前 · 累计 3 次", "slow", true],
      ["惯导离线", "offline", false],
    ],
  );
});

test("DVL valid status maps invalid, bottom-track, water-track, and unknown", () => {
  assert.deepEqual(
    [0, 1, 7, 9].map((value) => {
      const view = buildElb105ViewModel({ dvl_valid_flags: value });
      return [view.dvl_valid_text, view.dvl_valid_state, view.dvl_valid_ok];
    }),
    [
      ["0 无效", "invalid", false],
      ["1 对底", "valid", true],
      ["7 对流", "valid", true],
      ["未知 (9)", "unknown", false],
    ],
  );
});

test("unknown DVL valid status preserves its raw hexadecimal value", () => {
  const view = buildElb105ViewModel({
    dvl_valid_flags: 9,
    dvl_valid_flags_hex: "0x09",
  });

  assert.equal(view.dvl_valid_text, "未知 (9)");
  assert.equal(view.dvl_valid_state, "unknown");
  assert.equal(view.dvl_valid_hex, "0x09");
});

test("fallback hardware text uses the configured 460800 baud rate", () => {
  const view = buildElb105ViewModel({});

  assert.match(view.hardware, /460800/);
  assert.doesNotMatch(view.hardware, /921600/);
});

test("formats alignment wait, countdown, timeout, complete, and offline states", () => {
  assert.equal(
    buildElb105ViewModel({
      alive: true,
      alignment_timer_state: "idle",
    }).alignment_timer_text,
    "等待对准",
  );
  assert.equal(
    buildElb105ViewModel({
      alive: true,
      alignment_timer_state: "active",
      alignment_remaining_sec: 899.0,
    }).alignment_timer_text,
    "预计剩余 14:59",
  );
  assert.equal(
    buildElb105ViewModel({
      alive: true,
      alignment_timer_state: "timeout",
      alignment_elapsed_sec: 901.0,
    }).alignment_timer_text,
    "已超时 00:00:01",
  );
  assert.equal(
    buildElb105ViewModel({
      alive: true,
      alignment_timer_state: "complete",
    }).alignment_timer_text,
    "对准完成",
  );
  assert.equal(
    buildElb105ViewModel({
      alive: false,
      alignment_timer_state: "active",
      alignment_remaining_sec: 500.0,
    }).alignment_timer_text,
    "数据离线，倒计时不可用",
  );
});

test("invalid alignment timer values degrade to unavailable", () => {
  for (const value of [null, "", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      buildElb105ViewModel({
        alive: true,
        alignment_timer_state: "active",
        alignment_remaining_sec: value,
      }).alignment_timer_text,
      "倒计时不可用",
    );
    assert.equal(
      buildElb105ViewModel({
        alive: true,
        alignment_timer_state: "timeout",
        alignment_elapsed_sec: value,
      }).alignment_timer_text,
      "倒计时不可用",
    );
  }
});
