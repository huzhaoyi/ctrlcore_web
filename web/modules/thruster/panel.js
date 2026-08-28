import { postModule } from "../../core/api.js";

const PWM_NEUTRAL = 1500;
const PWM_MIN = 1000;
const PWM_MAX = 2000;
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
          <div class="card"><div class="label">周期保活</div><div id="thr-stream" class="value">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="thr-age" class="value">--</div></div>
        </div>
        <div class="card-grid">
          <div class="card"><div class="label">状态话题</div><div id="thr-status-topic" class="value mono-block">/ThrusterStatus</div></div>
          <div class="card"><div class="label">命令话题</div><div id="thr-cmd-topic" class="value mono-block">/thruster_command</div></div>
          <div class="card"><div class="label">锁字段</div><div id="thr-lock-field" class="value mono-block">thruster_unlocked</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="thr-link-hw" class="value mono-block">fdcan2 · TD10A · main_out</div></div>
        </div>
        <p class="hint">
          状态链：MCU MCN <code>thruster</code> / td10a → MAVLink <code>THRUSTER_STATUS (id=2, 20Hz)</code>
          → ROS <code>/ThrusterStatus</code>。
          命令链：开启周期后 Web 保活 <code>/thruster_command</code>（<code>thrusts</code> + <code>thruster_unlocked</code>）
          → <code>THRUSTER_CMD (id=10)</code> 和 <code>THRUSTER_LOCK (id=11)</code>。
          AUV 仅 index=0 有效，其余填 1500。
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
            <div class="label">power_lock（推进器动力锁）</div>
            <div id="thr-lock" class="value">—</div>
            <p id="thr-lock-hint" class="hint">0 解锁可运行；1 上锁禁止 TC（以本状态为准）</p>
          </div>
          <div class="card">
            <div class="label">ROS header.stamp</div>
            <div id="thr-ros-stamp" class="value mono-block">—</div>
          </div>
          <div class="card">
            <div class="label">最近目标 thrusts[0]</div>
            <div id="thr-last-cmd" class="value mono-block">—</div>
            <p class="hint">Web 调试目标，1500=中位</p>
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
            <div class="label">current_a（QC 电流）</div>
            <div id="thr-pwr0" class="value mono-block">—</div>
            <p class="hint">厂家无电压；ROS 字段名仍为 power_w，实为电流 A；精度约 ±0.8~1A</p>
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
          status：1=QV 成功；0=通信失败。fault：EF(0x4546) 原始 16 位故障字，约 1Hz 刷新。
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
                <th>current_a</th>
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
          <code>thrusts[0]</code>：1000~2000，中位 1500。
          MCU 映射 TC 百分比：percent = (thrusts[0] - 1500) × 100 / 500，限幅 ±100%。
          开周期会带 <code>thruster_unlocked=true</code>。
          <strong>仅「周期发送」开启后</strong>才持续发 <code>/thruster_command</code>；
          切到其他界面或监测页<strong>不会</strong>停发，须点「停止周期发送」才真正停发，可验证 MCU 断流看门狗。
        </p>
        <div class="control-row">
          <label class="label-inline" for="thr-speed">thrusts[0]</label>
          <input id="thr-speed" class="thr-speed-range" type="range" min="${PWM_MIN}" max="${PWM_MAX}" step="1" value="${PWM_NEUTRAL}">
          <input id="thr-speed-num" class="thr-speed-num" type="number" min="${PWM_MIN}" max="${PWM_MAX}" step="1" value="${PWM_NEUTRAL}" title="直接输入 1000~2000">
          <span id="thr-percent-val" class="hint">0% · TC 0%</span>
        </div>
        <div class="control-row">
          <button id="thr-stream-toggle" type="button">开启周期发送</button>
          <button id="thr-neutral" type="button">目标归中 1500</button>
        </div>
        <div id="thr-cmd-result" class="hint">POST /api/modules/thruster/stream_start|stream_stop</div>
      </section>

      <section class="panel">
        <h2>THRUSTER_LOCK 动力锁</h2>
        <p class="hint">
          走同一条 <code>/thruster_command</code>：<code>thruster_unlocked=true</code> 解锁后才能写推力；
          <code>false</code> 上锁后忽略 TC 并归零。不联动阀控 / board_ctrl。
          未开周期时点解锁，网关约 2.5 s 无油门会 failsafe 再上锁。
        </p>
        <div class="control-row">
          <button id="thr-unlock" type="button">解锁 (thruster_unlocked=true)</button>
          <button id="thr-lock-btn" type="button">上锁 (thruster_unlocked=false)</button>
          <span id="thr-lock-sync" class="hint">状态：等待 /ThrusterStatus</span>
        </div>
        <div id="thr-lock-result" class="hint">POST /api/modules/thruster/lock → /thruster_command.thruster_unlocked；按钮高亮跟随 MCU 回报</div>
      </section>

      <section class="panel">
        <h2>协议字段对照</h2>
        <p class="mono-block">
          THRUSTER_STATUS (id=2): timestamp_ms, speed[12], power[12], temp[12], status[12], fault[12], lock, fault_raw[12]（MAVLink 2 扩展）<br>
          /thruster_command: thrusts[16] 油门 μs + thruster_unlocked<br>
          THRUSTER_CMD (id=10): thrusts[0..7]（Web 用 thrusts[0]）<br>
          THRUSTER_LOCK (id=11): 由 thruster_unlocked 生成（true=解锁 / false=上锁）<br>
          TD10A CAN: TC/QV/QC/QT/EF/MQ · 无 QP 电压 · power 字段上报电流 A · Node 0x01 · fdcan2 500k
        </p>
      </section>
    `;

    this._streaming = false;
    this._pendingLock = null;
    this._pendingLockAt = 0;
    this._lastLocked = true;

    const speedInput = document.getElementById("thr-speed");
    const speedNum = document.getElementById("thr-speed-num");

    const clampSpeed = (raw) => {
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        return PWM_NEUTRAL;
      }
      return Math.max(PWM_MIN, Math.min(PWM_MAX, Math.round(num)));
    };

    const updateSpeedLabel = (speed) => {
      const pct = speedToPercent(speed);
      if (speedNum && document.activeElement !== speedNum) {
        speedNum.value = String(speed);
      }
      setText("thr-percent-val", `${pct >= 0 ? "+" : ""}${pct}% · TC ${pct >= 0 ? "+" : ""}${pct}%`);
    };

    const syncSpeedControls = (raw) => {
      const speed = clampSpeed(raw);
      speedInput.value = String(speed);
      if (speedNum) {
        speedNum.value = String(speed);
      }
      updateSpeedLabel(speed);
      return speed;
    };

    speedInput.addEventListener("input", () => {
      updateSpeedLabel(clampSpeed(speedInput.value));
    });
    updateSpeedLabel(clampSpeed(speedInput.value));

    const setCmdResult = (text) => {
      const resultEl = document.getElementById("thr-cmd-result");
      if (resultEl) {
        resultEl.textContent = text;
      }
    };

    const syncStreamButton = () => {
      const btn = document.getElementById("thr-stream-toggle");
      if (!btn) {
        return;
      }
      btn.textContent = this._streaming ? "停止周期发送" : "开启周期发送";
    };

    const syncLockButtons = (locked, pending) => {
      const unlockBtn = document.getElementById("thr-unlock");
      const lockBtn = document.getElementById("thr-lock-btn");
      const syncEl = document.getElementById("thr-lock-sync");
      if (unlockBtn) {
        unlockBtn.classList.toggle("is-active", locked === false);
        unlockBtn.classList.remove("is-active-warn");
      }
      if (lockBtn) {
        lockBtn.classList.toggle("is-active-warn", locked === true);
        lockBtn.classList.toggle("is-active", false);
      }
      if (!syncEl) {
        return;
      }
      if (pending != null && pending !== (locked ? 1 : 0)) {
        syncEl.textContent = `状态：MCU=${locked ? "上锁(1)" : "解锁(0)"}，已请求 lock=${pending}，等待确认…`;
      } else {
        syncEl.textContent = `状态：${locked ? "上锁 (1) — 禁止 TC" : "解锁 (0) — 允许 TC"}`;
      }
    };
    this._syncLockButtons = syncLockButtons;

    this._postLock = async (lock) => {
      const resultEl = document.getElementById("thr-lock-result");
      this._pendingLock = lock;
      this._pendingLockAt = Date.now();
      try {
        const { status, data } = await postModule("thruster", "lock", { lock });
        if (data.ok) {
          resultEl.textContent =
            `已请求 thruster_unlocked=${data.thruster_unlocked}（累计 ${data.lock_tx_count}）；以状态卡 / 按钮高亮为准，MCU 拒绝解锁时状态会保持上锁`;
          syncLockButtons(this._lastLocked, lock);
        } else {
          this._pendingLock = null;
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        this._pendingLock = null;
        resultEl.textContent = `请求异常: ${err}`;
      }
    };

    this._startStream = async () => {
      try {
        const { status, data } = await postModule("thruster", "stream_start", {
          speed: clampSpeed(speedInput.value),
        });
        if (data.ok) {
          this._streaming = true;
          syncStreamButton();
          syncSpeedControls(data.speed);
          setCmdResult(
            [
              `周期已开启 thrusts[0]=${data.speed} (${data.percent >= 0 ? "+" : ""}${data.percent}%)`,
              data.note || "",
            ].join(" · "),
          );
        } else {
          setCmdResult(`开启失败 (${status}): ${data.error || "unknown"}`);
        }
      } catch (err) {
        setCmdResult(`请求异常: ${err}`);
      }
    };

    this._stopStream = async () => {
      try {
        const { status, data } = await postModule("thruster", "stream_stop", {});
        if (data.ok) {
          this._streaming = false;
          syncStreamButton();
          setCmdResult(data.note || "周期已停止");
        } else {
          setCmdResult(`停止失败 (${status}): ${data.error || "unknown"}`);
        }
      } catch (err) {
        setCmdResult(`请求异常: ${err}`);
      }
    };

    this._onStreamToggle = () => {
      if (this._streaming) {
        this._stopStream();
      } else {
        this._startStream();
      }
    };

    this._onSpeedInput = async () => {
      const speed = syncSpeedControls(speedInput.value);
      if (!this._streaming) {
        return;
      }
      try {
        const { status, data } = await postModule("thruster", "cmd", {
          speed,
        });
        if (data.ok) {
          setCmdResult(
            `周期中目标 thrusts[0]=${data.speed} (${data.percent >= 0 ? "+" : ""}${data.percent}%)`,
          );
        } else {
          setCmdResult(`更新失败 (${status}): ${data.error || "unknown"}`);
        }
      } catch (err) {
        setCmdResult(`请求异常: ${err}`);
      }
    };

    this._onSpeedNumChange = async () => {
      const speed = syncSpeedControls(speedNum.value);
      speedInput.value = String(speed);
      await this._onSpeedInput();
    };

    this._onNeutral = async () => {
      syncSpeedControls(PWM_NEUTRAL);
      try {
        const { status, data } = await postModule("thruster", "neutral", {});
        if (data.ok) {
          setCmdResult(data.note || `目标归中 thrusts[0]=${data.speed}`);
        } else {
          setCmdResult(`失败 (${status}): ${data.error || "unknown"}`);
        }
      } catch (err) {
        setCmdResult(`请求异常: ${err}`);
      }
    };

    this._onUnlock = () => {
      this._postLock(0);
    };
    this._onLock = () => {
      this._postLock(1);
    };

    speedInput.addEventListener("change", this._onSpeedInput);
    if (speedNum) {
      speedNum.addEventListener("change", this._onSpeedNumChange);
      speedNum.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this._onSpeedNumChange();
        }
      });
    }
    document.getElementById("thr-stream-toggle").addEventListener("click", this._onStreamToggle);
    document.getElementById("thr-neutral").addEventListener("click", this._onNeutral);
    document.getElementById("thr-unlock").addEventListener("click", this._onUnlock);
    document.getElementById("thr-lock-btn").addEventListener("click", this._onLock);
    syncStreamButton();
    syncLockButtons(true, null);
  },

  update(snapshot) {
    const data = snapshot.modules?.thruster;
    if (!data) {
      return;
    }

    const connected = Boolean(data.connected);
    const streamOn = Boolean(data.stream_enabled);
    this._streaming = streamOn;

    setText("thr-connected", connected ? "在线" : "离线");
    setText("thr-rx-count", data.rx_count ?? 0);
    setText(
      "thr-tx-count",
      `cmd=${data.cmd_tx_count ?? 0} / lock=${data.lock_tx_count ?? 0}`,
    );
    setStatusValue("thr-stream", streamOn, streamOn ? "开启（保活中）" : "关闭（已停发）");
    setText("thr-age", data.age_sec != null ? fmt(data.age_sec, 3) : "—");
    setText("thr-status-topic", data.status_topic ?? "/ThrusterStatus");
    setText("thr-cmd-topic", data.cmd_topic ?? "/thruster_command");
    setText("thr-lock-field", data.lock_field ?? "thruster_unlocked");
    setText("thr-link-hw", data.hardware ?? "fdcan2 · TD10A · main_out · Node 0x01 @500k");

    const streamBtn = document.getElementById("thr-stream-toggle");
    if (streamBtn) {
      streamBtn.textContent = streamOn ? "停止周期发送" : "开启周期发送";
    }

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
    const locked = !lockOk;
    this._lastLocked = locked;
    const confirmedLock = locked ? 1 : 0;
    if (this._pendingLock != null && this._pendingLock === confirmedLock) {
      this._pendingLock = null;
    } else if (
      this._pendingLock != null
      && this._pendingLockAt
      && (Date.now() - this._pendingLockAt) > 2500
      && this._pendingLock !== confirmedLock
    ) {
      const resultEl = document.getElementById("thr-lock-result");
      if (resultEl) {
        resultEl.textContent =
          `请求 lock=${this._pendingLock} 后状态仍为 ${confirmedLock}（可能被 MCU 拒绝，如未就绪/离线）`;
      }
      this._pendingLock = null;
    }
    setStatusValue("thr-lock", lockOk, data.power_lock_label ?? (locked ? "1 上锁（禁止 TC）" : "0 解锁（允许运行）"));
    setText("thr-lock-hint", lockOk ? "允许 TC / 推力控制" : "已上锁，MCU 忽略推力指令");
    if (typeof this._syncLockButtons === "function") {
      this._syncLockButtons(locked, this._pendingLock);
    }

    const fmtCurrent = (raw) => {
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        return "—";
      }
      return `${num} A`;
    };

    const ch0 = data.channels?.[0];
    if (ch0) {
      setText("thr-rpm0", fmtSigned(ch0.speed_rpm, 0));
      setText("thr-pwr0", fmtCurrent(ch0.current_a ?? ch0.power_w));
      setText("thr-temp0", `${ch0.temperature_c} °C`);
      setStatusValue("thr-st0", ch0.status_ok, ch0.status_label ?? "—");
      setStatusValue("thr-fault0", ch0.fault_ok, joinLabels(ch0.fault_labels));
    } else {
      setText("thr-rpm0", data.speed_rpm?.[0] ?? "—");
      setText("thr-pwr0", fmtCurrent(data.current_a?.[0] ?? data.power_w?.[0]));
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
      setText(`thr-ch-${index}-pwr`, fmtCurrent(ch.current_a ?? ch.power_w));
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
    // 周期保活在后端，切页/销毁面板不得 stream_stop；仅用户点「停止周期发送」才停。
    this._streaming = false;
    const speedInput = document.getElementById("thr-speed");
    if (speedInput && this._onSpeedInput) {
      speedInput.removeEventListener("change", this._onSpeedInput);
    }
    const speedNum = document.getElementById("thr-speed-num");
    if (speedNum && this._onSpeedNumChange) {
      speedNum.removeEventListener("change", this._onSpeedNumChange);
    }
    const bindings = [
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
