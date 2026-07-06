import { postModule } from "../../core/api.js";

const EN_COUNT = 8;
const EN_GPIO = [13, 11, 10, 9, 8, 6, 4, 2];

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function stateText(value) {
  return Number(value) === 1 ? "使能 ON" : "关闭 OFF";
}

function stateClass(value) {
  return Number(value) === 1 ? "en-state-on" : "en-state-off";
}

function buildEnCards() {
  const cards = [];
  for (let index = 0; index < EN_COUNT; index += 1) {
    cards.push(`
      <div class="card en-card" id="en-card-${index}">
        <div class="label">EN${index + 1} · index ${index}</div>
        <div class="value en-state" id="en-state-${index}">—</div>
        <div class="hint mono-block" id="en-gpio-${index}">GPIO ${EN_GPIO[index]}</div>
        <div class="control-row" style="margin-top:10px">
          <button type="button" class="en-btn-on" data-index="${index}" data-value="1">开</button>
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
  title: "载荷使能 EN1~8",

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
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="en-hw" class="value mono-block">CH9434A SPI1 · EN1~8</div></div>
        </div>
        <p class="hint">
          状态链：CH9434A GPIO 硬件读回
          → MAVLink <code>SWITCH_STATUS (id=9, 10Hz)</code>
          → ROS <code>/Switch</code>（非 board_ctrl 命令镜像）。
        </p>
        <p class="hint">
          命令链：Web → ROS <code>/obc/switch_cmd</code>
          → MAVLink <code>SWITCH_CMD (id=17)</code>
          → MCU <code>ch9434a_en_apply_from_sw()</code> → CH9434A GPIO。
        </p>
      </section>

      <section class="panel">
        <h2>EN1~EN8 继电器状态</h2>
        <div class="card-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
          ${buildEnCards()}
        </div>
        <div class="control-row" style="margin-top:14px">
          <button id="en-all-off" type="button">全部关闭</button>
        </div>
        <div id="en-cmd-result" class="hint">载荷电源操作请谨慎；极性为高有效（1=使能）。</div>
      </section>
    `;

    const resultEl = document.getElementById("en-cmd-result");

    for (const btn of root.querySelectorAll(".en-btn-on, .en-btn-off")) {
      btn.addEventListener("click", async () => {
        const index = Number(btn.dataset.index);
        const value = Number(btn.dataset.value);
        await sendCmd(index, value, resultEl);
      });
    }

    document.getElementById("en-all-off").addEventListener("click", async () => {
      try {
        const { data } = await postModule("payload_en", "all_off", {});
        if (data.ok) {
          resultEl.textContent = "已下发 EN1~EN8 全部关闭";
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
    for (let index = 0; index < EN_COUNT; index += 1) {
      const stateEl = document.getElementById(`en-state-${index}`);
      const cardEl = document.getElementById(`en-card-${index}`);
      const gpioEl = document.getElementById(`en-gpio-${index}`);
      const gpio = (data.en_gpio && data.en_gpio[index]) ?? EN_GPIO[index];
      const value = connected ? states[index] : null;

      if (gpioEl) {
        gpioEl.textContent = `GPIO ${gpio}`;
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
