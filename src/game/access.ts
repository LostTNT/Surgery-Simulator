import * as THREE from "three";
import { BoneCut, CUT_RX, CUT_RY } from "./bone-cut";
export class BoneWindow {
  cut = new BoneCut();
  geometry = new THREE.BufferGeometry();
  mesh: THREE.Mesh;
  flap: THREE.Mesh | null = null;
  path: THREE.Points;
  dust: THREE.Points;
  dustPositions = new Float32Array(90 * 3);
  particles = Array.from({ length: 90 }, () => ({
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    life: 0,
  }));
  particleIndex = 0;
  geometryDirty = false;
  liftTime = -1;
  positions: Float32Array;
  colors: Float32Array;
  constructor(scene: THREE.Scene, texture: THREE.Texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const count = this.cut.damage.length;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = this.cut.x(i),
        y = this.cut.y(i),
        edge = Math.max(
          1,
          Math.sqrt((x * x) / (1.83 * 1.83) + (y * y) / (1.54 * 1.54)),
        );
      this.positions[i * 3] = x / edge;
      this.positions[i * 3 + 1] = y / edge;
      uv[i * 2] = x / 3.8 + 0.5;
      uv[i * 2 + 1] = y / 3.2 + 0.5;
    }
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    this.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(this.colors, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.mesh = new THREE.Mesh(
      this.geometry,
      new THREE.MeshStandardMaterial({
        map: texture,
        bumpMap: texture,
        bumpScale: 0.024,
        color: 0xd5bf96,
        roughness: 0.66,
        vertexColors: true,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    const points = new Float32Array(this.cut.path.length * 3);
    this.cut.path.forEach((p, i) => {
      points[i * 3] = p.x;
      points[i * 3 + 1] = p.y;
      points[i * 3 + 2] = this.height(p.x, p.y) + 0.009;
    });
    const pathGeometry = new THREE.BufferGeometry();
    pathGeometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
    pathGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(points.length).fill(1), 3),
    );
    this.path = new THREE.Points(
      pathGeometry,
      new THREE.PointsMaterial({
        size: 0.055,
        vertexColors: true,
        color: 0x375c46,
        depthTest: false,
        transparent: true,
        opacity: 1,
      }),
    );
    this.path.visible = false;
    scene.add(this.path);
    const dustGeometry = new THREE.BufferGeometry();
    this.dustPositions.fill(100);
    dustGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.dustPositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.dust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        size: 0.018,
        color: 0xe7d6b3,
        transparent: true,
        opacity: 0.8,
      }),
    );
    scene.add(this.dust);
    this.rebuild();
  }
  height(x: number, y: number) {
    return (
      0.36 +
      0.18 * Math.max(0, 1 - (x * x) / (1.67 * 1.67) - (y * y) / (1.39 * 1.39))
    );
  }
  rebuild(outerOnly = false) {
    const indices: number[] = [];
    for (let i = 0; i < this.cut.damage.length; i++) {
      let x = this.cut.x(i),
        y = this.cut.y(i);
      const edge = Math.max(
        1,
        Math.sqrt((x * x) / (1.83 * 1.83) + (y * y) / (1.54 * 1.54)),
      );
      x /= edge;
      y /= edge;
      if (outerOnly) {
        const r = Math.sqrt(
          (x * x) / (CUT_RX * CUT_RX) + (y * y) / (CUT_RY * CUT_RY),
        );
        if (r > 0 && r < 1) {
          x /= r;
          y /= r;
        }
      }
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] =
        this.height(this.positions[i * 3], this.positions[i * 3 + 1]) -
        this.cut.damage[i] * 0.16;
      const shade = 1 - this.cut.damage[i] * 0.48;
      this.colors[i * 3] = shade;
      this.colors[i * 3 + 1] = shade;
      this.colors[i * 3 + 2] = shade;
    }
    const n = this.cut.columns + 1;
    for (let j = 0; j < this.cut.rows; j++)
      for (let k = 0; k < this.cut.columns; k++) {
        const a = j * n + k,
          b = a + 1,
          c = a + n,
          d = c + 1;
        if (
          outerOnly &&
          [a, b, c, d].every(
            (i) =>
              this.cut.x(i) ** 2 / (CUT_RX * CUT_RX) +
                this.cut.y(i) ** 2 / (CUT_RY * CUT_RY) <
              1,
          )
        )
          continue;
        if (
          (this.cut.damage[a] + this.cut.damage[b] + this.cut.damage[c]) / 3 <
          0.9
        )
          indices.push(a, b, c);
        if (
          (this.cut.damage[b] + this.cut.damage[d] + this.cut.damage[c]) / 3 <
          0.9
        )
          indices.push(b, d, c);
      }
    this.geometry.setIndex(indices);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
    const colors = this.path.geometry.attributes.color;
    this.cut.path.forEach((p, i) => {
      const done = this.cut.at(p.x, p.y) > 0.82;
      colors.setXYZ(i, done ? 0.2 : 1, done ? 0.65 : 1, done ? 0.32 : 1);
    });
    colors.needsUpdate = true;
  }
  carve(x: number, y: number, dt: number) {
    if (this.liftTime >= 0) return;
    if (this.cut.carve(x, y, dt)) {
      this.geometryDirty = true;
      for (let i = 0; i < 3; i++) {
        const p = this.particles[this.particleIndex++ % this.particles.length];
        p.life = 0.5 + Math.random() * 0.5;
        p.p.set(x, y, this.height(x, y) - 0.02);
        p.v.set(
          (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 0.6,
          0.3 + Math.random() * 0.5,
        );
      }
    }
  }
  lift() {
    if (this.cut.progress < 0.97 || this.liftTime >= 0) return false;
    const geometry = this.geometry.clone(),
      old = this.geometry.index!,
      indices: number[] = [];
    for (let i = 0; i < old.count; i += 3) {
      const a = old.getX(i),
        x = this.cut.x(a),
        y = this.cut.y(a);
      if ((x * x) / (CUT_RX * CUT_RX) + (y * y) / (CUT_RY * CUT_RY) < 1)
        indices.push(a, old.getX(i + 1), old.getX(i + 2));
    }
    geometry.setIndex(indices);
    this.flap = new THREE.Mesh(geometry, this.mesh.material);
    this.flap.castShadow = true;
    this.mesh.parent?.add(this.flap);
    this.rebuild(true);
    this.liftTime = 0;
    this.path.visible = false;
    return true;
  }
  update(dt: number) {
    if (this.geometryDirty) {
      this.rebuild();
      this.geometryDirty = false;
    }
    if (this.liftTime >= 0 && this.flap) {
      this.liftTime += dt;
      const t = THREE.MathUtils.smoothstep(this.liftTime, 0, 1.3);
      this.flap.position.set(-t * 3.5, t * 1.4, t * 2);
      this.flap.rotation.set(t * 0.6, t * 0.7, t * -0.3);
      this.flap.visible = this.liftTime < 1.5;
    }
    this.particles.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= dt;
        p.v.z -= dt * 1.8;
        p.p.addScaledVector(p.v, dt);
        const floor = this.height(p.p.x, p.p.y);
        if (p.p.z < floor && this.cut.at(p.p.x, p.p.y) < 0.8) {
          p.p.z = floor + 0.004;
          p.v.z = Math.abs(p.v.z) * 0.25;
          p.v.x *= 0.7;
          p.v.y *= 0.7;
        }
        this.dustPositions.set(p.p.toArray(), i * 3);
      } else this.dustPositions.set([100, 100, 100], i * 3);
    });
    this.dust.geometry.attributes.position.needsUpdate = true;
  }
  reset() {
    this.cut.reset();
    this.flap?.geometry.dispose();
    this.flap?.removeFromParent();
    this.flap = null;
    this.liftTime = -1;
    this.path.visible = false;
    this.rebuild();
  }
}

