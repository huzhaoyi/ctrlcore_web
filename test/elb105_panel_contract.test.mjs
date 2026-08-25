import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panelPath = new URL("../web/modules/elb105/panel.js", import.meta.url);

test("ELB105 panel uses SHZR04 fields and no TOGS field model", async () => {
  const source = await readFile(panelPath, "utf8");

  assert.match(source, /buildElb105ViewModel/);
  assert.match(source, /对准状态/);
  assert.match(source, /角速度/);
  assert.match(source, /加速度/);
  assert.match(source, /组合导航速度/);
  assert.match(source, /IMU 温度/);
  assert.doesNotMatch(source, /\$TOGS/);
  assert.doesNotMatch(source, /F1~F21|F5=|9 已对准/);
  assert.doesNotMatch(source, /data\.mode|data\.status_flags|dvl_beam_range_m/);
});

test("ELB105 alignment remains a ROS-backed Web action", async () => {
  const source = await readFile(panelPath, "utf8");

  assert.match(source, /buildAlignmentRequest/);
  assert.match(source, /postModule\("elb105", "align", body\)/);
  assert.doesNotMatch(source, /alignment_time_sec/);
  assert.doesNotMatch(source, /ttyUSB|serial/i);
});

test("ELB105 panel shows the configured 460800 baud rate", async () => {
  const source = await readFile(panelPath, "utf8");

  assert.match(source, /460800 baud/);
  assert.match(source, /50 Hz/);
  assert.match(source, /reliable/);
  assert.doesNotMatch(source, /921600 baud/);
  assert.doesNotMatch(source, /200 Hz/);
  assert.doesNotMatch(source, /best_effort/);
});

test("ELB105 panel renders estimated alignment time and DVL semantic state", async () => {
  const source = await readFile(panelPath, "utf8");

  assert.match(source, /elb-alignment-timer/);
  assert.match(source, /alignment_timer_text/);
  assert.match(source, /dvl_update_state/);
  assert.match(source, /累计更新次数/);
  assert.match(source, /dvl_update_count/);
  assert.match(source, /DVL 模式/);
  assert.match(source, /dvl_valid_state/);
  assert.match(source, /state === "recent"/);
  assert.doesNotMatch(source, /不要重复发送/);
});
