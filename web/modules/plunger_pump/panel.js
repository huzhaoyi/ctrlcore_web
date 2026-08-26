import { postModule } from "../../core/api.js";
import {
  plungerWireHtml,
  updatePlungerWire,
} from "../wire_displacement/ch0_fragment.js";

const ESC_MIN = 10;
const ESC_MAX = 90;
const RPM_MAX = 3240;

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function fmtPct(value, fallback = "—") {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return `${num} %`;
}

function fmtRpm(value, fallback = "—") {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return `${num} rpm`;
}

function cmdLabel(duty) {
  const num = Number(duty);
  if (!Number.isFinite(num)) {
    return "—";
  }
  if (num < ESC_MIN) {
    return `${num} % · 停泵(→${ESC_MIN}%)`;
  }
  return `${num} %`;
}

function setDutyBar(barId, value, maxPct) {
  const bar = document.getElementById(barId);
  const num = Number(value);

  if (!bar) {
    return;
  }

  if (!Number.isFinite(num)) {
    bar.style.width = "0%";
    return;
  }

  const clamped = Math.max(0, Math.min(maxPct, num));
  const widthPct = maxPct > 0 ? (clamped / maxPct) * 100 : 0;
  bar.style.width = `${widthPct.toFixed(1)}%`;
}

function pumpDutySectionHtml(prefix, title) {
  return `
    <div class="card wide" style="grid-column: 1 / -1">
      <div class="label">${title}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
            <span class="hint" style="margin:0">下发值 (ESC%)</span>
            <span id="${prefix}-cmd-label" class="value mono-block" style="margin:0;font-size:1rem">—</span>
          </div>
          <div style="height:10px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid var(--border);overflow:hidden">
            <div id="${prefix}-cmd-bar" style="height:100%;width:0%;background:var(--accent);transition:width 0.2s ease"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
            <span class="hint" style="margin:0">ESCON 输出占空比</span>
            <span id="${prefix}-out-label" class="value mono-block" style="margin:0;font-size:1rem">—</span>
          </div>
          <div style="height:10px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid var(--border);overflow:hidden">
            <div id="${prefix}-out-bar" style="height:100%;width:0%;background:var(--ok);transition:width 0.2s ease"></div>
          </div>
          <p class="hint" style="margin:6px 0 0">有效区 ${ESC_MIN}~${ESC_MAX} %（&lt;${ESC_MIN} → ${ESC_MIN} % 停泵）</p>
        </div>
      </div>
      <div style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
          <span class="hint" style="margin:0">估算转速（占空比映射，非编码器）</span>
          <span id="${prefix}-rpm-label" class="value mono-block" style="margin:0;font-size:1rem">—</span>
        </div>
        <div style="height:10px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid var(--border);overflow:hidden">
          <div id="${prefix}-rpm-bar" style="height:100%;width:0%;background:var(--accent);transition:width 0.2s ease"></div>
        </div>
        <p class="hint" style="margin:6px 0 0">映射 ${ESC_MIN}%→0rpm · ${ESC_MAX}%→${RPM_MAX}rpm</p>
      </div>
    </div>
  `;
}

