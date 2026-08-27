/** 船体分段健康汇总（仅读 snapshot，不新增后端接口）。 */

import {
  assessDvlModeDisplay,
  dvlPulseHint,
} from "../modules/elb105/dvl_health.mjs";
import { HULL_SEGMENTS } from "./hull_segments.mjs";

export { HULL_SEGMENTS } from "./hull_segments.mjs";

export const HEALTH = {
  OK: "ok",
  WARN: "warn",
  BAD: "bad",
  UNKNOWN: "unknown",
};

const SEVERITY = {
  [HEALTH.UNKNOWN]: 0,
  [HEALTH.OK]: 1,
  [HEALTH.WARN]: 2,
  [HEALTH.BAD]: 3,
};

const GPIO_SONAR_A = 3;
const GPIO_SONAR_B = 4;
const GPIO_DVL_A = 5;
const GPIO_DVL_B = 6;
const GPIO_HEIGHT_PWR = 7;
const GPIO_VALVE_HIGH = 0;
const GPIO_VALVE_LOW = 1;
const GPIO_JETTISON = 2;
const HEIGHT_INVALID = 65535;
const PITCH_WIRE_CH = 1;
const PITCH_TRAVEL_MIN_MM = 45.0;
const PITCH_TRAVEL_MAX_MM = 125.0;
const PLUNGER_ESC_STOP_DUTY = 10;
/** 物理舱段 → BMS 拨码（MCU bms.h：PACK0=0x01，PACK1=0x02） */
const BMS_PACK_BY_HULL = {
  battery1: 1,
  battery2: 2,
};
const BMS_LABEL_BY_HULL = {
  battery1: "电池1",
  battery2: "电池2",
};

function worstHealth(...levels) {
  return levels.reduce((acc, level) => {
    const safe = Object.prototype.hasOwnProperty.call(SEVERITY, level)
      ? level
      : HEALTH.UNKNOWN;
    return SEVERITY[safe] > SEVERITY[acc] ? safe : acc;
  }, HEALTH.UNKNOWN);
}

function healthItem(level, label, detail, moduleId = null) {
  return { level, label, detail, moduleId };
}

function mod(source, moduleId) {
  if (source?.modules) {
    return source.modules[moduleId] ?? null;
  }
  return source?.[moduleId] ?? null;
}

function isAlive(data) {
  return data?.alive === true;
}

function gpioState(modules, index) {
  const payload = mod(modules, "payload_en");
  if (!isAlive(payload)) {
    return null;
  }
  const states = payload.switch_status || [];
  return Number(states[index]) === 1;
}

function fmtNum(value, digits, suffix = "") {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "—";
  }
  return `${num.toFixed(digits)}${suffix}`;
}

function pitchMmToPct(mm) {
  const num = Number(mm);
  if (!Number.isFinite(num)) {
    return null;
  }
  const span = PITCH_TRAVEL_MAX_MM - PITCH_TRAVEL_MIN_MM;
  if (span <= 0.0) {
    return null;
  }
  const mid = (PITCH_TRAVEL_MIN_MM + PITCH_TRAVEL_MAX_MM) * 0.5;
  const pct = (num - mid) * 200.0 / span;
  return Math.max(-100.0, Math.min(100.0, pct));
}

function fmtPitchWirePct(mm) {
  const pct = pitchMmToPct(mm);
  if (pct == null) {
    return "—";
  }
  const prefix = pct >= 0.0 ? "+" : "";
  return `${prefix}${pct.toFixed(1)} %`;
}

function pitchMotorKpiValue(motor) {
  if (!isAlive(motor)) {
    return "—";
  }
  const pct = fmtNum(motor.actual_pct, 1, " %");
  const run = motor.run_label || "—";
  return `${pct} · ${run}`;
}

function m1Status(data) {
  return data?.status ?? null;
}

function findBmsPack(data, packId) {
  const packs = data?.packs || [];
  return packs.find((pack) => Number(pack.pack_id) === packId) ?? null;
}

