import test from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  tick,
  aimDrain,
  driveDrain,
  secureDrain,
  drainTip,
  CASES,
  type Contact,
} from "../src/game/simulation.ts";

const idle: Contact = { clearance: 0.4, inField: false, pocket: -1, vessel: null, shaftContact: false, tip: [0, 0, 0], bleedDistance: Infinity };
function run(s: ReturnType<typeof createState>, seconds: number) {
  for (let i = 0; i < seconds * 60 && s.status === "running"; i++) tick(s, idle, 1 / 60);
}
function drainRun() {
  const s = createState("case06");
  s.status = "running";
  return s;
}
/** Aim from the burr hole straight at a point on the scan. */
function aimAt(s: ReturnType<typeof createState>, x: number, y: number) {
  const d = s.drain!;
  aimDrain(s, Math.atan2(y - d.entry[1], x - d.entry[0]));
}
function insertTo(s: ReturnType<typeof createState>, depth: number) {
  driveDrain(s, 1);
  for (let i = 0; i < 60 * 20 && s.drain!.depth < depth && s.status === "running"; i++) tick(s, idle, 1 / 60);
  driveDrain(s, 0);
}
test("the drain case starts at the burr hole with raised pressure", () => {
  const s = createState("case06");
  assert.equal(s.drain?.depth, 0);
  assert.ok(s.drain!.icp > 25);
  assert.ok(CASES.case06.preOpened);
});
test("pressure rises while the surgeon works and collapses the patient if nothing is done", () => {
  const s = drainRun();
  run(s, 20);
  assert.ok(s.drain!.icp > 34);
  assert.ok(s.vitals.hr !== 72 || s.shock > 0);
  run(s, 400);
  assert.equal(s.status, "failed");
  assert.ok(s.events.some((e) => e.type === "failure"));
});
test("aim cannot be changed after the catheter is in the brain", () => {
  const s = drainRun();
  aimAt(s, 80, 98);
  const angle = s.drain!.angle;
  insertTo(s, 30);
  aimDrain(s, 2.2);
  assert.equal(s.drain!.angle, angle);
});
test("the obvious straight line at the ventricle clips the vessel; angling lateral avoids it", () => {
  const direct = drainRun();
  aimAt(direct, 80, 98);
  insertTo(direct, 50);
  assert.ok(direct.events.some((e) => /sulcal vessel/.test(e.detail)));
  const clear = drainRun();
  aimAt(clear, 88, 100);
  insertTo(clear, 50);
  assert.ok(!clear.events.some((e) => /sulcal vessel/.test(e.detail)));
  assert.equal(clear.injury, 0);
});
test("a true trajectory finds CSF, can be secured, and relieves pressure to a win", () => {
  const s = drainRun();
  aimAt(s, 88, 100);
  insertTo(s, 55);
  const tip = drainTip(s.drain!);
  assert.ok(s.drain!.inVentricle, `tip ${tip} should be in the ventricle`);
  assert.ok(s.events.some((e) => /CSF return/.test(e.detail)));
  secureDrain(s);
  assert.equal(s.drain!.secured, true);
  run(s, 30);
  assert.equal(s.status, "success");
  assert.ok(s.drain!.icp <= 16);
});
test("securing without CSF is refused and keeps the pressure climbing", () => {
  const s = drainRun();
  aimAt(s, 130, 98);
  insertTo(s, 40);
  secureDrain(s);
  assert.equal(s.drain!.secured, false);
  assert.equal(s.feedback.title, "No CSF return.");
});
test("a missed pass withdrawn from the brain costs tissue and counts as a complication", () => {
  const s = drainRun();
  aimAt(s, 50, 98);
  insertTo(s, 45);
  driveDrain(s, -1);
  run(s, 3);
  assert.equal(s.drain!.depth, 0);
  assert.equal(s.drain!.passes, 1);
  assert.ok(s.injury > 0.05);
  assert.equal(s.complicationsTriggered, 1);
  aimAt(s, 88, 100);
  insertTo(s, 55);
  assert.ok(s.drain!.inVentricle, "second pass should succeed");
});
test("crossing the midline injures the other hemisphere", () => {
  const s = drainRun();
  aimAt(s, 150, 100);
  insertTo(s, 90);
  assert.ok(s.injury > 0.05);
  assert.ok(s.events.some((e) => /midline/.test(e.detail)));
});
test("a trajectory through the vessel records the injury", () => {
  const s = drainRun();
  aimAt(s, 69, 62);
  insertTo(s, 45);
  assert.ok(s.events.some((e) => /sulcal vessel/.test(e.detail)));
  assert.ok(s.injury >= 0.25);
});
test("passing straight through the far wall injures tissue", () => {
  const s = drainRun();
  aimAt(s, 88, 100);
  insertTo(s, 95);
  assert.ok(s.events.some((e) => /far wall/.test(e.detail)));
  assert.ok(s.injury > 0.1);
});
