import test from "node:test";
import assert from "node:assert/strict";
import { createState, tick, CASES, score, type Contact } from "../src/game/simulation.ts";
import { gradeAttempt, letterFor } from "../src/game/grading.ts";
import { vitalsLevel, vitalsTarget, BASE_VITALS } from "../src/game/vitals.ts";

const contact: Contact = {
  clearance: 0.5,
  inField: true,
  pocket: -1,
  vessel: null,
  shaftContact: false,
  tip: [0.6, 0.5, 0.5],
  bleedDistance: Infinity,
};
function run(s: ReturnType<typeof createState>, seconds: number) {
  for (let i = 0; i < seconds * 60 && s.status === "running"; i++)
    tick(s, contact, 1 / 60);
}
test("a quiet patient keeps stable vitals and loses no blood", () => {
  const s = createState();
  s.status = "running";
  run(s, 30);
  assert.equal(s.bloodLoss, 0);
  assert.equal(vitalsLevel(s.vitals), "stable");
  assert.ok(Math.abs(s.vitals.hr - BASE_VITALS.hr) < 1);
  assert.equal(s.callout, null);
});
test("ongoing bleeding raises heart rate, lowers pressure and warns the surgeon", () => {
  const s = createState();
  s.status = "running";
  s.bleeding = 0.5;
  run(s, 25);
  assert.ok(s.bloodLoss > 20);
  assert.ok(s.vitals.hr > BASE_VITALS.hr + 8);
  assert.ok(s.vitals.sys < BASE_VITALS.sys - 8);
  assert.ok(s.callout, "anaesthetist should speak");
  assert.ok(s.events.some((e) => e.type === "callout"));
});
test("uncontrolled bleeding eventually collapses the patient", () => {
  const s = createState();
  s.status = "running";
  s.bleeding = 0.95;
  s.bloodLoss = 700;
  run(s, 120);
  assert.equal(s.status, "failed");
  assert.ok(s.events.some((e) => e.type === "failure"));
});
test("controlling bleeding lets the patient recover and the anaesthetist says so", () => {
  const s = createState();
  s.status = "running";
  s.bleeding = 0.7;
  run(s, 30);
  assert.ok(s.vitals.sys < 100);
  s.bleeding = 0;
  run(s, 60);
  assert.ok(s.vitals.sys > 100);
  assert.ok(s.said.includes("recover"));
});
test("each remark is only spoken once per attempt", () => {
  const s = createState();
  s.status = "running";
  s.bleeding = 0.6;
  run(s, 40);
  const texts = s.events.filter((e) => e.type === "callout").map((e) => e.detail);
  assert.equal(new Set(texts).size, texts.length);
});
test("difficulty changes how fast consequences build", () => {
  const injured = (difficulty: "resident" | "attending" | "chief") => {
    const s = createState("lab", true, 0, difficulty);
    s.status = "running";
    for (let i = 0; i < 12; i++)
      tick(s, { ...contact, clearance: -0.2 }, 1 / 60);
    return s.injury;
  };
  assert.ok(injured("resident") < injured("attending"));
  assert.ok(injured("attending") < injured("chief"));
});
test("grade rewards a clean, quick, stable operation and caps a failed one", () => {
  const s = createState("case01");
  s.elapsed = CASES.case01.parSeconds - 10;
  s.status = "success";
  const clean = gradeAttempt(s, CASES.case01.parSeconds);
  assert.equal(clean.letter, "S");
  assert.equal(clean.points, 100);
  s.injury = 0.4;
  s.bloodLoss = 300;
  s.minSys = 80;
  s.complicationsTriggered = 2;
  s.complicationsHandled = 1;
  const mixed = gradeAttempt(s, CASES.case01.parSeconds);
  assert.ok(mixed.points < clean.points && mixed.points > 50);
  s.status = "failed";
  const failed = gradeAttempt(s, CASES.case01.parSeconds);
  assert.equal(failed.letter, "F");
  assert.ok(failed.points <= 39);
  assert.equal(score(s), failed.points);
});
test("letters are monotonic in points", () => {
  const order = ["F", "D", "C", "B", "A", "S"];
  let last = -1;
  for (const p of [0, 40, 58, 72, 85, 95, 100]) {
    const idx = order.indexOf(letterFor(p));
    assert.ok(idx >= last);
    last = idx;
  }
});
test("vitals targets are bounded", () => {
  const worst = vitalsTarget({ bleeding: 1, bloodLoss: 5000, injury: 1, shock: 1 });
  assert.ok(worst.sys >= 38 && worst.hr <= 178 && worst.spo2 >= 78);
});