export default {
  id: "plunger_pump",
  title: "拉线位移 / 柱塞泵",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="pp-connected" class="value">--</div></div>
          <div class="card"><div class="label">状态帧计数</div><div id="pp-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="pp-age" class="value">--</div></div>
          <div class="card"><div class="label">MCU 时间戳 (ms)</div><div id="pp-ts" class="value mono-block">—</div></div>
        </div>
        <div class="card-grid">
          <div class="card"><div class="label">状态话题</div><div id="pp-status-topic" class="value mono-block">/PlungerPumpStatus</div></div>
          <div class="card"><div class="label">命令话题</div><div id="pp-cmd-topic" class="value mono-block">/obc/plunger_pump_cmd</div></div>
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="pp-hw" class="value mono-block">pwm3 PC8/PC9 · ESCON 50/5 ×2</div></div>
        </div>
        <p class="hint">
          两路泵并联同一根拉线（<code>WPS CH0</code>）：单开较慢，双开较快。
          泵0：<code>pwm3 CH3 (PC8)</code> → ESCON#1 DigIN1。
          泵1：<code>pwm3 CH4 (PC9)</code> → ESCON#2 DigIN1。
          ESCON Studio 常使能；直通语义：下发值即 ESC 占空比%，MCU 钳到有效区 10~90%（&lt;10 停 @10%）。
        </p>
      </section>

      ${plungerWireHtml()}

      <section class="panel">
        <h2>占空比实时状态</h2>
        <div class="card-grid">
          ${pumpDutySectionHtml("pp0", "泵 0 · pwm3 CH3 (PC8) → ESCON#1")}
          ${pumpDutySectionHtml("pp1", "泵 1 · pwm3 CH4 (PC9) → ESCON#2")}
        </div>
      </section>

      <section class="panel">
        <h2>单泵转 / 停（调试）</h2>
        <p class="hint">
          仍走 <code>/obc/plunger_pump_cmd</code>。转 = 50%（约 1620 rpm），停 = 0%（MCU 钳到 10%）。
          只改一路时另一路保持上次下发值：单开 = 慢速，双开 = 较快。
          CH0 ≥ 176.29 mm 时 MCU 强制两路都停。
        </p>
        <div class="card-grid">
          <div class="card">
            <div class="label">泵 0 · pwm3 CH3 (PC8)</div>
            <div class="control-row" style="margin-top:8px">
              <button id="pp-run0" type="button">转 50%</button>
              <button id="pp-stop0" type="button"
                style="border-color:rgba(243,18,96,0.5);background:rgba(243,18,96,0.15)">停</button>
            </div>
          </div>
          <div class="card">
            <div class="label">泵 1 · pwm3 CH4 (PC9)</div>
            <div class="control-row" style="margin-top:8px">
              <button id="pp-run1" type="button">转 50%</button>
              <button id="pp-stop1" type="button"
                style="border-color:rgba(243,18,96,0.5);background:rgba(243,18,96,0.15)">停</button>
            </div>
          </div>
        </div>
        <div id="pp-run-result" class="hint">POST /api/modules/plunger_pump/run</div>
      </section>

      <section class="panel">
        <h2>PLUNGER_PUMP_CMD 下发</h2>
        <div class="card-grid">
          <div class="card"><div class="label">CMD 下发计数</div><div id="pp-cmd-count" class="value">--</div></div>
        </div>
        <div class="card-grid">
          <div class="card">
            <div class="label">duty_pct_ch0 (ESC%, 10~90, &lt;10停)</div>
            <input id="pp-duty0-range" type="range" min="0" max="90" step="1" value="0"
              style="width:100%;margin:8px 0">
            <input id="pp-duty0" type="number" min="0" max="90" step="1" value="0"
              style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
          </div>
          <div class="card">
            <div class="label">duty_pct_ch1 (ESC%, 10~90, &lt;10停)</div>
            <input id="pp-duty1-range" type="range" min="0" max="90" step="1" value="0"
              style="width:100%;margin:8px 0">
            <input id="pp-duty1" type="number" min="0" max="90" step="1" value="0"
              style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
          </div>
        </div>
        <div class="control-row" style="margin-top:12px">
          <button id="pp-send" type="button">发送 PLUNGER_PUMP_CMD</button>
          <button id="pp-stop" type="button" style="border-color:rgba(243,18,96,0.5);background:rgba(243,18,96,0.15)">双路停泵 (→10%)</button>
        </div>
        <div id="pp-cmd-result" class="hint">POST /api/modules/plunger_pump/cmd</div>
      </section>
    `;

    const duty0 = document.getElementById("pp-duty0");
    const duty1 = document.getElementById("pp-duty1");
    const duty0Range = document.getElementById("pp-duty0-range");
    const duty1Range = document.getElementById("pp-duty1-range");

    duty0Range.addEventListener("input", () => {
      duty0.value = duty0Range.value;
    });
    duty1Range.addEventListener("input", () => {
      duty1.value = duty1Range.value;
    });
    duty0.addEventListener("input", () => {
      duty0Range.value = duty0.value;
    });
    duty1.addEventListener("input", () => {
      duty1Range.value = duty1.value;
    });

    const sendCmd = async (ch0, ch1) => {
      const resultEl = document.getElementById("pp-cmd-result");
      try {
        const { status, data } = await postModule("plunger_pump", "cmd", {
          duty_pct_ch0: ch0,
          duty_pct_ch1: ch1,
        });
        if (data.ok) {
          setDutyInputs(data.duty_pct_ch0, data.duty_pct_ch1);
          resultEl.textContent = `已下发 ch0=${data.duty_pct_ch0}% ch1=${data.duty_pct_ch1}% · cmd累计=${data.cmd_tx_count}`;
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    };

    const setDutyInputs = (ch0, ch1) => {
      duty0.value = String(ch0);
      duty1.value = String(ch1);
      duty0Range.value = String(ch0);
      duty1Range.value = String(ch1);
    };

    const sendRun = async (channel, on) => {
      const resultEl = document.getElementById("pp-run-result");
      try {
        const { status, data } = await postModule("plunger_pump", "run", {
          channel,
          on,
        });
        if (data.ok) {
          setDutyInputs(data.duty_pct_ch0, data.duty_pct_ch1);
          resultEl.textContent =
            `${data.note} · 帧 ch0=${data.duty_pct_ch0}% ch1=${data.duty_pct_ch1}% · cmd累计=${data.cmd_tx_count}`;
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    };

    document.getElementById("pp-run0").addEventListener("click", async () => {
      await sendRun(0, true);
    });
    document.getElementById("pp-stop0").addEventListener("click", async () => {
      await sendRun(0, false);
    });
    document.getElementById("pp-run1").addEventListener("click", async () => {
      await sendRun(1, true);
    });
    document.getElementById("pp-stop1").addEventListener("click", async () => {
      await sendRun(1, false);
    });

    document.getElementById("pp-send").addEventListener("click", async () => {
      await sendCmd(Number(duty0.value), Number(duty1.value));
    });

    document.getElementById("pp-stop").addEventListener("click", async () => {
      duty0.value = 0;
      duty1.value = 0;
      duty0Range.value = 0;
      duty1Range.value = 0;
      await sendCmd(0, 0);
    });
  },

  update(snapshot) {
    const atMax = updatePlungerWire(snapshot);
    const data = snapshot.modules?.plunger_pump;
    const run0 = document.getElementById("pp-run0");
    const run1 = document.getElementById("pp-run1");
    const limitTitle = atMax ? "CH0 已到 176.29 mm，两路禁止转" : "";
    if (run0) {
      run0.disabled = Boolean(atMax);
      run0.title = limitTitle;
    }
    if (run1) {
      run1.disabled = Boolean(atMax);
      run1.title = limitTitle;
    }
    if (!data) {
      return;
    }

    setText("pp-connected", data.connected ? "在线" : "离线");
    setText("pp-rx-count", data.rx_count ?? 0);
    setText("pp-cmd-count", data.cmd_tx_count ?? 0);
    setText("pp-age", data.age_sec != null ? Number(data.age_sec).toFixed(3) : "—");
    setText("pp-status-topic", data.status_topic ?? "/PlungerPumpStatus");
    setText("pp-cmd-topic", data.cmd_topic ?? "/obc/plunger_pump_cmd");
    setText("pp-hw", data.hardware ?? "pwm3 PC8/PC9 · ESCON 50/5 ×2");
    setText("pp-ts", data.timestamp_ms != null ? String(data.timestamp_ms) : "—");

    if (!data.connected) {
      return;
    }

    setText("pp0-cmd-label", cmdLabel(data.duty_cmd_ch0));
    setText("pp1-cmd-label", cmdLabel(data.duty_cmd_ch1));
    setText("pp0-out-label", fmtPct(data.duty_out_ch0));
    setText("pp1-out-label", fmtPct(data.duty_out_ch1));
    setText("pp0-rpm-label", fmtRpm(data.rpm_est_ch0));
    setText("pp1-rpm-label", fmtRpm(data.rpm_est_ch1));

    setDutyBar("pp0-cmd-bar", data.duty_cmd_ch0, ESC_MAX);
    setDutyBar("pp1-cmd-bar", data.duty_cmd_ch1, ESC_MAX);
    setDutyBar("pp0-out-bar", data.duty_out_ch0, ESC_MAX);
    setDutyBar("pp1-out-bar", data.duty_out_ch1, ESC_MAX);
    setDutyBar("pp0-rpm-bar", data.rpm_est_ch0, RPM_MAX);
    setDutyBar("pp1-rpm-bar", data.rpm_est_ch1, RPM_MAX);
  },
};
