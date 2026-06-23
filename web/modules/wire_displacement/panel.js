const WIRE_CHANNEL_COUNT = 2;
const WIRE_RANGE_MM = 250.0;

function fmtMm(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "—";
  }
  return `${num.toFixed(2)} mm`;
}

function setCell(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function setWireBar(barId, mm, maxMm) {
  const bar = document.getElementById(barId);
  const num = Number(mm);

  if (!bar) {
    return;
  }

  if (!Number.isFinite(num) || num < 0.0) {
    bar.style.width = "0%";
    return;
  }

  const clamped = Math.max(0.0, Math.min(maxMm, num));
  const widthPct = maxMm > 0.0 ? (clamped / maxMm) * 100.0 : 0.0;
  bar.style.width = `${widthPct.toFixed(1)}%`;
}

export default {
  id: "wire_displacement",
  title: "拉线位移 WPS MK30",

  mount(root) {
    const rows = [];
    for (let ch = 0; ch < WIRE_CHANNEL_COUNT; ch += 1) {
      rows.push(`
        <tr>
          <td class="mono">[${ch}]</td>
          <td class="mono" id="wire-value-${ch}">—</td>
        </tr>
      `);
    }

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
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="wire-hw" class="value mono-block">WPS MK30 ×2 · ADS7128</div></div>
        </div>
        <div class="hint">
          WPS-250-MK30-P10（3.3 V 激励 / 250 mm）→ ADS7128 ADC
          → MCN <code>sensor_wire_displacement</code>
          → MAVLink <code>WIRE_DISPLACEMENT_STATUS</code> (msgid 27, 50Hz)
          → ROS <code>/WireDisplacementStatus</code>。
          换算：<code>mm = (V / V_exc) × 250 − offset</code>。
        </div>
      </section>

      <section class="panel">
        <h2>双通道位移</h2>
        <div class="card-grid">
          <div class="card"><div class="label">timestamp_ms</div><div id="wire-ts" class="value mono-block">—</div></div>
        </div>
        ${[0, 1]
          .map(
            (ch) => `
          <div class="card wide" style="margin-top:8px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
              <span class="hint" style="margin:0">通道 [${ch}]</span>
              <span id="wire-ch${ch}-bar-label" class="value mono-block" style="margin:0;font-size:1rem">—</span>
            </div>
            <div style="height:12px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid var(--border);overflow:hidden">
              <div id="wire-ch${ch}-bar" style="height:100%;width:0%;background:var(--accent);transition:width 0.2s ease"></div>
            </div>
          </div>
        `,
          )
          .join("")}
        <p class="hint" style="margin:6px 0 0">满量程 250 mm；进度条按 250 mm 标度。</p>
      </section>

      <section class="panel">
        <h2>WIRE_DISPLACEMENT_STATUS 全通道</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>通道</th>
                <th>displacement_mm</th>
              </tr>
            </thead>
            <tbody>
              ${rows.join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  },

  update(snapshot) {
    const data = snapshot.modules?.wire_displacement;
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
      "wire-hw",
      data.hardware ?? "WPS-250-MK30-P10 ×2 · ADS7128 · 3.3V / 250mm",
    );
    setCell(
      "wire-ts",
      connected && data.timestamp_ms != null ? String(data.timestamp_ms) : "—",
    );

    const mmList = data.displacement_mm || [];

    for (let ch = 0; ch < WIRE_CHANNEL_COUNT; ch += 1) {
      const mm = mmList[ch];
      setCell(`wire-value-${ch}`, connected ? fmtMm(mm) : "—");
      setCell(`wire-ch${ch}-bar-label`, connected ? fmtMm(mm) : "—");
      setWireBar(`wire-ch${ch}-bar`, mm, WIRE_RANGE_MM);
    }
  },

  destroy() {},
};
