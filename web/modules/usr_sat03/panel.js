import { postModule } from "../../core/api.js";

export default {
  id: "usr_sat03",
  title: "天通卫通",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">GNSS 话题</div><div id="sat-gnss-topic" class="value mono-block">/usr_sat03/gnss</div></div>
          <div class="card"><div class="label">下行话题</div><div id="sat-down-topic" class="value mono-block">/usr_sat03/downlink</div></div>
          <div class="card"><div class="label">上行话题</div><div id="sat-uplink-topic" class="value mono-block">/usr_sat03/uplink</div></div>
          <div class="card"><div class="label">GNSS 距上次 (s)</div><div id="sat-gnss-age" class="value">--</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="sat-hw" class="value mono-block">uart5 · USR-SAT03</div></div>
        </div>
        <p class="hint">
          MCU <code>uart5</code> · USR-SAT03（115200 8N1，无 RS485 RE）
          → MAVLink <code>SERIAL_CONTROL</code> (dev=120, 20Hz) → OBC ROS 话题。
          Web 调试上行 POST → 发布 <code>/usr_sat03/uplink</code>。
        </p>
      </section>

      <section class="panel">
        <h2>GNSS</h2>
        <div class="card-grid">
          <div class="card"><div class="label">有效</div><div id="sat-valid" class="value">--</div></div>
          <div class="card"><div class="label">设备号</div><div id="sat-dev-id" class="value">--</div></div>
          <div class="card"><div class="label">经度 (°)</div><div id="sat-lon" class="value">--</div></div>
          <div class="card"><div class="label">纬度 (°)</div><div id="sat-lat" class="value">--</div></div>
          <div class="card"><div class="label">GNSS 计数</div><div id="sat-gnss-rx" class="value">--</div></div>
          <div class="card"><div class="label">下行计数</div><div id="sat-down-rx" class="value">--</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>卫星下行 (raw)</h2>
        <div class="mono-block">
          <div><span class="label-inline">最新 HEX</span> <span id="sat-down-hex">--</span></div>
          <div><span class="label-inline">最新 ASCII</span> <span id="sat-down-ascii">--</span></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>时间</th><th>长度</th><th>HEX</th><th>ASCII</th></tr></thead>
            <tbody id="sat-down-history"></tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>卫星上行 (调试)</h2>
        <div class="control-row">
          <input id="sat-uplink-text" type="text" placeholder="输入文本，如 hello" value="hello">
          <button id="sat-uplink-send" type="button">发送上行</button>
        </div>
        <div id="sat-uplink-result" class="hint">POST /api/modules/usr_sat03/uplink</div>
      </section>
    `;

    this._onSend = async () => {
      const text = document.getElementById("sat-uplink-text").value;
      const resultEl = document.getElementById("sat-uplink-result");
      try {
        const { status, data } = await postModule("usr_sat03", "uplink", { text });
        if (data.ok) {
          resultEl.textContent = `已发送 ${data.len} 字节，hex=${data.hex}，累计=${data.uplink_tx_count}`;
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    };

    document.getElementById("sat-uplink-send").addEventListener("click", this._onSend);
  },

  update(snapshot) {
    const data = snapshot.modules?.usr_sat03;
    if (!data) {
      return;
    }

    document.getElementById("sat-gnss-topic").textContent = data.gnss_topic ?? "/usr_sat03/gnss";
    document.getElementById("sat-down-topic").textContent = data.downlink_topic ?? "/usr_sat03/downlink";
    document.getElementById("sat-uplink-topic").textContent = data.uplink_topic ?? "/usr_sat03/uplink";
    document.getElementById("sat-hw").textContent =
      data.hardware ?? "uart5 · USR-SAT03 · 115200 8N1 · MAVLink SERIAL_CONTROL (dev=120)";
    document.getElementById("sat-gnss-age").textContent =
      data.gnss_age_sec != null ? Number(data.gnss_age_sec).toFixed(3) : "—";

    const gnss = data.gnss;
    if (gnss) {
      document.getElementById("sat-valid").textContent = gnss.valid ? "是" : "否";
      document.getElementById("sat-dev-id").textContent = gnss.dev_id;
      document.getElementById("sat-lon").textContent = Number(gnss.lon_deg).toFixed(6);
      document.getElementById("sat-lat").textContent = Number(gnss.lat_deg).toFixed(6);
    }

    document.getElementById("sat-gnss-rx").textContent = data.gnss_rx_count ?? 0;
    document.getElementById("sat-down-rx").textContent = data.downlink_rx_count ?? 0;

    const down = data.downlink;
    if (down) {
      document.getElementById("sat-down-hex").textContent = down.hex || "--";
      document.getElementById("sat-down-ascii").textContent = down.ascii || "--";
    }

    const tbody = document.getElementById("sat-down-history");
    const history = data.downlink_history || [];
    tbody.innerHTML = history
      .slice(0, 20)
      .map((row) => {
        const ts = row.stamp_sec ? new Date(row.stamp_sec * 1000).toLocaleTimeString() : "--";
        return `<tr><td>${ts}</td><td>${row.len}</td><td class="mono">${row.hex}</td><td>${row.ascii}</td></tr>`;
      })
      .join("");
  },

  destroy() {
    const btn = document.getElementById("sat-uplink-send");
    if (btn && this._onSend) {
      btn.removeEventListener("click", this._onSend);
    }
  },
};
