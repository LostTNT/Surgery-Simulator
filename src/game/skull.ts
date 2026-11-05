import * as THREE from "three";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";

/** Scalp thickness in field units (about 6 mm). The bone lies this far under the skin. */
export const SCALP_THICKNESS = 0.17;
/** Where the table drape lies, well below the head. */
export const TABLE_Z = -4.6;
/** The incision, as an ellipse radius in field units: the scanned skin is removed inside this. */
export const WINDOW_RADIUS = 2.12;

/**
 * The patient's skull: scalp height as a function of position, sampled from the
 * scanned head. The bone, the scalp layers and the drape all follow this surface,
 * so the operative field sits on a real curved head instead of a flat plate.
 * Without a head (loading failed) it falls back to a gentle dome.
 */
export class Skull {
  private grid: Float32Array | null = null;
  private readonly x0 = -8;
  private readonly y0 = -9;
  private readonly step = 0.1;
  private readonly nx = 161;
  private readonly ny = 181;
  /** Raw height of the head surface, or NaN where there is no head. */
  headTop(x: number, y: number): number {
    if (!this.grid) return NaN;
    const fx = (x - this.x0) / this.step,
      fy = (y - this.y0) / this.step;
    const ix = Math.floor(fx),
      iy = Math.floor(fy);
    if (ix < 0 || iy < 0 || ix >= this.nx - 1 || iy >= this.ny - 1) return NaN;
    const tx = fx - ix,
      ty = fy - iy,
      g = this.grid,
      i = iy * this.nx + ix;
    const a = g[i],
      b = g[i + 1],
      c = g[i + this.nx],
      d = g[i + this.nx + 1];
    if (Number.isNaN(a + b + c + d)) {
      // Near the silhouette: use the nearest valid corner so the drape does not tear.
      const v = [a, b, c, d].find((n) => !Number.isNaN(n));
      return v ?? NaN;
    }
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  private fallback(x: number, y: number) {
    const r2 = (x * x) / (1.67 * 1.67) + (y * y) / (1.39 * 1.39);
    return 0.46 + 0.18 * Math.max(0, 1 - r2) - 0.03 * (x * x + y * y);
  }
  get hasHead() {
    return this.grid !== null;
  }
  /** Top of the scalp skin. */
  scalp(x: number, y: number) {
    const h = this.headTop(x, y);
    return Number.isNaN(h) ? this.fallback(x, y) + SCALP_THICKNESS : h;
  }
  /** Outer surface of the bone, under the scalp. */
  bone(x: number, y: number) {
    return this.scalp(x, y) - SCALP_THICKNESS;
  }
  /** Surface the drape lies on: over the head where there is one, otherwise down on the table. */
  drape(x: number, y: number) {
    // Take the highest point nearby so the cloth never dips under a bump of the skin.
    let h = NaN;
    for (const [dx, dy] of [[0, 0], [0.18, 0], [-0.18, 0], [0, 0.18], [0, -0.18], [0.13, 0.13], [-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13]]) {
      const v = this.headTop(x + dx, y + dy);
      if (!Number.isNaN(v) && (Number.isNaN(h) || v > h)) h = v;
    }
    return Number.isNaN(h) ? TABLE_Z : Math.max(TABLE_Z, h + 0.07);
  }
  /** Sample the head by casting rays straight down over a grid. */
  build(mesh: THREE.Mesh) {
    mesh.updateMatrixWorld(true);
    if (!mesh.geometry.boundsTree) mesh.geometry.boundsTree = new MeshBVH(mesh.geometry);
    mesh.raycast = acceleratedRaycast;
    const ray = new THREE.Raycaster(),
      down = new THREE.Vector3(0, 0, -1),
      origin = new THREE.Vector3(),
      grid = new Float32Array(this.nx * this.ny);
    ray.firstHitOnly = true;
    for (let j = 0; j < this.ny; j++)
      for (let i = 0; i < this.nx; i++) {
        origin.set(this.x0 + i * this.step, this.y0 + j * this.step, 12);
        ray.set(origin, down);
        const hit = ray.intersectObject(mesh, false)[0];
        grid[j * this.nx + i] = hit ? hit.point.z : NaN;
      }
    this.grid = grid;
  }
}