function bmsKpi(modules, hullKey) {
  const bms = mod(modules, "bms");
  const packId = BMS_PACK_BY_HULL[hullKey];
  const pack = findBmsPack(bms, packId);
  const soc = pack?.comm_ok ? Number(pack.soc_pct) : null;
  return {
    label: BMS_LABEL_BY_HULL[hullKey],
    value: Number.isFinite(soc) ? `${soc.toFixed(0)} %` : "—",
  };
}

function assessDvlHealth(data) {
  const mode = assessDvlModeDisplay(data);
  let detail = mode.detail;
  const pulseHint = dvlPulseHint(data);

  if (pulseHint && mode.state === "valid") {
    detail = `${detail} · ${pulseHint}`;
  } else if (pulseHint && mode.state === "idle") {
    detail = `${detail} · ${pulseHint}`;
  }

  let level = HEALTH.UNKNOWN;
  if (mode.state === "valid") {
    level = HEALTH.OK;
  } else if (mode.state === "idle") {
    level = HEALTH.WARN;
  } else if (mode.state === "invalid") {
    level = HEALTH.BAD;
  } else if (mode.state === "unknown") {
    level = HEALTH.WARN;
  }

  if (mode.state === "valid" && data.dvl_update_latch_state === "waiting") {
    level = HEALTH.WARN;
  }

  return healthItem(level, "DVL", detail, "elb105");
}

function assessLink(modules) {
  const data = mod(modules, "link");
  if (!isAlive(data)) {
    return healthItem(HEALTH.BAD, "MCU 链路", "心跳超时或离线", "link");
  }
  return healthItem(HEALTH.OK, "MCU 链路", "心跳正常", "link");
}

function assessElb105(data) {
  if (!isAlive(data)) {
    return [healthItem(HEALTH.BAD, "惯导 ELB105", "数据离线", "elb105")];
  }

  const items = [
    healthItem(HEALTH.OK, "惯导 ELB105", "在线", "elb105"),
    assessDvlHealth(data),
  ];

  if (data.alignment_ok === false && Number(data.alignment_status) !== 3) {
    items.push(healthItem(HEALTH.WARN, "对准", data.alignment_label || "未完成对准", "elb105"));
  }

  return items;
}

function assessDepth(data) {
  if (!isAlive(data)) {
    return healthItem(HEALTH.BAD, "深度计", "数据离线", "depth");
  }
  return healthItem(HEALTH.OK, "深度计", "在线", "depth");
}

function assessHeight(data) {
  if (!isAlive(data)) {
    return healthItem(HEALTH.BAD, "高度计", "数据离线", "height");
  }
  const cm = Number(data.near_dist?.[0]);
  if (!Number.isFinite(cm) || cm >= HEIGHT_INVALID) {
    return healthItem(HEALTH.WARN, "高度计", "无效或未入水", "height");
  }
  return healthItem(HEALTH.OK, "高度计", "有效回波", "height");
}

function assessSonarPower(modules) {
  const power = gpioState(modules, GPIO_SONAR_A) || gpioState(modules, GPIO_SONAR_B);
  if (power === null) {
    return healthItem(HEALTH.UNKNOWN, "声呐供电", "采集板离线，状态未知", "payload_en");
  }
  if (!power) {
    return healthItem(HEALTH.WARN, "声呐供电", "24V 未开启", "payload_en");
  }
  return healthItem(HEALTH.OK, "声呐供电", "24V 已开启", "payload_en");
}

function assessSingleGpioPower(modules, gpioIndex, label, moduleId) {
  const power = gpioState(modules, gpioIndex);
  if (power === null) {
    return healthItem(HEALTH.UNKNOWN, `${label}供电`, "采集板离线，状态未知", moduleId);
  }
  if (!power) {
    return healthItem(HEALTH.WARN, `${label}供电`, "24V 未开启", moduleId);
  }
  return healthItem(HEALTH.OK, `${label}供电`, "24V 已开启", moduleId);
}

function assessPairedGpioPower(modules, gpioA, gpioB, label, moduleId) {
  const powerA = gpioState(modules, gpioA);
  const powerB = gpioState(modules, gpioB);
  if (powerA === null && powerB === null) {
    return healthItem(HEALTH.UNKNOWN, `${label}供电`, "采集板离线，状态未知", moduleId);
  }
  if (!powerA && !powerB) {
    return healthItem(HEALTH.WARN, `${label}供电`, "24V 未开启", moduleId);
  }
  return healthItem(HEALTH.OK, `${label}供电`, "24V 已开启", moduleId);
}

