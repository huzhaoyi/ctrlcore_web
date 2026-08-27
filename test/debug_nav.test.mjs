import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  DEBUG_NAV_GROUPS,
  buildDebugNavLayout,
} from "../web/core/debug_nav.mjs";

const MANIFEST_IDS = [
  "link",
  "m1",
  "elb105",
  "height",
  "depth",
  "wire_displacement",
  "bme280",
  "gs",
  "plunger_pump",
  "bms",
  "payload_en",
  "mixed_io",
  "thruster",
];

test("debug nav covers every manifest module exactly once", () => {
  const layout = buildDebugNavLayout(MANIFEST_IDS);
  const assigned = layout.flatMap((group) => group.moduleIds);
  assert.deepEqual([...assigned].sort(), [...MANIFEST_IDS].sort());
  assert.equal(new Set(assigned).size, MANIFEST_IDS.length);
});

test("debug nav keeps six hull-aligned groups before misc", () => {
  const layout = buildDebugNavLayout(MANIFEST_IDS);
  assert.equal(layout.length, DEBUG_NAV_GROUPS.length);
  assert.deepEqual(
    layout.map((group) => group.segmentId),
    DEBUG_NAV_GROUPS.map((group) => group.id),
  );
});

test("comm group keeps lora placeholder", () => {
  const comm = buildDebugNavLayout(MANIFEST_IDS).find((group) => group.segmentId === "comm");
  assert.match(comm?.placeholder || "", /LoRa/);
});

test("shell builds grouped debug navigation", async () => {
  const source = await readFile(
    new URL("../web/core/shell.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /buildDebugNavLayout/);
  assert.match(source, /nav-group/);
});
