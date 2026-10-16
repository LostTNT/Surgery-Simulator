import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Tool } from "./simulation";
export const TRAY_TOOLS: Tool[] = ["drill", "suction", "irrigation", "bipolar"];
export class InstrumentTray {
  group = new THREE.Group();
  models = new Map<Tool, THREE.Group>();
  slots = TRAY_TOOLS.map((tool, i) => ({
    tool,
    x: 2.25,
    y: -1.65 + i * 0.86,
    z: 0.3,
  }));
  constructor(
    scene: THREE.Scene,
    models: Partial<Record<Tool, THREE.Group>>,
    drape: THREE.Texture,
  ) {
    const metal = new THREE.MeshStandardMaterial({
      color: 0x9aa5a5,
      metalness: 0.9,
      roughness: 0.28,
      envMapIntensity: 0.7,
    });
    const base = new THREE.Mesh(
      new RoundedBoxGeometry(3.15, 3.75, 0.1, 3, 0.06),
      metal,
    );
    base.position.set(3.6, -0.35, 0.12);
    base.receiveShadow = true;
    base.userData.tray = true;
    this.group.add(base);
    const fabric = drape.clone();
    fabric.repeat.set(2, 2);
    fabric.needsUpdate = true;
    const liner = new THREE.Mesh(
      new RoundedBoxGeometry(2.96, 3.55, 0.025, 2, 0.035),
      new THREE.MeshStandardMaterial({
        map: fabric,
        color: 0x456b61,
        roughness: 0.95,
      }),
    );
    liner.position.set(3.6, -0.35, 0.185);
    liner.receiveShadow = true;
    liner.userData.tray = true;
    this.group.add(liner);
    for (const slot of this.slots) {
      const model = models[slot.tool]!.clone();
      model.visible = true;
      model.rotation.set(0, 0, 0);
      model.position.set(slot.x, slot.y, slot.z);
      model.userData.tool = slot.tool;
      this.models.set(slot.tool, model);
      this.group.add(model);
    }
    scene.add(this.group);
  }
  update(held: Tool | null) {
    for (const [tool, model] of this.models) model.visible = held !== tool;
  }
  hit(ray: THREE.Raycaster) {
    const hit = ray.intersectObject(this.group, true).find((hit) => {
      let item: THREE.Object3D | null = hit.object;
      while (item && item !== this.group) {
        if (!item.visible) return false;
        item = item.parent;
      }
      return true;
    });
    if (!hit) return null;
    let item: THREE.Object3D | null = hit.object;
    while (item && item !== this.group) {
      if (item.userData.tool) return item.userData.tool as Tool;
      item = item.parent;
    }
    return "place" as const;
  }
}
