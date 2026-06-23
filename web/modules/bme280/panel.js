function fmt(val, digits = 2) {
  const num = Number(val);
  if (!Number.isFinite(num)) {
    return "—";
  }
  return num.toFixed(digits);
}

function fmtSigned(val, digits = 2) {
  const num = Number(val);
  if (!Number.isFinite(num)) {
    return "—";
  }
  return (num >= 0.0 ? "+" : "") + num.toFixed(digits);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

export default {
  id: "bme280",
  title: "板载 BME280",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="bme-connected" class="value">--</div></div>
          <div class="card"><div class="label">状态帧计数</div><div id="bme-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="bme-age" class="value">--</div></div>
          <div class="card"><div class="label">ROS 话题</div><div id="bme-topic" class="value mono-block">/Bme280Status</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="bme-link-hw" class="value mono-block">SPI2 · BME280</div></div>
        </div>
        <p class="hint">
          数据链：MCU SPI2 BME280 → MCN <code>sensor_BME280</code> → MAVLink
          <code>BEM280 (id=8, 1Hz)</code> → OBC bridge → ROS <code>/Bme280Status</code>。
          只读传感器，无下行命令。
        </p>
      </section>

      <section class="panel">
        <h2>帧头</h2>
        <div class="card-grid">
          <div class="card">
            <div class="label">timestamp_ms</div>
            <div id="bme-mcu-ts" class="value mono-block">—</div>
            <p class="hint">MCU 毫秒 tick，与驱动采样时刻一致</p>
          </div>
          <div class="card">
            <div class="label">ROS header.stamp</div>
            <div id="bme-ros-stamp" class="value mono-block">—</div>
            <p class="hint">OBC bridge 收到 MAVLink 后打 ROS 时间戳</p>
          </div>
          <div class="card">
            <div class="label">frame_id</div>
            <div id="bme-frame-id" class="value mono-block">—</div>
          </div>
          <div class="card">
            <div class="label">硬件</div>
            <div id="bme-hw" class="value mono-block">SPI2 · BME280</div>
            <p class="hint">芯片 ID 0x60，补偿值 cal_temperature / cal_humidity / cal_pressure</p>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>环境量测</h2>
        <div class="card-grid">
          <div class="card">
            <div class="label">temperature_c (°C)</div>
            <div id="bme-temp" class="value mono-block">—</div>
            <p id="bme-temp-hint" class="hint">补偿温度，典型 -40 ~ +85 °C</p>
          </div>
          <div class="card">
            <div class="label">humidity_rh (%RH)</div>
            <div id="bme-humi" class="value mono-block">—</div>
            <p id="bme-humi-parse" class="hint">—</p>
          </div>
          <div class="card">
            <div class="label">press_hpa (hPa)</div>
            <div id="bme-press" class="value mono-block">—</div>
            <p class="hint">补偿气压，1 hPa = 100 Pa，典型 300 ~ 1100 hPa</p>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>字段对照</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>字段</th><th>说明</th><th>值</th></tr>
            </thead>
            <tbody>
              <tr><td class="mono">timestamp_ms</td><td id="bme-f-ts-desc">—</td><td id="bme-f-ts" class="mono">—</td></tr>
              <tr><td class="mono">temperature_c</td><td id="bme-f-temp-desc">—</td><td id="bme-f-temp" class="mono">—</td></tr>
              <tr><td class="mono">humidity_rh</td><td id="bme-f-humi-desc">—</td><td id="bme-f-humi" class="mono">—</td></tr>
              <tr><td class="mono">press_hpa</td><td id="bme-f-press-desc">—</td><td id="bme-f-press" class="mono">—</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>协议字段对照</h2>
        <p class="mono-block">
          BEM280 (MCU→OBC, id=8): timestamp_ms, temp (°C), humi (%RH), press (hPa)<br>
          ROS Bme280Status: header, timestamp_ms, temperature_c, humidity_rh, press_hpa
        </p>
      </section>
    `;
  },

  update(snapshot) {
    const data = snapshot.modules?.bme280;
    if (!data) {
      return;
    }

    const connected = Boolean(data.connected);
    setText("bme-connected", connected ? "在线" : "离线");
    setText("bme-rx-count", data.rx_count ?? 0);
    setText("bme-age", data.age_sec != null ? fmt(data.age_sec, 3) : "—");
    setText("bme-topic", data.status_topic ?? "/Bme280Status");
    if (data.hardware) {
      setText("bme-link-hw", data.hardware);
      setText("bme-hw", data.hardware);
    }

    if (!connected) {
      setText("bme-mcu-ts", data.message || "等待 /Bme280Status");
      return;
    }

    setText("bme-mcu-ts", data.timestamp_ms != null ? String(data.timestamp_ms) : "—");
    const stampSec = data.stamp_sec;
    const stampNs = data.stamp_nanosec;
    if (stampSec != null) {
      setText(
        "bme-ros-stamp",
        `${stampSec}.${String(stampNs ?? 0).padStart(9, "0").slice(0, 9)} s`,
      );
    } else {
      setText("bme-ros-stamp", "—");
    }
    setText("bme-frame-id", data.frame_id ?? "—");

    setText("bme-temp", fmtSigned(data.temperature_c, 2));
    setText("bme-humi", fmt(data.humidity_rh, 2));
    setText("bme-press", fmt(data.press_hpa, 2));

    const fields = data.fields || [];
    const fieldMap = {};
    for (const field of fields) {
      fieldMap[field.id] = field;
    }

    const humiField = fieldMap.humidity_rh;
    if (humiField?.parse_label) {
      setText("bme-humi-parse", humiField.parse_label);
    }

    const rows = [
      ["timestamp_ms", "bme-f-ts"],
      ["temperature_c", "bme-f-temp"],
      ["humidity_rh", "bme-f-humi"],
      ["press_hpa", "bme-f-press"],
    ];
    for (const [fid, valId] of rows) {
      const f = fieldMap[fid];
      const descEl = document.getElementById(`${valId}-desc`);
      if (f) {
        setText(valId, f.value ?? "—");
        if (descEl) {
          const hint = f.range_hint ? `${f.description}（${f.range_hint}）` : f.description;
          descEl.textContent = hint || "—";
        }
      }
    }
  },

  destroy() {},
};
