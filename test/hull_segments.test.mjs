import test from "node:test";
import assert from "node:assert/strict";

import { HULL_SEGMENTS, hullSegmentById } from "../web/core/hull_segments.mjs";
import { buildDebugNavLayout } from "../web/core/debug_nav.mjs";

test("hull segments define six canonical compartments", () => {
  assert.equal(HULL_SEGMENTS.length, 6);
  assert.deepEqual(
    HULL_SEGMENTS.map((segment) => segment.id),
    ["bow", "battery1", "battery2", "comm", "buoyancy", "stern"],
  );
});

test("each hull segment has accent token and default debug module", () => {
  for (const segment of HULL_SEGMENTS) {
    assert.match(segment.accentVar, /^--seg-/);
    assert.ok(segment.defaultModule);
    assert.ok(segment.debugModules.includes(segment.defaultModule));
    assert.equal(hullSegmentById(segment.id), segment);
  }
});

test("debug nav groups align with hull segment ids", () => {
  const layout = buildDebugNavLayout(HULL_SEGMENTS.flatMap((segment) => segment.debugModules));
  const hullIds = HULL_SEGMENTS.map((segment) => segment.id);
  const layoutHullIds = layout
    .map((group) => group.segmentId)
    .filter((id) => id !== "misc");
  assert.deepEqual(layoutHullIds, hullIds);
});
