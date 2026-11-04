import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { POCKET_CLEAR_THRESHOLD, type GameState } from "./simulation.ts";

type Surface = (x: number, y: number) => number;
export interface TumorObjects {
  group: THREE.Group;
  update: (state: GameState, time: number) => void;
}
function lobuleGeometry(seed: number) {
  const g = new THREE.SphereGeometry(1, 40, 28);
  const pos = g.attributes.position,
    colors: number[] = [],
    a = new THREE.Color(0xdcc08c),
    b = new THREE.Color(0xc29866),
    c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const bump =
      1 +
      0.07 * Math.sin(x * 5 + seed) * Math.sin(y * 4.3 + seed * 1.7) +
      0.045 * Math.sin(z * 9 + seed * 2.3);
    pos.setXYZ(i, x * bump, y * bump, z * bump);
    c.copy(a).lerp(b, 0.5 + 0.5 * Math.sin(x * 7 + y * 6 + seed));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}
export function buildTumor(
  scene: THREE.Scene,
  surface: Surface,
  cortex: THREE.Mesh,
): TumorObjects {
  const group = new THREE.Group();
  scene.add(group);
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.46,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
    sheen: 0.3,
    sheenColor: new THREE.Color(0xfff0c8),
  });
  const lobules: THREE.Mesh[] = [];
  const feederMat = new THREE.MeshPhysicalMaterial({ color: 0xe2483a, roughness: 0.28, clearcoat: 0.8, emissive: 0x661510 });
  const feeders: THREE.Mesh[] = [];
  const mask = document.createElement("canvas");
  mask.width = mask.height = 128;
  const mctx = mask.getContext("2d")!,
    mgrad = mctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  mgrad.addColorStop(0, "#9a9a9a");
  mgrad.addColorStop(0.78, "#c8c8c8");
  mgrad.addColorStop(0.9, "#ffffff");
  mgrad.addColorStop(1, "#000000");
  mctx.fillStyle = mgrad;
  mctx.fillRect(0, 0, 128, 128);
  const motorMat = new THREE.MeshBasicMaterial({
    color: 0x2fe08a,
    alphaMap: new THREE.CanvasTexture(mask),
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    side: THREE.DoubleSide,
  });
  let motor: THREE.Mesh | null = null;
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xd6dfc2,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.117, 48), ringMat);
  ring.renderOrder = 24;
  group.add(ring);
  let built = "";
  function build(state: GameState) {
    for (const m of [...lobules, ...feeders, ...(motor ? [motor] : [])]) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    lobules.length = feeders.length = 0;
    state.pockets.forEach((p, i) => {
      const m = new THREE.Mesh(lobuleGeometry(i * 3.1), material);
      m.castShadow = m.receiveShadow = true;
      m.userData.base = [p.x, p.y, p.radius];
      group.add(m);
      lobules.push(m);
    });
    const t = state.tumor!;
    t.feeders.forEach((f, i) => {
      const target = state.pockets.find((_, j) => t.link[j] === i) ?? state.pockets[0];
      const start = new THREE.Vector3(f.x, f.y, surface(f.x, f.y) + 0.05);
      const toward = new THREE.Vector3(target.x - f.x, target.y - f.y, 0).normalize();
      const end = new THREE.Vector3(
        target.x - toward.x * target.radius * 0.6,
        target.y - toward.y * target.radius * 0.6,
        surface(target.x, target.y) + 0.1,
      );
      const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0, 0.07));
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start, mid, end), 20, 0.026, 8),
        feederMat,
      );
      tube.castShadow = true;
      group.add(tube);
      feeders.push(tube);
    });
    const m = t.motor;
    motor = new THREE.Mesh(
      new DecalGeometry(
        cortex,
        new THREE.Vector3(m.x, m.y, surface(m.x, m.y)),
        new THREE.Euler(0, 0, 0),
        new THREE.Vector3(m.rx * 2.1, m.ry * 2.1, 2),
      ),
      motorMat,
    );
    motor.renderOrder = 3;
    group.add(motor);
    built = `${state.entry}:${state.caseId}`;
  }
  return {
    group,
    update(state, time) {
      const t = state.tumor;
      group.visible = Boolean(t);
      if (!t) return;
      if (built !== `${state.entry}:${state.caseId}`) build(state);
      state.pockets.forEach((p, i) => {
        const m = lobules[i];
        if (!m) return;
        const [x, y, r] = m.userData.base as [number, number, number];
        const f = THREE.MathUtils.lerp(0.28, 1, Math.pow(p.remaining, 0.6));
        m.visible = p.remaining > POCKET_CLEAR_THRESHOLD;
        const rx = r * 0.82 * f,
          ry = r * 0.7 * f,
          rz = r * 0.4 * f;
        m.scale.set(rx, ry, rz);
        m.position.set(x, y, surface(x, y) + rz * 0.55);
      });
      t.feeders.forEach((f, i) => {
        if (feeders[i]) feeders[i].visible = !f.done;
      });
      if (motor) {
        const hot = state.action && (state.tool === "suction" || state.tool === "bipolar");
        motor.visible = state.difficulty !== "chief" || state.showAnatomy;
        motorMat.opacity = 0.36 + 0.07 * Math.sin(time * 2) + (hot ? 0.08 : 0);
      }
      const next = t.feeders.find((f) => !f.done && !f.bleeding);
      ring.visible = state.guided && state.status === "running" && Boolean(next);
      if (next) ring.position.set(next.x, next.y, surface(next.x, next.y) + 0.1);
      ring.scale.setScalar(1 + 0.08 * Math.sin(time * 4));
    },
  };
}
