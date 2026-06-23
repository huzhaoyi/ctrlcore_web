import { postModule } from "../../core/api.js";

const ESC_MIN = 10;
const ESC_MAX = 90;

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
    </div>
  `;
}

export default {
  id: "plunger_pump",
  title: "柱塞泵 ESCON",

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
          泵0：<code>pwm3 CH3 (PC8)</code> → ESCON#1 DigIN1；泵1：<code>pwm3 CH4 (PC9)</code> → ESCON#2 DigIN1。
          ESCON Studio 常使能；直通语义：下发值即 ESC 占空比%，MCU 钳到有效区 10~90%（&lt;10 停 @10%）。
        </p>
      </section>

      <section class="panel">
        <h2>占空比实时状态</h2>
        <div class="card-grid">
          ${pumpDutySectionHtml("pp0", "泵 0 · pwm3 CH3 (PC8) → ESCON#1")}
          ${pumpDutySectionHtml("pp1", "泵 1 · pwm3 CH4 (PC9) → ESCON#2")}
        </div>
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
          resultEl.textContent = `已下发 ch0=${data.duty_pct_ch0}% ch1=${data.duty_pct_ch1}% · cmd累计=${data.cmd_tx_count}`;
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    };

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
    const data = snapshot.modules?.plunger_pump;
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

    setDutyBar("pp0-cmd-bar", data.duty_cmd_ch0, ESC_MAX);
    setDutyBar("pp1-cmd-bar", data.duty_cmd_ch1, ESC_MAX);
    setDutyBar("pp0-out-bar", data.duty_out_ch0, ESC_MAX);
    setDutyBar("pp1-out-bar", data.duty_out_ch1, ESC_MAX);
  },
};