function assessBmsPack(data, packId, hullLabel) {
  const packHex = `0x${String(packId).padStart(2, "0")}`;
  const itemLabel = hullLabel;

  if (!isAlive(data)) {
    return healthItem(HEALTH.BAD, itemLabel, "通信离线", "bms");
  }

  const pack = findBmsPack(data, packId);
  if (!pack) {
    return healthItem(HEALTH.WARN, itemLabel, `等待 ${packHex} 数据`, "bms");
  }
  if (!pack.comm_ok) {
    return healthItem(HEALTH.BAD, itemLabel, `${packHex} 失联`, "bms");
  }
  if ((pack.protect_items || []).length || (pack.fail_items || []).length) {
    return healthItem(
      HEALTH.BAD,
      itemLabel,
      pack.health_summary || `${packHex} 保护/失效`,
      "bms",
    );
  }
  if ((pack.alarm_items || []).length) {
    return healthItem(
      HEALTH.WARN,
      itemLabel,
      pack.health_summary || `${packHex} 告警`,
      "bms",
    );
  }
  return healthItem(HEALTH.OK, itemLabel, `正常 · ${packHex}`, "bms");
}

function fmtPumpKpi(data, channel) {
  if (!isAlive(data)) {
    return "—";
  }
  const duty = Number(data[`duty_out_ch${channel}`]);
  const rpm = Number(data[`rpm_est_ch${channel}`]);
  if (!Number.isFinite(duty)) {
    return "—";
  }
  if (duty <= PLUNGER_ESC_STOP_DUTY) {
    return "停";
  }
  if (!Number.isFinite(rpm)) {
    return `${duty.toFixed(0)} %`;
  }
  return `${rpm} rpm`;
}

function assessPumpChannel(data, channel) {
  const label = `泵${channel}`;
  if (!isAlive(data)) {
    return healthItem(HEALTH.BAD, label, "数据离线", "plunger_pump");
  }

  const duty = Number(data[`duty_out_ch${channel}`]);
  const rpm = Number(data[`rpm_est_ch${channel}`]);
  if (!Number.isFinite(duty)) {
    return healthItem(HEALTH.UNKNOWN, label, "状态不可用", "plunger_pump");
  }
  if (duty <= PLUNGER_ESC_STOP_DUTY) {
    return healthItem(HEALTH.OK, label, "停止", "plunger_pump");
  }
  const rpmText = Number.isFinite(rpm) ? `${rpm} rpm · ` : "";
  return healthItem(HEALTH.OK, label, `${rpmText}${duty}%`, "plunger_pump");
}

function assessValveSwitch(modules, gpioIndex, label) {
  const state = gpioState(modules, gpioIndex);
  if (state === null) {
    return healthItem(HEALTH.UNKNOWN, label, "采集板离线", "payload_en");
  }
  return healthItem(
    HEALTH.OK,
    label,
    state ? "开启" : "关闭",
    "payload_en",
  );
}

function assessBuoyancy(modules) {
  const pump = mod(modules, "plunger_pump");
  const items = [
    assessPumpChannel(pump, 0),
    assessPumpChannel(pump, 1),
    assessValveSwitch(modules, GPIO_VALVE_HIGH, "阀1 高压"),
    assessValveSwitch(modules, GPIO_VALVE_LOW, "阀2 低压"),
  ];

  const oilValid = isAlive(pump) && Number(pump.oil_valid) === 1;
  if (oilValid && Number(pump.oil_pct) >= 100.0) {
    items.push(healthItem(HEALTH.WARN, "油量 CH0", "已满油，MCU 可能强制停泵", "plunger_pump"));
  } else if (oilValid) {
    items.push(healthItem(HEALTH.OK, "油量 CH0", `${fmtNum(pump.oil_pct, 1, " %")}`, "plunger_pump"));
  } else {
    items.push(healthItem(HEALTH.WARN, "油量 CH0", "无效或离线", "plunger_pump"));
  }

  return items;
}

