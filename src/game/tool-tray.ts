import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Tool } from "./simulation";
export const TRAY_TOOLS: Tool[] = ["drill", "suction", "irrigation", "bipolar"];
export const CLIP_TRAY_TOOLS: Tool[] = ["suction", "bipolar", "clip"];
export const TUMOR_TRAY_TOOLS: Tool[] = ["suction", "bipolar"];
const ALL_TOOLS: Tool[] = [...TRAY_TOOLS, "clip"];
function layout(tools: Tool[]) {
  const step = tools.length > 4 ? 0.72 : 0.86,
    start = tools.length > 4 ? -1.9 : -1.65;
  return tools.map((tool, i) => ({ tool, x: 2.25, y: start + i * step, z: 0.3 }));
}
export class InstrumentTray {
  group = new THREE.Group();
  models = new Map<Tool, THREE.Group>();
  tools: Tool[] = TRAY_TOOLS;
  slots = layout(TRAY_TOOLS);
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
    for (const tool of ALL_TOOLS) {
      const source = models[tool];
      if (!source) continue;
      const model = source.clone();
      model.visible = true;
      model.rotation.set(0, 0, 0);
      // The applier lies flat on the tray with the clip open and square.
      model.getObjectByName("shaft")?.rotation.set(0, 0, 0);
      model.userData.tool = tool;
      this.models.set(tool, model);
      this.group.add(model);
    }
    this.setTools(TRAY_TOOLS);
    scene.add(this.group);
  }
  /** Choose which instruments this procedure lays out, and where. */
  setTools(tools: Tool[]) {
    this.tools = tools;
    this.slots = layout(tools);
    for (const slot of this.slots)
      this.models.get(slot.tool)?.position.set(slot.x, slot.y, slot.z);
  }
  update(held: Tool | null) {
    for (const [tool, model] of this.models)
      model.visible = held !== tool && this.tools.includes(tool);
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
