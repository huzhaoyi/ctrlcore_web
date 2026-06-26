import { postModule } from "../../core/api.js";

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

/** 从 0x02 电压包实际上报的单体数组取极值（勿用 0x04 的 max/min 字段，两者可能不一致） */
function cellExtremaMv(cells) {
  if (!cells.length) {
    return { min_mv: null, max_mv: null };
  }
  const nums = cells.map((v) => Number(v));
  return {
    min_mv: Math.min(...nums),
    max_mv: Math.max(...nums),
  };
}

function cellRemark(mv, min_mv, max_mv) {
  const val = Number(mv);
  if (min_mv == null || max_mv == null || min_mv === max_mv) {
    return "";
  }
  if (val === max_mv) {
    return "最高";
  }
  if (val === min_mv) {
    return "最低";
  }
  return "";
}

function cellCardStyle(mv, min_mv, max_mv) {
  const val = Number(mv);
  if (min_mv == null || max_mv == null || min_mv === max_mv) {
    return "";
  }
  if (val === max_mv) {
    return "border-color:rgba(61,214,140,0.75);box-shadow:0 0 0 1px rgba(61,214,140,0.35)";
  }
  if (val === min_mv) {
    return "border-color:rgba(243,18,96,0.75);box-shadow:0 0 0 1px rgba(243,18,96,0.35)";
  }
  return "";
}

function warnStyle(text, okValues) {
  if (okValues.includes(text)) {
    return "";
  }
  return "color:var(--warn)";
}

/** 后端 enrich 缺失时的兜底解码，避免显示横杠 */
function workStateText(pack) {
  if (pack.work_state_text) {
    return pack.work_state_text;
  }
  if (pack.charging && pack.discharging) {
    return "充电中 · 放电中";
  }
  if (pack.charging) {
    return "充电中";
  }
  if (pack.discharging) {
    return "放电中";
  }
  return "静置";
}

function workStateHint(pack) {
  if (pack.work_state_hint) {
    return pack.work_state_hint;
  }
  const a = Number(pack.current_a || 0);
  if (a > 0.01) {
    return `电流 +${a} A，电池对外放电`;
  }
  if (a < -0.01) {
    return `电流 ${a} A，电池在充电`;
  }
  return "电流接近 0，负载与充电器均未明显拉电流";
}

function chargeMosText(pack) {
  if (pack.charge_mos_text) {
    return pack.charge_mos_text;
  }
  return pack.charge_mos_on ? "已合上 · 允许充电" : "已断开 · 禁止充电";
}

function dischargeMosText(pack) {
  if (pack.discharge_mos_text) {
    return pack.discharge_mos_text;
  }
  return pack.discharge_mos_on ? "已合上 · 允许放电" : "已断开 · 禁止放电";
}

function renderCardWithHint(label, text, hint, okValues = ["正常", "无告警", "无失效", "无均衡"]) {
  const style = warnStyle(text, okValues);
  const hintHtml = hint
    ? `<div class="hint" style="margin:6px 0 0;font-size:0.75rem;line-height:1.35">${hint}</div>`
    : "";
  return `
    <div class="card">
      <div class="label">${label}</div>
      <div class="value" style="${style}">${text}</div>
      ${hintHtml}
    </div>
  `;
}

function renderProtocolBlock(num, title, cmd, bodyHtml) {
  return `
    <section class="bms-protocol-block" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
      <h3 style="margin:0 0 10px;font-size:0.95rem;color:var(--text)">
        ${num}. ${title}
        <span style="font-weight:normal;color:var(--muted);font-size:0.85rem"> · 命令 ${cmd}</span>
      </h3>
      ${bodyHtml}
    </section>
  `;
}

function renderCellCards(pack) {
  const count = pack.cell_count || 0;
  const cells = (pack.cell_mv || []).slice(0, count);
  if (!count) {
    return `<p class="hint">暂无单体电压</p>`;
  }

  const { min_mv, max_mv } = cellExtremaMv(cells);
  const cards = cells
    .map((mv, i) => {
      const remark = cellRemark(mv, min_mv, max_mv);
      const style = cellCardStyle(mv, min_mv, max_mv);
      return `
        <div class="card"${style ? ` style="${style}"` : ""}>
          <div class="label">第 ${i + 1} 串${remark ? ` · ${remark}` : ""}</div>
          <div class="value mono-block">${mv} mV</div>
        </div>
      `;
    })
    .join("");

  return `
    <p class="hint" style="margin:0 0 8px">绿色 = 最高电压 · 红色 = 最低电压</p>
    <div class="card-grid" style="grid-template-columns:repeat(auto-fit,minmax(108px,1fr))">${cards}</div>
  `;
}

