const PLUNGER_WIRE_CH = 0;
const WIRE_RANGE_MM = 250.0;
const PLUNGER_TRAVEL_MAX_MM = 176.29;

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

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

export function plungerCh0AtMax(mm) {
  const num = Number(mm);
  return Number.isFinite(num) && num >= PLUNGER_TRAVEL_MAX_MM;
}

function setWireBar(barId, mm) {
  const bar = document.getElementById(barId);
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
  if (plungerCh0AtMax(num)) {
    bar.style.background = "rgba(243, 18, 96, 0.85)";
  } else {
    bar.style.background = "rgba(46, 204, 113, 0.85)";
  }
}

export function plungerWireHtml() {
  const maxPct = mmToPct(PLUNGER_TRAVEL_MAX_MM).toFixed(2);

  return `
      <section class="panel">
        <h2>拉线 CH0 · 柱塞泵共用反馈</h2>
        <div class="card-grid">
          <div class="card"><div class="label">拉线连接</div><div id="pp-wire-connected" class="value">--</div></div>
          <div class="card"><div class="label">话题</div><div id="pp-wire-topic" class="value mono-block">/WireDisplacementStatus</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="pp-wire-age" class="value">--</div></div>
          <div class="card"><div class="label">软限位</div><div id="pp-wire-limit" class="value">—</div></div>
        </div>
        <div class="card wide" style="margin-top:8px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
            <span class="hint" style="margin:0">CH0 · 双泵共用（MCU 软限位 ≥${PLUNGER_TRAVEL_MAX_MM} mm 两路都停）</span>
            <span id="pp-wire-ch0-label" class="value mono-block" style="margin:0;font-size:1rem">—</span>
          </div>
          <div style="position:relative;margin-top:20px;padding-top:2px">
            <div style="position:relative;height:14px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid var(--border);overflow:visible">
              <div aria-hidden="true" style="position:absolute;inset:0;pointer-events:none">
                <div style="position:absolute;left:0;width:${maxPct}%;top:0;bottom:0;background:rgba(46,204,113,0.14);border-radius:2px"></div>
                <div style="position:absolute;left:${maxPct}%;top:-2px;bottom:-2px;width:0;border-left:2px solid #e74c3c;box-shadow:0 0 4px rgba(231,76,60,0.6)" title="双泵停转 ${PLUNGER_TRAVEL_MAX_MM} mm"></div>
                <span class="mono" style="position:absolute;left:calc(${maxPct}% + 4px);top:-18px;transform:translateX(-50%);font-size:10px;color:#e74c3c">${PLUNGER_TRAVEL_MAX_MM}</span>
              </div>
              <div style="position:relative;height:100%;border-radius:999px;overflow:hidden">
                <div id="pp-wire-ch0-bar" style="height:100%;width:0%;background:var(--accent);transition:width 0.2s ease, background 0.2s ease"></div>
              </div>
            </div>
          </div>
          <p class="hint" style="margin:6px 0 0">
            红线：MCU 软限位，CH0 ≥ ${PLUNGER_TRAVEL_MAX_MM} mm 时两路 PWM 强制停（钳到 10%）。
            单开一泵较慢，两泵同开较快。另一侧行程未标定，暂不设。绿区为当前允许侧。
          </p>
        </div>
      </section>
    `;
}

export function updatePlungerWire(snapshot) {
  const data = snapshot.modules?.wire_displacement;
  if (!data) {
    setText("pp-wire-connected", "离线");
    setText("pp-wire-ch0-label", "—");
    setText("pp-wire-limit", "—");
    setWireBar("pp-wire-ch0-bar", NaN);
    return false;
  }

  const connected = Boolean(data.connected);
  setText("pp-wire-connected", connected ? "在线" : "离线");
  setText("pp-wire-topic", data.status_topic ?? "/WireDisplacementStatus");
  setText(
    "pp-wire-age",
    data.age_sec != null ? Number(data.age_sec).toFixed(3) : "—",
  );

  const mm = (data.displacement_mm || [])[PLUNGER_WIRE_CH];
  setText("pp-wire-ch0-label", connected ? fmtMm(mm) : "—");
  setWireBar("pp-wire-ch0-bar", connected ? mm : NaN);

  if (!connected) {
    setText("pp-wire-limit", "—");
    return false;
  }

  if (plungerCh0AtMax(mm)) {
    setText("pp-wire-limit", `已到上限 ${PLUNGER_TRAVEL_MAX_MM} mm · 两路禁止转`);
    return true;
  }

  setText("pp-wire-limit", `行程内（上限 ${PLUNGER_TRAVEL_MAX_MM} mm）`);
  return false;
}
