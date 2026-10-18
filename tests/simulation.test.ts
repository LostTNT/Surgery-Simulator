import test from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  tick,
  pause,
  checkpoint,
  fluidProgress,
  CASES,
  INSPECTION_SECONDS,
  beginInspection,
  inspectionReady,
  initializeProcedure,
  pocketsCleared,
  type Contact,
} from "../src/game/simulation.ts";
const contact: Contact = {
  clearance: 0.1,
  inField: true,
  pocket: 0,
  vessel: null,
  shaftContact: false,
  tip: [0.6, 0.5, 0.1],
  bleedDistance: Infinity,
};
function advance(
  s: ReturnType<typeof createState>,
  seconds: number,
  c = contact,
  hz = 60,
) {
  for (let i = 0; i < seconds * hz; i++) tick(s, c, 1 / hz);
}
test("leaving exposure disengages tool while ongoing bleeding advances", () => {
  const s = createState();
  s.status = "running";
  s.bleeding = 0.4;
  s.action = true;
  advance(s, 10, { ...contact, inField: false });
  assert.equal(s.action, false);
  assert.ok(s.bleeding > 0.45);
  assert.ok(s.elapsed > 9.9);
});
test("paused simulation preserves all tissue and complication state", () => {
  const s = createState();
  s.status = "running";
  s.bleeding = 0.4;
  s.action = true;
  pause(s);
  advance(s, 10, { ...contact, clearance: -0.2 });
  assert.equal(s.bleeding, 0.4);
  assert.equal(s.injury, 0);
  assert.equal(s.elapsed, 0);
  assert.equal(s.action, false);
});
test("shaft injury applies even with the tip outside the opening", () => {
  const s = createState();
  s.status = "running";
  advance(s, 0.2, { ...contact, inField: false, shaftContact: true });
  assert.ok(s.injury > 0.2);
  assert.equal(s.action, false);
});
test("shaft injury records the actual contact location instead of the healthy tip", () => {
  const s = createState();
  s.status = "running";
  advance(s, 0.2, {
    ...contact,
    shaftContact: true,
    injuryPoint: [-0.6, 0.3, 0.1],
    tip: [0.8, 0.7, 0.4],
  });
  assert.deepEqual(s.bleedPosition, [-0.6, 0.3, 0.1]);
  assert.deepEqual(
    s.events.find((e) => e.type === "injury")?.position,
    [-0.6, 0.3, 0.1],
  );
});
test("damage and aspiration agree at distinct simulation rates", () => {
  for (const hz of [30, 60, 120]) {
    const s = createState();
    s.status = "running";
    s.action = true;
    advance(s, 1, contact, hz);
    assert.ok(Math.abs(s.pockets[0].remaining - 0.52) < 1e-8);
    const d = createState();
    d.status = "running";
    advance(d, 0.2, { ...contact, clearance: -0.1 }, hz);
    assert.ok(Math.abs(d.injury - 0.23) < 0.001);
  }
});
test("critical vessel contact fails consistently and records its cause", () => {
  const s = createState();
  s.status = "running";
  advance(s, 1, { ...contact, clearance: -0.1, vessel: "cortical vessel" });
  assert.equal(s.status, "failed");
  assert.equal(s.action, false);
  assert.ok(s.events.some((e) => e.detail.includes("cortical vessel")));
});
test("a true checkpoint restores completed work and prior injury", () => {
  const saved = createState();
  saved.stage = 2;
  saved.pockets.forEach((p) => (p.remaining = 0));
  saved.injury = 0.1;
  saved.elapsed = 20;
  saved.clarity = 0.9;
  saved.procedureStarted = true;
  saved.inspectionActive = true;
  saved.inspectionTime = 1;
  const current = structuredClone(saved);
  current.injury = 0.8;
  current.elapsed = 30;
  const restored = checkpoint(current, saved);
  assert.equal(restored.stage, 2);
  assert.equal(restored.injury, 0.1);
  assert.equal(restored.elapsed, 20);
  assert.equal(restored.clarity, 0.9);
  assert.equal(restored.procedureStarted, true);
  assert.equal(restored.inspectionActive, false);
  assert.equal(restored.inspectionTime, 0);
  assert.equal(fluidProgress(restored), 1);
  assert.notEqual(restored.pockets, saved.pockets);
  assert.equal(restored.status, "running");
});
test("complete path requires explicit examination after clearing and rinsing", () => {
  const s = createState();
  s.status = "running";
  s.action = true;
  for (let i = 0; i < s.pockets.length; i++)
    advance(s, 2.2, { ...contact, pocket: i });
  assert.equal(s.stage, 2);
  assert.equal(s.status, "running");
  s.tool = "irrigation";
  advance(s, 4.4, { ...contact, pocket: -1 });
  assert.equal(s.status, "running");
  s.action = false;
  advance(s, 5, { ...contact, pocket: -1 });
  assert.equal(s.status, "running", "releasing the instrument must not finish the case");
  assert.equal(s.inspectionTime, 0);
  assert.equal(inspectionReady(s), true);
  assert.equal(beginInspection(s), true);
  advance(s, INSPECTION_SECONDS, { ...contact, inField: false, pocket: -1 });
  assert.equal(s.status, "success");
  assert.equal(s.inspectionActive, false);
});
test("irrigation never repairs existing injury", () => {
  const s = createState();
  s.status = "running";
  s.injury = 0.3;
  s.tool = "irrigation";
  s.action = true;
  advance(s, 5);
  assert.equal(s.injury, 0.3);
  assert.equal(s.clarity, 1);
});
test("a prepared source starts only when the field opens and cannot be reseeded", () => {
  const s = createState("case02");
  assert.equal(s.bleeding, 0);
  assert.equal(s.bleedPosition, null);
  assert.equal(s.procedureStarted, false);
  initializeProcedure(s, [0.12, -0.24, 0.42]);
  assert.equal(s.procedureStarted, true);
  assert.equal(s.bleeding, CASES.case02.initialBleeding);
  assert.deepEqual(s.bleedPosition, [0.12, -0.24, 0.42]);
  s.bleeding = 0.12;
  initializeProcedure(s, [1, 1, 1]);
  assert.equal(s.bleeding, 0.12);
  assert.deepEqual(s.bleedPosition, [0.12, -0.24, 0.42]);
  assert.equal(s.events.filter((e) => e.type === "source").length, 1);
});
test("focal bleeding case requires bipolar control before fluid removal and rinsing", () => {
  const s = createState("case02");
  s.status = "running";
  initializeProcedure(s);
  s.action = true;
  advance(s, 1);
  assert.equal(s.pockets[0].remaining, 1);
  assert.match(s.feedback.title, /Control bleeding first/);
  s.tool = "irrigation";
  advance(s, 1);
  assert.equal(s.clarity, 0);
  s.tool = "bipolar";
  advance(s, 2, { ...contact, pocket: -1, bleedDistance: 0 });
  assert.equal(s.sourceControlled, true);
  assert.equal(s.bleeding, 0);
  assert.equal(s.action, false);
  assert.equal(s.injury, 0);
  s.tool = "suction";
  s.action = true;
  for (let i = 0; i < s.pockets.length; i++)
    advance(s, 4, { ...contact, pocket: i });
  assert.equal(pocketsCleared(s), true);
  s.tool = "irrigation";
  advance(s, 5, { ...contact, pocket: -1 });
  assert.equal(beginInspection(s), true);
  advance(s, INSPECTION_SECONDS, { ...contact, inField: false, pocket: -1 });
  assert.equal(s.status, "success");
});
test("loculated washout offers six separated pockets and a longer final rinse", () => {
  const s = createState("case03");
  s.status = "running";
  initializeProcedure(s);
  assert.equal(s.pockets.length, 6);
  assert.ok(s.pockets.some((p) => p.x < -0.5 && p.y < 0));
  s.action = true;
  for (let i = 0; i < s.pockets.length; i++)
    advance(s, 4, { ...contact, pocket: i });
  assert.equal(pocketsCleared(s), true);
  assert.equal(s.stage, 2);
  s.tool = "irrigation";
  advance(s, 4, { ...contact, pocket: -1 });
  assert.equal(inspectionReady(s), false);
  assert.equal(beginInspection(s), false);
  assert.match(s.feedback.detail, /96%/);
  advance(s, 3, { ...contact, pocket: -1 });
  assert.equal(beginInspection(s), true);
  advance(s, INSPECTION_SECONDS, { ...contact, inField: false, pocket: -1 });
  assert.equal(s.status, "success");
});
test("examination checks every pocket rather than averaged removal progress", () => {
  const s = createState("case03");
  s.status = "running";
  s.stage = 1;
  s.clarity = 1;
  s.pockets.forEach((p) => (p.remaining = 0));
  s.pockets[5].remaining = 0.06;
  assert.ok(fluidProgress(s) > 0.985);
  advance(s, 1, { ...contact, pocket: -1 });
  assert.equal(s.stage, 1);
  assert.equal(beginInspection(s), false);
  assert.match(s.feedback.detail, /1 remaining pocket/);
  s.pockets[5].remaining = 0.015;
  assert.equal(beginInspection(s), true);
});
test("examination rejects insufficient clarity and uncontrolled bleeding", () => {
  const s = createState("case01");
  s.status = "running";
  s.pockets.forEach((p) => (p.remaining = 0));
  s.clarity = 0.8;
  assert.equal(beginInspection(s), false);
  assert.match(s.feedback.detail, /88%/);
  s.clarity = 1;
  s.bleeding = 0.025;
  assert.equal(beginInspection(s), false);
  assert.match(s.feedback.title, /Control bleeding/);
  s.bleeding = 0;
  assert.equal(beginInspection(s), true);
});
test("examination takes the same time at distinct simulation rates", () => {
  for (const hz of [30, 60, 120]) {
    const s = createState();
    s.status = "running";
    s.clarity = 1;
    s.pockets.forEach((p) => (p.remaining = 0));
    assert.equal(beginInspection(s), true);
    advance(s, 2, { ...contact, inField: false }, hz);
    assert.equal(s.status, "running");
    advance(s, 0.5, { ...contact, inField: false }, hz);
    assert.equal(s.status, "success");
    assert.equal(s.inspectionTime, INSPECTION_SECONDS);
  }
});
test("operation or physical contact interrupts examination and requires restarting", () => {
  for (const interruption of ["operation", "contact"] as const) {
    const s = createState();
    s.status = "running";
    s.clarity = 1;
    s.pockets.forEach((p) => (p.remaining = 0));
    beginInspection(s);
    advance(s, 1);
    if (interruption === "operation") s.action = true;
    tick(s, { ...contact, shaftContact: interruption === "contact" }, 1 / 60);
    assert.equal(s.inspectionActive, false);
    assert.equal(s.inspectionTime, 0);
    s.action = false;
    advance(s, 4);
    assert.equal(s.status, "running");
    assert.equal(s.inspectionTime, 0);
  }
});
test("pausing freezes an explicitly started examination and resuming continues it", () => {
  const s = createState();
  s.status = "running";
  s.clarity = 1;
  s.pockets.forEach((p) => (p.remaining = 0));
  beginInspection(s);
  advance(s, 1, { ...contact, inField: false });
  const inspected = s.inspectionTime;
  pause(s);
  advance(s, 10, { ...contact, inField: false });
  assert.equal(s.inspectionActive, true);
  assert.equal(s.inspectionTime, inspected);
  s.status = "running";
  advance(s, 1.5, { ...contact, inField: false });
  assert.equal(s.status, "success");
});