function renderTempCards(pack) {
  const readings = pack.temp_readings || [];
  if (!readings.length) {
    return `<p class="hint">暂无温度数据</p>`;
  }

  const cards = readings
    .map((item) => `
      <div class="card">
        <div class="label">${item.label}</div>
        <div class="value mono-block">${item.value_c} °C</div>
      </div>
    `)
    .join("");

  return `<div class="card-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">${cards}</div>`;
}

function renderTextCard(label, text, okValues = ["正常", "无告警", "无失效", "无均衡"]) {
  return renderCardWithHint(label, text, "", okValues);
}

function renderPackSection1(pack) {
  const body = `
    <div class="card-grid">
      <div class="card"><div class="label">当前包电池串数</div><div class="value">${pack.cell_count} 串</div></div>
      <div class="card"><div class="label">温度探头数量</div><div class="value">${pack.temp_count} 路</div></div>
    </div>
    <div style="margin-top:10px">${renderCellCards(pack)}</div>
  `;
  return renderProtocolBlock(1, "电压数据包", "0xFF 0x02", body);
}

function renderPackSection2(pack) {
  const body = `
    <p class="hint" style="margin:0 0 10px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid var(--border)">
      <strong>综合判断：</strong>${pack.health_summary || (pack.comm_ok ? "等待解码…" : "通信失联")}
    </p>
    <div class="card-grid">
      ${renderCardWithHint("充放电状态", workStateText(pack), workStateHint(pack), ["静置", "充电中", "放电中", "充电中 · 放电中"])}
      <div class="card">
        <div class="label">电流</div>
        <div class="value mono-block">${pack.current_a} A</div>
        <div class="hint" style="margin:6px 0 0;font-size:0.75rem">协议约定：正 = 放电，负 = 充电</div>
      </div>
      ${renderCardWithHint("过压保护", pack.protect_ov_text || "正常", pack.protect_ov_hint || "无过压类保护动作")}
      ${renderCardWithHint("欠压保护", pack.protect_uv_text || "正常", pack.protect_uv_hint || "无欠压类保护动作")}
      ${renderCardWithHint("温度保护", pack.protect_temp_text || "正常", pack.protect_temp_hint || "无温度类保护动作")}
      ${renderCardWithHint("短路 / 过流 / 环境保护", pack.protect_other_text || "正常", pack.protect_other_hint || "无短路/过流/环境类保护动作")}
    </div>
    <div style="margin-top:10px">
      <div class="card-grid">
        <div class="card"><div class="label">软件版本</div><div class="value mono-block">V${pack.sw_version}</div></div>
        ${renderCardWithHint("充电 MOS", chargeMosText(pack), pack.charge_mos_hint || (pack.charge_mos_on ? "充电回路导通" : "充电回路关断"), ["已合上 · 允许充电", "已断开 · 禁止充电"])}
        ${renderCardWithHint("放电 MOS", dischargeMosText(pack), pack.discharge_mos_hint || (pack.discharge_mos_on ? "放电回路导通" : "放电回路关断"), ["已合上 · 允许放电", "已断开 · 禁止放电"])}
        ${renderCardWithHint("均衡状态", pack.balance_text || "无均衡", pack.balance_hint || "当前没有电芯在主动均衡", ["无均衡"])}
        ${renderCardWithHint("失效状态", pack.fail_text || "无失效", pack.fail_hint || "采集与 MOS 驱动正常", ["无失效"])}
        ${renderCardWithHint("告警状态", pack.alarm_text || "无告警", pack.alarm_hint || "无预警项", ["无告警"])}
        <div class="card"><div class="label">MOS 温度探头</div><div class="value">${pack.mos_temp_valid_text || (pack.mos_temp_valid ? "有 MOS 温度数据" : "无 MOS 温度数据")}</div></div>
        <div class="card"><div class="label">环境温度探头</div><div class="value">${pack.env_temp_valid_text || (pack.env_temp_valid ? "有环境温度数据" : "无环境温度数据")}</div></div>
      </div>
    </div>
    <h4 style="margin:12px 0 8px;font-size:0.88rem;color:var(--muted)">温度探头（协议 0x03 字节 9 起）</h4>
    ${renderTempCards(pack)}
    <p class="hint" style="margin:8px 0 0;font-size:0.75rem">未上报字段：电流检测电阻阻值（协议 0x03）；编号包 0x11 全链路未接入。</p>
  `;
  return renderProtocolBlock(2, "电流及状态数据包", "0xFF 0x03", body);
}

