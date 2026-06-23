import { postModule } from "../../core/api.js";

function fmt(val, digits = 2) {
  const num = Number(val);
  if (Number.isNaN(num)) {
    return "--";
  }
  return num.toFixed(digits);
}

function fmtSigned(val, digits = 2) {
  const num = Number(val);
  if (Number.isNaN(num)) {
    return "--";
  }
  return (num >= 0.0 ? "+" : "") + num.toFixed(digits);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function setStatusValue(id, ok, text) {
  const el = document.getElementById(id);
  if (!el) {
    return;
  }
  el.textContent = text;
  el.style.color = ok ? "var(--ok)" : "var(--warn)";
}

function joinLabels(labels) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return "--";
  }
  return labels.join("；");
}

export default {
  id: "elb105",
  title: "ELB105 惯导",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="elb-connected" class="value">--</div></div>
          <div class="card"><div class="label">帧计数</div><div id="elb-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="elb-age" class="value">--</div></div>
          <div class="card"><div class="label">话题</div><div id="elb-topic" class="value">--</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="elb-hw" class="value mono-block">OBC RS422 · ELB105-SHZR04(3)</div></div>
        </div>
        <p class="hint">协议帧：<code>$TOGS,F1,...,F21\\r\\n</code>，200Hz @ 921600。OBC RS422 直连（非 MCU MAVLink），ROS <code>/elb105/shzr04</code>。</p>
      </section>

      <section class="panel">
        <h2>对准指令 (24B 二进制帧)</h2>
        <p class="hint">
          上电后需先发对准指令（与 TOGS 同一 RS422 串口）。帧头 <code>55 AA 18 80</code>，小端，标志 <code>0x00</code> 手动装订静基座。
          发送后观察 F5：1 粗对准 → 2 精对准 → 9 已对准。
        </p>
        <div class="card-grid">
          <div class="card">
            <div class="label">纬度 (°)</div>
            <input id="elb-align-lat" type="text" value="22.801124" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
          </div>
          <div class="card">
            <div class="label">经度 (°)</div>
            <input id="elb-align-lon" type="text" value="113.525280" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
          </div>
          <div class="card">
            <div class="label">高度 (m)</div>
            <input id="elb-align-alt" type="text" value="8.0" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
          </div>
          <div class="card">
            <div class="label">对准时间 (s)</div>
            <input id="elb-align-time" type="text" value="0" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
            <p class="hint">≤0 使用设备默认</p>
          </div>
        </div>
        <div class="control-row" style="margin-top:12px">
          <button id="elb-align-send" type="button">发送对准指令</button>
        </div>
        <div id="elb-align-result" class="hint">POST /api/modules/elb105/align → /elb105/send_alignment</div>
      </section>

      <section class="panel">
        <h2>姿态 / 模式 (F1~F5)</h2>
        <div class="card-grid">
          <div class="card">
            <div class="label">F1 航向 Heading (°)</div>
            <div id="elb-heading" class="value">--</div>
            <p class="hint">000.00~359.99，顺时针为正</p>
          </div>
          <div class="card">
            <div class="label">F2 俯仰 Pitch (°)</div>
            <div id="elb-pitch" class="value">--</div>
            <p class="hint">-090.00~+090.00，船首上为正</p>
          </div>
          <div class="card">
            <div class="label">F3 横滚 Roll (°)</div>
            <div id="elb-roll" class="value">--</div>
            <p class="hint">-180.00~+180.00，左舷上为正</p>
          </div>
          <div class="card">
            <div class="label">F5 对准模式 Mode</div>
            <div id="elb-mode" class="value">--</div>
            <p class="hint">0=等待；收到对准指令后 1 粗对准 → 2 精对准 → 9 已对准</p>
          </div>
          <div class="card">
            <div class="label">F4 状态标志 Status</div>
            <div id="elb-status" class="value">--</div>
            <div id="elb-status-hex" class="hint mono-block" style="margin:6px 0 0">--</div>
          </div>
        </div>
        <p class="hint">F4 错误标志（位或）：0x01 无 IMU；0x02 陀螺超量程；0x04 加表超量程；0x08 无深度传感器；0x10 无 DVL。</p>
      </section>

      <section class="panel">
        <h2>位置 (F6~F7, F20~F21)</h2>
        <div class="card-grid">
          <div class="card">
            <div class="label">F20 纬度 Latitude (°)</div>
            <div id="elb-lat" class="value">--</div>
            <p class="hint">WGS84 十进制度，[-90,+90]，可带 +/-</p>
          </div>
          <div class="card">
            <div class="label">F21 经度 Longitude (°)</div>
            <div id="elb-lon" class="value">--</div>
            <p class="hint">WGS84 十进制度，[-180,+180]，可带 +/-</p>
          </div>
          <div class="card">
            <div class="label">F6 高度 Altitude (m)</div>
            <div id="elb-alt" class="value">--</div>
          </div>
          <div class="card">
            <div class="label">F7 深度 Depth (m)</div>
            <div id="elb-depth" class="value">--</div>
            <p class="hint">-999.999~6000.000</p>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>DVL (F8~F19)</h2>
        <div class="card-grid">
          <div class="card">
            <div class="label">F8 对底速度 X (m/s)</div>
            <div id="elb-dvl-bx" class="value">--</div>
            <p class="hint">-9.99~9.99，前向为正</p>
          </div>
          <div class="card">
            <div class="label">F9 对底速度 Y (m/s)</div>
            <div id="elb-dvl-by" class="value">--</div>
            <p class="hint">-9.99~9.99，右舷为正</p>
          </div>
          <div class="card">
            <div class="label">F19 数据更新标志</div>
            <div id="elb-dvl-upd" class="value">--</div>
            <p class="hint">0=未更新，1=已更新</p>
          </div>
          <div class="card">
            <div class="label">F18 参考层状态</div>
            <div id="elb-dvl-ref-st" class="value">--</div>
            <div id="elb-dvl-ref-hex" class="hint mono-block" style="margin:6px 0 0">--</div>
          </div>
        </div>
        <p class="hint">F18 状态位（位或）：0x01 波束1相关度低；0x02 波束2；0x04 波束3；0x08 波束4；0x10 高度过浅。</p>
        <div class="table-wrap" style="margin-top:12px">
          <table>
            <thead>
              <tr><th>字段</th><th>说明</th><th>值</th></tr>
            </thead>
            <tbody>
              <tr><td>F10</td><td>波束 1 对底距离 (m)，000.00~999.99</td><td id="elb-beam-0" class="mono">--</td></tr>
              <tr><td>F11</td><td>波束 2 对底距离 (m)</td><td id="elb-beam-1" class="mono">--</td></tr>
              <tr><td>F12</td><td>波束 3 对底距离 (m)</td><td id="elb-beam-2" class="mono">--</td></tr>
              <tr><td>F13</td><td>波束 4 对底距离 (m)</td><td id="elb-beam-3" class="mono">--</td></tr>
              <tr><td>F14</td><td>参考层速度 X (m/s)，前向为正</td><td id="elb-ref-x" class="mono">--</td></tr>
              <tr><td>F15</td><td>参考层速度 Y (m/s)，右舷为正</td><td id="elb-ref-y" class="mono">--</td></tr>
              <tr><td>F16</td><td>参考层速度 Z (m/s)，向下为正</td><td id="elb-ref-z" class="mono">--</td></tr>
              <tr><td>F17</td><td>参考层速度误差 (m/s)</td><td id="elb-ref-err" class="mono">--</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>协议字段对照</h2>
        <p class="mono-block">
          $TOGS, F1(Heading), F2(Pitch), F3(Roll), F4(Status), F5(Mode),<br>
          F6(Altitude), F7(Depth), F8~F9(DVL底速), F10~F13(波束距离),<br>
          F14~F17(参考层速度/误差), F18(参考层状态), F19(DVL更新),<br>
          F20(Latitude), F21(Longitude), \\r\\n
        </p>
      </section>
    `;

    this._onAlignSend = async () => {
      const resultEl = document.getElementById("elb-align-result");
      const body = {
        latitude_deg: Number(document.getElementById("elb-align-lat").value),
        longitude_deg: Number(document.getElementById("elb-align-lon").value),
        altitude_m: Number(document.getElementById("elb-align-alt").value),
        alignment_time_sec: Number(document.getElementById("elb-align-time").value),
      };
      try {
        const { status, data } = await postModule("elb105", "align", body);
        if (data.ok) {
          resultEl.textContent = `已排队 (${status}): ${data.message || "alignment queued"}`;
        } else {
          resultEl.textContent = `失败: ${data.error || data.message || status}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    };

    document.getElementById("elb-align-send").addEventListener("click", this._onAlignSend);
  },

  update(snapshot) {
    const data = snapshot.modules?.elb105;
    if (!data) {
      return;
    }

    const connected = Boolean(data.connected);
    setText("elb-connected", connected ? "在线" : "等待中");
    setText("elb-rx-count", data.rx_count ?? "--");
    setText("elb-age", data.age_sec ?? "--");
    setText("elb-topic", data.topic ?? "/elb105/shzr04");
    setText("elb-hw", data.hardware ?? "OBC RS422 USB · ELB105-SHZR04(3) · 921600");

    if (data.last_align) {
      const align = data.last_align;
      const alignText = align.ok
        ? `最近对准: 成功 - ${align.message || ""}`
        : `最近对准: 失败 - ${align.message || align.error || ""}`;
      setText("elb-align-result", alignText);
    }

    if (!connected) {
      setText("elb-heading", data.message || "等待数据");
      return;
    }

    setText("elb-heading", fmt(data.heading_deg, 2));
    setText("elb-pitch", fmtSigned(data.pitch_deg, 2));
    setText("elb-roll", fmtSigned(data.roll_deg, 2));

    const modeCode = data.mode ?? "--";
    const modeLabel = data.mode_label ?? "--";
    setText("elb-mode", `F5=${modeCode} · ${modeLabel}`);

    const statusOk = Boolean(data.status_ok);
    const statusText = joinLabels(data.status_labels);
    setStatusValue("elb-status", statusOk, statusText);
    setText("elb-status-hex", `原始值 ${data.status_flags_hex ?? "0x00"}`);

    setText("elb-lat", fmtSigned(data.latitude_deg, 6));
    setText("elb-lon", fmtSigned(data.longitude_deg, 6));
    setText("elb-alt", fmtSigned(data.altitude_m, 1));
    setText("elb-depth", fmtSigned(data.depth_m, 3));

    setText("elb-dvl-bx", fmtSigned(data.dvl_bottom_vel_x_mps, 2));
    setText("elb-dvl-by", fmtSigned(data.dvl_bottom_vel_y_mps, 2));

    const dvlUpd = Number(data.dvl_data_updated);
    const dvlUpdOk = dvlUpd === 1;
    setStatusValue(
      "elb-dvl-upd",
      dvlUpdOk,
      data.dvl_data_updated_label ?? (dvlUpdOk ? "1 已更新" : "0 未更新"),
    );

    const refOk = Boolean(data.dvl_ref_status_ok);
    const refText = joinLabels(data.dvl_ref_status_labels);
    setStatusValue("elb-dvl-ref-st", refOk, refText);
    setText("elb-dvl-ref-hex", `原始值 ${data.dvl_ref_status_hex ?? "0x00"}`);

    const beams = data.dvl_beam_range_m || [];
    for (let i = 0; i < 4; i += 1) {
      setText(`elb-beam-${i}`, fmt(beams[i], 2));
    }

    setText("elb-ref-x", fmtSigned(data.dvl_ref_vel_x_mps, 2));
    setText("elb-ref-y", fmtSigned(data.dvl_ref_vel_y_mps, 2));
    setText("elb-ref-z", fmtSigned(data.dvl_ref_vel_z_mps, 2));
    setText("elb-ref-err", fmt(data.dvl_ref_vel_err_mps, 2));
  },

  destroy() {
    const btn = document.getElementById("elb-align-send");
    if (btn && this._onAlignSend) {
      btn.removeEventListener("click", this._onAlignSend);
    }
  },
};
