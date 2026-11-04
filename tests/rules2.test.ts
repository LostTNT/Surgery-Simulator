import test from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  tick,
  CASES,
  ruptureAneurysm,
  aimDrain,
  driveDrain,
  type Contact,
} from "../src/game/simulation.ts";
import { gradeAttempt } from "../src/game/grading.ts";

const idle: Contact = { clearance: 0.11, inField: true, pocket: -1, vessel: null, shaftContact: false, tip: [0, 0, 0.2], bleedDistance: Infinity };
function hold(s: ReturnType<typeof createState>, c: Contact, seconds: number) {
  s.action = true;
  for (let i = 0; i < seconds * 60 && s.status === "running"; i++) {
    tick(s, c, 1 / 60);
    if (!s.action) break;
  }
}
test("a failed operation scores nothing for pace or complications", () => {
  const s = createState("case01");
  s.status = "failed";
  s.elapsed = 1;
  const g = gradeAttempt(s, CASES.case01.parSeconds);
  assert.equal(g.parts.find((p) => p.label === "Pace")!.value, 0);
  assert.equal(g.parts.find((p) => p.label === "Complications")!.value, 0);
});
test("complications you caused cost points even when you recover from them", () => {
  const s = createState("case04");
  s.status = "success";
  s.elapsed = 100;
  const clean = gradeAttempt(s, 300).points;
  s.complicationsTriggered = 1;
  s.complicationsHandled = 1;
  s.mistakes = 1;
  const fixed = gradeAttempt(s, 300);
  assert.ok(fixed.points < clean);
  assert.match(fixed.parts.find((p) => p.label === "Complications")!.note, /caused by you/);
});
test("a rupture is counted as the surgeon's mistake", () => {
  const s = createState("case04");
  s.status = "running";
  ruptureAneurysm(s, "test");
  assert.equal(s.mistakes, 1);
});
test("resident cannot earn the top grades", () => {
  const s = createState("case01", true, 0, "resident");
  s.status = "success";
  s.elapsed = 10;
  const g = gradeAttempt(s, 300);
  assert.ok(g.points <= 91);
  assert.notEqual(g.letter, "S");
});
test("tissue injury reaching 100% fails the operation in a tumour case too", () => {
  const s = createState("case05");
  s.status = "running";
  s.tool = "suction";
  hold(s, { ...idle, tip: [s.tumor!.motor.x, s.tumor!.motor.y, 0.2] }, 6);
  assert.equal(s.status, "failed");
  assert.ok(s.events.some((e) => e.type === "failure"));
});
test("a blind clip at the right spot is a miss, not a pinched artery", () => {
  const s = createState("case04");
  s.status = "running";
  const a = s.aneurysm!;
  a.bridges.forEach((b) => (b.done = true));
  a.dissection = 1;
  ruptureAneurysm(s, "test");
  s.mistakes = 0;
  s.tool = "clip";
  s.clipAngle = a.axis;
  hold(s, { ...idle, tip: [a.clipSpot[0], a.clipSpot[1], 0.2] }, 1);
  assert.equal(a.phase, "ruptured");
  assert.equal(s.injury, 0);
  assert.equal(s.mistakes, 0);
});
test("a missed drain pass counts as the surgeon's mistake", () => {
  const s = createState("case06");
  s.status = "running";
  aimDrain(s, Math.atan2(98 - 28, 50 - 62));
  driveDrain(s, 1);
  for (let i = 0; i < 60 * 6; i++) tick(s, idle, 1 / 60);
  driveDrain(s, -1);
  for (let i = 0; i < 60 * 4; i++) tick(s, idle, 1 / 60);
  assert.equal(s.drain!.passes, 1);
  assert.equal(s.mistakes, 1);
});
test("a long operation slowly wears the patient down on Attending but not Resident", () => {
  const attending = createState("case01");
  const resident = createState("case01", true, 0, "resident");
  for (const s of [attending, resident]) {
    s.status = "running";
    s.elapsed = CASES.case01.parSeconds * 1.6;
    for (let i = 0; i < 60 * 30; i++) tick(s, idle, 1 / 60);
  }
  assert.ok(attending.shock > 0.1);
  assert.ok(attending.vitals.sys < resident.vitals.sys);
  assert.equal(resident.shock, 0);
});