function renderPackSection3(pack) {
  const body = `
    <div class="card-grid">
      ${renderCardWithHint("电量 SOC", `${pack.soc_pct} %`, pack.soc_hint || "")}
      <div class="card"><div class="label">循环次数</div><div class="value mono-block">${pack.cycle_count} 次</div></div>
      <div class="card"><div class="label">设计容量</div><div class="value mono-block">${pack.design_cap_mah} mAh</div></div>
      <div class="card"><div class="label">满充容量</div><div class="value mono-block">${pack.full_cap_mah} mAh</div></div>
      <div class="card"><div class="label">剩余容量</div><div class="value mono-block">${pack.remain_cap_mah} mAh</div></div>
      <div class="card"><div class="label">放电剩余时间</div><div class="value mono-block">${pack.discharge_time_min} min</div></div>
      <div class="card"><div class="label">充电剩余时间</div><div class="value mono-block">${pack.charge_time_min} min</div></div>
      <div class="card"><div class="label">电池总电压</div><div class="value mono-block">${pack.total_voltage_v} V</div></div>
      <div class="card"><div class="label">最高单体电压</div><div class="value mono-block">${pack.cell_v_max_mv} mV</div></div>
      <div class="card"><div class="label">最低单体电压</div><div class="value mono-block">${pack.cell_v_min_mv} mV</div></div>
      <div class="card"><div class="label">硬件版本</div><div class="value mono-block">V${pack.hw_version}</div></div>
      ${renderCardWithHint("方案识别", pack.scheme_text || "—", pack.scheme_hint || "方案识别字节")}
    </div>
    <p class="hint" style="margin:8px 0 0;font-size:0.75rem">未上报字段：当前/最长充电间隔（协议 0x04 字节 0x09/0x0A），MAVLink 未携带。</p>
  `;
  return renderProtocolBlock(3, "电量数据包", "0xFF 0x04", body);
}

function renderPack(pack) {
  return `
    <section class="panel">
      <h2>电池包 0x${String(pack.pack_id).padStart(2, "0")} ${pack.comm_ok ? "· 在线" : "· 通信失联"}</h2>
      <p class="hint" style="margin:0">对应协议 1～3 节；保护/告警/失效已解为中文，卡片下方灰色小字为排查建议。</p>
      ${renderPackSection1(pack)}
      ${renderPackSection2(pack)}
      ${renderPackSection3(pack)}
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
          <div class="card"><div class="label">距上次更新</div><div id="bms-age" class="value">--</div></div>
          <div class="card"><div class="label">状态话题</div><div id="bms-status-topic" class="value mono-block">/BmsStatus</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="bms-hw" class="value mono-block">uart6 · 通用 BMS 协议</div></div>
        </div>
      </section>

      <div id="bms-packs"></div>

      <section class="panel">
        <h2>5. MOS 控制数据包 <span style="font-weight:normal;color:var(--muted);font-size:0.85rem">· 命令 0x19 / 0x1A / 0x1B / 0x1C</span></h2>
        <p class="hint">对应协议第 5 节：允许/禁止充放电 MOS；经 ROS <code>/obc/bms_mos_cmd</code> → MAVLink BMS_MOS_CMD 下发至 MCU。</p>
        <div class="card-grid">
          <div class="card"><div class="label">CMD 下发计数</div><div id="bms-cmd-count" class="value">--</div></div>
          <div class="card"><div class="label">命令话题</div><div id="bms-cmd-topic" class="value mono-block">/obc/bms_mos_cmd</div></div>
        </div>
        <div class="card-grid">
          <div class="card">
            <div class="label">电池包地址</div>
            <select id="bms-pack-input" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
              <option value="1">0x01</option>
              <option value="2">0x02</option>
            </select>
          </div>
          <div class="card">
            <div class="label">0x1B / 0x1C 充电 MOS</div>
            <select id="bms-charge-input" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
              <option value="1">0x1B 允许充电</option>
              <option value="0">0x1C 禁止充电</option>
            </select>
          </div>
          <div class="card">
            <div class="label">0x19 / 0x1A 放电 MOS</div>
            <select id="bms-discharge-input" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)">
              <option value="1">0x19 允许放电</option>
              <option value="0">0x1A 禁止放电</option>
            </select>
          </div>
        </div>
        <div class="control-row" style="margin-top:12px">
          <button id="bms-send" type="button">下发 MOS 控制</button>
        </div>
        <div id="bms-cmd-result" class="hint">敏感电源操作，请谨慎。</div>
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
          resultEl.textContent = `已下发至包 0x0${data.pack_id}：${chargeEn ? "允许充电(0x1B)" : "禁止充电(0x1C)"} · ${dischargeEn ? "允许放电(0x19)" : "禁止放电(0x1A)"}`;
        } else {
          resultEl.textContent = `失败：${data.error || "unknown"}`;
        }
      } catch (err) {
        resultEl.textContent = `请求异常：${err}`;
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
    setText("bms-age", data.age_sec != null ? `${Number(data.age_sec).toFixed(1)} s` : "—");

    const packsEl = document.getElementById("bms-packs");
    if (packsEl) {
      const packs = data.packs || [];
      packsEl.innerHTML = packs.length
        ? packs.map(renderPack).join("")
        : `<section class="panel"><p class="hint">等待 ${data.status_topic || "/BmsStatus"} 数据…</p></section>`;
    }
  },
};
