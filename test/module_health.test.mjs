import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getModuleHealth,
  markAllModulesOffline,
} from "../web/core/module_health.mjs";

test("module is online only for a strict true alive value", () => {
  assert.deepEqual(
    getModuleHealth({ modules: { bms: { alive: true } } }, "bms"),
    { online: true, label: "在线" },
  );
  assert.deepEqual(
    getModuleHealth({ modules: { bms: { alive: 1 } } }, "bms"),
    { online: false, label: "离线" },
  );
});

test("missing snapshots and modules are offline", () => {
  assert.deepEqual(getModuleHealth(null, "bms"), {
    online: false,
    label: "离线",
  });
  assert.deepEqual(getModuleHealth({ modules: {} }, "bms"), {
    online: false,
    label: "离线",
  });
});

test("shell clears all module health on snapshot API failure", async () => {
  const source = await readFile(
    new URL("../web/core/shell.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /this\._updateModuleHealth\(snapshot\)/);
  assert.match(source, /catch \(err\)[\s\S]*markAllModulesOffline/);
  assert.match(source, /catch \(err\)[\s\S]*this\._updateActivePanel/);
});

test("offline snapshot preserves values but marks every known module offline", () => {
  const previous = {
    ok: true,
    modules: {
      elb105: { alive: true, alignment_timer_state: "active" },
    },
  };

  const offline = markAllModulesOffline(previous, ["elb105", "bms"]);

  assert.equal(offline.ok, false);
  assert.deepEqual(offline.modules.elb105, {
    alive: false,
    alignment_timer_state: "active",
  });
  assert.deepEqual(offline.modules.bms, { alive: false });
  assert.equal(previous.modules.elb105.alive, true);
});
