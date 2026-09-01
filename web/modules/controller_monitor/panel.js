function setCell(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function fmtNum(value, digits = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "—";
  }
  return num.toFixed(digits);
}

function fmtAge(ageSec) {
  if (ageSec == null || !Number.isFinite(Number(ageSec))) {
    return "—";
  }
  return Number(ageSec).toFixed(3);
}

function sourceConnectedLabel(source) {
  if (!source || !source.connected) {
    return "离线 offline";
  }
  return "在线 online";
}

function modeLabel(name, id) {
  const map = {
    NONE: "无控制 NONE",
    MANUAL: "手动 MANUAL",
    MISSION: "任务跟踪 MISSION",
  };
  if (name && map[name]) {
    return map[name];
  }
  if (name) {
    return `${name} (${id ?? "?"})`;
  }
  return "—";
}

function renderGsRows(prefix, angles, steps, withStep) {
  for (let i = 0; i < 4; i += 1) {
    setCell(`${prefix}-ang-${i}`, fmtNum(angles?.[i], 2));
    if (withStep) {
      const step = steps?.[i];
      if (step == null) {
        setCell(`${prefix}-step-${i}`, "—");
      } else if (Number(step) === 1) {
        setCell(`${prefix}-step-${i}`, "在线 1");
      } else {
        setCell(`${prefix}-step-${i}`, `离线 ${step}`);
      }
    }
  }
}

