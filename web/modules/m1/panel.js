import { postModule } from "../../core/api.js";

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

export default {
  id: "m1",
  title: "天通卫通 M1",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>模块 / 驱动在线</h2>
        <p class="hint" id="m1-deployment-hint">
          AUV：MCU(uart3)↔M1 → MAVLink → OBC ROS <code>/m1/status</code>；
          岸端：SatM1↔M1 → 同名 <code>/m1/status</code>。未驻网仍可显示在线。
        </p>
        <div class="card-grid">
          <div class="card"><div class="label">模块在线</div><div id="m1-module-online" class="value">--</div></div>
          <div class="card"><div class="label">状态话题</div><div id="m1-status-topic" class="value mono-block">/m1/status</div></div>
          <div class="card"><div class="label">状态距上次 (s)</div><div id="m1-status-age" class="value">--</div></div>
          <div class="card"><div class="label">状态计数</div><div id="m1-status-rx" class="value">--</div></div>
          <div class="card"><div class="label">下行话题</div><div id="m1-down-topic" class="value mono-block">/m1/downlink</div></div>
          <div class="card"><div class="label">上行话题</div><div id="m1-uplink-topic" class="value mono-block">/m1/uplink</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="m1-hw" class="value mono-block">uart3 · M1</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>ROS 端到端链路</h2>
        <p class="hint">
          来自 <code>sealien_ctrlcore_sat_task</code> 的 <code>/m1/link_state</code>（呼叫建链后的对端心跳）。
          未启动 sat_task 时本块可为离线，不影响上方「模块在线」。
        </p>
        <div class="card-grid">
          <div class="card"><div class="label">ROS 链路在线</div><div id="m1-ros-link-online" class="value">--</div></div>
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
        <h2>业务状态（模块）</h2>
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
          <div class="card"><div class="label">速度</div><div id="m1-speed" class="value">--</div></div>
          <div class="card"><div class="label">海拔</div><div id="m1-altitude" class="value">--</div></div>
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

    setText("m1-deployment-hint", data.deployment_hint
      ?? "AUV：MCU(uart3)↔M1 → MAVLink → OBC ROS /m1/*；岸端：SatM1↔M1 → 同名 ROS /m1/*。");
    setText("m1-module-online", data.module_online_text
      ?? (data.module_online ? "在线" : "离线"));
    setText("m1-status-topic", data.status_topic ?? "/m1/status");
    setText("m1-down-topic", data.downlink_topic ?? "/m1/downlink");
    setText("m1-uplink-topic", data.uplink_topic ?? "/m1/uplink");
    setText(
      "m1-hw",
      data.hardware ?? "uart3 · M1 · 115200 8N1 · MAVLink M1_STATUS + SERIAL_CONTROL (dev=120)",
    );
    setText(
      "m1-status-age",
      data.status_age_sec != null ? Number(data.status_age_sec).toFixed(3) : "—",
    );
    setText("m1-status-rx", data.status_rx_count ?? 0);

    setText("m1-ros-link-online", data.ros_link_online_text
      ?? (data.ros_link_online ? "在线" : "未启动/无心跳"));
    setText("m1-link-topic", data.link_state_topic ?? "/m1/link_state");

    const link = data.link_state;
    if (link) {
      setText("m1-link-state-name", link.link_state_name ?? link.link_state ?? "--");
      setText("m1-link-ok", link.link_ok ? "是" : "否");
      setText("m1-call-connected", link.call_connected ? "是" : "否");
      setText(
        "m1-peer-hb-age",
        link.last_peer_hb_age_ms != null ? String(link.last_peer_hb_age_ms) : "从未收到",
      );
      setText(
        "m1-hb-counts",
        `${link.hb_tx_count ?? 0} / ${link.hb_rx_count ?? 0}`,
      );
    } else {
      setText("m1-link-state-name", "—（未启动 sat_task）");
      setText("m1-link-ok", "—");
      setText("m1-call-connected", "—");
      setText("m1-peer-hb-age", "—");
      setText("m1-hb-counts", "—");
    }
    setText(
      "m1-link-age",
      data.link_state_age_sec != null ? Number(data.link_state_age_sec).toFixed(3) : "—",
    );

    const status = data.status;
    if (status) {
      setText("m1-net-state", status.net_state_name ?? status.net_state ?? "--");
      setText("m1-call-state", status.call_state_name ?? status.call_state ?? "--");
      setText("m1-csq", status.csq ?? "--");
      setText("m1-connected-ms", status.connected_ms ?? "--");
      setText("m1-tx-busy", status.tx_busy ? "是" : "否");
      setText("m1-buf-percent", status.buf_percent ?? "--");
      setText("m1-dial-fail", status.dial_fail_cnt ?? 0);
      setText("m1-hangup-fail", status.hangup_fail_cnt ?? 0);
      setText("m1-valid", status.gnss_valid ? "是" : "否");
      setText("m1-lon", Number(status.lon_deg).toFixed(6));
      setText("m1-lat", Number(status.lat_deg).toFixed(6));
      setText(
        "m1-speed",
        status.speed != null ? Number(status.speed).toFixed(3) : "--",
      );
      setText(
        "m1-altitude",
        status.altitude != null ? Number(status.altitude).toFixed(3) : "--",
      );
    } else {
      setText("m1-net-state", "—");
      setText("m1-call-state", "—");
      setText("m1-csq", "—");
      setText("m1-connected-ms", "—");
      setText("m1-tx-busy", "—");
      setText("m1-buf-percent", "—");
      setText("m1-dial-fail", "—");
      setText("m1-hangup-fail", "—");
      setText("m1-valid", "—");
      setText("m1-lon", "—");
      setText("m1-lat", "—");
      setText("m1-speed", "—");
      setText("m1-altitude", "—");
    }

    setText("m1-down-rx", data.downlink_rx_count ?? 0);
    setText("m1-incoming-rx", data.incoming_rx_count ?? 0);

    const down = data.downlink;
    if (down) {
      setText("m1-down-hex", down.hex || "--");
      setText("m1-down-ascii", down.ascii || "--");
    }

    const downTbody = document.getElementById("m1-down-history");
    if (downTbody) {
      const history = data.downlink_history || [];
      downTbody.innerHTML = history
        .slice(0, 20)
        .map((row) => {
          const ts = row.stamp_sec ? new Date(row.stamp_sec * 1000).toLocaleTimeString() : "--";
          return `<tr><td>${ts}</td><td>${row.len}</td><td class="mono">${row.hex}</td><td>${row.ascii}</td></tr>`;
        })
        .join("");
    }

    const inTbody = document.getElementById("m1-incoming-history");
    if (inTbody) {
      const inHistory = data.incoming_history || [];
      inTbody.innerHTML = inHistory
        .slice(0, 10)
        .map((row) => {
          const ts = row.stamp_sec ? new Date(row.stamp_sec * 1000).toLocaleTimeString() : "--";
          return `<tr><td>${ts}</td><td class="mono">${row.number}</td></tr>`;
        })
        .join("");
    }
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
