/** 船体六段元数据（监测页 + 调试侧栏共用）。 */

export const HULL_SEGMENTS = [
  {
    id: "bow",
    title: "艏部",
    subtitle: "惯导 · 高度 · 深度 · DVL · 声呐",
    defaultModule: "elb105",
    accentVar: "--seg-bow",
    debugModules: ["elb105", "height", "depth"],
    debugPlaceholder: null,
  },
  {
    id: "battery1",
    title: "电池1 · 电控",
    subtitle: "MCU · 采集板 · 电池1",
    defaultModule: "link",
    accentVar: "--seg-battery1",
    debugModules: ["link", "bme280", "payload_en", "mixed_io", "bms"],
    debugPlaceholder: null,
  },
  {
    id: "battery2",
    title: "电池2 · 俯仰",
    subtitle: "俯仰 · 拉线 · 电池2",
    defaultModule: "wire_displacement",
    accentVar: "--seg-battery2",
    debugModules: ["wire_displacement"],
    debugPlaceholder: null,
  },
  {
    id: "comm",
    title: "通信交界",
    subtitle: "卫通 · LoRa",
    defaultModule: "m1",
    accentVar: "--seg-comm",
    debugModules: ["m1", "lora"],
    debugPlaceholder: null,
  },
  {
    id: "buoyancy",
    title: "浮驱",
    subtitle: "泵0 · 泵1 · 阀1 · 阀2 · 油量",
    defaultModule: "plunger_pump",
    accentVar: "--seg-buoyancy",
    debugModules: ["plunger_pump"],
    debugPlaceholder: null,
  },
  {
    id: "stern",
    title: "艉部",
    subtitle: "舵机 · 推进器 · 运动监视",
    defaultModule: "thruster",
    accentVar: "--seg-stern",
    debugModules: ["gs", "thruster", "controller_monitor"],
    debugPlaceholder: null,
  },
];

export function hullSegmentById(segmentId) {
  return HULL_SEGMENTS.find((segment) => segment.id === segmentId) ?? null;
}
