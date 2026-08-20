import { postModule } from "../../core/api.js";

const RUN_CMD = {
  STOP: 0,
  FWD: 1,
  REV: 2,
  DISPLACE_ZERO: 3,
};

const PITCH_ZERO_MM = 45.0;
const PITCH_S_MAX_MM = 80.0;

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

export function pitchMotorHtml() {
  return `
      <section class="panel">
        <h2>俯仰电机 BLD005（测试点动）</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="pitch-connected" class="value">--</div></div>
          <div class="card"><div class="label">设定 / 实际转速 (rpm)</div><div id="pitch-rpm-pair" class="value mono-block">— / —</div></div>
          <div class="card"><div class="label">运行状态</div><div id="pitch-run-label" class="value">—</div></div>
          <div class="card"><div class="label">故障</div><div id="pitch-fault-label" class="value">—</div></div>
          <div class="card"><div class="label">母线 V / A</div><div id="pitch-bus-pair" class="value mono-block">— / —</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="pitch-age" class="value">--</div></div>
        </div>
        <div class="card-grid">
          <div class="card">
            <div class="label">运行转速 (rpm)</div>
            <input id="pitch-speed-input" type="number" min="150" max="3000" step="10" value="500"
              style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
            <p class="hint">仅测试点动用；150~3000（MCU 钳位）</p>
          </div>
        </div>
        <div class="control-row" style="margin-top:12px;display:flex;flex-wrap:wrap;gap:10px">
          <button id="pitch-fwd" type="button"
            style="min-width:120px;border-color:rgba(46,204,113,0.5);background:rgba(46,204,113,0.15)">正转</button>
          <button id="pitch-rev" type="button"
            style="min-width:120px;border-color:rgba(52,152,219,0.5);background:rgba(52,152,219,0.15)">反转</button>
          <button id="pitch-stop" type="button"
            style="min-width:120px;border-color:rgba(243,18,96,0.5);background:rgba(243,18,96,0.15)">停止</button>
        </div>
        <div id="pitch-cmd-result" class="hint">软限位 CH1：正转≤45 mm、反转≥125 mm；停止后等下一条位移指令再进位置环</div>
      </section>

      <section class="panel">
        <h2>位置环（正式控制）</h2>
        <p class="hint" style="margin-top:0">
          零位 = 拉线 <strong>45 mm</strong>；往前朝 <strong>125 mm</strong>（读数增大）。
          发位移 s → 目标 = 45 + s（最大 s = 80 mm）。外控只发目标，无需取消闭环。
        </p>
        <div class="card-grid">
          <div class="card">
            <div class="label">往前位移 s (mm)</div>
            <input id="pitch-s-input" type="number" min="0" max="80" step="0.5" value="10"
              style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
            <p class="hint">0~80；例 s=20 → 目标 65 mm</p>
          </div>
          <div class="card"><div class="label">推算目标绝对 mm</div><div id="pitch-s-target" class="value mono-block">55.0</div></div>
        </div>
        <div class="control-row" style="margin-top:12px;display:flex;flex-wrap:wrap;gap:10px">
          <button id="pitch-go-s" type="button"
            style="min-width:140px;border-color:rgba(241,196,15,0.55);background:rgba(241,196,15,0.18)">执行位移</button>
        </div>
        <div id="pitch-s-result" class="hint">PID 位置闭环：死带内停机，超差持续纠偏</div>
        <p class="hint" style="margin-top:8px">
          命令：<code>/obc/pitch_cmd</code> → MAVLink <code>PITCH_CMD</code>；
          状态：<code>/PitchMotorStatus</code> · uart4 RS485 BLD005-LR
        </p>
      </section>
    `;
}

function updateSTargetPreview() {
  const sInput = document.getElementById("pitch-s-input");
  const targetEl = document.getElementById("pitch-s-target");
  if (!sInput || !targetEl) {
    return;
  }
  let s = Number(sInput.value);
  if (!Number.isFinite(s)) {
    s = 0.0;
  }
  s = Math.max(0.0, Math.min(PITCH_S_MAX_MM, s));
  targetEl.textContent = (PITCH_ZERO_MM + s).toFixed(1);
}

