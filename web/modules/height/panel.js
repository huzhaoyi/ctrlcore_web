const HEIGHT_INVALID = 65535;

function fmtDistCm(cm) {
  const value = Number(cm);
  if (!Number.isFinite(value) || value <= 0 || value >= HEIGHT_INVALID) {
    return "—";
  }
  return `${value} cm (${(value / 100.0).toFixed(3)} m)`;
}

function fmtStren(stren) {
  const value = Number(stren);
  if (!Number.isFinite(value) || value >= HEIGHT_INVALID) {
    return "—";
  }
  return String(value);
}

function setCell(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

export default {
  id: "height",
  title: "高度计 GCRY-S400",

  mount(root) {
    const rows = [];
    for (let ch = 0; ch < 5; ch += 1) {
      rows.push(`
        <tr>
          <td class="mono">[${ch}]</td>
          <td class="mono" id="height-near-dist-${ch}">—</td>
          <td class="mono" id="height-near-stren-${ch}">—</td>
          <td class="mono" id="height-far-dist-${ch}">—</td>
          <td class="mono" id="height-far-stren-${ch}">—</td>
          <td class="mono" id="height-most-dist-${ch}">—</td>
          <td class="mono" id="height-most-stren-${ch}">—</td>
        </tr>
      `);
    }

    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="height-connected" class="value">--</div></div>
          <div class="card"><div class="label">接收计数</div><div id="height-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="height-age" class="value">--</div></div>
          <div class="card"><div class="label">ROS 话题</div><div id="height-topic" class="value mono-block">/SonarAltimeterStatus</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="height-hw" class="value mono-block">uart3 RS485 · GCRY-S400-FL</div></div>
        </div>
        <div class="hint">
          MCU <code>uart3</code> RS485 GCRY-S400-FL（NMEA <code>$SDDBT</code> @9600，硬件 4Hz）
          → MCN <code>sensor_gcry_altimeter</code> → MAVLink <code>HEIGHT_STATUS</code> (msgid 6, 4Hz)
          → ROS <code>/SonarAltimeterStatus</code>。
          字段与 <code>mavlink_height_status_t</code> 一致；距离单位 cm，无效值 65535。
        </div>
      </section>

      <section class="panel">
        <h2>HEIGHT_STATUS</h2>
        <div class="card-grid">
          <div class="card wide">
            <div class="label">timestamp_ms</div>
            <div id="height-timestamp-ms" class="value mono-block">—</div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>通道</th>
                <th>near_dist [cm]</th>
                <th>near_stren</th>
                <th>far_dist [cm]</th>
                <th>far_stren</th>
                <th>most_dist [cm]</th>
                <th>most_stren</th>
              </tr>
            </thead>
            <tbody>
              ${rows.join("")}
            </tbody>
          </table>
        </div>
        <p class="hint">GCRY 简易声呐仅使用通道 [0] 的 near_dist；其余通道应为 65535。</p>
      </section>
    `;
  },

  update(snapshot) {
    const data = snapshot.modules?.height;
    if (!data) {
      return;
    }

    const connected = Boolean(data.connected);
    setCell("height-connected", connected ? "在线" : "离线");
    setCell("height-rx-count", data.rx_count ?? 0);
    setCell(
      "height-age",
      data.age_sec != null ? Number(data.age_sec).toFixed(3) : "—",
    );
    setCell("height-topic", data.status_topic ?? "/SonarAltimeterStatus");
    setCell("height-hw", data.hardware ?? "uart3 RS485 · GCRY-S400-FL · NMEA $SDDBT @9600");
    setCell(
      "height-timestamp-ms",
      connected && data.timestamp_ms != null ? String(data.timestamp_ms) : "—",
    );

    const nearDist = data.near_dist || [];
    const nearStren = data.near_stren || [];
    const farDist = data.far_dist || [];
    const farStren = data.far_stren || [];
    const mostDist = data.most_dist || [];
    const mostStren = data.most_stren || [];

    for (let ch = 0; ch < 5; ch += 1) {
      setCell(`height-near-dist-${ch}`, fmtDistCm(nearDist[ch]));
      setCell(`height-near-stren-${ch}`, fmtStren(nearStren[ch]));
      setCell(`height-far-dist-${ch}`, fmtDistCm(farDist[ch]));
      setCell(`height-far-stren-${ch}`, fmtStren(farStren[ch]));
      setCell(`height-most-dist-${ch}`, fmtDistCm(mostDist[ch]));
      setCell(`height-most-stren-${ch}`, fmtStren(mostStren[ch]));
    }
  },

  destroy() {},
};
