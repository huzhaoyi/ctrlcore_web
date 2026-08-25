import {
  mountPitchMotorControls,
  pitchMotorHtml,
  updatePitchMotor,
} from "../pitch_motor/panel_fragment.js";

const WIRE_RANGE_MM = 250.0;

/* 俯仰电机限位 · MCU 读 displacement_mm[1] = WPS CH1 */
const PITCH_WIRE_CH = 1;
const PITCH_TRAVEL_MIN_MM = 45.0;
const PITCH_TRAVEL_MAX_MM = 125.0;

function fmtMm(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "—";
  }
  return `${num.toFixed(2)} mm`;
}

function mmToPct(mm, maxMm = WIRE_RANGE_MM) {
  const num = Number(mm);
  if (!Number.isFinite(num)) {
    return 0.0;
  }
  const clamped = Math.max(0.0, Math.min(maxMm, num));
  return maxMm > 0.0 ? (clamped / maxMm) * 100.0 : 0.0;
}

function setCell(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function pitchLimitStatus(mm) {
  const num = Number(mm);
  if (!Number.isFinite(num)) {
    return "unknown";
  }
  if (num < PITCH_TRAVEL_MIN_MM) {
    return "below";
  }
  if (num > PITCH_TRAVEL_MAX_MM) {
    return "above";
  }
  return "in_range";
}

function setPitchBar(mm) {
  const bar = document.getElementById("wire-ch1-bar");
  const num = Number(mm);

  if (!bar) {
    return;
  }

  if (!Number.isFinite(num) || num < 0.0) {
    bar.style.width = "0%";
    bar.style.background = "var(--accent)";
    return;
  }

  bar.style.width = `${mmToPct(num).toFixed(1)}%`;
  const status = pitchLimitStatus(num);
  if (status === "in_range") {
    bar.style.background = "rgba(46, 204, 113, 0.85)";
  } else {
    bar.style.background = "rgba(243, 18, 96, 0.85)";
  }
}

function pitchBarHtml() {
  const minPct = mmToPct(PITCH_TRAVEL_MIN_MM).toFixed(2);
  const maxPct = mmToPct(PITCH_TRAVEL_MAX_MM).toFixed(2);
  const zoneWidth = (
    mmToPct(PITCH_TRAVEL_MAX_MM) - mmToPct(PITCH_TRAVEL_MIN_MM)
  ).toFixed(2);

  return `
          <div class="card wide" style="margin-top:8px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
              <span class="hint" style="margin:0">CH1 · 俯仰电机（45~125 mm MCU 软限位）</span>
              <span id="wire-ch1-bar-label" class="value mono-block" style="margin:0;font-size:1rem">—</span>
            </div>
            <div style="position:relative;margin-top:20px;padding-top:2px">
              <div style="position:relative;height:14px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid var(--border);overflow:visible">
                <div aria-hidden="true" style="position:absolute;inset:0;pointer-events:none">
                  <div style="position:absolute;left:${minPct}%;width:${zoneWidth}%;top:0;bottom:0;background:rgba(46,204,113,0.14);border-radius:2px"></div>
                  <div style="position:absolute;left:${minPct}%;top:-2px;bottom:-2px;width:0;border-left:2px solid #e74c3c;box-shadow:0 0 4px rgba(231,76,60,0.6)" title="正转限位 ${PITCH_TRAVEL_MIN_MM} mm"></div>
                  <div style="position:absolute;left:${maxPct}%;top:-2px;bottom:-2px;width:0;border-left:2px solid #e74c3c;box-shadow:0 0 4px rgba(231,76,60,0.6)" title="反转限位 ${PITCH_TRAVEL_MAX_MM} mm"></div>
                  <span class="mono" style="position:absolute;left:calc(${minPct}% - 4px);top:-18px;transform:translateX(-50%);font-size:10px;color:#e74c3c">${PITCH_TRAVEL_MIN_MM}</span>
                  <span class="mono" style="position:absolute;left:calc(${maxPct}% + 4px);top:-18px;transform:translateX(-50%);font-size:10px;color:#e74c3c">${PITCH_TRAVEL_MAX_MM}</span>
                </div>
                <div style="position:relative;height:100%;border-radius:999px;overflow:hidden">
                  <div id="wire-ch1-bar" style="height:100%;width:0%;background:var(--accent);transition:width 0.2s ease, background 0.2s ease"></div>
                </div>
              </div>
            </div>
            <p class="hint" style="margin:4px 0 0">红线：MCU 软限位（正转≤${PITCH_TRAVEL_MIN_MM} mm，反转≥${PITCH_TRAVEL_MAX_MM} mm）；绿区为允许行程。CH0 在「拉线位移 / 柱塞泵」。</p>
          </div>
        `;
}

function pitchLimitLabel(connected, mm) {
  if (!connected) {
    return "—";
  }
  const status = pitchLimitStatus(mm);
  if (status === "in_range") {
    return "行程内";
  }
  if (status === "below") {
    return "低于下限";
  }
  if (status === "above") {
    return "超过上限";
  }
  return "—";
}

export default {
  id: "wire_displacement",
  title: "拉线位移 / 俯仰电机",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="wire-connected" class="value">--</div></div>
          <div class="card"><div class="label">接收计数</div><div id="wire-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="wire-age" class="value">--</div></div>
          <div class="card"><div class="label">ROS 话题</div><div id="wire-topic" class="value mono-block">/WireDisplacementStatus</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="wire-hw" class="value mono-block">WPS MK30 CH1 · ADS7128</div></div>
        </div>
        <div class="hint">
          本页只用 <code>WPS CH1</code> = <code>displacement_mm[1]</code>（俯仰限位）。
          CH0 柱塞泵反馈在「拉线位移 / 柱塞泵」。
          换算：<code>mm = (V / V_exc) × 250 − offset</code>（0 V→0 mm）。
        </div>
      </section>

      <section class="panel">
        <h2>CH1 位移</h2>
        <div class="card-grid">
          <div class="card"><div class="label">timestamp_ms</div><div id="wire-ts" class="value mono-block">—</div></div>
          <div class="card"><div class="label">displacement_mm</div><div id="wire-value-1" class="value mono-block">—</div></div>
          <div class="card"><div class="label">软限位</div><div id="wire-status-1" class="value">—</div></div>
        </div>
        ${pitchBarHtml()}
        <p class="hint" style="margin:6px 0 0">满量程 250 mm；进度条按 250 mm 标度。</p>
      </section>

      ${pitchMotorHtml()}
    `;

    mountPitchMotorControls();
  },

  update(snapshot) {
    const data = snapshot.modules?.wire_displacement;
    updatePitchMotor(snapshot);
    if (!data) {
      return;
    }

    const connected = Boolean(data.connected);
    setCell("wire-connected", connected ? "在线" : "离线");
    setCell("wire-rx-count", data.rx_count ?? 0);
    setCell(
      "wire-age",
      data.age_sec != null ? Number(data.age_sec).toFixed(3) : "—",
    );
    setCell("wire-topic", data.status_topic ?? "/WireDisplacementStatus");
    setCell(
      "wire-ts",
      connected && data.timestamp_ms != null ? String(data.timestamp_ms) : "—",
    );

    const mm = (data.displacement_mm || [])[PITCH_WIRE_CH];
    setCell("wire-value-1", connected ? fmtMm(mm) : "—");
    setCell("wire-ch1-bar-label", connected ? fmtMm(mm) : "—");
    setCell("wire-status-1", pitchLimitLabel(connected, mm));
    setPitchBar(connected ? mm : NaN);
  },

  destroy() {},
};
