import test from "node:test";
import assert from "node:assert/strict";
import { BoneCut } from "../src/game/bone-cut.ts";

test("bone removal is local and requires sustained cutting", () => {
  const bone = new BoneCut(),
    p = bone.path[0];
  bone.carve(p.x, p.y, 1 / 60);
  assert.ok(bone.at(p.x, p.y) > 0 && bone.at(p.x, p.y) < 0.2);
  assert.equal(bone.at(-p.x, -p.y), 0);
  assert.equal(bone.progress, 0);
  for (let i = 0; i < 30; i++) bone.carve(p.x, p.y, 1 / 60);
  assert.ok(bone.at(p.x, p.y) > 0.99);
  assert.ok(bone.progress < 0.1, "one hole must not free the flap");
});
test("tracing the whole path frees the flap; reset restores rigid bone", () => {
  const bone = new BoneCut();
  for (const p of bone.path)
    for (let i = 0; i < 26; i++) bone.carve(p.x, p.y, 1 / 60);
  assert.ok(bone.progress >= 0.97);
  assert.equal(bone.at(0, 0), 0, "the inner flap remains intact");
  bone.reset();
  assert.equal(bone.progress, 0);
  assert.ok(bone.damage.every((d) => d === 0));
});
test("carving away from the guide changes material without advancing the cut", () => {
  const bone = new BoneCut();
  for (let i = 0; i < 60; i++) bone.carve(0, 0, 1 / 60);
  assert.equal(bone.at(0, 0), 1);
  assert.equal(bone.progress, 0);
  assert.ok(bone.damage.every((d) => d >= 0 && d <= 1));
});