export default {
  id: "controller_monitor",
  title: "运动闭环监视 Motion Monitor",

  mount(root) {
    const gsCmdRows = [];
    const gsFbRows = [];
    for (let i = 0; i < 4; i += 1) {
      gsCmdRows.push(`
        <tr>
          <td class="mono">通道 CH[${i}]</td>
          <td class="mono" id="cm-gsout-ang-${i}">—</td>
        </tr>
      `);
      gsFbRows.push(`
        <tr>
          <td class="mono">通道 CH[${i}]</td>
          <td class="mono" id="cm-gsfb-ang-${i}">—</td>
          <td class="mono" id="cm-gsfb-step-${i}">—</td>
        </tr>
      `);
    }

    root.innerHTML = `
      <section class="panel">
        <h2>链路总览 Link Overview（只读 Read-only）</h2>
        <div class="card-grid">
          <div class="card"><div class="label">模块状态 Module</div><div id="cm-connected" class="value">--</div></div>
          <div class="card"><div class="label">读写 Access</div><div class="value">只读 · 不下发 / read-only</div></div>
          <div class="card wide"><div class="label">说明 Note</div><div id="cm-message" class="value mono-block">—</div></div>
        </div>
        <div class="hint">
          数据流：手柄 Joy → <code>/obc/twist_cmd</code> → 控制器 <code>controller</code>
          → 推进 <code>/thruster_command</code> / 舵机 <code>/obc/gs_cmd</code>
          → 网关 Bridge → 下位机 MCU。
          本页只监视闭环量，不抢 thruster / gs 直控页。
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>数据源 Source</th>
                <th>话题 Topic</th>
                <th>状态 Status</th>
                <th>距上次更新 age (s)</th>
                <th>接收计数 rx</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>手柄指令 Command</td>
                <td class="mono" id="cm-topic-twist">/obc/twist_cmd</td>
                <td id="cm-src-twist">—</td>
                <td class="mono" id="cm-age-twist">—</td>
                <td class="mono" id="cm-rx-twist">—</td>
              </tr>
              <tr>
                <td>船姿状态 Odometry</td>
                <td class="mono" id="cm-topic-odom">/msg_adapter/rov_odom</td>
                <td id="cm-src-odom">—</td>
                <td class="mono" id="cm-age-odom">—</td>
                <td class="mono" id="cm-rx-odom">—</td>
              </tr>
              <tr>
                <td>控制输出 PID Output</td>
                <td class="mono" id="cm-topic-pid">/controller/pid_output_cmd</td>
                <td id="cm-src-pid">—</td>
                <td class="mono" id="cm-age-pid">—</td>
                <td class="mono" id="cm-rx-pid">—</td>
              </tr>
              <tr>
                <td>舵角指令 Servo Cmd</td>
                <td class="mono" id="cm-topic-gsout">/controller/gs_cmd_output</td>
                <td id="cm-src-gsout">—</td>
                <td class="mono" id="cm-age-gsout">—</td>
                <td class="mono" id="cm-rx-gsout">—</td>
              </tr>
              <tr>
                <td>推进反馈 Thruster FB</td>
                <td class="mono" id="cm-topic-thr">/ThrusterStatus</td>
                <td id="cm-src-thr">—</td>
                <td class="mono" id="cm-age-thr">—</td>
                <td class="mono" id="cm-rx-thr">—</td>
              </tr>
              <tr>
                <td>舵机反馈 Servo FB</td>
                <td class="mono" id="cm-topic-gsfb">/GsStatus</td>
                <td id="cm-src-gsfb">—</td>
                <td class="mono" id="cm-age-gsfb">—</td>
                <td class="mono" id="cm-rx-gsfb">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>手柄指令 Joy Command · /obc/twist_cmd</h2>
        <div class="card-grid">
          <div class="card"><div class="label">控制模式 Mode</div><div id="cm-mode" class="value">—</div></div>
          <div class="card"><div class="label">推进锁 Lock</div><div id="cm-lock" class="value">—</div></div>
          <div class="card"><div class="label">模式编号 ctrl_mode</div><div id="cm-mode-id" class="value mono-block">—</div></div>
          <div class="card"><div class="label">锁状态 lock_status</div><div id="cm-lock-id" class="value mono-block">—</div></div>
        </div>
        <div class="card-grid">
          <div class="card"><div class="label">前向 x surge</div><div id="cm-cmd-x" class="value mono-block">—</div></div>
          <div class="card"><div class="label">侧向 y sway</div><div id="cm-cmd-y" class="value mono-block">—</div></div>
          <div class="card"><div class="label">垂向 z heave</div><div id="cm-cmd-z" class="value mono-block">—</div></div>
          <div class="card"><div class="label">滚转 roll</div><div id="cm-cmd-roll" class="value mono-block">—</div></div>
          <div class="card"><div class="label">俯仰 pitch</div><div id="cm-cmd-pitch" class="value mono-block">—</div></div>
          <div class="card"><div class="label">航向 yaw</div><div id="cm-cmd-yaw" class="value mono-block">—</div></div>
        </div>
        <p class="hint">Zorro：三段开关 0=手动 MANUAL（解锁），1=无控制 NONE（上锁），-1=任务 MISSION。</p>
      </section>

      <section class="panel">
        <h2>船姿状态 Vehicle State · /msg_adapter/rov_odom</h2>
        <div class="card-grid">
          <div class="card"><div class="label">滚转角 roll (°)</div><div id="cm-att-roll" class="value mono-block">—</div></div>
          <div class="card"><div class="label">俯仰角 pitch (°)</div><div id="cm-att-pitch" class="value mono-block">—</div></div>
          <div class="card"><div class="label">航向角 yaw (°)</div><div id="cm-att-yaw" class="value mono-block">—</div></div>
        </div>
        <div class="card-grid">
          <div class="card"><div class="label">前向速度 vel.x (m/s)</div><div id="cm-vel-x" class="value mono-block">—</div></div>
          <div class="card"><div class="label">侧向速度 vel.y</div><div id="cm-vel-y" class="value mono-block">—</div></div>
          <div class="card"><div class="label">垂向速度 vel.z</div><div id="cm-vel-z" class="value mono-block">—</div></div>
          <div class="card"><div class="label">滚转速率 rate.x (rad/s)</div><div id="cm-rate-x" class="value mono-block">—</div></div>
          <div class="card"><div class="label">俯仰速率 rate.y</div><div id="cm-rate-y" class="value mono-block">—</div></div>
          <div class="card"><div class="label">航向速率 rate.z</div><div id="cm-rate-z" class="value mono-block">—</div></div>
        </div>
        <div class="card-grid">
          <div class="card"><div class="label">位置 pos.x (m)</div><div id="cm-pos-x" class="value mono-block">—</div></div>
          <div class="card"><div class="label">位置 pos.y</div><div id="cm-pos-y" class="value mono-block">—</div></div>
          <div class="card"><div class="label">深度/高度 pos.z</div><div id="cm-pos-z" class="value mono-block">—</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>控制器输出 Controller Output</h2>
        <div class="card-grid">
          <div class="card"><div class="label">推力归一化 output.x</div><div id="cm-out-x" class="value mono-block">—</div></div>
          <div class="card"><div class="label">俯仰通道 output.pitch</div><div id="cm-out-pitch" class="value mono-block">—</div></div>
          <div class="card"><div class="label">航向通道 output.yaw</div><div id="cm-out-yaw" class="value mono-block">—</div></div>
          <div class="card"><div class="label">其它 y / z / roll</div><div id="cm-out-yzr" class="value mono-block">—</div></div>
        </div>
        <h3 style="margin-top:12px">舵角指令 Servo Command · gs_cmd_output (°)</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>通道 Channel</th><th>目标角度 angle_deg</th></tr></thead>
            <tbody>${gsCmdRows.join("")}</tbody>
          </table>
        </div>
        <p class="hint">CH0/1：水平舵（俯仰 pitch）；CH2/3：垂直舵（航向 yaw）。与 Thru_Cmd_Mix 一致。</p>
      </section>

      <section class="panel">
        <h2>执行反馈 Actuator Feedback</h2>
        <div class="card-grid">
          <div class="card"><div class="label">动力锁 power_lock</div><div id="cm-power-lock" class="value">—</div></div>
          <div class="card"><div class="label">推进转速 speed_rpm[0]</div><div id="cm-rpm0" class="value mono-block">—</div></div>
          <div class="card"><div class="label">推进时间戳 timestamp_ms</div><div id="cm-thr-ts" class="value mono-block">—</div></div>
        </div>
        <h3 style="margin-top:12px">舵机反馈 Servo Feedback · /GsStatus</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>通道 Channel</th><th>当前角度 angle_deg</th><th>在线 step</th></tr>
            </thead>
            <tbody>${gsFbRows.join("")}</tbody>
          </table>
        </div>
        <p class="hint">power_lock：0=未上锁可转，1=上锁禁止；step：1=该路舵机在线。</p>
      </section>
    `;
  },

  update(snapshot) {
    const data = snapshot.modules?.controller_monitor;
    if (!data) {
      return;
    }

    const connected = Boolean(data.connected);
    setCell("cm-connected", connected ? "有数据 has data" : "无数据 no data");
    setCell("cm-message", data.message ?? "—");

    const topics = data.topics || {};
    setCell("cm-topic-twist", topics.twist_cmd ?? "/obc/twist_cmd");
    setCell("cm-topic-odom", topics.rov_odom ?? "/msg_adapter/rov_odom");
    setCell("cm-topic-pid", topics.pid_output ?? "/controller/pid_output_cmd");
    setCell("cm-topic-gsout", topics.gs_output ?? "/controller/gs_cmd_output");
    setCell("cm-topic-thr", topics.thruster_status ?? "/ThrusterStatus");
    setCell("cm-topic-gsfb", topics.gs_status ?? "/GsStatus");

    const sources = data.sources || {};
    const map = [
      ["twist", sources.twist_cmd],
      ["odom", sources.rov_odom],
      ["pid", sources.pid_output],
      ["gsout", sources.gs_output],
      ["thr", sources.thruster_status],
      ["gsfb", sources.gs_status],
    ];
    for (const [key, src] of map) {
      setCell(`cm-src-${key}`, sourceConnectedLabel(src));
      setCell(`cm-age-${key}`, fmtAge(src?.age_sec));
      setCell(`cm-rx-${key}`, src?.rx_count ?? 0);
    }

    const twist = sources.twist_cmd?.data;
    if (twist) {
      setCell("cm-mode", modeLabel(twist.ctrl_mode_name, twist.ctrl_mode));
      setCell(
        "cm-lock",
        twist.unlocked ? "解锁 unlocked" : "上锁 locked",
      );
      setCell("cm-mode-id", String(twist.ctrl_mode));
      setCell(
        "cm-lock-id",
        `${twist.lock_status} (${twist.unlocked ? "0=解锁" : "1=上锁"})`,
      );
      setCell("cm-cmd-x", fmtNum(twist.x));
      setCell("cm-cmd-y", fmtNum(twist.y));
      setCell("cm-cmd-z", fmtNum(twist.z));
      setCell("cm-cmd-roll", fmtNum(twist.roll));
      setCell("cm-cmd-pitch", fmtNum(twist.pitch));
      setCell("cm-cmd-yaw", fmtNum(twist.yaw));
    } else {
      [
        "cm-mode",
        "cm-lock",
        "cm-mode-id",
        "cm-lock-id",
        "cm-cmd-x",
        "cm-cmd-y",
        "cm-cmd-z",
        "cm-cmd-roll",
        "cm-cmd-pitch",
        "cm-cmd-yaw",
      ].forEach((id) => setCell(id, "—"));
    }

    const odom = sources.rov_odom?.data;
    if (odom) {
      setCell("cm-att-roll", fmtNum(odom.roll_deg, 2));
      setCell("cm-att-pitch", fmtNum(odom.pitch_deg, 2));
      setCell("cm-att-yaw", fmtNum(odom.yaw_deg, 2));
      setCell("cm-vel-x", fmtNum(odom.vel_x));
      setCell("cm-vel-y", fmtNum(odom.vel_y));
      setCell("cm-vel-z", fmtNum(odom.vel_z));
      setCell("cm-rate-x", fmtNum(odom.rate_x));
      setCell("cm-rate-y", fmtNum(odom.rate_y));
      setCell("cm-rate-z", fmtNum(odom.rate_z));
      setCell("cm-pos-x", fmtNum(odom.pos_x));
      setCell("cm-pos-y", fmtNum(odom.pos_y));
      setCell("cm-pos-z", fmtNum(odom.pos_z));
    } else {
      [
        "cm-att-roll",
        "cm-att-pitch",
        "cm-att-yaw",
        "cm-vel-x",
        "cm-vel-y",
        "cm-vel-z",
        "cm-rate-x",
        "cm-rate-y",
        "cm-rate-z",
        "cm-pos-x",
        "cm-pos-y",
        "cm-pos-z",
      ].forEach((id) => setCell(id, "—"));
    }

    const pid = sources.pid_output?.data;
    if (pid) {
      setCell("cm-out-x", fmtNum(pid.x));
      setCell("cm-out-pitch", fmtNum(pid.pitch));
      setCell("cm-out-yaw", fmtNum(pid.yaw));
      setCell(
        "cm-out-yzr",
        `${fmtNum(pid.y)} / ${fmtNum(pid.z)} / ${fmtNum(pid.roll)}`,
      );
    } else {
      ["cm-out-x", "cm-out-pitch", "cm-out-yaw", "cm-out-yzr"].forEach((id) =>
        setCell(id, "—"),
      );
    }

    const gsOut = sources.gs_output?.data;
    renderGsRows("cm-gsout", gsOut?.angle_deg, null, false);

    const thr = sources.thruster_status?.data;
    if (thr) {
      const locked = Number(thr.power_lock) === 1;
      setCell(
        "cm-power-lock",
        locked ? "上锁 locked (1)" : "未上锁 unlocked (0)",
      );
      setCell("cm-rpm0", String(thr.speed_rpm_0 ?? "—"));
      setCell("cm-thr-ts", String(thr.timestamp_ms ?? "—"));
    } else {
      ["cm-power-lock", "cm-rpm0", "cm-thr-ts"].forEach((id) => setCell(id, "—"));
    }

    const gsFb = sources.gs_status?.data;
    renderGsRows("cm-gsfb", gsFb?.angle_deg, gsFb?.step, true);
  },

  destroy() {},
};
