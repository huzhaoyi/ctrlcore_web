import { postModule } from "../../core/api.js";

const GS_CHANNEL_COUNT = 4;

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

function fmt(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "—";
  }
  return num.toFixed(digits);
}

function fmtSigned(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "—";
  }
  return (num >= 0.0 ? "+" : "") + num.toFixed(digits);
}

function joinLabels(labels) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return "—";
  }
  return labels.join("；");
}

function channelRowsHtml() {
  const rows = [];
  for (let index = 0; index < GS_CHANNEL_COUNT; index += 1) {
    rows.push(`
      <tr>
        <td class="mono">[${index}]</td>
        <td id="gs-ch-${index}-meta" class="hint">—</td>
        <td id="gs-ch-${index}-angle" class="mono">—</td>
        <td id="gs-ch-${index}-step" class="mono">—</td>
        <td id="gs-ch-${index}-res" class="mono">—</td>
        <td id="gs-ch-${index}-res-label" class="hint">—</td>
      </tr>
    `);
  }
  return rows.join("");
}

function channelOptionsHtml() {
  const options = [];
  for (let index = 0; index < GS_CHANNEL_COUNT; index += 1) {
    options.push(`<option value="${index}">[${index}] 舵机 ${index}</option>`);
  }
  return options.join("");
}

