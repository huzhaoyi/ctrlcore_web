import { postModule } from "../../core/api.js";
import { gpioLevelText } from "./level.mjs";

const VALVE_COUNT = 8;
const VALVE_LABELS = [
  "GPIO0(阀1高压)",
  "GPIO1(阀2低压)",
  "GPIO2(声呐24V)",
  "GPIO3(抛载)",
  "GPIO4",
  "GPIO5",
  "GPIO6",
  "GPIO7",
];
const VALVE_GPIO_HINTS = [
  "DEV4 P1 PIN0 (24V/P4)",
  "DEV4 P1 PIN1 (24V/P4)",
  "DEV4 P1 PIN2 (24V/P4 · 声呐开关)",
  "DEV4 P1 PIN3 (24V/P4 · 抛载，拉高即丢，慎重)",
  "DEV4 P1 PIN4 (24V/P4)",
  "DEV4 P1 PIN5 (24V/P4)",
  "DEV4 P1 PIN6 (24V/P4)",
  "DEV4 P1 PIN7 (24V/P4)",
];

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function stateText(value) {
  return Number(value) === 1 ? "开启 ON" : "关闭 OFF";
}

function stateClass(value) {
  return Number(value) === 1 ? "en-state-on" : "en-state-off";
}

function buildValveCards() {
  const cards = [];
  for (let index = 0; index < VALVE_COUNT; index += 1) {
    const caution =
      index === 3
        ? `<div class="hint en-caution">⚠ 开启则 AUV 抛载丢弃，操作请慎重</div>`
        : "";
    cards.push(`
      <div class="card en-card${index === 3 ? " en-card-danger" : ""}" id="en-card-${index}">
        <div class="label">${VALVE_LABELS[index]} · index ${index}</div>
        <div class="value en-state" id="en-state-${index}">—</div>
        <div class="hint mono-block">GPIO 输出：<span id="en-level-${index}">—</span></div>
        <div class="hint mono-block" id="en-gpio-${index}">${VALVE_GPIO_HINTS[index]}</div>
        ${caution}
        <div class="control-row" style="margin-top:10px">
          <button type="button" class="en-btn-on${index === 3 ? " is-active-warn" : ""}" data-index="${index}" data-value="1">开</button>
          <button type="button" class="en-btn-off" data-index="${index}" data-value="0">关</button>
        </div>
      </div>
    `);
  }
  return cards.join("");
}

async function sendCmd(index, value, resultEl) {
  try {
    const { data } = await postModule("payload_en", "cmd", { index, value });
    if (data.ok) {
      resultEl.textContent = `已下发 ${data.label} → ${value === 1 ? "ON" : "OFF"}`;
    } else {
      resultEl.textContent = `失败：${data.error || "unknown"}`;
    }
  } catch (err) {
    resultEl.textContent = `请求异常：${err}`;
  }
}

export default {
  id: "payload_en",
  title: "GPIO×8",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="en-connected" class="value">--</div></div>
          <div class="card"><div class="label">状态帧计数</div><div id="en-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="en-age" class="value">--</div></div>
          <div class="card"><div class="label">CMD 下发计数</div><div id="en-cmd-count" class="value">--</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="en-hw" class="value mono-block">TCA9535 I2C1 · DEV4 P1 24V</div></div>
        </div>
        <p class="hint">
          状态链：TCA9535 DEV4 P1 输出读回
          → MAVLink <code>SWITCH_STATUS (id=9, 10Hz)</code>
          → ROS <code>/Switch</code>（switchs[0..7] 有效）。
        </p>
        <p class="hint">
          命令链：Web → ROS <code>/obc/switch_cmd</code>
          → MAVLink <code>SWITCH_CMD (id=17)</code>
          → MCU <code>auv_valve_apply_from_sw()</code> → <code>SE_set_i2c_gpio</code>。
        </p>
      </section>

      <section class="panel">
        <h2>GPIO 状态</h2>
        <div class="card-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
          ${buildValveCards()}
        </div>
        <div class="control-row" style="margin-top:14px">
          <button id="en-all-off" type="button">全部关闭</button>
        </div>
        <div id="en-cmd-result" class="hint">GPIO 为执行器操作，请谨慎；极性为高有效（1=开）。GPIO3 抛载：开启即丢，务必确认。</div>
      </section>
    `;

    const resultEl = document.getElementById("en-cmd-result");

    for (const btn of root.querySelectorAll(".en-btn-on, .en-btn-off")) {
      btn.addEventListener("click", async () => {
        const index = Number(btn.dataset.index);
        const value = Number(btn.dataset.value);
        if (index === 3 && value === 1) {
          const ok = window.confirm(
            "GPIO3 为抛载通道：开启后 AUV 将立即抛掉载荷。\n确认继续？",
          );
          if (!ok) {
            resultEl.textContent = "已取消 GPIO3 抛载开启";
            return;
          }
        }
        await sendCmd(index, value, resultEl);
      });
    }

    document.getElementById("en-all-off").addEventListener("click", async () => {
      try {
        const { data } = await postModule("payload_en", "all_off", {});
        if (data.ok) {
          resultEl.textContent = "已下发 8 路 GPIO 全部关闭";
        } else {
          resultEl.textContent = `失败：${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常：${err}`;
      }
    });
  },

  update(snapshot) {
    const data = snapshot.modules?.payload_en;
    if (!data) {
      return;
    }

    const connected = Boolean(data.connected);
    setText("en-connected", connected ? "在线" : "离线");
    setText("en-rx-count", data.rx_count ?? 0);
    setText("en-cmd-count", data.cmd_tx_count ?? 0);
    setText(
      "en-age",
      connected && data.age_sec != null ? Number(data.age_sec).toFixed(3) : "—",
    );
    if (data.hardware) {
      setText("en-hw", data.hardware);
    }

    const states = data.switch_status || [];
    const labels = data.valve_labels || VALVE_LABELS;
    const gpioHints = data.valve_gpio_hints || VALVE_GPIO_HINTS;

    for (let index = 0; index < VALVE_COUNT; index += 1) {
      const stateEl = document.getElementById(`en-state-${index}`);
      const cardEl = document.getElementById(`en-card-${index}`);
      const gpioEl = document.getElementById(`en-gpio-${index}`);
      const levelEl = document.getElementById(`en-level-${index}`);
      const labelEl = cardEl?.querySelector(".label");
      const value = connected ? states[index] : null;

      if (labelEl) {
        labelEl.textContent = `${labels[index] ?? VALVE_LABELS[index]} · index ${index}`;
      }
      if (gpioEl) {
        gpioEl.textContent = gpioHints[index] ?? VALVE_GPIO_HINTS[index];
      }
      if (levelEl) {
        levelEl.textContent = gpioLevelText(value, connected);
      }
      if (stateEl) {
        stateEl.textContent = connected ? stateText(value) : "—";
        stateEl.className = `value en-state ${connected ? stateClass(value) : ""}`;
      }
      if (cardEl) {
        cardEl.classList.toggle("en-card-active", connected && Number(value) === 1);
      }
    }
  },

  destroy() {},
};
