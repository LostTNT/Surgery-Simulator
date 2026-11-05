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
  private drapeGrid: Float32Array | null = null;
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
  /** Surface the drape lies on: over the head, tenting smoothly down to the table. */
  drape(x: number, y: number) {
    const g = this.drapeGrid;
    if (!g) return TABLE_Z;
    const fx = (x - this.x0) / this.step,
      fy = (y - this.y0) / this.step;
    const ix = Math.floor(fx),
      iy = Math.floor(fy);
    if (ix < 0 || iy < 0 || ix >= this.nx - 1 || iy >= this.ny - 1) return TABLE_Z;
    const tx = fx - ix,
      ty = fy - iy,
      i = iy * this.nx + ix;
    return (
      (g[i] * (1 - tx) + g[i + 1] * tx) * (1 - ty) +
      (g[i + this.nx] * (1 - tx) + g[i + this.nx + 1] * tx) * ty
    );
  }
  /** Cloth heights: the head surface plus a margin, relaxed outward with a gentle slope. */
  private buildDrape(head: Float32Array) {
    const nx = this.nx,
      ny = this.ny,
      slope = 1.1 * this.step;
    let d = new Float32Array(head.length);
    // Start from the raw (unsmoothed) scan, widened by one cell, so no bump of the skin
    // can poke through the cloth.
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        let h = NaN;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ii = i + di,
              jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
            const v = head[jj * nx + ii];
            if (!Number.isNaN(v) && (Number.isNaN(h) || v > h)) h = v;
          }
        d[j * nx + i] = Number.isNaN(h) ? TABLE_Z : Math.max(TABLE_Z, h + 0.08);
      }
    const relax = (i: number, j: number, di: number, dj: number, cost: number) => {
      const ii = i + di,
        jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) return;
      const v = d[jj * nx + ii] - cost;
      if (v > d[j * nx + i]) d[j * nx + i] = v;
    };
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          relax(i, j, -1, 0, slope);
          relax(i, j, 0, -1, slope);
          relax(i, j, -1, -1, slope * 1.41);
          relax(i, j, 1, -1, slope * 1.41);
        }
      for (let j = ny - 1; j >= 0; j--)
        for (let i = nx - 1; i >= 0; i--) {
          relax(i, j, 1, 0, slope);
          relax(i, j, 0, 1, slope);
          relax(i, j, 1, 1, slope * 1.41);
          relax(i, j, -1, 1, slope * 1.41);
        }
    }
    // Soften, then make sure the cloth still clears the skin everywhere.
    for (let pass = 0; pass < 4; pass++) {
      const out = new Float32Array(d.length);
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          let sum = 0,
            w = 0;
          for (let dj = -1; dj <= 1; dj++)
            for (let di = -1; di <= 1; di++) {
              const ii = i + di,
                jj = j + dj;
              if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
              const wt = di === 0 && dj === 0 ? 4 : di === 0 || dj === 0 ? 2 : 1;
              sum += d[jj * nx + ii] * wt;
              w += wt;
            }
          out[j * nx + i] = sum / w;
        }
      d = out;
    }
    for (let k = 0; k < d.length; k++)
      if (!Number.isNaN(head[k])) d[k] = Math.max(d[k], head[k] + 0.06);
    this.drapeGrid = d;
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
    // The scan is a coarse mesh: smooth the sampled heights so the layered scalp
    // edge and the bone follow a clean curve instead of the triangle facets.
    let src = grid;
    for (let pass = 0; pass < 5; pass++) {
      const out = new Float32Array(src.length);
      for (let j = 0; j < this.ny; j++)
        for (let i = 0; i < this.nx; i++) {
          const k = j * this.nx + i;
          if (Number.isNaN(src[k])) {
            out[k] = NaN;
            continue;
          }
          let sum = 0,
            w = 0;
          for (let dj = -1; dj <= 1; dj++)
            for (let di = -1; di <= 1; di++) {
              const ii = i + di,
                jj = j + dj;
              if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.ny) continue;
              const v = src[jj * this.nx + ii];
              if (Number.isNaN(v)) continue;
              const wt = di === 0 && dj === 0 ? 4 : di === 0 || dj === 0 ? 2 : 1;
              sum += v * wt;
              w += wt;
            }
          out[k] = sum / w;
        }
      src = out;
    }
    this.grid = src;
    this.buildDrape(grid);
  }
}
