import { postModule } from "../../core/api.js";

const GS_CHANNEL_COUNT = 4;
const GS_CMD_TYPE_ANGLE = 0;
const GS_CMD_TYPE_SPEED = 1;

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
        <td id="gs-ch-${index}-online">—</td>
        <td id="gs-ch-${index}-angle" class="mono">—</td>
        <td id="gs-ch-${index}-fwd" class="mono">—</td>
        <td id="gs-ch-${index}-rev" class="mono">—</td>
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

function numInput(id, value, step) {
  return `<input id="${id}" type="number" step="${step}" value="${value}"
    style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">`;
}

function setCmdTypeView(cmdType) {
  const angleCard = document.getElementById("gs-cmd-angle-card");
  const fwdCard = document.getElementById("gs-cmd-fwd-card");
  const revCard = document.getElementById("gs-cmd-rev-card");
  const isAngle = Number(cmdType) === GS_CMD_TYPE_ANGLE;
  if (angleCard) {
    angleCard.style.display = isAngle ? "" : "none";
  }
  if (fwdCard) {
    fwdCard.style.display = isAngle ? "none" : "";
  }
  if (revCard) {
    revCard.style.display = isAngle ? "none" : "";
  }
}

export default {
  id: "gs",
  title: "10Nm 舵机",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">链路</div><div id="gs-connected" class="value">--</div></div>
          <div class="card"><div class="label">舵机在线</div><div id="gs-online-count" class="value">--</div></div>
          <div class="card"><div class="label">状态帧计数</div><div id="gs-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="gs-age" class="value">--</div></div>
          <div class="card"><div class="label">状态话题</div><div id="gs-status-topic" class="value mono-block">/GsStatus</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="gs-link-hw" class="value mono-block">fdcan2 · HYOROCEAN 10Nm</div></div>
        </div>
        <p class="hint">
          状态链：控制板 <code>fdcan2</code> · HYOROCEAN 10Nm（Node 0x01~0x04 @500k）
          → MCN <code>gs_servo</code> → MAVLink <code>GS_STATUS</code>
          → OBC bridge → ROS <code>/GsStatus</code>。
        </p>
        <p class="hint">
          运行时命令：<code>/obc/gs_cmd</code> → GS_CMD（0=角度 / 1=正反转速）。
          四路可独立在线；未接入的路显示离线。
          零点 / ID / 波特率 / 限位等产线配置走 MCU，网页不提供。
        </p>
      </section>

      <section class="panel">
        <h2>GS_STATUS 帧头</h2>
        <div class="card-grid">
          <div class="card">
            <div class="label">timestamp_ms</div>
            <div id="gs-timestamp-ms" class="value mono-block">—</div>
          </div>
          <div class="card">
            <div class="label">ROS header.stamp</div>
            <div id="gs-ros-stamp" class="value mono-block">—</div>
          </div>
          <div class="card">
            <div class="label">frame_id</div>
            <div id="gs-frame-id" class="value mono-block">—</div>
          </div>
          <div class="card">
            <div class="label">硬件 / 总线</div>
            <div id="gs-hardware" class="value mono-block">fdcan2 · 10Nm</div>
          </div>
          <div class="card">
            <div class="label">MCU 角度限幅 (deg)</div>
            <div id="gs-mcu-limit" class="value mono-block">—</div>
          </div>
          <div class="card">
            <div class="label">MCU 转速范围 (°/s)</div>
            <div id="gs-mcu-speed-limit" class="value mono-block">—</div>
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
                <th>在线</th>
                <th>angle_deg (°)</th>
                <th>fwd (°/s)</th>
                <th>rev (°/s)</th>
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
          <strong>在线</strong>：该路有应答。未接的路保持离线，不影响其它路上报。
          <strong>angle_deg</strong>：当前角度。
          <strong>fwd / rev</strong>：正反转速反馈。
          离线时角度和故障不显示实测值。
        </p>
      </section>

      <section class="panel">
        <h2>GS_CMD 单次下发</h2>
        <div class="card-grid">
          <div class="card"><div class="label">CMD 下发计数</div><div id="gs-cmd-count" class="value">--</div></div>
        </div>
        <div class="card-grid">
          <div class="card">
            <div class="label">index</div>
            <select id="gs-index" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
              ${channelOptionsHtml()}
            </select>
          </div>
          <div class="card">
            <div class="label">cmd_type</div>
            <select id="gs-cmd-type" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
              <option value="${GS_CMD_TYPE_ANGLE}">0 角度</option>
              <option value="${GS_CMD_TYPE_SPEED}">1 转速</option>
            </select>
          </div>
          <div class="card" id="gs-cmd-angle-card">
            <div class="label">angle_deg (°)</div>
            ${numInput("gs-angle-input", "0.0", "0.1")}
            <p class="hint">建议 ±45；超范围由 MCU 钳位</p>
          </div>
          <div class="card" id="gs-cmd-fwd-card" style="display:none">
            <div class="label">forward_speed (°/s)</div>
            ${numInput("gs-fwd-input", "20", "1")}
            <p class="hint">正转 CB01，MCU 范围 6~45</p>
          </div>
          <div class="card" id="gs-cmd-rev-card" style="display:none">
            <div class="label">reverse_speed (°/s)</div>
            ${numInput("gs-rev-input", "20", "1")}
            <p class="hint">反转 CB02，MCU 范围 6~45</p>
          </div>
        </div>
        <div class="control-row" style="margin-top:12px">
          <button id="gs-send" type="button">发送一次 GS_CMD</button>
        </div>
        <div id="gs-cmd-result" class="hint">POST /api/modules/gs/cmd → /obc/gs_cmd</div>
      </section>
    `;

    this._onCmdTypeChange = () => {
      const typeEl = document.getElementById("gs-cmd-type");
      setCmdTypeView(typeEl ? typeEl.value : GS_CMD_TYPE_ANGLE);
    };

    this._onGsSend = async () => {
      const index = Number(document.getElementById("gs-index").value);
      const cmdType = Number(document.getElementById("gs-cmd-type").value);
      const resultEl = document.getElementById("gs-cmd-result");
      const payload = {
        index,
        cmd_type: cmdType,
      };

      if (cmdType === GS_CMD_TYPE_ANGLE) {
        const angleInput = document.getElementById("gs-angle-input");
        const angle = Number(angleInput.value);
        if (!Number.isFinite(angle)) {
          resultEl.textContent = "angle_deg 无效";
          return;
        }
        angleInput.value = angle.toFixed(1);
        payload.angle_deg = angle;
      } else {
        const fwdInput = document.getElementById("gs-fwd-input");
        const revInput = document.getElementById("gs-rev-input");
        const forwardSpeed = Number(fwdInput.value);
        const reverseSpeed = Number(revInput.value);
        if (!Number.isFinite(forwardSpeed) || !Number.isFinite(reverseSpeed)) {
          resultEl.textContent = "forward_speed / reverse_speed 无效";
          return;
        }
        payload.forward_speed = forwardSpeed;
        payload.reverse_speed = reverseSpeed;
      }

      try {
        const { status, data } = await postModule("gs", "cmd", payload);
        if (data.ok) {
          if (Number(data.cmd_type) === GS_CMD_TYPE_SPEED) {
            resultEl.textContent = [
              `已下发 [${data.index}] 转速 fwd=${fmt(data.forward_speed, 0)} rev=${fmt(data.reverse_speed, 0)} °/s`,
              `cmd 累计=${data.cmd_tx_count}`,
              data.note || "",
            ].join(" · ");
          } else {
            resultEl.textContent = [
              `已下发 [${data.index}] angle=${fmt(data.angle_deg, 1)}°`,
              `cmd 累计=${data.cmd_tx_count}`,
              data.note || "",
            ].join(" · ");
          }
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    };

    document.getElementById("gs-cmd-type").addEventListener("change", this._onCmdTypeChange);
    document.getElementById("gs-send").addEventListener("click", this._onGsSend);
    this._onCmdTypeChange();
  },

  update(snapshot) {
    const data = snapshot.modules?.gs;
    if (!data) {
      return;
    }

    const connected = Boolean(data.connected);
    setText("gs-connected", connected ? "有状态帧" : "无状态帧");
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

    const speedLimit = data.mcu_speed_limit_dps || [];
    if (speedLimit.length >= 2) {
      setText("gs-mcu-speed-limit", `[${fmt(speedLimit[0], 0)}, ${fmt(speedLimit[1], 0)}]`);
    } else {
      setText("gs-mcu-speed-limit", "[6, 45]");
    }

    if (!connected) {
      setText("gs-timestamp-ms", data.message || "等待 /GsStatus");
      setText("gs-online-count", `—/${GS_CHANNEL_COUNT}`);
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
    const onlineCount = Number.isFinite(Number(data.online_count))
      ? Number(data.online_count)
      : channels.filter((ch) => ch && ch.online).length;
    setText("gs-online-count", `${onlineCount}/${data.channel_count ?? GS_CHANNEL_COUNT}`);

    for (let index = 0; index < GS_CHANNEL_COUNT; index += 1) {
      const ch = channels[index];
      if (!ch) {
        continue;
      }
      const online = Boolean(ch.online);
      setText(
        `gs-ch-${index}-meta`,
        `${ch.hal_name} · Node ${ch.can_node} · TX ${ch.can_tx_id} RX ${ch.can_rx_id}`,
      );
      setStatusValue(
        `gs-ch-${index}-online`,
        online,
        ch.online_label ?? (online ? "在线" : "离线"),
      );
      if (!online) {
        setText(`gs-ch-${index}-angle`, "—");
        setText(`gs-ch-${index}-fwd`, "—");
        setText(`gs-ch-${index}-rev`, "—");
        setText(`gs-ch-${index}-res`, "—");
        setStatusValue(`gs-ch-${index}-res-label`, false, "未接入");
        continue;
      }
      setText(`gs-ch-${index}-angle`, fmtSigned(ch.angle_deg, 2));
      setText(`gs-ch-${index}-fwd`, ch.forward_speed_label ?? fmt(ch.forward_speed_feedback, 0));
      setText(`gs-ch-${index}-rev`, ch.reverse_speed_label ?? fmt(ch.reverse_speed_feedback, 0));
      setText(`gs-ch-${index}-res`, ch.res_hex ?? "—");
      setStatusValue(
        `gs-ch-${index}-res-label`,
        Boolean(ch.res_ok),
        joinLabels(ch.res_labels),
      );
    }
  },

  destroy() {
    const typeEl = document.getElementById("gs-cmd-type");
    if (typeEl && this._onCmdTypeChange) {
      typeEl.removeEventListener("change", this._onCmdTypeChange);
    }
    const btn = document.getElementById("gs-send");
    if (btn && this._onGsSend) {
      btn.removeEventListener("click", this._onGsSend);
    }
  },
};
