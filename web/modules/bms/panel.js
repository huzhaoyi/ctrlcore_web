import { postModule } from "../../core/api.js";

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function fmtFlag(on, onText, offText) {
  return on ? onText : offText;
}

function cellRemark(mv, pack) {
  if (mv === pack.cell_v_max_mv && pack.cell_v_max_mv > 0) {
    return "最高";
  }
  if (mv === pack.cell_v_min_mv && pack.cell_v_min_mv > 0) {
    return "最低";
  }
  return "";
}

function cellCardStyle(mv, pack) {
  if (mv === pack.cell_v_max_mv && pack.cell_v_max_mv > 0) {
    return "border-color:rgba(61,214,140,0.55)";
  }
  if (mv === pack.cell_v_min_mv && pack.cell_v_min_mv > 0) {
    return "border-color:rgba(245,165,36,0.55)";
  }
  return "";
}

function renderCellCards(pack) {
  const count = pack.cell_count || 0;
  const cells = (pack.cell_mv || []).slice(0, count);
  if (!count) {
    return `<p class="hint">暂无单体电压数据</p>`;
  }

  const cards = cells
    .map((mv, i) => {
      const remark = cellRemark(mv, pack);
      const style = cellCardStyle(mv, pack);
      return `
        <div class="card"${style ? ` style="${style}"` : ""}>
          <div class="label">#${i + 1}${remark ? ` · ${remark}` : ""}</div>
          <div class="value mono-block">${mv} mV</div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="card-grid" style="grid-template-columns:repeat(auto-fit,minmax(108px,1fr))">
      ${cards}
    </div>
  `;
}

function renderTempCards(pack) {
  const count = pack.temp_count || 0;
  const temps = (pack.temp_c || []).slice(0, count);
  if (!count) {
    return `<p class="hint">暂无温度数据</p>`;
  }

  const cards = temps
    .map((t, i) => `
      <div class="card">
        <div class="label">T${i + 1}</div>
        <div class="value mono-block">${t} °C</div>
      </div>
    `)
    .join("");

  return `
    <div class="card-grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
      ${cards}
    </div>
  `;
}

function renderPack(pack) {
  return `
    <section class="panel">
      <h2>电池包 0x${String(pack.pack_id).padStart(2, "0")} ${pack.comm_ok ? "· 在线" : "· 失联"}</h2>
      <div class="card-grid">
        <div class="card"><div class="label">SOC (%)</div><div class="value">${pack.soc_pct}</div></div>
        <div class="card"><div class="label">总电压 (V)</div><div class="value mono-block">${pack.total_voltage_v}</div></div>
        <div class="card"><div class="label">电流 (A) +放/-充</div><div class="value mono-block">${pack.current_a}</div></div>
        <div class="card"><div class="label">充/放电状态</div><div class="value">${fmtFlag(pack.charging, "充电", "")} ${fmtFlag(pack.discharging, "放电", "")}</div></div>
        <div class="card"><div class="label">充电MOS</div><div class="value">${fmtFlag(pack.charge_mos_on, "ON", "OFF")}</div></div>
        <div class="card"><div class="label">放电MOS</div><div class="value">${fmtFlag(pack.discharge_mos_on, "ON", "OFF")}</div></div>
        <div class="card"><div class="label">最高/最低单体 (mV)</div><div class="value mono-block">${pack.cell_v_max_mv}/${pack.cell_v_min_mv}</div></div>
        <div class="card"><div class="label">循环次数</div><div class="value mono-block">${pack.cycle_count}</div></div>
        <div class="card"><div class="label">剩余/满充 (mAh)</div><div class="value mono-block">${pack.remain_cap_mah}/${pack.full_cap_mah}</div></div>
        <div class="card"><div class="label">放电/充电剩余 (min)</div><div class="value mono-block">${pack.discharge_time_min}/${pack.charge_time_min}</div></div>
        <div class="card"><div class="label">保护(过压/过放/温度/其它)</div><div class="value mono-block">${pack.protect_ov}/${pack.protect_uv}/${pack.protect_temp}/${pack.protect_other}</div></div>
        <div class="card"><div class="label">告警/失效</div><div class="value mono-block">${pack.alarm0},${pack.alarm1}/${pack.fail_status}</div></div>
      </div>
      <h3 style="margin:16px 0 8px;font-size:0.95rem;color:var(--muted)">单体电压 (${pack.cell_count} 串)</h3>
      ${renderCellCards(pack)}
      <h3 style="margin:16px 0 8px;font-size:0.95rem;color:var(--muted)">温度 (${pack.temp_count} 路)</h3>
      ${renderTempCards(pack)}
    </section>
  `;
}

export default {
  id: "bms",
  title: "电池管理 BMS",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="bms-connected" class="value">--</div></div>
          <div class="card"><div class="label">状态帧计数</div><div id="bms-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">距上次更新 (s)</div><div id="bms-age" class="value">--</div></div>
          <div class="card"><div class="label">状态话题</div><div id="bms-status-topic" class="value mono-block">/BmsStatus</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="bms-hw" class="value mono-block">uart6 · 通用 BMS 协议</div></div>
        </div>
        <p class="hint">
          状态链：控制板 <code>uart6</code> 通用 BMS 协议（9600，双包 0x01/0x02 轮询电压/电流/电量）
          → MCN <code>sensor_bms</code> → MAVLink <code>BMS_STATUS (msgid 28, 交替上报双包)</code>
          → ROS <code>/BmsStatus</code>。
        </p>
        <p class="hint">
          命令链：Web → ROS <code>/obc/bms_mos_cmd</code> → MAVLink <code>BMS_MOS_CMD (msgid 29)</code>
          → 充放电 MOS 使能（0x19/0x1A/0x1B/0x1C）。<strong>敏感电源操作，请谨慎。</strong>
        </p>
      </section>

      <div id="bms-packs"></div>

      <section class="panel">
        <h2>BMS_MOS_CMD 下发（充放电 MOS 使能）</h2>
        <div class="card-grid">
          <div class="card"><div class="label">CMD 下发计数</div><div id="bms-cmd-count" class="value">--</div></div>
          <div class="card"><div class="label">命令话题</div><div id="bms-cmd-topic" class="value mono-block">/obc/bms_mos_cmd</div></div>
        </div>
        <div class="card-grid">
          <div class="card">
            <div class="label">电池包</div>
            <select id="bms-pack-input" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
              <option value="1">0x01</option>
              <option value="2">0x02</option>
            </select>
          </div>
          <div class="card">
            <div class="label">充电使能 charge_en</div>
            <select id="bms-charge-input" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
              <option value="1">1 · 允许充电</option>
              <option value="0">0 · 禁止充电</option>
            </select>
          </div>
          <div class="card">
            <div class="label">放电使能 discharge_en</div>
            <select id="bms-discharge-input" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
              <option value="1">1 · 允许放电</option>
              <option value="0">0 · 禁止放电</option>
            </select>
          </div>
        </div>
        <div class="control-row" style="margin-top:12px">
          <button id="bms-send" type="button">发送 BMS_MOS_CMD</button>
        </div>
        <div id="bms-cmd-result" class="hint">POST /api/modules/bms/mos</div>
      </section>
    `;

    document.getElementById("bms-send").addEventListener("click", async () => {
      const resultEl = document.getElementById("bms-cmd-result");
      const packId = Number(document.getElementById("bms-pack-input").value);
      const chargeEn = Number(document.getElementById("bms-charge-input").value);
      const dischargeEn = Number(document.getElementById("bms-discharge-input").value);
      try {
        const { status, data } = await postModule("bms", "mos", {
          pack_id: packId,
          charge_en: chargeEn,
          discharge_en: dischargeEn,
        });
        if (data.ok) {
          resultEl.textContent = `已下发 pack=0x0${data.pack_id} charge_en=${data.charge_en} discharge_en=${data.discharge_en} · cmd累计=${data.cmd_tx_count}`;
        } else {
          resultEl.textContent = `失败 (${status}): ${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常: ${err}`;
      }
    });
  },

  update(snapshot) {
    const data = snapshot.modules?.bms;
    if (!data) {
      return;
    }

    setText("bms-connected", data.connected ? "在线" : "离线");
    setText("bms-rx-count", data.rx_count ?? 0);
    setText("bms-cmd-count", data.cmd_tx_count ?? 0);
    setText("bms-status-topic", data.status_topic ?? "/BmsStatus");
    setText("bms-cmd-topic", data.cmd_topic ?? "/obc/bms_mos_cmd");
    if (data.hardware) {
      setText("bms-hw", data.hardware);
    }
    setText("bms-age", data.age_sec != null ? Number(data.age_sec).toFixed(3) : "—");

    const packsEl = document.getElementById("bms-packs");
    if (packsEl) {
      const packs = data.packs || [];
      packsEl.innerHTML = packs.length
        ? packs.map(renderPack).join("")
        : `<section class="panel"><p class="hint">等待 ${data.status_topic || "/BmsStatus"} 数据…</p></section>`;
    }
  },
};
