import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHullMonitor,
  HEALTH,
  HULL_SEGMENTS,
} from "../web/core/hull_health.mjs";

function baseSnapshot(overrides = {}) {
  return {
    link_ok: true,
    server_time: 1_700_000_000,
    modules: {},
    ...overrides,
  };
}

test("buildHullMonitor returns six hull segments", () => {
  const model = buildHullMonitor(baseSnapshot());
  assert.equal(model.segments.length, HULL_SEGMENTS.length);
  assert.equal(model.segments[0].id, "bow");
  assert.equal(model.segments[5].id, "stern");
});

test("mcu link offline raises top alert", () => {
  const model = buildHullMonitor(baseSnapshot({ link_ok: false }));
  assert.equal(model.vesselLevel, HEALTH.BAD);
  assert.equal(model.topAlert?.label, "整艇");
  assert.match(model.topAlert?.detail || "", /MCU 链路离线/);
});

test("jettison gpio raises critical alert", () => {
  const model = buildHullMonitor(baseSnapshot({
    modules: {
      payload_en: {
        alive: true,
        switch_status: Array(16).fill(0).map((_, index) => (index === 2 ? 1 : 0)),
      },
    },
  }));

  assert.ok(model.alerts.some((alert) => alert.label === "抛载"));
  assert.equal(model.topAlert?.label, "抛载");
});

test("elb105 dvl invalid marks bow segment bad", () => {
  const model = buildHullMonitor(baseSnapshot({
    modules: {
      elb105: {
        alive: true,
        dvl_valid_flags: 0,
        dvl_mode_label: "0 无效",
        dvl_update_latch_state: "waiting",
        alignment_status: 3,
        alignment_ok: true,
      },
      depth: { alive: true, depth_m: [1.2] },
      height: { alive: true, near_dist: [120] },
      payload_en: {
        alive: true,
        switch_status: Array(16).fill(1),
      },
    },
  }));

  const bow = model.segments.find((segment) => segment.id === "bow");
  assert.equal(bow.level, HEALTH.BAD);
  assert.ok(model.alerts.some((alert) => alert.label === "DVL"));
});

test("dvl latch timeout does not fault valid bottom track mode", () => {
  const model = buildHullMonitor(baseSnapshot({
    modules: {
      elb105: {
        alive: true,
        dvl_valid_flags: 1,
        dvl_mode_label: "1 对底",
        dvl_valid_ok: true,
        dvl_update_latch_state: "timeout",
        dvl_update_age_sec: 42.5,
        dvl_update_count: 18,
        alignment_status: 3,
        alignment_ok: true,
      },
      depth: { alive: true, depth_m: [2.0] },
      height: { alive: true, near_dist: [120] },
      payload_en: {
        alive: true,
        switch_status: Array(16).fill(1),
      },
    },
  }));

  const bow = model.segments.find((segment) => segment.id === "bow");
  const dvlItem = bow.items.find((item) => item.label === "DVL");
  assert.equal(dvlItem.level, HEALTH.OK);
  assert.match(dvlItem.detail, /1 对底/);
  assert.match(dvlItem.detail, /低频更新/);
  assert.ok(!model.alerts.some((alert) => alert.label === "DVL 更新"));
});

test("dvl frame invalid with update history stays warn not bad", () => {
  const model = buildHullMonitor(baseSnapshot({
    modules: {
      elb105: {
        alive: true,
        dvl_valid_flags: 0,
        dvl_mode_label: "0 无效",
        dvl_valid_ok: false,
        dvl_update_latch_state: "timeout",
        dvl_update_age_sec: 2.0,
        dvl_update_count: 44,
        alignment_status: 3,
        alignment_ok: true,
      },
      depth: { alive: true, depth_m: [2.0] },
      height: { alive: true, near_dist: [120] },
      payload_en: {
        alive: true,
        switch_status: Array(16).fill(1),
      },
    },
  }));

  const bow = model.segments.find((segment) => segment.id === "bow");
  const dvlItem = bow.items.find((item) => item.label === "DVL");
  assert.equal(dvlItem.level, HEALTH.WARN);
  assert.match(dvlItem.detail, /链路正常/);
  assert.equal(bow.level, HEALTH.WARN);
});

test("bms protect items mark battery1 bad", () => {
  const model = buildHullMonitor(baseSnapshot({
    modules: {
      link: { alive: true },
      bms: {
        alive: true,
        packs: [{
          pack_id: 1,
          comm_ok: 1,
          protect_items: ["单体过压"],
          fail_items: [],
          alarm_items: [],
        }],
      },
      payload_en: { alive: true, switch_status: Array(16).fill(0) },
      mixed_io: { alive: true },
      bme280: { alive: true },
    },
  }));

  const battery1 = model.segments.find((segment) => segment.id === "battery1");
  assert.equal(battery1.level, HEALTH.BAD);
  assert.ok(battery1.items.some((item) => item.label === "电池1"));
});

