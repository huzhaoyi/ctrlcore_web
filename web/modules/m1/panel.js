import { postModule } from "../../core/api.js";

export default {
  id: "m1",
  title: "天通卫通 M1",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>卫星端到端链路</h2>
        <p class="hint">需启动 <code>sealien_ctrlcore_SatTask</code> 后才有 <code>/m1/link_state</code>（SatTask 心跳监测）。</p>
        <div class="card-grid">
          <div class="card"><div class="label">链路话题</div><div id="m1-link-topic" class="value mono-block">/m1/link_state</div></div>
          <div class="card"><div class="label">链路态</div><div id="m1-link-state-name" class="value">--</div></div>
          <div class="card"><div class="label">link_ok</div><div id="m1-link-ok" class="value">--</div></div>
          <div class="card"><div class="label">呼叫已建联</div><div id="m1-call-connected" class="value">--</div></div>
          <div class="card"><div class="label">对端心跳距今 (ms)</div><div id="m1-peer-hb-age" class="value">--</div></div>
          <div class="card"><div class="label">心跳 TX / RX</div><div id="m1-hb-counts" class="value">--</div></div>
          <div class="card"><div class="label">链路态距上次 (s)</div><div id="m1-link-age" class="value">--</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">状态话题</div><div id="m1-status-topic" class="value mono-block">/m1/status</div></div>
          <div class="card"><div class="label">下行话题</div><div id="m1-down-topic" class="value mono-block">/m1/downlink</div></div>
          <div class="card"><div class="label">上行话题</div><div id="m1-uplink-topic" class="value mono-block">/m1/uplink</div></div>
          <div class="card"><div class="label">状态距上次 (s)</div><div id="m1-status-age" class="value">--</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="m1-hw" class="value mono-block">uart5 · M1</div></div>
        </div>
        <p class="hint">
          MCU <code>uart5</code> · M1（115200 8N1，2.4K 点对点）
          → MAVLink <code>M1_STATUS</code> (2Hz) + <code>SERIAL_CONTROL</code> (dev=120)
          → OBC ROS 话题。来电由 AUV 自动接听。
        </p>
      </section>

      <section class="panel">
        <h2>业务状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">入网态</div><div id="m1-net-state" class="value">--</div></div>
          <div class="card"><div class="label">呼叫态</div><div id="m1-call-state" class="value">--</div></div>
          <div class="card"><div class="label">信号 CSQ</div><div id="m1-csq" class="value">--</div></div>
          <div class="card"><div class="label">已连接时长 (ms)</div><div id="m1-connected-ms" class="value">--</div></div>
          <div class="card"><div class="label">TX 忙</div><div id="m1-tx-busy" class="value">--</div></div>
          <div class="card"><div class="label">缓存占用 (%)</div><div id="m1-buf-percent" class="value">--</div></div>
          <div class="card"><div class="label">拨号失败</div><div id="m1-dial-fail" class="value">--</div></div>
          <div class="card"><div class="label">挂断失败</div><div id="m1-hangup-fail" class="value">--</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>GNSS</h2>
        <div class="card-grid">
          <div class="card"><div class="label">有效</div><div id="m1-valid" class="value">--</div></div>
          <div class="card"><div class="label">经度 (°)</div><div id="m1-lon" class="value">--</div></div>
          <div class="card"><div class="label">纬度 (°)</div><div id="m1-lat" class="value">--</div></div>
          <div class="card"><div class="label">状态计数</div><div id="m1-status-rx" class="value">--</div></div>
          <div class="card"><div class="label">下行计数</div><div id="m1-down-rx" class="value">--</div></div>
          <div class="card"><div class="label">来电计数</div><div id="m1-incoming-rx" class="value">--</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>来电记录</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>时间</th><th>号码</th></tr></thead>
            <tbody id="m1-incoming-history"></tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>卫星下行 (raw)</h2>
        <div class="mono-block">
          <div><span class="label-inline">最新 HEX</span> <span id="m1-down-hex">--</span></div>
          <div><span class="label-inline">最新 ASCII</span> <span id="m1-down-ascii">--</span></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>时间</th><th>长度</th><th>HEX</th><th>ASCII</th></tr></thead>
            <tbody id="m1-down-history"></tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>呼叫控制</h2>
        <div class="control-row">
          <input id="m1-dial-number" type="text" placeholder="对端号码" value="">
          <button id="m1-dial-btn" type="button">拨号</button>
          <button id="m1-hangup-btn" type="button">挂断</button>
        </div>
        <div id="m1-call-result" class="hint">POST /api/modules/m1/call_cmd</div>
      </section>

      <section class="panel">
        <h2>卫星上行 (调试)</h2>
        <div class="control-row">
          <input id="m1-uplink-text" type="text" placeholder="输入文本，如 hello" value="hello">
          <button id="m1-uplink-send" type="button">发送上行</button>
        </div>
        <div id="m1-uplink-result" class="hint">POST /api/modules/m1/uplink</div>
      </section>
    `;

    this._onSend = async () => {
      const text = document.getElementById("m1-uplink-text").value;
      const resultEl = document.getElementById("m1-uplink-result");
      try {
        const { status, data } = await postModule("m1", "uplink", { text });
        if (data.ok) {
          resultEl.textContent = `已发送 ${data.len} 字节，hex=${data.hex}，累计=${data.uplink_tx_count}`;
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    };

    this._onDial = async () => {
      const number = document.getElementById("m1-dial-number").value.trim();
      const resultEl = document.getElementById("m1-call-result");
      if (!number) {
        resultEl.textContent = "拨号需要填写对端号码";
        return;
      }
      try {
        const { status, data } = await postModule("m1", "call_cmd", { action: 1, number });
        if (data.ok) {
          resultEl.textContent = `拨号已下发: ${number}，累计=${data.call_cmd_tx_count}`;
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    };

    this._onHangup = async () => {
      const resultEl = document.getElementById("m1-call-result");
      try {
        const { status, data } = await postModule("m1", "call_cmd", { action: 3 });
        if (data.ok) {
          resultEl.textContent = `挂断已下发，累计=${data.call_cmd_tx_count}`;
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    };

    document.getElementById("m1-uplink-send").addEventListener("click", this._onSend);
    document.getElementById("m1-dial-btn").addEventListener("click", this._onDial);
    document.getElementById("m1-hangup-btn").addEventListener("click", this._onHangup);
  },

  update(snapshot) {
    const data = snapshot.modules?.m1;
    if (!data) {
      return;
    }

    document.getElementById("m1-status-topic").textContent = data.status_topic ?? "/m1/status";
    document.getElementById("m1-down-topic").textContent = data.downlink_topic ?? "/m1/downlink";
    document.getElementById("m1-uplink-topic").textContent = data.uplink_topic ?? "/m1/uplink";
    document.getElementById("m1-hw").textContent =
      data.hardware ?? "uart5 · M1 · 115200 8N1 · MAVLink M1_STATUS + SERIAL_CONTROL (dev=120)";
    document.getElementById("m1-status-age").textContent =
      data.status_age_sec != null ? Number(data.status_age_sec).toFixed(3) : "—";

    const link = data.link_state;
    document.getElementById("m1-link-topic").textContent =
      data.link_state_topic ?? "/m1/link_state";
    if (link) {
      document.getElementById("m1-link-state-name").textContent =
        link.link_state_name ?? link.link_state ?? "--";
      document.getElementById("m1-link-ok").textContent = link.link_ok ? "是" : "否";
      document.getElementById("m1-call-connected").textContent = link.call_connected ? "是" : "否";
      document.getElementById("m1-peer-hb-age").textContent =
        link.last_peer_hb_age_ms != null ? link.last_peer_hb_age_ms : "从未收到";
      document.getElementById("m1-hb-counts").textContent =
        `${link.hb_tx_count ?? 0} / ${link.hb_rx_count ?? 0}`;
    } else {
      document.getElementById("m1-link-state-name").textContent = "—（未启动 SatTask）";
      document.getElementById("m1-link-ok").textContent = "—";
      document.getElementById("m1-call-connected").textContent = "—";
      document.getElementById("m1-peer-hb-age").textContent = "—";
      document.getElementById("m1-hb-counts").textContent = "—";
    }
    document.getElementById("m1-link-age").textContent =
      data.link_state_age_sec != null ? Number(data.link_state_age_sec).toFixed(3) : "—";

    const status = data.status;
    if (status) {
      document.getElementById("m1-net-state").textContent =
        status.net_state_name ?? status.net_state ?? "--";
      document.getElementById("m1-call-state").textContent =
        status.call_state_name ?? status.call_state ?? "--";
      document.getElementById("m1-csq").textContent = status.csq ?? "--";
      document.getElementById("m1-connected-ms").textContent = status.connected_ms ?? "--";
      document.getElementById("m1-tx-busy").textContent = status.tx_busy ? "是" : "否";
      document.getElementById("m1-buf-percent").textContent = status.buf_percent ?? "--";
      document.getElementById("m1-dial-fail").textContent = status.dial_fail_cnt ?? 0;
      document.getElementById("m1-hangup-fail").textContent = status.hangup_fail_cnt ?? 0;
      document.getElementById("m1-valid").textContent = status.gnss_valid ? "是" : "否";
      document.getElementById("m1-lon").textContent = Number(status.lon_deg).toFixed(6);
      document.getElementById("m1-lat").textContent = Number(status.lat_deg).toFixed(6);
    }

    document.getElementById("m1-status-rx").textContent = data.status_rx_count ?? 0;
    document.getElementById("m1-down-rx").textContent = data.downlink_rx_count ?? 0;
    document.getElementById("m1-incoming-rx").textContent = data.incoming_rx_count ?? 0;

    const down = data.downlink;
    if (down) {
      document.getElementById("m1-down-hex").textContent = down.hex || "--";
      document.getElementById("m1-down-ascii").textContent = down.ascii || "--";
    }

    const downTbody = document.getElementById("m1-down-history");
    const history = data.downlink_history || [];
    downTbody.innerHTML = history
      .slice(0, 20)
      .map((row) => {
        const ts = row.stamp_sec ? new Date(row.stamp_sec * 1000).toLocaleTimeString() : "--";
        return `<tr><td>${ts}</td><td>${row.len}</td><td class="mono">${row.hex}</td><td>${row.ascii}</td></tr>`;
      })
      .join("");

    const inTbody = document.getElementById("m1-incoming-history");
    const inHistory = data.incoming_history || [];
    inTbody.innerHTML = inHistory
      .slice(0, 10)
      .map((row) => {
        const ts = row.stamp_sec ? new Date(row.stamp_sec * 1000).toLocaleTimeString() : "--";
        return `<tr><td>${ts}</td><td class="mono">${row.number}</td></tr>`;
      })
      .join("");
  },

  destroy() {
    const sendBtn = document.getElementById("m1-uplink-send");
    if (sendBtn && this._onSend) {
      sendBtn.removeEventListener("click", this._onSend);
    }
    const dialBtn = document.getElementById("m1-dial-btn");
    if (dialBtn && this._onDial) {
      dialBtn.removeEventListener("click", this._onDial);
    }
    const hangupBtn = document.getElementById("m1-hangup-btn");
    if (hangupBtn && this._onHangup) {
      hangupBtn.removeEventListener("click", this._onHangup);
    }
  },
};