export function buildBurr() {
  const group = new THREE.Group(),
    steel = new THREE.MeshStandardMaterial({
      color: 0x9dadae,
      metalness: 0.94,
      roughness: 0.22,
    }),
    grip = new THREE.MeshStandardMaterial({
      color: 0x31575f,
      metalness: 0.35,
      roughness: 0.43,
    });
  const part = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
  ) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.x = x;
    m.rotation.z = Math.PI / 2;
    m.castShadow = true;
    group.add(m);
    return m;
  };
  const head = part(new THREE.SphereGeometry(0.056, 24, 16), steel, 0);
  head.scale.set(1, 0.95, 1);
  const groove = new THREE.MeshStandardMaterial({
    color: 0x4b5a59,
    metalness: 0.8,
    roughness: 0.36,
  });
  for (let i = 0; i < 7; i++) {
    const flute = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.0018, 4, 28),
      groove,
    );
    flute.rotation.set(0, (i / 7) * Math.PI, Math.PI / 3);
    head.add(flute);
  }
  part(new THREE.CylinderGeometry(0.018, 0.022, 0.5, 20), steel, 0.28);
  part(new THREE.CylinderGeometry(0.07, 0.035, 0.3, 32), steel, 0.65);
  part(new THREE.CylinderGeometry(0.11, 0.095, 1.15, 40), grip, 1.35);
  part(new THREE.CylinderGeometry(0.087, 0.11, 0.22, 32), steel, 2.03);
  for (let i = 0; i < 12; i++) {
    const ring = part(
      new THREE.TorusGeometry(0.108, 0.004, 6, 32),
      steel,
      1 + i * 0.065,
    );
    ring.rotation.y = Math.PI / 2;
    ring.rotation.z = 0;
  }
  return group;
}
