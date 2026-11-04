import test from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  tick,
  initializeProcedure,
  pocketsCleared,
  type Contact,
  type CaseId,
  type Difficulty,
} from "../src/game/simulation.ts";

const base: Contact = { clearance: 0.1, inField: true, pocket: 0, vessel: null, shaftContact: false, tip: [0, 0, 0.1], bleedDistance: Infinity };
function start(id: CaseId, difficulty: Difficulty) {
  const s = createState(id, true, 0, difficulty);
  s.status = "running";
  initializeProcedure(s);
  return s;
}
function clear(s: ReturnType<typeof createState>, index: number) {
  s.tool = "suction";
  s.action = true;
  const p = s.pockets[index];
  for (let i = 0; i < 60 * 40 && p.remaining > 0.015; i++) {
    tick(s, { ...base, pocket: index, tip: [p.x, p.y, 0.1] }, 1 / 60);
    if (!s.action) s.action = true;
  }
  s.action = false;
  tick(s, base, 1 / 60);
}
test("resident sees no twists in any washout case", () => {
  for (const id of ["case01", "case03"] as CaseId[]) {
    const s = start(id, "resident");
    s.pockets.forEach((_, i) => clear(s, i));
    assert.equal(s.complicationsTriggered, 0, id);
    assert.ok(pocketsCleared(s));
  }
});
test("attending case 01: clearing the second pocket tears the membrane; bipolar handles it", () => {
  const s = start("case01", "attending");
  clear(s, 0);
  assert.equal(s.complicationsTriggered, 0);
  clear(s, 1);
  assert.equal(s.complicationsTriggered, 1);
  assert.ok(s.bleeding >= 0.4);
  assert.equal(s.sourceControlled, false);
  assert.ok(s.events.some((e) => e.type === "complication"));
  assert.ok(s.callout);
  // fluid removal is blocked until the bleed is controlled
  s.tool = "suction";
  s.action = true;
  const before = s.pockets[2].remaining;
  tick(s, { ...base, pocket: 2 }, 1 / 60);
  assert.equal(s.pockets[2].remaining, before);
  s.tool = "bipolar";
  s.action = true;
  const [bx, by] = s.bleedPosition!;
  for (let i = 0; i < 60 * 8 && !s.sourceControlled; i++)
    tick(s, { ...base, tip: [bx, by, 0.1], bleedDistance: 0 }, 1 / 60);
  assert.equal(s.sourceControlled, true);
  assert.equal(s.complicationsHandled, 1);
});
test("a refill twist re-collects a pocket and is handled when it is cleared again", () => {
  const s = start("case03", "attending");
  clear(s, 0);
  clear(s, 1);
  clear(s, 2);
  assert.equal(s.complicationsTriggered, 1);
  assert.ok(s.pockets[0].remaining > 0.5);
  assert.equal(pocketsCleared(s), false);
  clear(s, 0);
  tick(s, base, 1 / 60);
  assert.equal(s.complicationsHandled, 1);
});
test("chief sees an extra twist that attending does not", () => {
  const attending = start("case01", "attending");
  const chief = start("case01", "chief");
  for (const s of [attending, chief]) {
    for (let i = 0; i < 4; i++) {
      clear(s, i);
      if (s.bleeding > 0.025 && s.bleedPosition) {
        s.tool = "bipolar";
        s.action = true;
        const [bx, by] = s.bleedPosition;
        for (let k = 0; k < 60 * 10 && !s.sourceControlled; k++)
          tick(s, { ...base, tip: [bx, by, 0.1], bleedDistance: 0 }, 1 / 60);
        s.action = false;
      }
    }
  }
  assert.equal(attending.complicationsTriggered, 1);
  assert.equal(chief.complicationsTriggered, 2);
});
test("twists fire once only", () => {
  const s = start("case01", "attending");
  clear(s, 0);
  clear(s, 1);
  const n = s.complicationsTriggered;
  for (let i = 0; i < 120; i++) tick(s, base, 1 / 60);
  assert.equal(s.complicationsTriggered, n);
});
