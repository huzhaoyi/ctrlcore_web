import { postModule } from "../../core/api.js";

const RUN_OPTIONS = [
  { value: 0, label: "0 · 自由停止" },
  { value: 1, label: "1 · 正转" },
  { value: 2, label: "2 · 反转" },
  { value: 3, label: "3 · 刹车停" },
];

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

export default {
  id: "pitch_motor",
  title: "俯仰电机 BLD005",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="pitch-connected" class="value">--</div></div>
          <div class="card"><div class="label">状态帧计数</div><div id="pitch-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="pitch-age" class="value">--</div></div>
          <div class="card"><div class="label">状态话题</div><div id="pitch-status-topic" class="value mono-block">/PitchMotorStatus</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="pitch-link-hw" class="value mono-block">uart4 RS485 · BLD005-LR</div></div>
        </div>
        <p class="hint">
          状态链：控制板 <code>uart4</code> RS485 BLD005-LR（Modbus RTU 9600）
          → MCN <code>pitch_motor</code> → MAVLink <code>PITCH_STATUS (msgid 23, 5Hz)</code>
          → ROS <code>/PitchMotorStatus</code>。
        </p>
        <p class="hint">
          命令链：Web → ROS <code>/obc/pitch_cmd</code> → MAVLink <code>PITCH_CMD (msgid 24)</code>
          → reg <code>0x1002</code> 转速 + <code>0x1003</code> 运行。OBC 透传；rpm 150~3000 限幅在 MCU。
        </p>
      </section>

      <section class="panel">
        <h2>运行状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">设定转速 (rpm)</div><div id="pitch-set-rpm" class="value mono-block">—</div></div>
          <div class="card"><div class="label">实际转速 (rpm)</div><div id="pitch-act-rpm" class="value mono-block">—</div></div>
          <div class="card"><div class="label">运行状态</div><div id="pitch-run-label" class="value">—</div></div>
          <div class="card"><div class="label">故障</div><div id="pitch-fault-label" class="value">—</div></div>
          <div class="card"><div class="label">母线电压 (V)</div><div id="pitch-bus-v" class="value mono-block">—</div></div>
          <div class="card"><div class="label">母线电流 (A)</div><div id="pitch-bus-a" class="value mono-block">—</div></div>
          <div class="card"><div class="label">CPU 温度 (°C)</div><div id="pitch-cpu-t" class="value mono-block">—</div></div>
          <div class="card"><div class="label">硬件</div><div id="pitch-hw" class="value mono-block">uart4 · BLD005</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>PITCH_CMD 下发</h2>
        <div class="card-grid">
          <div class="card"><div class="label">CMD 下发计数</div><div id="pitch-cmd-count" class="value">--</div></div>
          <div class="card"><div class="label">命令话题</div><div id="pitch-cmd-topic" class="value mono-block">/obc/pitch_cmd</div></div>
        </div>
        <div class="card-grid">
          <div class="card">
            <div class="label">speed_rpm</div>
            <input id="pitch-speed-input" type="number" min="150" max="3000" step="10" value="500"
              style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
            <p class="hint">手册 0x1002：150~3000 rpm（MCU 钳位）</p>
          </div>
          <div class="card">
            <div class="label">run_cmd</div>
            <select id="pitch-run-input" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
              ${RUN_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="control-row" style="margin-top:12px">
          <button id="pitch-send" type="button">发送 PITCH_CMD</button>
        </div>
        <div id="pitch-cmd-result" class="hint">POST /api/modules/pitch_motor/cmd</div>
      </section>
    `;

    document.getElementById("pitch-send").addEventListener("click", async () => {
      const resultEl = document.getElementById("pitch-cmd-result");
      const speedRpm = Number(document.getElementById("pitch-speed-input").value);
      const runCmd = Number(document.getElementById("pitch-run-input").value);
      try {
        const { status, data } = await postModule("pitch_motor", "cmd", {
          speed_rpm: speedRpm,
          run_cmd: runCmd,
        });
        if (data.ok) {
          resultEl.textContent = `已下发 rpm=${data.speed_rpm} ${data.run_label} · cmd累计=${data.cmd_tx_count}`;
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    });
  },

  update(snapshot) {
    const data = snapshot.modules?.pitch_motor;
    if (!data) {
      return;
    }

    setText("pitch-connected", data.connected ? "在线" : "离线");
    setText("pitch-rx-count", data.rx_count ?? 0);
    setText("pitch-cmd-count", data.cmd_tx_count ?? 0);
    setText("pitch-status-topic", data.status_topic ?? "/PitchMotorStatus");
    setText("pitch-cmd-topic", data.cmd_topic ?? "/obc/pitch_cmd");
    if (data.hardware) {
      setText("pitch-link-hw", data.hardware);
      setText("pitch-hw", data.hardware);
    }
    setText("pitch-age", data.age_sec != null ? Number(data.age_sec).toFixed(3) : "—");

    if (!data.connected) {
      return;
    }

    setText("pitch-set-rpm", data.speed_set_rpm ?? "—");
    setText("pitch-act-rpm", data.speed_actual_rpm ?? "—");
    setText("pitch-run-label", data.run_label ?? "—");
    setText("pitch-fault-label", data.fault_label ?? "—");
    setText("pitch-bus-v", data.bus_voltage_v != null ? String(data.bus_voltage_v) : "—");
    setText("pitch-bus-a", data.bus_current_a != null ? String(data.bus_current_a) : "—");
    setText("pitch-cpu-t", data.cpu_temp_c != null ? String(data.cpu_temp_c) : "—");
  },
};