export function mountPitchMotorControls() {
  const resultEl = document.getElementById("pitch-cmd-result");
  const speedInput = document.getElementById("pitch-speed-input");
  const sInput = document.getElementById("pitch-s-input");
  const sResultEl = document.getElementById("pitch-s-result");

  const sendPitchCmd = async (runCmd, actionLabel, extraBody = {}) => {
    const body = {
      speed_rpm: Number(speedInput.value),
      run_cmd: runCmd,
      ...extraBody,
    };
    try {
      const { status, data } = await postModule("pitch_motor", "cmd", body);
      if (data.ok) {
        let text = `${actionLabel}：run_cmd=${data.run_cmd} · ${data.run_label} · cmd累计=${data.cmd_tx_count}`;
        if (data.displacement_mm != null) {
          text += ` · s=${data.displacement_mm} mm → 目标 ${data.target_mm} mm`;
        } else if (data.speed_rpm != null && runCmd <= 3) {
          text += ` · rpm=${data.speed_rpm}`;
        }
        resultEl.textContent = text;
        if (sResultEl && runCmd === RUN_CMD.DISPLACE_ZERO) {
          sResultEl.textContent = text;
        }
      } else {
        const errText = `${actionLabel}失败 (${status}): ${data.error || "unknown"}`;
        resultEl.textContent = errText;
        if (sResultEl) {
          sResultEl.textContent = errText;
        }
      }
    } catch (err) {
      const errText = `${actionLabel}请求异常: ${err}`;
      resultEl.textContent = errText;
      if (sResultEl) {
        sResultEl.textContent = errText;
      }
    }
  };

  document.getElementById("pitch-fwd").addEventListener("click", () => {
    sendPitchCmd(RUN_CMD.FWD, "正转");
  });
  document.getElementById("pitch-rev").addEventListener("click", () => {
    sendPitchCmd(RUN_CMD.REV, "反转");
  });
  document.getElementById("pitch-stop").addEventListener("click", () => {
    sendPitchCmd(RUN_CMD.STOP, "停止");
  });

  if (sInput) {
    sInput.addEventListener("input", updateSTargetPreview);
    updateSTargetPreview();
  }

  document.getElementById("pitch-go-s").addEventListener("click", () => {
    let s = Number(sInput.value);
    if (!Number.isFinite(s)) {
      sResultEl.textContent = "位移无效";
      return;
    }
    s = Math.max(0.0, Math.min(PITCH_S_MAX_MM, s));
    sInput.value = String(s);
    updateSTargetPreview();
    sendPitchCmd(RUN_CMD.DISPLACE_ZERO, "执行位移", { displacement_mm: s });
  });
}

export function updatePitchMotor(snapshot) {
  const data = snapshot.modules?.pitch_motor;
  if (!data) {
    return;
  }

  setText("pitch-connected", data.connected ? "在线" : "离线");
  setText("pitch-age", data.age_sec != null ? Number(data.age_sec).toFixed(3) : "—");

  if (!data.connected) {
    setText("pitch-rpm-pair", "— / —");
    setText("pitch-run-label", "—");
    setText("pitch-fault-label", "—");
    setText("pitch-bus-pair", "— / —");
    return;
  }

  const setRpm = data.speed_set_rpm ?? "—";
  const actRpm = data.speed_actual_rpm ?? "—";
  setText("pitch-rpm-pair", `${setRpm} / ${actRpm}`);
  setText("pitch-run-label", data.run_label ?? "—");
  setText("pitch-fault-label", data.fault_label ?? "—");

  const busV = data.bus_voltage_v != null ? String(data.bus_voltage_v) : "—";
  const busA = data.bus_current_a != null ? String(data.bus_current_a) : "—";
  setText("pitch-bus-pair", `${busV} / ${busA}`);
}
