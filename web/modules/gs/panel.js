import { postModule } from "../../core/api.js";

const GS_CHANNEL_COUNT = 4;
const GS_CMD_TYPE_ANGLE = 0;
const GS_CMD_TYPE_SPEED = 1;
const GS_CMD_TYPE_STOP = 2;
const GS_CMD_TYPE_SET_ZERO = 3;

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
        <td class="gs-ch-actions">
          <button type="button" class="gs-ch-stop" data-index="${index}">停止</button>
          <button type="button" class="gs-ch-zero" data-index="${index}">设零点</button>
        </td>
      </tr>
    `);
  }
  return rows.join("");
}

function channelOptionsHtml() {
  const options = [];
  for (let index = 0; index < GS_CHANNEL_COUNT; index += 1) {
    const node = (index + 1).toString(16).toUpperCase().padStart(2, "0");
    options.push(`<option value="${index}">[${index}] Node 0x${node}</option>`);
  }
  return options.join("");
}

function numInput(id, value, step) {
  return `<input id="${id}" type="number" step="${step}" value="${value}"
    style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">`;
}

function setZeroModalHtml() {
  return `
    <div id="gs-zero-modal" class="gs-zero-modal-overlay" hidden aria-hidden="true">
      <div class="gs-zero-modal" role="dialog" aria-labelledby="gs-zero-modal-title" aria-modal="true">
        <h3 id="gs-zero-modal-title">设零点确认</h3>
        <p class="gs-zero-modal-warn">
          此操作将通过 CAN 下发 <code>C4 01</code>，把<strong>当前机械位置</strong>写入舵机零点，
          后续角度反馈将以此为 0°。误操作会导致零位偏移，且<strong>不可通过网页撤销</strong>。
        </p>
        <dl class="gs-zero-modal-meta">
          <div><dt>index</dt><dd id="gs-zero-modal-index" class="mono">—</dd></div>
          <div><dt>CAN</dt><dd id="gs-zero-modal-can" class="mono">—</dd></div>
          <div><dt>当前 angle_deg</dt><dd id="gs-zero-modal-angle" class="mono">—</dd></div>
          <div><dt>在线</dt><dd id="gs-zero-modal-online">—</dd></div>
        </dl>
        <ol class="gs-zero-modal-steps hint">
          <li>先对该路下发<strong>停止</strong>，确认舵机已停在目标零位且不再运动。</li>
          <li>勾选下方确认项，再点击<strong>确认设零点</strong>。</li>
        </ol>
        <p id="gs-zero-modal-offline-warn" class="gs-zero-modal-offline-warn" hidden>
          该路当前离线或未接入，设零点命令可能无法到达舵机；请确认接线与在线状态后再继续。
        </p>
        <label class="gs-zero-modal-check">
          <input id="gs-zero-ack" type="checkbox">
          <span>我已确认舵机停在目标零位，且理解此操作会永久改变该路零点。</span>
        </label>
        <div class="gs-zero-modal-actions control-row">
          <button id="gs-zero-cancel" type="button">取消</button>
          <button id="gs-zero-confirm" type="button" class="gs-zero-modal-confirm" disabled>
            确认设零点
          </button>
        </div>
      </div>
    </div>
  `;
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
          运行时命令：<code>/obc/gs_cmd</code> → GS_CMD（0=角度 / 1=正反转速 / 2=停止 / 3=设零点）。
          四路可独立在线；未接入的路显示离线。
          程序 <strong>index 0..3</strong> 对应 CAN <strong>Node 0x01..0x04</strong>（如 4 号舵机 = index 3）。
          状态表每路可单独<strong>停止</strong>（C2）或<strong>设零点</strong>（C4 01）；限位 / ID / 波特率等仍走 MCU 产线 API。
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
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="gs-channel-tbody">
              ${channelRowsHtml()}
            </tbody>
          </table>
        </div>
        <p class="hint">
          <strong>在线</strong>：该路 A0 有应答（<code>step=1</code>）。未接的路保持离线，不影响其它路上报。
          <strong>angle_deg</strong>：MCU 由 A0 圈数 + 单圈角解析（运行中 byte[1]=0x80 时方向沿用缓存）。
          <strong>fwd / rev</strong>：CB01/CB02 配置转速反馈；在线后 MCU 自动 setup 写入默认 20 °/s，未上报前显示「—」。
          <strong>res</strong>：A0 状态字；仅 <code>res &amp; 0x737F ≠ 0</code> 计为报警，<code>0x8000</code> 单独为终端电阻状态。
          <strong>停止</strong>：下发 GS_CMD cmd_type=2（C2 停机）。<strong>设零点</strong>：cmd_type=3（C4 01），将当前机械位置写入零点，操作前请确认舵机已到位。
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
            <p class="hint">正转 CB01，最低 6 °/s，额定 20，建议不超过额定</p>
          </div>
          <div class="card" id="gs-cmd-rev-card" style="display:none">
            <div class="label">reverse_speed (°/s)</div>
            ${numInput("gs-rev-input", "20", "1")}
            <p class="hint">反转 CB02，最低 6 °/s，额定 20，建议不超过额定</p>
          </div>
        </div>
        <div class="control-row" style="margin-top:12px">
          <button id="gs-send" type="button">发送一次 GS_CMD</button>
        </div>
        <div id="gs-cmd-result" class="hint">POST /api/modules/gs/cmd|stop|set_zero → /obc/gs_cmd</div>
      </section>
      ${setZeroModalHtml()}
    `;

    this._channels = [];
    this._setZeroModalResolver = null;

    this._closeSetZeroModal = (confirmed) => {
      const modal = document.getElementById("gs-zero-modal");
      if (modal) {
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
      }
      const resolver = this._setZeroModalResolver;
      this._setZeroModalResolver = null;
      if (resolver) {
        resolver(Boolean(confirmed));
      }
    };

    this._updateSetZeroModalConfirm = () => {
      const ackEl = document.getElementById("gs-zero-ack");
      const confirmBtn = document.getElementById("gs-zero-confirm");
      if (confirmBtn) {
        confirmBtn.disabled = !Boolean(ackEl?.checked);
      }
    };

    this._requestSetZeroConfirm = (index) => {
      return new Promise((resolve) => {
        const modal = document.getElementById("gs-zero-modal");
        const confirmBtn = document.getElementById("gs-zero-confirm");
        const ackEl = document.getElementById("gs-zero-ack");
        if (!modal || !confirmBtn || !ackEl) {
          resolve(false);
          return;
        }

        const ch = this._channels?.[index];
        const node = (index + 1).toString(16).toUpperCase().padStart(2, "0");
        const online = Boolean(ch?.online);
        const angleText = online ? fmtSigned(ch.angle_deg, 2) : "—（离线或未接入）";

        setText("gs-zero-modal-index", `[${index}]`);
        setText("gs-zero-modal-can", ch
          ? `${ch.hal_name} · Node ${ch.can_node}`
          : `Node 0x${node}`);
        setText("gs-zero-modal-angle", angleText);
        setText("gs-zero-modal-online", online ? "在线" : "离线");

        const warnEl = document.getElementById("gs-zero-modal-offline-warn");
        if (warnEl) {
          warnEl.hidden = online;
        }

        confirmBtn.disabled = true;
        ackEl.checked = false;

        this._setZeroModalResolver = resolve;
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        ackEl.focus();
      });
    };

    this._onSetZeroModalKeydown = (event) => {
      const modal = document.getElementById("gs-zero-modal");
      if (!modal || modal.hidden) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this._closeSetZeroModal(false);
      }
    };

    this._onSetZeroCancel = () => {
      this._closeSetZeroModal(false);
    };

    this._onSetZeroConfirmClick = () => {
      const confirmBtn = document.getElementById("gs-zero-confirm");
      if (!confirmBtn || confirmBtn.disabled) {
        return;
      }
      this._closeSetZeroModal(true);
    };

    this._bindSetZeroModal = () => {
      const ackEl = document.getElementById("gs-zero-ack");
      const cancelBtn = document.getElementById("gs-zero-cancel");
      const confirmBtn = document.getElementById("gs-zero-confirm");

      if (ackEl) {
        ackEl.addEventListener("change", this._updateSetZeroModalConfirm);
      }
      if (cancelBtn) {
        cancelBtn.addEventListener("click", this._onSetZeroCancel);
      }
      if (confirmBtn) {
        confirmBtn.addEventListener("click", this._onSetZeroConfirmClick);
      }
      document.addEventListener("keydown", this._onSetZeroModalKeydown);
    };

    this._onCmdTypeChange = () => {
      const typeEl = document.getElementById("gs-cmd-type");
      setCmdTypeView(typeEl ? typeEl.value : GS_CMD_TYPE_ANGLE);
    };

    this._onChannelAction = async (event) => {
      const stopBtn = event.target.closest(".gs-ch-stop");
      const zeroBtn = event.target.closest(".gs-ch-zero");
      if (!stopBtn && !zeroBtn) {
        return;
      }

      const btn = stopBtn || zeroBtn;
      const index = Number(btn.dataset.index);
      const resultEl = document.getElementById("gs-cmd-result");
      const action = stopBtn ? "stop" : "set_zero";
      const actionLabel = stopBtn ? "停止" : "设零点";

      if (!Number.isInteger(index) || index < 0 || index >= GS_CHANNEL_COUNT) {
        resultEl.textContent = "index 无效";
        return;
      }

      if (zeroBtn) {
        const confirmed = await this._requestSetZeroConfirm(index);
        if (!confirmed) {
          resultEl.textContent = `[${index}] 设零点已取消`;
          return;
        }
      }

      btn.disabled = true;
      try {
        const { status, data } = await postModule("gs", action, { index });
        if (data.ok) {
          resultEl.textContent = [
            `已下发 [${data.index}] ${actionLabel}`,
            `cmd 累计=${data.cmd_tx_count}`,
            data.note || "",
          ].join(" · ");
        } else {
          resultEl.textContent = `[${index}] ${actionLabel} 失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `[${index}] ${actionLabel} 请求异常: ${err}`;
      } finally {
        btn.disabled = false;
      }
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
    const channelTbody = document.getElementById("gs-channel-tbody");
    if (channelTbody) {
      channelTbody.addEventListener("click", this._onChannelAction);
    }
    this._bindSetZeroModal();
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

    const speedMin = data.mcu_speed_min_dps;
    const speedRated = data.mcu_speed_rated_dps;
    if (speedMin != null && speedRated != null) {
      setText("gs-mcu-speed-limit", `≥${fmt(speedMin, 0)}，额定 ${fmt(speedRated, 0)}（无上限，建议≤额定）`);
    } else {
      const speedLimit = data.mcu_speed_limit_dps || [];
      if (speedLimit.length >= 2) {
        setText("gs-mcu-speed-limit", `≥${fmt(speedLimit[0], 0)}，额定 ${fmt(speedLimit[1], 0)}`);
      } else {
        setText("gs-mcu-speed-limit", "≥6，额定 20（建议≤额定）");
      }
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
    this._channels = channels;
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
    this._closeSetZeroModal(false);

    const ackEl = document.getElementById("gs-zero-ack");
    if (ackEl && this._updateSetZeroModalConfirm) {
      ackEl.removeEventListener("change", this._updateSetZeroModalConfirm);
    }
    const cancelBtn = document.getElementById("gs-zero-cancel");
    if (cancelBtn && this._onSetZeroCancel) {
      cancelBtn.removeEventListener("click", this._onSetZeroCancel);
    }
    const confirmBtn = document.getElementById("gs-zero-confirm");
    if (confirmBtn && this._onSetZeroConfirmClick) {
      confirmBtn.removeEventListener("click", this._onSetZeroConfirmClick);
    }
    if (this._onSetZeroModalKeydown) {
      document.removeEventListener("keydown", this._onSetZeroModalKeydown);
    }

    const typeEl = document.getElementById("gs-cmd-type");
    if (typeEl && this._onCmdTypeChange) {
      typeEl.removeEventListener("change", this._onCmdTypeChange);
    }
    const btn = document.getElementById("gs-send");
    if (btn && this._onGsSend) {
      btn.removeEventListener("click", this._onGsSend);
    }
    const channelTbody = document.getElementById("gs-channel-tbody");
    if (channelTbody && this._onChannelAction) {
      channelTbody.removeEventListener("click", this._onChannelAction);
    }
  },
};
