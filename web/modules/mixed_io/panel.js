const MIXED_IO_ADC_CH_COUNT = 8;
const MIXED_IO_ADC_DEVS = [
  {
    devId: 1,
    addr: "0x10",
    baseIdx: 0,
    mavlinkField: "adc_dev1_Vin",
    snapshotKey: "adc_dev1_vin",
  },
  {
    devId: 2,
    addr: "0x11",
    baseIdx: 8,
    mavlinkField: "adc_dev2_Vin",
    snapshotKey: "adc_dev2_vin",
  },
  {
    devId: 3,
    addr: "0x12",
    baseIdx: 16,
    mavlinkField: "adc_dev3_Vin",
    snapshotKey: "adc_dev3_vin",
  },
];

function fmtV(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "—";
  }
  return `${num.toFixed(3)} V`;
}

function setCell(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function buildDevSection(dev) {
  const rows = [];
  for (let ch = 0; ch < MIXED_IO_ADC_CH_COUNT; ch += 1) {
    const flatIdx = dev.baseIdx + ch;
    rows.push(`
      <tr>
        <td class="mono">AIN${ch}</td>
        <td class="mono">adc_v[${flatIdx}]</td>
        <td class="mono" id="mixed-dev${dev.devId}-adc-${ch}">—</td>
      </tr>
    `);
  }

  return `
    <section class="panel mixed-dev-panel" id="mixed-dev-${dev.devId}-section">
      <h2>
        Dev${dev.devId} · ${dev.addr}
        <span class="mixed-dev-badge" id="mixed-dev-${dev.devId}-badge">—</span>
      </h2>
      <div class="hint mono-block">${dev.mavlinkField}[0..7] ↔ adc_v[${dev.baseIdx}..${dev.baseIdx + 7}]</div>
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead>
            <tr>
              <th>引脚</th>
              <th>索引</th>
              <th>电压 (V)</th>
            </tr>
          </thead>
          <tbody>
            ${rows.join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export default {
  id: "mixed_io",
  title: "混合 IO · ADC",

  mount(root) {
    const devSections = MIXED_IO_ADC_DEVS.map((dev) => buildDevSection(dev)).join("");

    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="mixed-connected" class="value">--</div></div>
          <div class="card"><div class="label">接收计数</div><div id="mixed-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="mixed-age" class="value">--</div></div>
          <div class="card"><div class="label">ROS 话题</div><div id="mixed-topic" class="value mono-block">/MixedIoStatus</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="mixed-hw" class="value mono-block">ADS7128</div></div>
        </div>
        <div class="hint">
          3×ADS7128 共 24 路 ADC（分压已还原）
          → MCN <code>i2c_get_adc_result</code>
          → MAVLink <code>MIXED_IO_DATA</code> (msgid 20, 50Hz)
          → ROS <code>/MixedIoStatus.adc_v[0..23]</code>。
        </div>
      </section>

      <section class="panel">
        <h2>MIXED_IO_DATA · 概览</h2>
        <div class="card-grid">
          <div class="card"><div class="label">mcu_timestamp_ms</div><div id="mixed-ts" class="value mono-block">—</div></div>
          <div class="card"><div class="label">link_ok</div><div id="mixed-link-ok" class="value mono-block">—</div></div>
          <div class="card"><div class="label">ADC 路数</div><div id="mixed-adc-count" class="value mono-block">24</div></div>
        </div>
        <p class="hint">
          未挂载芯片由 MCU 填 0；全 0 组会置灰显示「未挂载」。
          实际 probe 片数由固件 <code>ADS7128_PROBE_DEV_NUM</code> 控制。
        </p>
      </section>

      ${devSections}
    `;
  },

  update(snapshot) {
    const data = snapshot.modules?.mixed_io;
    if (!data) {
      return;
    }

    const connected = Boolean(data.connected);
    setCell("mixed-connected", connected ? "在线" : "离线");
    setCell("mixed-rx-count", data.rx_count ?? 0);
    setCell(
      "mixed-age",
      data.age_sec != null ? Number(data.age_sec).toFixed(3) : "—",
    );
    setCell("mixed-topic", data.status_topic ?? "/MixedIoStatus");
    setCell(
      "mixed-hw",
      data.hardware ?? "ADS7128 ×3 (24 路)",
    );
    setCell(
      "mixed-ts",
      connected && data.mcu_timestamp_ms != null
        ? String(data.mcu_timestamp_ms)
        : "—",
    );
    setCell(
      "mixed-link-ok",
      connected && data.link_ok != null ? String(data.link_ok) : "—",
    );

    const devActive = data.adc_dev_active || [];

    for (const dev of MIXED_IO_ADC_DEVS) {
      const adcList = data[dev.snapshotKey] || [];
      const devIdx = dev.devId - 1;
      const active = connected && Boolean(devActive[devIdx]);
      const section = document.getElementById(`mixed-dev-${dev.devId}-section`);
      const badge = document.getElementById(`mixed-dev-${dev.devId}-badge`);

      if (section) {
        section.classList.toggle("mixed-dev-inactive", connected && !active);
      }
      if (badge) {
        badge.textContent = connected ? (active ? "在线" : "未挂载") : "—";
        badge.classList.toggle("online", active);
        badge.classList.toggle("offline", connected && !active);
      }

      for (let ch = 0; ch < MIXED_IO_ADC_CH_COUNT; ch += 1) {
        setCell(
          `mixed-dev${dev.devId}-adc-${ch}`,
          connected ? fmtV(adcList[ch]) : "—",
        );
      }
    }
  },

  destroy() {},
};
