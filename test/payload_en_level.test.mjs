import test from "node:test";
import assert from "node:assert/strict";

import { gpioLevelText } from "../web/modules/payload_en/level.mjs";

test("connected value 1 is HIGH", () => {
  assert.equal(gpioLevelText(1, true), "HIGH");
});

test("connected value 0 is LOW", () => {
  assert.equal(gpioLevelText(0, true), "LOW");
});

test("disconnected state is unknown", () => {
  assert.equal(gpioLevelText(0, false), "—");
});

test("invalid connected value is unknown", () => {
  assert.equal(gpioLevelText(undefined, true), "—");
});
