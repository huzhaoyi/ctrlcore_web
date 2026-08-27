import {
  assessDvlModeDisplay,
  assessDvlUpdateDisplay,
} from "./dvl_health.mjs";

const ALIGNMENT_LABELS = new Map([
  [0, "0 待机 (Standby)"],
  [1, "1 粗对准 (Coarse alignment)"],
  [2, "2 精对准 (Fine alignment)"],
  [3, "3 对准完成 (Aligned)"],
]);

function isPresent(value) {
  return value !== null && value !== undefined && value !== "";
}

function numberText(value, digits, signed = false) {
  if (!isPresent(value)) {
    return "--";
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "--";
  }

  const prefix = signed && number >= 0.0 ? "+" : "";
  return `${prefix}${number.toFixed(digits)}`;
}

function scalarText(value) {
  return isPresent(value) ? String(value) : "--";
}

function stampText(sec, nanosec) {
  if (!isPresent(sec) || !isPresent(nanosec)) {
    return "--";
  }

  const secNumber = Number(sec);
  const nanosecNumber = Number(nanosec);
  if (!Number.isFinite(secNumber) || !Number.isFinite(nanosecNumber)) {
    return "--";
  }

  const fraction = Math.trunc(nanosecNumber).toString().padStart(9, "0");
  return `${Math.trunc(secNumber)}.${fraction}`;
}

function clockText(totalSec) {
  const seconds = Math.max(0, Math.floor(Number(totalSec)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function countdownText(data) {
  if (data?.alive !== true) {
    return { text: "数据离线，倒计时不可用", state: "offline" };
  }
  if (data?.alignment_timer_state === "idle") {
    return { text: "等待对准", state: "idle" };
  }
  if (data?.alignment_timer_state === "complete") {
    return { text: "对准完成", state: "complete" };
  }
  if (
    data?.alignment_timer_state === "active" &&
    isPresent(data?.alignment_remaining_sec) &&
    Number.isFinite(Number(data?.alignment_remaining_sec))
  ) {
    const remaining = Math.ceil(Number(data.alignment_remaining_sec));
    return {
      text: `预计剩余 ${clockText(remaining).slice(3)}`,
      state: "active",
    };
  }
  if (
    data?.alignment_timer_state === "timeout" &&
    isPresent(data?.alignment_elapsed_sec) &&
    Number.isFinite(Number(data?.alignment_elapsed_sec))
  ) {
    const overtime = Math.max(0, Number(data.alignment_elapsed_sec) - 900.0);
    return { text: `已超时 ${clockText(overtime)}`, state: "timeout" };
  }
  return { text: "倒计时不可用", state: "unavailable" };
}

export function alignmentLabel(status) {
  if (!isPresent(status) || !Number.isFinite(Number(status))) {
    return "--";
  }

  const code = Number(status);
  return ALIGNMENT_LABELS.get(code) ?? `未知状态 (${code})`;
}

export function buildAlignmentRequest(latitude, longitude, altitude) {
  if (!isPresent(latitude) || !isPresent(longitude) || !isPresent(altitude)) {
    return { ok: false, error: "纬度、经度和高度不能为空" };
  }

  const latitudeDeg = Number(latitude);
  const longitudeDeg = Number(longitude);
  const altitudeM = Number(altitude);
  if (
    !Number.isFinite(latitudeDeg) ||
    !Number.isFinite(longitudeDeg) ||
    !Number.isFinite(altitudeM)
  ) {
    return { ok: false, error: "纬度、经度和高度必须是有限数值" };
  }
  if (latitudeDeg < -90.0 || latitudeDeg > 90.0) {
    return { ok: false, error: "纬度必须在 -90° 到 +90° 之间" };
  }
  if (longitudeDeg < -180.0 || longitudeDeg > 180.0) {
    return { ok: false, error: "经度必须在 -180° 到 +180° 之间" };
  }

  return {
    ok: true,
    body: {
      latitude_deg: latitudeDeg,
      longitude_deg: longitudeDeg,
      altitude_m: altitudeM,
    },
  };
}

export function buildElb105ViewModel(data = {}) {
  const alignmentStatus = Number(data?.alignment_status);
  const dvlUpdate = assessDvlUpdateDisplay(data);
  const dvlMode = assessDvlModeDisplay(data);
  const countdown = countdownText(data);
  const connected = Boolean(data?.connected);

  return {
    connected_text: connected ? "在线" : "等待中",
    connected,
    rx_count: scalarText(data?.rx_count),
    age: numberText(data?.age_sec, 3),
    topic: data?.topic || "/elb105/shzr04",
    hardware:
      data?.hardware ||
      "OBC RS422 USB · ELB105-SHZR04(3) · 460800 · SHZR04 147B",
    frame_seq: scalarText(data?.frame_seq),
    imu_time: numberText(data?.imu_time_sec, 3),
    frame_id: scalarText(data?.frame_id),
    stamp: stampText(data?.stamp_sec, data?.stamp_nanosec),
    alignment_text:
      data?.alignment_label || alignmentLabel(data?.alignment_status),
    alignment_ok: alignmentStatus === 3,
    alignment_timer_text: countdown.text,
    alignment_timer_state: countdown.state,
    heading: numberText(data?.heading_deg, 2),
    pitch: numberText(data?.pitch_deg, 2, true),
    roll: numberText(data?.roll_deg, 2, true),
    gyro_x: numberText(data?.gyro_x_degps, 4, true),
    gyro_y: numberText(data?.gyro_y_degps, 4, true),
    gyro_z: numberText(data?.gyro_z_degps, 4, true),
    accel_x: numberText(data?.accel_x_mps2, 4, true),
    accel_y: numberText(data?.accel_y_mps2, 4, true),
    accel_z: numberText(data?.accel_z_mps2, 4, true),
    latitude: numberText(data?.latitude_deg, 6, true),
    longitude: numberText(data?.longitude_deg, 6, true),
    velocity_north: numberText(data?.velocity_north_mps, 3, true),
    velocity_east: numberText(data?.velocity_east_mps, 3, true),
    velocity_down: numberText(data?.velocity_down_mps, 3, true),
    dvl_bottom_front: numberText(data?.dvl_bottom_front_mps, 3, true),
    dvl_bottom_right: numberText(data?.dvl_bottom_right_mps, 3, true),
    dvl_bottom_down: numberText(data?.dvl_bottom_down_mps, 3, true),
    dvl_water_front: numberText(data?.dvl_water_front_mps, 3, true),
    dvl_water_right: numberText(data?.dvl_water_right_mps, 3, true),
    dvl_water_down: numberText(data?.dvl_water_down_mps, 3, true),
    dvl_bottom_height: numberText(data?.dvl_bottom_height_m, 3),
    dvl_update_text: dvlUpdate.text,
    dvl_update_state: dvlUpdate.state,
    dvl_update_ok: dvlUpdate.ok,
    dvl_update_count: scalarText(data?.dvl_update_count),
    dvl_valid_text: data?.dvl_mode_label || dvlMode.text,
    dvl_valid_state: dvlMode.state,
    dvl_valid_hex: scalarText(data?.dvl_valid_flags_hex),
    dvl_valid_ok: dvlMode.ok,
    temperature: numberText(data?.imu_temperature_c, 2),
    dvl_speed_scale: numberText(data?.dvl_speed_scale, 6),
    dvl_mount_error: numberText(data?.dvl_mount_error_deg, 4, true),
  };
}