function assessPitch(modules) {
  const wire = mod(modules, "wire_displacement");
  const motor = mod(modules, "pitch_motor");
  const items = [];

  if (!isAlive(wire)) {
    items.push(healthItem(HEALTH.BAD, "拉线 CH1", "数据离线", "wire_displacement"));
  } else {
    items.push(healthItem(HEALTH.OK, "拉线 CH1", "在线", "wire_displacement"));
  }

  if (!isAlive(motor)) {
    items.push(healthItem(HEALTH.BAD, "俯仰驱动", "数据离线", "pitch_motor"));
  } else if (Number(motor.fault) !== 0) {
    items.push(healthItem(
      HEALTH.BAD,
      "俯仰驱动",
      motor.fault_label || `故障 ${motor.fault}`,
      "pitch_motor",
    ));
  } else {
    items.push(healthItem(
      HEALTH.OK,
      "俯仰驱动",
      `${pitchMotorKpiValue(motor)}`,
      "pitch_motor",
    ));
  }

  return items;
}

function assessM1(data) {
  if (!isAlive(data)) {
    return healthItem(HEALTH.BAD, "天通卫通 M1", "模块离线", "m1");
  }
  if (data.module_online === false) {
    return healthItem(HEALTH.BAD, "天通卫通 M1", "模块未在线", "m1");
  }

  const status = m1Status(data);
  const netState = Number(status?.net_state);
  if (!Number.isFinite(netState)) {
    return healthItem(HEALTH.WARN, "天通卫通 M1", "等待状态数据", "m1");
  }
  if (netState === 0) {
    return healthItem(HEALTH.WARN, "天通卫通 M1", status?.net_state_name || "未驻网", "m1");
  }
  return healthItem(HEALTH.OK, "天通卫通 M1", status?.net_state_name || "在线", "m1");
}

function assessGs(data) {
  if (!isAlive(data)) {
    return healthItem(HEALTH.BAD, "舵机", "数据离线", "gs");
  }

  const channels = data.channels || [];
  const onlineChannels = channels.filter((ch) => ch.online);
  if (!onlineChannels.length) {
    return healthItem(HEALTH.WARN, "舵机", "无在线通道", "gs");
  }

  const faultChannels = onlineChannels.filter((ch) => ch.res_ok === false);
  if (faultChannels.length) {
    return healthItem(HEALTH.BAD, "舵机", `${faultChannels.length} 路报警`, "gs");
  }

  return healthItem(HEALTH.OK, "舵机", `${onlineChannels.length} 路在线`, "gs");
}

function assessThruster(data) {
  if (!isAlive(data)) {
    return healthItem(HEALTH.BAD, "推进器", "数据离线", "thruster");
  }

  const channels = data.channels || [];
  const activeCount = Number(data.active_thruster_count) || channels.length;
  const checked = channels.slice(0, activeCount);
  const faultChannels = checked.filter((ch) => ch.fault_active || ch.fault_ok === false);

  if (data.power_lock_ok === false) {
    return healthItem(HEALTH.WARN, "推进器", data.power_lock_label || "功率锁定", "thruster");
  }
  if (faultChannels.length) {
    return healthItem(HEALTH.BAD, "推进器", `${faultChannels.length} 路故障`, "thruster");
  }
  return healthItem(HEALTH.OK, "推进器", "在线", "thruster");
}

function assessJettison(modules) {
  const armed = gpioState(modules, GPIO_JETTISON);
  if (armed === null) {
    return null;
  }
  if (armed) {
    return healthItem(HEALTH.BAD, "抛载", "GPIO2 已开启 · 载荷已丢弃", "payload_en");
  }
  return null;
}

function rollupSegment(items) {
  const level = items.reduce(
    (acc, item) => worstHealth(acc, item.level),
    HEALTH.UNKNOWN,
  );
  const issues = items.filter((item) => item.level === HEALTH.BAD || item.level === HEALTH.WARN);
  const summary = issues.length
    ? issues.slice(0, 2).map((item) => item.label).join(" · ")
    : level === HEALTH.OK
      ? "正常"
      : level === HEALTH.UNKNOWN
        ? "部分无数据"
        : "正常";
  return { level, items, summary };
}

