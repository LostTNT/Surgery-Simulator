import test from "node:test";
import assert from "node:assert/strict";
import { createState, tick, CASES, score, inspectionReady, type Contact } from "../src/game/simulation.ts";
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

// ---- Aneurysm clipping ----
import { createAneurysm, neckFrame, ruptureAneurysm } from "../src/game/simulation.ts";
function aneurysmRun() {
  const s = createState("case04");
  s.status = "running";
  return s;
}
function at(x: number, y: number, extra: Partial<Contact> = {}): Contact {
  return { ...contact, clearance: 0.11, tip: [x, y, 0.2], pocket: -1, ...extra };
}
function hold(s: ReturnType<typeof createState>, c: Contact, seconds: number) {
  s.action = true;
  for (let i = 0; i < seconds * 60 && s.status === "running"; i++) {
    tick(s, c, 1 / 60);
    if (!s.action) break;
  }
}
test("the aneurysm case starts with an intact aneurysm, no pockets and the bone open", () => {
  const s = createState("case04");
  assert.equal(s.aneurysm?.phase, "intact");
  assert.equal(s.pockets.length, 0);
  assert.ok(CASES.case04.preOpened);
  assert.equal(s.aneurysm?.bridges.length, 2);
});
test("bipolar on the tethers releases them without injury", () => {
  const s = aneurysmRun();
  s.tool = "bipolar";
  for (const b of s.aneurysm!.bridges) hold(s, at(b.x, b.y), 2);
  assert.ok(s.aneurysm!.bridges.every((b) => b.done));
  assert.equal(s.injury, 0);
  assert.equal(s.aneurysm!.phase, "intact");
});
test("bipolar on the dome ruptures it and starts a bleed that bipolar cannot seal", () => {
  const s = aneurysmRun();
  s.tool = "bipolar";
  hold(s, at(...s.aneurysm!.dome), 3);
  assert.equal(s.aneurysm!.phase, "ruptured");
  assert.ok(s.bleeding >= 0.7);
  assert.equal(s.complicationsTriggered, 1);
  assert.ok(s.events.some((e) => e.type === "rupture"));
  const before = s.bleeding;
  hold(s, at(s.aneurysm!.dome[0], s.aneurysm!.dome[1], { bleedDistance: 0 }), 3);
  assert.ok(s.bleeding >= before, "bipolar must not reduce an arterial rupture");
});
test("quiet hands let wall tension settle", () => {
  const s = aneurysmRun();
  s.aneurysm!.tension = 0.6;
  for (let i = 0; i < 600; i++) tick(s, at(2, 2, { inField: true }), 1 / 60);
  assert.ok(s.aneurysm!.tension < 0.1);
});
test("fast movement near the dome raises tension", () => {
  const s = aneurysmRun();
  s.tool = "suction";
  for (let i = 0; i < 120; i++) tick(s, at(...s.aneurysm!.dome, { speed: 2.4, clearance: 0.11 }), 1 / 60);
  assert.ok(s.aneurysm!.tension > 0.5);
});
function prepared() {
  const s = aneurysmRun();
  s.tool = "bipolar";
  for (const b of s.aneurysm!.bridges) hold(s, at(b.x, b.y), 2);
  s.tool = "suction";
  hold(s, at(...s.aneurysm!.work), 9);
  return s;
}
test("suction beside the neck frees it only after the tethers are released", () => {
  const raw = aneurysmRun();
  raw.tool = "suction";
  hold(raw, at(...raw.aneurysm!.work), 12);
  assert.equal(raw.aneurysm!.dissection, 0);
  const s = prepared();
  assert.ok(s.aneurysm!.dissection >= 0.9);
});
test("a correctly aligned clip seals the aneurysm and allows examination", () => {
  const s = prepared();
  s.tool = "clip";
  s.clipAngle = s.aneurysm!.axis + 0.1;
  hold(s, at(...s.aneurysm!.clipSpot), 1);
  assert.equal(s.aneurysm!.phase, "clipped");
  s.action = false;
  assert.equal(inspectionReady(s), true);
});
test("a misaligned clip is removed and the aneurysm stays open", () => {
  const s = prepared();
  s.tool = "clip";
  s.clipAngle = s.aneurysm!.axis + 1.2;
  hold(s, at(...s.aneurysm!.clipSpot), 1);
  assert.equal(s.aneurysm!.phase, "intact");
  assert.equal(inspectionReady(s), false);
});
test("a clip on the artery itself pinches the parent vessel", () => {
  const s = prepared();
  s.tool = "clip";
  s.clipAngle = s.aneurysm!.axis;
  hold(s, at(...s.aneurysm!.neck), 1);
  assert.equal(s.aneurysm!.phase, "intact");
  assert.ok(s.injury > 0.15);
});
test("clipping before the neck is free slips and adds tension", () => {
  const s = aneurysmRun();
  s.tool = "clip";
  s.clipAngle = s.aneurysm!.axis;
  hold(s, at(...s.aneurysm!.clipSpot), 1);
  assert.equal(s.aneurysm!.phase, "intact");
  assert.ok(s.aneurysm!.tension > 0.15);
});
test("after a rupture, suction lets the surgeon see; clipping blind misses", () => {
  const blind = prepared();
  ruptureAneurysm(blind, "test");
  blind.tool = "clip";
  blind.clipAngle = blind.aneurysm!.axis;
  hold(blind, at(...blind.aneurysm!.clipSpot), 1);
  assert.equal(blind.aneurysm!.phase, "ruptured", "blind clip should miss");
  const seen = prepared();
  ruptureAneurysm(seen, "test");
  seen.tool = "suction";
  hold(seen, at(...seen.aneurysm!.dome), 1);
  seen.tool = "clip";
  seen.clipAngle = seen.aneurysm!.axis;
  hold(seen, at(...seen.aneurysm!.clipSpot), 1);
  assert.equal(seen.aneurysm!.phase, "clipped");
  assert.equal(seen.bleeding, 0);
  assert.equal(seen.complicationsHandled, 1);
  assert.equal(seen.sourceControlled, true);
});
test("neck frame reports position relative to the artery", () => {
  const a = createAneurysm();
  const spot = neckFrame(a, ...a.clipSpot);
  assert.ok(Math.abs(spot.along) < 1e-9 && Math.abs(spot.side - 0.05) < 1e-9);
});
