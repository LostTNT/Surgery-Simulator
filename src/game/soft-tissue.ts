import * as THREE from "three";
import type { MeshBVH } from "three-mesh-bvh";
// Local damped springs give tissue a yielding response. Bone uses permanent
// material removal instead; the two surfaces intentionally behave differently.
export class SoftTissue {
  base: Float32Array;
  offset: Float32Array;
  velocity: Float32Array;
  moving = false;
  mesh: THREE.Mesh;
  constructor(mesh: THREE.Mesh) {
    this.mesh = mesh;
    this.base = new Float32Array(mesh.geometry.attributes.position.array);
    this.offset = new Float32Array(this.base.length / 3);
    this.velocity = new Float32Array(this.offset.length);
  }
  update(tip: THREE.Vector3, clearance: number, active: boolean, dt: number) {
    const pressure = active
      ? THREE.MathUtils.clamp((0.075 - clearance) * 2.5, 0, 0.13)
      : 0;
    if (!this.moving && pressure === 0) return;
    const position = this.mesh.geometry.attributes.position;
    let moving = false;
    for (let i = 0; i < this.offset.length; i++) {
      const x = this.base[i * 3],
        y = this.base[i * 3 + 1],
        d2 = (x - tip.x) ** 2 + (y - tip.y) ** 2,
        target = d2 < 0.07 ? -pressure * Math.exp(-d2 / 0.014) : 0;
      this.velocity[i] +=
        ((target - this.offset[i]) * 65 - this.velocity[i] * 13) * dt;
      this.offset[i] += this.velocity[i] * dt;
      if (Math.abs(this.offset[i]) + Math.abs(this.velocity[i]) > 0.00002)
        moving = true;
      else {
        this.offset[i] = 0;
        this.velocity[i] = 0;
      }
      position.setZ(i, this.base[i * 3 + 2] + this.offset[i]);
    }
    position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    (this.mesh.geometry.boundsTree as MeshBVH)?.refit();
    this.moving = moving;
  }
  reset() {
    this.offset.fill(0);
    this.velocity.fill(0);
    this.mesh.geometry.attributes.position.array.set(this.base);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    (this.mesh.geometry.boundsTree as MeshBVH)?.refit();
    this.moving = false;
  }
}