function buildKpis(segmentId, modules, snapshot) {
  switch (segmentId) {
    case "bow": {
      const elb = mod(modules, "elb105");
      const depth = mod(modules, "depth");
      const height = mod(modules, "height");
      const heightCm = Number(height?.near_dist?.[0]);
      const heightText = !Number.isFinite(heightCm) || heightCm >= HEIGHT_INVALID
        ? "—"
        : `${(heightCm / 100.0).toFixed(2)} m`;
      return [
        { label: "航向", value: isAlive(elb) ? `${fmtNum(elb.heading_deg, 1, "°")}` : "—" },
        { label: "深度", value: isAlive(depth) ? fmtNum(depth.depth_m?.[0], 2, " m") : "—" },
        { label: "高度", value: isAlive(height) ? heightText : "—" },
        {
          label: "DVL",
          value: isAlive(elb) ? (elb.dvl_mode_label || "—") : "—",
        },
      ];
    }
    case "battery1": {
      const link = mod(modules, "link");
      return [
        bmsKpi(modules, "battery1"),
        { label: "MCU", value: isAlive(link) ? "在线" : "离线" },
        { label: "采集板", value: isAlive(mod(modules, "payload_en")) ? "GPIO 在线" : "离线" },
        { label: "ADC", value: isAlive(mod(modules, "mixed_io")) ? "在线" : "离线" },
      ];
    }
    case "battery2": {
      const motor = mod(modules, "pitch_motor");
      const wire = mod(modules, "wire_displacement");
      const mm = wire?.displacement_mm?.[PITCH_WIRE_CH];
      return [
        bmsKpi(modules, "battery2"),
        { label: "拉线", value: isAlive(wire) ? fmtPitchWirePct(mm) : "—" },
        { label: "俯仰", value: pitchMotorKpiValue(motor) },
      ];
    }
    case "comm": {
      const m1 = mod(modules, "m1");
      const status = m1Status(m1);
      const gnssValid = Number(status?.gnss_valid) === 1;
      const lat = Number(status?.lat_deg);
      const lon = Number(status?.lon_deg);
      return [
        { label: "卫通", value: isAlive(m1) ? (status?.net_state_name || "—") : "离线" },
        {
          label: "纬度",
          value: isAlive(m1) && gnssValid && Number.isFinite(lat)
            ? lat.toFixed(6)
            : "—",
        },
        {
          label: "经度",
          value: isAlive(m1) && gnssValid && Number.isFinite(lon)
            ? lon.toFixed(6)
            : "—",
        },
        { label: "LoRa", value: "无监测" },
      ];
    }
    case "buoyancy": {
      const pump = mod(modules, "plunger_pump");
      const oilValid = isAlive(pump) && Number(pump.oil_valid) === 1;
      const valveHigh = gpioState(modules, GPIO_VALVE_HIGH);
      const valveLow = gpioState(modules, GPIO_VALVE_LOW);
      return [
        { label: "泵0", value: fmtPumpKpi(pump, 0) },
        { label: "泵1", value: fmtPumpKpi(pump, 1) },
        {
          label: "阀1",
          value: valveHigh === null ? "—" : (valveHigh ? "开" : "关"),
        },
        {
          label: "阀2",
          value: valveLow === null ? "—" : (valveLow ? "开" : "关"),
        },
        { label: "油量", value: oilValid ? fmtNum(pump.oil_pct, 1, " %") : "—" },
      ];
    }
    case "stern": {
      const gs = mod(modules, "gs");
      const thr = mod(modules, "thruster");
      return [
        {
          label: "舵机",
          value: isAlive(gs) ? `${gs.online_count ?? 0}/${gs.channel_count ?? 4}` : "—",
        },
        { label: "推进器", value: isAlive(thr) ? "在线" : "离线" },
      ];
    }
    default:
      return [];
  }
}

