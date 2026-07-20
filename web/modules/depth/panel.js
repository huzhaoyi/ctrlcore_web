const DEPTH_CHANNEL_COUNT = 4;

function fmtDepthM(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "—";
  }
  return `${num.toFixed(3)} m`;
}

function fmtTempC(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0.0) {
    return "—";
  }
  return `${num.toFixed(2)} °C`;
}

function setCell(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function setDepthBar(barId, depthM, maxDepthM) {
  const bar = document.getElementById(barId);
  const num = Number(depthM);

  if (!bar) {
    return;
  }

  if (!Number.isFinite(num) || num < 0.0) {
    bar.style.width = "0%";
    return;
  }

  const clamped = Math.max(0.0, Math.min(maxDepthM, num));
  const widthPct = maxDepthM > 0.0 ? (clamped / maxDepthM) * 100.0 : 0.0;
  bar.style.width = `${widthPct.toFixed(1)}%`;
}

export default {
  id: "depth",
  title: "深度计 Keller 21Y",

  mount(root) {
    const rows = [];
    for (let ch = 0; ch < DEPTH_CHANNEL_COUNT; ch += 1) {
      rows.push(`
        <tr>
          <td class="mono">[${ch}]</td>
          <td class="mono" id="depth-value-${ch}">—</td>
          <td class="mono" id="depth-temp-${ch}">—</td>
        </tr>
      `);
    }

    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="depth-connected" class="value">--</div></div>
          <div class="card"><div class="label">接收计数</div><div id="depth-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="depth-age" class="value">--</div></div>
          <div class="card"><div class="label">ROS 话题</div><div id="depth-topic" class="value mono-block">/DepthStatus</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="depth-hw" class="value mono-block">Keller 21Y · ADS7128</div></div>
        </div>
        <div class="hint">
          Keller 21Y（0.5–4.5 V / 0–250 bar gauge）→ ADS7128 DEV1 CH0（软件 I2C2）
          → MCN <code>sensor_keller_depth</code>
          → MAVLink <code>DEPTH_STATUS</code> (msgid 7, 50Hz)
          → ROS <code>/DepthStatus</code>。
          通道 [0] 为 Keller；温度通道无硬件，应为 0。
        </div>
      </section>

      <section class="panel">
        <h2>DEPTH_STATUS · 通道 [0]</h2>
        <div class="card-grid">
          <div class="card"><div class="label">timestamp_ms</div><div id="depth-ts" class="value mono-block">—</div></div>
          <div class="card"><div class="label">depth_m [0]</div><div id="depth-ch0-label" class="value mono-block">—</div></div>
        </div>
        <div class="card wide" style="margin-top:8px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
            <span class="hint" style="margin:0">水深（相对水面，向下为正）</span>
            <span id="depth-ch0-bar-label" class="value mono-block" style="margin:0;font-size:1rem">—</span>
          </div>
          <div style="height:12px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid var(--border);overflow:hidden">
            <div id="depth-ch0-bar" style="height:100%;width:0%;background:var(--accent);transition:width 0.2s ease"></div>
          </div>
          <p class="hint" style="margin:6px 0 0">满量程约 2500 m（250 bar）；进度条按 2500 m 标度。</p>
        </div>
      </section>

      <section class="panel">
        <h2>DEPTH_STATUS 全通道</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>通道</th>
                <th>depth_m</th>
                <th>temperature_c</th>
              </tr>
            </thead>
            <tbody>
              ${rows.join("")}
            </tbody>
          </table>
        </div>
        <p class="hint">Keller 模拟量仅使用 depth_m[0]；depth_m[1..3] 与 temperature_c 保留协议字段。</p>
      </section>
    `;
  },

  update(snapshot) {
    const data = snapshot.modules?.depth;
    if (!data) {
      return;
    }

    const connected = Boolean(data.connected);
    setCell("depth-connected", connected ? "在线" : "离线");
    setCell("depth-rx-count", data.rx_count ?? 0);
    setCell(
      "depth-age",
      data.age_sec != null ? Number(data.age_sec).toFixed(3) : "—",
    );
    setCell("depth-topic", data.status_topic ?? "/DepthStatus");
    setCell(
      "depth-hw",
      data.hardware ?? "Keller 21Y · ADS7128 DEV1 CH0 · 0.5–4.5V / 0–250 bar",
    );
    setCell(
      "depth-ts",
      connected && data.timestamp_ms != null ? String(data.timestamp_ms) : "—",
    );

    const depthList = data.depth_m || [];
    const tempList = data.temperature_c || [];
    const depth0 = depthList[0];

    setCell("depth-ch0-label", connected ? fmtDepthM(depth0) : "—");
    setCell("depth-ch0-bar-label", connected ? fmtDepthM(depth0) : "—");
    setDepthBar("depth-ch0-bar", depth0, 2500.0);

    for (let ch = 0; ch < DEPTH_CHANNEL_COUNT; ch += 1) {
      setCell(`depth-value-${ch}`, connected ? fmtDepthM(depthList[ch]) : "—");
      setCell(`depth-temp-${ch}`, connected ? fmtTempC(tempList[ch]) : "—");
    }
  },

  destroy() {},
};