test("battery2 includes hull-aligned bms health", () => {
  const model = buildHullMonitor(baseSnapshot({
    modules: {
      wire_displacement: { alive: true, displacement_mm: [0, 85] },
      pitch_motor: { alive: true, fault: 0, actual_pct: 0.0, run_label: "停止" },
      bms: {
        alive: true,
        packs: [{
          pack_id: 2,
          comm_ok: 1,
          soc_pct: 76,
          protect_items: [],
          fail_items: [],
          alarm_items: [],
        }],
      },
    },
  }));

  const battery2 = model.segments.find((segment) => segment.id === "battery2");
  assert.ok(battery2.items.some((item) => item.label === "电池2"));
  assert.equal(battery2.kpis.find((kpi) => kpi.label === "电池2")?.value, "76 %");
  assert.equal(battery2.kpis.find((kpi) => kpi.label === "拉线")?.value, "+0.0 %");
  assert.equal(battery2.kpis.length, 3);
  assert.match(battery2.kpis.find((kpi) => kpi.label === "俯仰")?.value || "", /停止/);
  assert.ok(battery2.items.some((item) => item.label === "俯仰驱动"));
});

test("battery segments place bms kpi in the same first slot", () => {
  const model = buildHullMonitor(baseSnapshot({
    modules: {
      link: { alive: true },
      wire_displacement: { alive: true, displacement_mm: [0, 85] },
      pitch_motor: { alive: true, fault: 0, run_label: "停止" },
      bms: {
        alive: true,
        packs: [
          { pack_id: 1, comm_ok: 1, soc_pct: 77 },
          { pack_id: 2, comm_ok: 1, soc_pct: 76 },
        ],
      },
      payload_en: { alive: true, switch_status: Array(16).fill(0) },
      mixed_io: { alive: true },
    },
  }));

  const battery1 = model.segments.find((segment) => segment.id === "battery1");
  const battery2 = model.segments.find((segment) => segment.id === "battery2");
  assert.equal(battery1.kpis[0].label, "电池1");
  assert.equal(battery2.kpis[0].label, "电池2");
  assert.equal(battery1.items[0].label, "电池1");
  assert.equal(battery2.items[0].label, "电池2");
});

test("buoyancy shows dual pumps dual valves and oil", () => {
  const model = buildHullMonitor(baseSnapshot({
    modules: {
      plunger_pump: {
        alive: true,
        oil_valid: 1,
        oil_pct: 42.5,
        duty_out_ch0: 50,
        duty_out_ch1: 10,
        rpm_est_ch0: 1620,
        rpm_est_ch1: 0,
      },
      payload_en: {
        alive: true,
        switch_status: Array(16).fill(0).map((_, index) => (index === 1 ? 1 : 0)),
      },
    },
  }));

  const buoyancy = model.segments.find((segment) => segment.id === "buoyancy");
  assert.ok(buoyancy.items.some((item) => item.label === "泵0" && item.level === HEALTH.OK));
  assert.ok(buoyancy.items.some((item) => item.label === "泵1"));
  assert.ok(buoyancy.items.some((item) => item.label === "阀1 高压"));
  assert.ok(buoyancy.items.some((item) => item.label === "阀2 低压" && item.detail === "开启"));
  assert.equal(buoyancy.kpis.find((kpi) => kpi.label === "泵0")?.value, "1620 rpm");
  assert.equal(buoyancy.kpis.find((kpi) => kpi.label === "泵1")?.value, "停");
  assert.equal(buoyancy.kpis.find((kpi) => kpi.label === "阀2")?.value, "开");
});

test("comm segment shows gnss lat lon from m1 status", () => {
  const model = buildHullMonitor(baseSnapshot({
    modules: {
      m1: {
        alive: true,
        module_online: true,
        status: {
          net_state: 1,
          net_state_name: "已驻网",
          gnss_valid: 1,
          lat_deg: 31.123456,
          lon_deg: 121.654321,
        },
      },
    },
  }));

  const comm = model.segments.find((segment) => segment.id === "comm");
  assert.equal(comm.kpis.find((kpi) => kpi.label === "纬度")?.value, "31.123456");
  assert.equal(comm.kpis.find((kpi) => kpi.label === "经度")?.value, "121.654321");
});

test("lora stays unknown without raising vessel bad", () => {
  const model = buildHullMonitor(baseSnapshot({
    modules: {
      m1: {
        alive: true,
        module_online: true,
        status: {
          net_state: 1,
          net_state_name: "已驻网",
          csq: 20,
        },
      },
    },
  }));

  const comm = model.segments.find((segment) => segment.id === "comm");
  assert.ok(comm.items.some((item) => item.label === "LoRa" && item.level === HEALTH.UNKNOWN));
});

test("buoyancy segment omits pump enable gpio", () => {
  const model = buildHullMonitor(baseSnapshot({
    modules: {
      plunger_pump: {
        alive: true,
        oil_valid: 1,
        oil_pct: 42.5,
        duty_out_ch0: 10,
        duty_out_ch1: 10,
      },
      payload_en: {
        alive: true,
        switch_status: Array(16).fill(0),
      },
    },
  }));

  const buoyancy = model.segments.find((segment) => segment.id === "buoyancy");
  assert.ok(!buoyancy.kpis.some((kpi) => kpi.label === "使能"));
  assert.ok(!buoyancy.items.some((item) => item.label === "泵使能"));
});
