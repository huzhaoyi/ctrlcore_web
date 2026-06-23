import { postModule } from "../../core/api.js";

const PWM_NEUTRAL = 1500;
const PWM_MIN = 1000;
const PWM_MAX = 2000;
const STREAM_HZ = 20;
const STREAM_MS = 1000 / STREAM_HZ;
const THRUSTER_ARRAY_SIZE = 12;

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
    return "—";
  }
  return labels.join("；");
}

function speedToPercent(speed) {
  return Math.round(((Number(speed) - PWM_NEUTRAL) * 100) / 500);
}

function channelRowsHtml() {
  const rows = [];
  for (let index = 0; index < THRUSTER_ARRAY_SIZE; index += 1) {
    rows.push(`
      <tr>
        <td class="mono">[${index}]</td>
        <td id="thr-ch-${index}-meta" class="hint">—</td>
        <td id="thr-ch-${index}-rpm" class="mono">—</td>
        <td id="thr-ch-${index}-pwr" class="mono">—</td>
        <td id="thr-ch-${index}-temp" class="mono">—</td>
        <td id="thr-ch-${index}-st" class="hint">—</td>
        <td id="thr-ch-${index}-fault" class="hint">—</td>
      </tr>
    `);
  }
  return rows.join("");
}

export default {
  id: "thruster",
  title: "TD10A 推进器",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="thr-connected" class="value">--</div></div>
          <div class="card"><div class="label">状态帧计数</div><div id="thr-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">CMD / LOCK 计数</div><div id="thr-tx-count" class="value mono-block">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="thr-age" class="value">--</div></div>
        </div>
        <div class="card-grid">
          <div class="card"><div class="label">状态话题</div><div id="thr-status-topic" class="value mono-block">/ThrusterStatus</div></div>
          <div class="card"><div class="label">命令话题</div><div id="thr-cmd-topic" class="value mono-block">/thruster_command</div></div>
          <div class="card"><div class="label">锁话题</div><div id="thr-lock-topic" class="value mono-block">/obc/thruster_lock</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="thr-link-hw" class="value mono-block">fdcan2 · TD10A · main_out</div></div>
        </div>
        <p class="hint">
          状态链：MCU MCN <code>thruster</code> / td10a → MAVLink <code>THRUSTER_STATUS (id=2, 20Hz)</code>
          → ROS <code>/ThrusterStatus</code>。
          命令链：Web → <code>/thruster_command</code> → <code>THRUSTER_CMD (id=10)</code>；
          <code>/obc/thruster_lock</code> → <code>THRUSTER_LOCK (id=11)</code> → MCU <code>main_out</code>。
          AUV 仅 index=0 有效，其余填 0。
        </p>
      </section>

      <section class="panel">
        <h2>THRUSTER_STATUS 帧头</h2>
        <div class="card-grid">
          <div class="card">
            <div class="label">timestamp_ms</div>
            <div id="thr-mcu-ts" class="value mono-block">—</div>
            <p class="hint">MCU td10a 遥测周期时间戳</p>
          </div>
          <div class="card">
            <div class="label">power_lock（全局动力锁）</div>
            <div id="thr-lock" class="value">—</div>
            <p id="thr-lock-hint" class="hint">0 解锁可运行；1 上锁禁止 TC</p>
          </div>
          <div class="card">
            <div class="label">ROS header.stamp</div>
            <div id="thr-ros-stamp" class="value mono-block">—</div>
          </div>
          <div class="card">
            <div class="label">最近下发 PWM[0]</div>
            <div id="thr-last-cmd" class="value mono-block">—</div>
            <p class="hint">Web 调试最后一次 speed[0]，1500=中立</p>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>推进器 #0（AUV 主推进）</h2>
        <div class="card-grid">
          <div class="card">
            <div class="label">speed_rpm</div>
            <div id="thr-rpm0" class="value mono-block">—</div>
            <p class="hint">CAN QV(0x5156) 转速，正/负表示转向</p>
          </div>
          <div class="card">
            <div class="label">power_w</div>
            <div id="thr-pwr0" class="value mono-block">—</div>
            <p class="hint">QC(电流×0.1A) × QP(电压 V) 估算功率 W</p>
          </div>
          <div class="card">
            <div class="label">temperature_c</div>
            <div id="thr-temp0" class="value mono-block">—</div>
            <p class="hint">QT(0x5154) 控制器温度 °C</p>
          </div>
          <div class="card">
            <div class="label">status / fault</div>
            <div id="thr-st0" class="value mono-block">—</div>
            <p id="thr-fault0" class="hint">—</p>
          </div>
        </div>
        <p class="hint">
          硬件：<code>main_out</code> · fdcan2 @500k · Node 0x01 · TX 0x301 / RX 0x281。
          status：1=QV 成功；0=通信失败。fault：EF(0x4546) 故障字节，约 1Hz 刷新。
        </p>
      </section>

      <section class="panel">
        <h2>12 路数组（MAVLink 槽位）</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>index</th>
                <th>硬件 / CAN</th>
                <th>speed_rpm</th>
                <th>power_w</th>
                <th>temp °C</th>
                <th>status</th>
                <th>fault</th>
              </tr>
            </thead>
            <tbody>
              ${channelRowsHtml()}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>THRUSTER_CMD 推力调试</h2>
        <p class="hint">
          <code>speed[0]</code> PWM 微秒值：1000~2000，中立 1500。
          MCU 映射 TC 百分比：percent = (speed - 1500) × 100 / 500，限幅 ±100%。
          OBC bridge 50Hz 整形下发，断流 failsafe 归中 1500。
        </p>
        <div class="control-row">
          <label class="label-inline" for="thr-speed">speed[0] PWM</label>
          <input id="thr-speed" type="range" min="${PWM_MIN}" max="${PWM_MAX}" step="10" value="${PWM_NEUTRAL}">
          <span id="thr-speed-val" class="mono-block">${PWM_NEUTRAL}</span>
          <span id="thr-percent-val" class="hint">0% · TC 0%</span>
        </div>
        <div class="control-row">
          <button id="thr-send-once" type="button">发送一次</button>
          <button id="thr-stream-toggle" type="button">周期发送 ${STREAM_HZ}Hz</button>
          <button id="thr-neutral" type="button">中立 1500</button>
        </div>
        <div id="thr-cmd-result" class="hint">POST /api/modules/thruster/cmd → /thruster_command</div>
      </section>

      <section class="panel">
        <h2>THRUSTER_LOCK 动力锁</h2>
        <p class="hint">
          <code>lock=1</code>：MCU power_lock，推力清零并忽略 TC；
          <code>lock=0</code>：解锁。与推进器命令独立订阅，bridge 即时下发。
        </p>
        <div class="control-row">
          <button id="thr-unlock" type="button">解锁 (lock=0)</button>
          <button id="thr-lock-btn" type="button">上锁 (lock=1)</button>
        </div>
        <div id="thr-lock-result" class="hint">POST /api/modules/thruster/lock → /obc/thruster_lock</div>
      </section>

      <section class="panel">
        <h2>协议字段对照</h2>
        <p class="mono-block">
          THRUSTER_STATUS (id=2): timestamp_ms, speed[12], power[12], temp[12], status[12], fault[12], lock<br>
          THRUSTER_CMD (id=10): speed[8] PWM μs（Web 用 speed[0]）<br>
          THRUSTER_LOCK (id=11): lock (0/1)<br>
          TD10A CAN: TC/QV/QC/QP/QT/EF/MQ · Node 0x01 · fdcan2 500k
        </p>
      </section>
    `;

    this._streamTimer = null;
    this._streaming = false;

    const speedInput = document.getElementById("thr-speed");

    const updateSpeedLabel = () => {
      const speed = Number(speedInput.value);
      const pct = speedToPercent(speed);
      setText("thr-speed-val", String(speed));
      setText("thr-percent-val", `${pct >= 0 ? "+" : ""}${pct}% · TC ${pct >= 0 ? "+" : ""}${pct}%`);
    };
    speedInput.addEventListener("input", updateSpeedLabel);
    updateSpeedLabel();

    this._postCmd = async (speed) => {
      const resultEl = document.getElementById("thr-cmd-result");
      try {
        const { status, data } = await postModule("thruster", "cmd", { speed: Number(speed) });
        if (data.ok) {
          resultEl.textContent = [
            `已下发 PWM=${data.speed} (${data.percent >= 0 ? "+" : ""}${data.percent}%)`,
            `cmd=${data.cmd_tx_count}`,
            data.note || "",
          ].join(" · ");
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    };

    this._postLock = async (lock) => {
      const resultEl = document.getElementById("thr-lock-result");
      try {
        const { status, data } = await postModule("thruster", "lock", { lock });
        if (data.ok) {
          resultEl.textContent = `已下发 lock=${data.lock}，累计 lock=${data.lock_tx_count}`;
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    };

    this._stopStream = () => {
      if (this._streamTimer != null) {
        clearInterval(this._streamTimer);
        this._streamTimer = null;
      }
      this._streaming = false;
      document.getElementById("thr-stream-toggle").textContent = `周期发送 ${STREAM_HZ}Hz`;
    };

    this._startStream = () => {
      this._stopStream();
      this._streaming = true;
      document.getElementById("thr-stream-toggle").textContent = "停止周期发送";
      const tick = () => {
        this._postCmd(Number(speedInput.value));
      };
      tick();
      this._streamTimer = setInterval(tick, STREAM_MS);
    };

    this._onSendOnce = () => {
      this._postCmd(Number(speedInput.value));
    };
    this._onStreamToggle = () => {
      if (this._streaming) {
        this._stopStream();
      } else {
        this._startStream();
      }
    };
    this._onNeutral = async () => {
      speedInput.value = String(PWM_NEUTRAL);
      updateSpeedLabel();
      const resultEl = document.getElementById("thr-cmd-result");
      try {
        const { status, data } = await postModule("thruster", "neutral", {});
        if (data.ok) {
          resultEl.textContent = `已中立 PWM=${data.speed}，累计 cmd=${data.cmd_tx_count}`;
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    };
    this._onUnlock = () => {
      this._postLock(0);
    };
    this._onLock = () => {
      this._postLock(1);
    };

    document.getElementById("thr-send-once").addEventListener("click", this._onSendOnce);
    document.getElementById("thr-stream-toggle").addEventListener("click", this._onStreamToggle);
    document.getElementById("thr-neutral").addEventListener("click", this._onNeutral);
    document.getElementById("thr-unlock").addEventListener("click", this._onUnlock);
    document.getElementById("thr-lock-btn").addEventListener("click", this._onLock);
  },

  update(snapshot) {
    const data = snapshot.modules?.thruster;
    if (!data) {
      return;
    }

    const connected = Boolean(data.connected);
    setText("thr-connected", connected ? "在线" : "离线");
    setText("thr-rx-count", data.rx_count ?? 0);
    setText(
      "thr-tx-count",
      `cmd=${data.cmd_tx_count ?? 0} / lock=${data.lock_tx_count ?? 0}`,
    );
    setText("thr-age", data.age_sec != null ? fmt(data.age_sec, 3) : "—");
    setText("thr-status-topic", data.status_topic ?? "/ThrusterStatus");
    setText("thr-cmd-topic", data.cmd_topic ?? "/thruster_command");
    setText("thr-lock-topic", data.lock_topic ?? "/obc/thruster_lock");
    setText("thr-link-hw", data.hardware ?? "fdcan2 · TD10A · main_out · Node 0x01 @500k");

    if (data.last_cmd_speed != null) {
      const pct = data.last_cmd_percent ?? speedToPercent(data.last_cmd_speed);
      setText(
        "thr-last-cmd",
        `${data.last_cmd_speed} (${pct >= 0 ? "+" : ""}${pct}%)`,
      );
    }

    if (!connected) {
      setText("thr-mcu-ts", data.message || "等待 /ThrusterStatus");
      return;
    }

    setText("thr-mcu-ts", data.timestamp_ms != null ? String(data.timestamp_ms) : "—");
    const stampSec = data.stamp_sec;
    const stampNs = data.stamp_nanosec;
    if (stampSec != null) {
      setText(
        "thr-ros-stamp",
        `${stampSec}.${String(stampNs ?? 0).padStart(9, "0").slice(0, 9)} s`,
      );
    } else {
      setText("thr-ros-stamp", "—");
    }

    const lockOk = Boolean(data.power_lock_ok);
    setStatusValue("thr-lock", lockOk, data.power_lock_label ?? (data.power_lock ? "上锁 (1)" : "解锁 (0)"));
    setText("thr-lock-hint", lockOk ? "允许 TC / 推力控制" : "已上锁，MCU 忽略推力指令");

    const ch0 = data.channels?.[0];
    if (ch0) {
      setText("thr-rpm0", fmtSigned(ch0.speed_rpm, 0));
      setText("thr-pwr0", `${ch0.power_w} W`);
      setText("thr-temp0", `${ch0.temperature_c} °C`);
      setStatusValue("thr-st0", ch0.status_ok, ch0.status_label ?? "—");
      setStatusValue("thr-fault0", ch0.fault_ok, joinLabels(ch0.fault_labels));
    } else {
      setText("thr-rpm0", data.speed_rpm?.[0] ?? "—");
      setText("thr-pwr0", data.power_w?.[0] ?? "—");
      setText("thr-temp0", data.temperature_c?.[0] ?? "—");
      setText("thr-st0", "—");
      setText("thr-fault0", "—");
    }

    const channels = data.channels || [];
    for (let index = 0; index < THRUSTER_ARRAY_SIZE; index += 1) {
      const ch = channels[index];
      if (!ch) {
        continue;
      }
      const meta = ch.active
        ? `${ch.hal_name} · ${ch.can_bus} · Node ${ch.can_node}`
        : "未使用（AUV 填 0）";
      setText(`thr-ch-${index}-meta`, meta);
      setText(`thr-ch-${index}-rpm`, String(ch.speed_rpm));
      setText(`thr-ch-${index}-pwr`, `${ch.power_w} W`);
      setText(`thr-ch-${index}-temp`, `${ch.temperature_c}`);
      setStatusValue(`thr-ch-${index}-st`, ch.status_ok, ch.status_label ?? "—");
      setStatusValue(
        `thr-ch-${index}-fault`,
        ch.fault_ok,
        `${ch.fault_hex} · ${joinLabels(ch.fault_labels)}`,
      );
    }
  },

  destroy() {
    if (this._streamTimer != null) {
      clearInterval(this._streamTimer);
      this._streamTimer = null;
    }
    const bindings = [
      ["thr-send-once", this._onSendOnce],
      ["thr-stream-toggle", this._onStreamToggle],
      ["thr-neutral", this._onNeutral],
      ["thr-unlock", this._onUnlock],
      ["thr-lock-btn", this._onLock],
    ];
    for (const [id, handler] of bindings) {
      const el = document.getElementById(id);
      if (el && handler) {
        el.removeEventListener("click", handler);
      }
    }
  },
};
