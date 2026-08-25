const PLUNGER_WIRE_CH = 0;
const WIRE_RANGE_MM = 250.0;

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

function setWireBar(barId, mm) {
  const bar = document.getElementById(barId);
  const num = Number(mm);

  if (!bar) {
    return;
  }

  if (!Number.isFinite(num) || num < 0.0) {
    bar.style.width = "0%";
    return;
  }

  bar.style.width = `${mmToPct(num).toFixed(1)}%`;
}

export function plungerWireHtml() {
  return `
      <section class="panel">
        <h2>拉线 CH0 · 柱塞泵 0 反馈</h2>
        <div class="card-grid">
          <div class="card"><div class="label">拉线连接</div><div id="pp-wire-connected" class="value">--</div></div>
          <div class="card"><div class="label">话题</div><div id="pp-wire-topic" class="value mono-block">/WireDisplacementStatus</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="pp-wire-age" class="value">--</div></div>
        </div>
        <div class="card wide" style="margin-top:8px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
            <span class="hint" style="margin:0">CH0 · 泵 0（pwm3 CH3 / PC8）</span>
            <span id="pp-wire-ch0-label" class="value mono-block" style="margin:0;font-size:1rem">—</span>
          </div>
          <div style="height:14px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid var(--border);overflow:hidden">
            <div id="pp-wire-ch0-bar" style="height:100%;width:0%;background:var(--accent);transition:width 0.2s ease"></div>
          </div>
          <p class="hint" style="margin:6px 0 0">
            WPS-250-MK30 CH0，满量程 250 mm。MCU 柱塞泵仍开环 PWM，此条只看位移有没有跟着转。
            泵 1 无拉线。
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
    setWireBar("pp-wire-ch0-bar", NaN);
    return;
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
}
