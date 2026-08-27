/** DVL 链路 / 模式 / 更新脉冲 分层判定（ELB105 snapshot 字段）。 */

export function dvlHasUpdateHistory(data) {
  const count = Number(data?.dvl_update_count);
  return Number.isFinite(count) && count > 0;
}

export function dvlModeIsValid(data) {
  if (data?.dvl_valid_ok === true) {
    return true;
  }
  const flags = Number(data?.dvl_valid_flags);
  return flags === 1 || flags === 7;
}

export function dvlLinkOnline(data) {
  if (data?.alive !== true) {
    return false;
  }
  return dvlModeIsValid(data) || dvlHasUpdateHistory(data);
}

export function dvlPulseHint(data) {
  const latch = data?.dvl_update_latch_state;
  const ageSec = Number(data?.dvl_update_age_sec);
  const count = Number(data?.dvl_update_count);
  const countText = Number.isFinite(count) ? ` · 累计 ${count} 次` : "";

  if (latch === "waiting") {
    return "等待首次速度更新脉冲";
  }
  if (latch === "recent") {
    return "近期有速度更新";
  }
  if (latch === "timeout" && Number.isFinite(ageSec)) {
    return `低频更新 · 末次脉冲 ${ageSec.toFixed(0)}s 前${countText}`;
  }
  return null;
}

export function assessDvlUpdateDisplay(data) {
  if (data?.alive === false) {
    return { text: "惯导离线", state: "offline", ok: false };
  }

  const latch = data?.dvl_update_latch_state;
  if (latch == null || latch === "") {
    return { text: "--", state: "unknown", ok: false };
  }

  if (latch === "waiting") {
    if (dvlModeIsValid(data)) {
      return { text: "等待首次速度更新脉冲", state: "waiting", ok: false };
    }
    return { text: "等待首次更新", state: "waiting", ok: false };
  }

  const ageSec = Number(data?.dvl_update_age_sec);
  if (!Number.isFinite(ageSec) || ageSec < 0.0) {
    return { text: "更新状态不可用", state: "unknown", ok: false };
  }

  const countSuffix = dvlHasUpdateHistory(data)
    ? ` · 累计 ${Number(data.dvl_update_count)} 次`
    : "";

  if (latch === "recent") {
    return {
      text: `更新正常 · 距今 ${ageSec.toFixed(2)}s${countSuffix}`,
      state: "recent",
      ok: true,
    };
  }

  if (latch === "timeout") {
    const linkActive = dvlLinkOnline(data);
    if (linkActive) {
      return {
        text: `低频更新 · 末次脉冲 ${ageSec.toFixed(2)}s 前${countSuffix}`,
        state: "slow",
        ok: true,
      };
    }
    return {
      text: `更新超时 · 距今 ${ageSec.toFixed(2)}s`,
      state: "timeout",
      ok: false,
    };
  }

  return { text: `未知状态 (${latch})`, state: "unknown", ok: false };
}

export function assessDvlModeDisplay(data) {
  const flags = Number(data?.dvl_valid_flags);
  const label = data?.dvl_mode_label;

  if (!Number.isFinite(flags)) {
    return { text: "--", state: "unknown", ok: false, detail: "有效位不可用" };
  }

  if (flags === 1 || flags === 7) {
    const text = label || (flags === 1 ? "1 对底" : "7 对流");
    return { text, state: "valid", ok: true, detail: text };
  }

  if (flags === 0) {
    if (dvlLinkOnline(data) && dvlHasUpdateHistory(data)) {
      return {
        text: label || "0 本帧无效",
        state: "idle",
        ok: true,
        detail: "本帧无效 · 链路正常",
      };
    }
    return { text: label || "0 无效", state: "invalid", ok: false, detail: "无效 (0)" };
  }

  const unknownText = label || `未知 (${flags})`;
  return { text: unknownText, state: "unknown", ok: false, detail: unknownText };
}
