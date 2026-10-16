import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { InstrumentTray, TRAY_TOOLS } from "../src/game/tool-tray.ts";
import type { Tool } from "../src/game/simulation.ts";
function setup() {
  const scene = new THREE.Scene(),
    models: Partial<Record<Tool, THREE.Group>> = {};
  for (const tool of TRAY_TOOLS) {
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.12, 0.12),
        new THREE.MeshBasicMaterial(),
      ),
    );
    models[tool] = group;
  }
  const tray = new InstrumentTray(scene, models, new THREE.Texture());
  scene.updateMatrixWorld(true);
  return tray;
}
test("a visible instrument can be picked through its 3D geometry", () => {
  const tray = setup(),
    slot = tray.slots[0];
  const ray = new THREE.Raycaster(
    new THREE.Vector3(slot.x, slot.y, 2),
    new THREE.Vector3(0, 0, -1),
  );
  assert.equal(tray.hit(ray), "drill");
});
test("a held instrument leaves a real empty tray slot that accepts placement", () => {
  const tray = setup(),
    slot = tray.slots[0];
  tray.update("drill");
  const ray = new THREE.Raycaster(
    new THREE.Vector3(slot.x, slot.y, 2),
    new THREE.Vector3(0, 0, -1),
  );
  assert.equal(tray.hit(ray), "place");
  tray.update(null);
  assert.equal(tray.hit(ray), "drill");
});