function buildSegment(segment, modules, snapshot) {
  let items = [];

  switch (segment.id) {
    case "bow":
      items = [
        ...assessElb105(mod(modules, "elb105")),
        assessDepth(mod(modules, "depth")),
        assessHeight(mod(modules, "height")),
        assessSonarPower(modules),
        assessPairedGpioPower(modules, GPIO_DVL_A, GPIO_DVL_B, "DVL", "payload_en"),
        assessSingleGpioPower(modules, GPIO_HEIGHT_PWR, "高度计", "payload_en"),
      ];
      break;
    case "battery1":
      items = [
        assessBmsPack(
          mod(modules, "bms"),
          BMS_PACK_BY_HULL.battery1,
          BMS_LABEL_BY_HULL.battery1,
        ),
        assessLink(modules),
        isAlive(mod(modules, "payload_en"))
          ? healthItem(HEALTH.OK, "GPIO 采集板", "在线", "payload_en")
          : healthItem(HEALTH.BAD, "GPIO 采集板", "离线", "payload_en"),
        isAlive(mod(modules, "mixed_io"))
          ? healthItem(HEALTH.OK, "ADC 采集板", "在线", "mixed_io")
          : healthItem(HEALTH.BAD, "ADC 采集板", "离线", "mixed_io"),
        isAlive(mod(modules, "bme280"))
          ? healthItem(HEALTH.OK, "舱内 BME280", "在线", "bme280")
          : healthItem(HEALTH.WARN, "舱内 BME280", "离线", "bme280"),
      ];
      break;
    case "battery2":
      items = [
        assessBmsPack(
          mod(modules, "bms"),
          BMS_PACK_BY_HULL.battery2,
          BMS_LABEL_BY_HULL.battery2,
        ),
        ...assessPitch(modules),
      ];
      break;
    case "comm":
      items = [
        assessM1(mod(modules, "m1")),
        healthItem(HEALTH.UNKNOWN, "LoRa", "暂无监测接口", null),
      ];
      break;
    case "buoyancy":
      items = assessBuoyancy(modules);
      break;
    case "stern":
      items = [
        assessGs(mod(modules, "gs")),
        assessThruster(mod(modules, "thruster")),
      ];
      break;
    default:
      break;
  }

  const rollup = rollupSegment(items.flat().filter(Boolean));
  return {
    ...segment,
    level: rollup.level,
    summary: rollup.summary,
    items: rollup.items,
    kpis: buildKpis(segment.id, modules, snapshot),
  };
}

function alertPriority(alert) {
  if (alert.label === "抛载") {
    return 0;
  }
  if (alert.label === "整艇") {
    return 1;
  }
  const levelOrder = {
    [HEALTH.BAD]: 10,
    [HEALTH.WARN]: 20,
    [HEALTH.UNKNOWN]: 30,
    [HEALTH.OK]: 40,
  };
  return levelOrder[alert.level] ?? 99;
}

function sortAlerts(alerts) {
  return [...alerts].sort((left, right) => {
    const priorityDiff = alertPriority(left) - alertPriority(right);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return left.label.localeCompare(right.label, "zh-CN");
  });
}

export function buildHullMonitor(snapshot) {
  const modules = snapshot?.modules || {};
  const linkOk = Boolean(snapshot?.link_ok);
  const segments = HULL_SEGMENTS.map((segment) => buildSegment(segment, modules, snapshot));

  const alerts = [];
  if (!linkOk) {
    alerts.push(healthItem(HEALTH.BAD, "整艇", "MCU 链路离线", "link"));
  }

  const jettison = assessJettison(modules);
  if (jettison) {
    alerts.push(jettison);
  }

  for (const segment of segments) {
    for (const item of segment.items) {
      if (item.level === HEALTH.BAD || item.level === HEALTH.WARN) {
        alerts.push({
          ...item,
          segmentId: segment.id,
          segmentTitle: segment.title,
        });
      }
    }
  }

  const sortedAlerts = sortAlerts(alerts);
  const topAlert = sortedAlerts[0] || null;
  const vesselLevel = segments.reduce(
    (acc, segment) => worstHealth(acc, segment.level),
    linkOk ? HEALTH.OK : HEALTH.BAD,
  );

  return {
    linkOk,
    vesselLevel,
    topAlert,
    alerts: sortedAlerts,
    segments,
  };
}

export function healthLabel(level) {
  switch (level) {
    case HEALTH.OK:
      return "正常";
    case HEALTH.WARN:
      return "注意";
    case HEALTH.BAD:
      return "故障";
    default:
      return "未知";
  }
}
