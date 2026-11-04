import test from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  tick,
  CASES,
  inspectionReady,
  tumorDone,
  tumorResected,
  type Contact,
} from "../src/game/simulation.ts";
import { gradeAttempt } from "../src/game/grading.ts";

function tumorRun() {
  const s = createState("case05");
  s.status = "running";
  return s;
}
function at(x: number, y: number, extra: Partial<Contact> = {}): Contact {
  return { clearance: 0.11, inField: true, pocket: -1, vessel: null, shaftContact: false, tip: [x, y, 0.2], bleedDistance: Infinity, ...extra };
}
function hold(s: ReturnType<typeof createState>, c: Contact, seconds: number) {
  s.action = true;
  for (let i = 0; i < seconds * 60 && s.status === "running"; i++) {
    tick(s, c, 1 / 60);
    if (!s.action) break;
  }
}
function sealFeeders(s: ReturnType<typeof createState>) {
  s.tool = "bipolar";
  for (const f of s.tumor!.feeders) hold(s, at(f.x, f.y), 2);
}
function debulk(s: ReturnType<typeof createState>, upTo = s.pockets.length) {
  s.tool = "suction";
  for (let i = 0; i < upTo; i++) {
    const p = s.pockets[i];
    hold(s, at(p.x, p.y, { pocket: i }), 8);
    s.action = false;
  }
}
test("the tumour case has lobules, three feeders and a motor area; bone is pre-opened", () => {
  const s = createState("case05");
  assert.equal(s.pockets.length, 5);
  assert.equal(s.tumor?.feeders.length, 3);
  assert.ok(CASES.case05.preOpened);
});
test("bipolar seals a feeding vessel without injury", () => {
  const s = tumorRun();
  sealFeeders(s);
  assert.ok(s.tumor!.feeders.every((f) => f.done));
  assert.equal(s.injury, 0);
});
test("suction in the motor area injures function and is recorded", () => {
  const s = tumorRun();
  s.tool = "suction";
  hold(s, at(s.tumor!.motor.x, s.tumor!.motor.y), 1);
  assert.ok(s.injury > 0.3);
  assert.ok(s.events.some((e) => e.type === "injury" && /motor/i.test(e.detail)));
});
test("resecting before sealing a feeder makes it bleed, and bipolar resolves it", () => {
  const s = tumorRun();
  debulk(s, 1);
  assert.equal(s.tumor!.feeders[0].bleeding, true);
  assert.ok(s.bleeding >= 0.45);
  assert.equal(s.complicationsTriggered, 1);
  s.tool = "bipolar";
  const f = s.tumor!.feeders[0];
  hold(s, at(f.x, f.y, { bleedDistance: 0 }), 6);
  assert.equal(s.sourceControlled, true);
  assert.equal(s.complicationsHandled, 1);
  assert.equal(s.tumor!.feeders[0].done, true);
});
test("sealed feeders plus 85% resection allow examination", () => {
  const s = tumorRun();
  sealFeeders(s);
  debulk(s);
  s.action = false;
  assert.ok(tumorResected(s) > 0.95);
  assert.equal(tumorDone(s), true);
  assert.equal(inspectionReady(s), true);
});
test("an unsealed feeder blocks examination even with the tumour gone", () => {
  const s = tumorRun();
  s.pockets.forEach((p) => (p.remaining = 0));
  s.tumor!.feeders[0].done = true;
  s.tumor!.feeders[1].done = true;
  assert.equal(inspectionReady(s), false);
});
test("the grade reports extent of resection for tumour cases", () => {
  const s = tumorRun();
  s.pockets.forEach((p) => (p.remaining = 0.1));
  const grade = gradeAttempt(s, CASES.case05.parSeconds);
  const part = grade.parts.find((p) => p.label === "Extent of resection");
  assert.ok(part);
  assert.match(part!.note, /90%/);
});
