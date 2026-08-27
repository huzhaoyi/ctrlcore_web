import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildAppHash,
  parseAppRoute,
} from "../web/core/app_route.mjs";

test("default route opens monitor workspace", () => {
  assert.deepEqual(parseAppRoute(""), {
    workspace: "monitor",
    moduleId: null,
  });
  assert.deepEqual(parseAppRoute("#"), {
    workspace: "monitor",
    moduleId: null,
  });
  assert.deepEqual(parseAppRoute("#monitor"), {
    workspace: "monitor",
    moduleId: null,
  });
});

test("debug route accepts module id", () => {
  assert.deepEqual(parseAppRoute("#debug"), {
    workspace: "debug",
    moduleId: null,
  });
  assert.deepEqual(parseAppRoute("#debug/link"), {
    workspace: "debug",
    moduleId: "link",
  });
});

test("buildAppHash mirrors parseAppRoute", () => {
  assert.equal(buildAppHash("monitor"), "#monitor");
  assert.equal(buildAppHash("debug"), "#debug");
  assert.equal(buildAppHash("debug", "bms"), "#debug/bms");
});

test("shell exposes monitor and debug workspaces", async () => {
  const source = await readFile(
    new URL("../web/core/shell.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /WORKSPACE_MONITOR/);
  assert.match(source, /WORKSPACE_DEBUG/);
  assert.match(source, /mountMonitor/);
  assert.match(source, /updateMonitor/);
  assert.match(source, /showWorkspace/);
});

test("index html defaults to monitor workspace", async () => {
  const html = await readFile(
    new URL("../web/index.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /id="workspace-monitor"/);
  assert.match(html, /id="workspace-debug"/);
  assert.match(html, /core\/tokens\.css/);
  assert.match(html, /assets\/sealien-logo\.png/);
  assert.match(html, /id="tab-monitor"/);
  assert.match(html, /workspace-active/);
  assert.doesNotMatch(html, /id="workspace-debug" class="workspace workspace-active"/);
});