export default {
  id: "gs",
  title: "10Nm 舵机",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="gs-connected" class="value">--</div></div>
          <div class="card"><div class="label">状态帧计数</div><div id="gs-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="gs-age" class="value">--</div></div>
          <div class="card"><div class="label">状态话题</div><div id="gs-status-topic" class="value mono-block">/GsStatus</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="gs-link-hw" class="value mono-block">fdcan1 · HYOROCEAN 10Nm</div></div>
        </div>
        <p class="hint">
          状态链：控制板 <code>fdcan1</code> · HYOROCEAN 10Nm 舵机（Node 0x01~0x04 @125k）
          → MCN <code>gs_servo</code> → MAVLink <code>GS_STATUS (msgid 3, 20Hz)</code>
          → OBC bridge → ROS <code>/GsStatus</code>。
        </p>
        <p class="hint">
          命令链：Web → ROS <code>/obc/gs_cmd</code> → MAVLink <code>GS_CMD (msgid 15)</code>
          → MCU <code>servo_N_out</code>（CAN C1/A0）。OBC 网关透传；角度限幅 ±45° 在 MCU。
        </p>
      </section>

      <section class="panel">
        <h2>GS_STATUS 帧头</h2>
        <div class="card-grid">
          <div class="card">
            <div class="label">timestamp_ms</div>
            <div id="gs-timestamp-ms" class="value mono-block">—</div>
            <p class="hint">MCU 毫秒 tick，与 MCN <code>gs_servo.state.timestamp_ms</code> 一致</p>
          </div>
          <div class="card">
            <div class="label">ROS header.stamp</div>
            <div id="gs-ros-stamp" class="value mono-block">—</div>
            <p class="hint">OBC bridge 收到 MAVLink 后打 ROS 时间戳</p>
          </div>
          <div class="card">
            <div class="label">frame_id</div>
            <div id="gs-frame-id" class="value mono-block">—</div>
          </div>
          <div class="card">
            <div class="label">硬件 / 总线</div>
            <div id="gs-hardware" class="value mono-block">fdcan1 · 10Nm</div>
            <p class="hint">4 路 HAL：<code>servo_0_out</code> … <code>servo_3_out</code></p>
          </div>
          <div class="card">
            <div class="label">MCU 角度限幅 (deg)</div>
            <div id="gs-mcu-limit" class="value mono-block">—</div>
            <p class="hint">Web/OBC 不限幅；超范围由 MCU <code>servo_10nm_clamp_deg</code> 处理</p>
          </div>
          <div class="card">
            <div class="label">命令话题</div>
            <div id="gs-cmd-topic" class="value mono-block">/obc/gs_cmd</div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>四路舵机状态</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>index</th>
                <th>硬件 / CAN</th>
                <th>angle_deg (°)</th>
                <th>step</th>
                <th>res</th>
                <th>故障解析</th>
              </tr>
            </thead>
            <tbody>
              ${channelRowsHtml()}
            </tbody>
          </table>
        </div>
        <p class="hint">
          <strong>angle_deg</strong>：A0 查询当前角度（deg）。<strong>step</strong>：MAVLink 预留，当前填 0。
          <strong>res</strong>：A0 应答故障字 data[4:5]，0x0000 表示无故障。
        </p>
      </section>

      <section class="panel">
        <h2>GS_CMD 单次下发</h2>
        <div class="card-grid">
          <div class="card"><div class="label">CMD 下发计数</div><div id="gs-cmd-count" class="value">--</div></div>
        </div>
        <p class="hint">
          字段：<code>index</code> 0~3 对应四路舵机；<code>angle_deg</code> 目标角度（deg）。
          MCU 收到后写 <code>target_deg</code> 并经 CAN C1(0xC100) 下发；SIM 模式下角度立即跟随。
        </p>
        <div class="card-grid">
          <div class="card">
            <div class="label">index</div>
            <select id="gs-index" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
              ${channelOptionsHtml()}
            </select>
            <p class="hint">舵机通道，与上表 index 一致</p>
          </div>
          <div class="card">
            <div class="label">angle_deg (°)</div>
            <input id="gs-angle-input" type="number" step="0.1" value="0.0"
              style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
            <p class="hint">建议 ±45（MCU 机械限幅）；可输入更大值以验证 MCU 钳位</p>
          </div>
        </div>
        <div class="control-row" style="margin-top:12px">
          <button id="gs-send" type="button">发送一次 GS_CMD</button>
        </div>
        <div id="gs-cmd-result" class="hint">POST /api/modules/gs/cmd → /obc/gs_cmd</div>
      </section>

      <section class="panel">
        <h2>协议字段对照</h2>
        <p class="mono-block">
          GS_STATUS (MCU→OBC, id=3): timestamp_ms, angle[4], step[4], res[4]<br>
          GS_CMD (OBC→MCU, id=15): index (uint8), angle (float32 deg)<br>
          CAN @ fdcan1 125k, Node 0x01~0x04, TX=0x300+N RX=0x280+N, C1/A0/C2 PDO2
        </p>
      </section>
    `;

    this._onGsSend = async () => {
      const index = Number(document.getElementById("gs-index").value);
      const angleInput = document.getElementById("gs-angle-input");
      const angle = Number(angleInput.value);
      if (!Number.isFinite(angle)) {
        document.getElementById("gs-cmd-result").textContent = "angle_deg 无效";
        return;
      }
      angleInput.value = angle.toFixed(1);
      const resultEl = document.getElementById("gs-cmd-result");
      try {
        const { status, data } = await postModule("gs", "cmd", {
          index,
          angle_deg: angle,
        });
        if (data.ok) {
          resultEl.textContent = [
            `已下发 [${data.index}] angle=${fmt(data.angle_deg, 1)}°`,
            `cmd 累计=${data.cmd_tx_count}`,
            data.note || "",
          ].join(" · ");
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    };

    document.getElementById("gs-send").addEventListener("click", this._onGsSend);
  },

  update(snapshot) {
    const data = snapshot.modules?.gs;
    if (!data) {
      return;
    }

    const connected = Boolean(data.connected);
    setText("gs-connected", connected ? "在线" : "离线");
    setText("gs-rx-count", data.rx_count ?? 0);
    setText("gs-cmd-count", data.cmd_tx_count ?? 0);
    setText("gs-age", data.age_sec != null ? Number(data.age_sec).toFixed(3) : "—");
    setText("gs-status-topic", data.status_topic ?? "/GsStatus");
    setText("gs-cmd-topic", data.cmd_topic ?? "/obc/gs_cmd");
    if (data.hardware) {
      setText("gs-link-hw", data.hardware);
      setText("gs-hardware", data.hardware);
    }

    const limit = data.mcu_angle_limit_deg || [];
    if (limit.length >= 2) {
      setText("gs-mcu-limit", `[${fmt(limit[0], 1)}, ${fmt(limit[1], 1)}]`);
    } else {
      setText("gs-mcu-limit", "±45（MCU 默认）");
    }

    if (!connected) {
      setText("gs-timestamp-ms", data.message || "等待 /GsStatus");
      return;
    }

    setText("gs-timestamp-ms", data.timestamp_ms != null ? String(data.timestamp_ms) : "—");
    const stampSec = data.stamp_sec;
    const stampNs = data.stamp_nanosec;
    if (stampSec != null) {
      setText("gs-ros-stamp", `${stampSec}.${String(stampNs ?? 0).padStart(9, "0").slice(0, 9)} s`);
    } else {
      setText("gs-ros-stamp", "—");
    }
    setText("gs-frame-id", data.frame_id ?? "—");

    const channels = data.channels || [];
    for (let index = 0; index < GS_CHANNEL_COUNT; index += 1) {
      const ch = channels[index];
      if (!ch) {
        continue;
      }
      setText(
        `gs-ch-${index}-meta`,
        `${ch.hal_name} · Node ${ch.can_node} · TX ${ch.can_tx_id} RX ${ch.can_rx_id}`,
      );
      setText(`gs-ch-${index}-angle`, fmtSigned(ch.angle_deg, 2));
      setText(`gs-ch-${index}-step`, ch.step_label ?? String(ch.step ?? "—"));
      setText(`gs-ch-${index}-res`, ch.res_hex ?? "—");
      setStatusValue(
        `gs-ch-${index}-res-label`,
        Boolean(ch.res_ok),
        joinLabels(ch.res_labels),
      );
    }
  },

  destroy() {
    const btn = document.getElementById("gs-send");
    if (btn && this._onGsSend) {
      btn.removeEventListener("click", this._onGsSend);
    }
  },
};
