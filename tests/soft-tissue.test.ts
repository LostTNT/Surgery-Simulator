import test from "node:test";
import assert from "node:assert/strict";
import { Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from "three";
import { SoftTissue } from "../src/game/soft-tissue.ts";

test("soft tissue yields locally under pressure and rebounds when released", () => {
  const mesh = new Mesh(
    new PlaneGeometry(2, 2, 20, 20),
    new MeshBasicMaterial(),
  );
  const tissue = new SoftTissue(mesh),
    tip = new Vector3(0, 0, 0);
  const position = mesh.geometry.attributes.position;
  const center = 220;
  for (let i = 0; i < 60; i++) tissue.update(tip, 0, true, 1 / 60);
  assert.ok(position.getZ(center) < -0.1);
  assert.ok(Math.abs(position.getZ(0)) < 0.001, "distant tissue stays still");
  for (let i = 0; i < 180; i++) tissue.update(tip, 0.38, false, 1 / 60);
  assert.ok(Math.abs(position.getZ(center)) < 0.001);
  assert.ok([...position.array].every(Number.isFinite));
  tissue.reset();
  assert.equal(position.getZ(center), 0);
});
