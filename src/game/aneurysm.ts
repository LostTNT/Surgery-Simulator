import * as THREE from "three";
import type { GameState } from "./simulation.ts";

type Surface = (x: number, y: number) => number;
const titanium = new THREE.MeshStandardMaterial({
  color: 0x7f93ab,
  metalness: 0.92,
  roughness: 0.28,
});
const steel = new THREE.MeshStandardMaterial({
  color: 0x9dadae,
  metalness: 0.94,
  roughness: 0.22,
});
const grip = new THREE.MeshStandardMaterial({
  color: 0x3a4f78,
  metalness: 0.35,
  roughness: 0.45,
});
/** Jaws that close around the aneurysm neck. The tip is the clip centre. */
export function buildClipJaws() {
  const jaws = new THREE.Group();
  jaws.name = "jaws";
  for (const [name, sign] of [["bladeA", 1], ["bladeB", -1]] as const) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.034), titanium);
    blade.name = name;
    blade.position.y = sign * 0.045;
    blade.castShadow = true;
    jaws.add(blade);
  }
  const spring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 8, 20, Math.PI), titanium);
  spring.rotation.z = Math.PI / 2;
  spring.position.x = -0.15;
  spring.castShadow = true;
  jaws.add(spring);
  return jaws;
}
/** Applier plus clip. Pointing the tip, rotating the jaws is done in the engine. */
export function buildClip() {
  const wrapper = new THREE.Group();
  const shaft = new THREE.Group();
  shaft.name = "shaft";
  shaft.rotation.set(0, -0.85, -0.48);
  const part = (g: THREE.BufferGeometry, m: THREE.Material, x: number) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.x = x;
    mesh.rotation.z = Math.PI / 2;
    mesh.castShadow = true;
    shaft.add(mesh);
  };
  part(new THREE.CylinderGeometry(0.014, 0.018, 0.55, 16), steel, 0.3);
  part(new THREE.CylinderGeometry(0.06, 0.03, 0.26, 28), steel, 0.7);
  part(new THREE.CylinderGeometry(0.1, 0.088, 1.05, 36), grip, 1.35);
  part(new THREE.CylinderGeometry(0.078, 0.1, 0.2, 28), steel, 1.97);
  wrapper.add(shaft, buildClipJaws());
  return wrapper;
}
export interface AneurysmObjects {
  group: THREE.Group;
  update: (state: GameState, time: number) => void;
}
export function buildAneurysm(scene: THREE.Scene, surface: Surface): AneurysmObjects {
  const group = new THREE.Group();
  scene.add(group);
  const wall = new THREE.MeshPhysicalMaterial({
    color: 0x9e1f24,
    roughness: 0.22,
    clearcoat: 0.85,
    clearcoatRoughness: 0.16,
    sheen: 0.4,
    sheenColor: new THREE.Color(0xff9d8a),
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17, 40, 28), wall);
  dome.castShadow = dome.receiveShadow = true;
  group.add(dome);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.095, 1, 20), wall);
  neck.castShadow = true;
  group.add(neck);
  const bleb = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 20, 14),
    new THREE.MeshPhysicalMaterial({ color: 0xf0cfae, roughness: 0.2, clearcoat: 1, transparent: true, opacity: 0.9 }),
  );
  group.add(bleb);
  const tetherMat = new THREE.MeshStandardMaterial({ color: 0xb36a58, roughness: 0.5 });
  const tethers: THREE.Mesh[] = [];
  const guideMat = new THREE.MeshBasicMaterial({
    color: 0xd6dfc2,
    transparent: true,
    opacity: 0.8,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.117, 48), guideMat);
  ring.renderOrder = 24;
  group.add(ring);
  const axisLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.2, 0, 0), new THREE.Vector3(0.2, 0, 0)]),
    new THREE.LineDashedMaterial({ color: 0xd6dfc2, dashSize: 0.03, gapSize: 0.02, depthTest: false, transparent: true, opacity: 0.8 }),
  );
  axisLine.computeLineDistances();
  axisLine.renderOrder = 24;
  group.add(axisLine);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshPhysicalMaterial({
      color: 0x6e0b0e,
      roughness: 0.18,
      clearcoat: 1,
      transparent: true,
      opacity: 0.93,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      depthWrite: false,
    }),
  );
  pool.renderOrder = 6;
  group.add(pool);
  const placed = buildClipJaws();
  placed.visible = false;
  group.add(placed);
  let built = "";
  const up = new THREE.Vector3(0, 1, 0);
  function build(state: GameState) {
    const a = state.aneurysm!;
    const [dx, dy] = a.dome,
      [nx, ny] = a.neck;
    const dz = surface(dx, dy) + 0.13;
    dome.position.set(dx, dy, dz);
    const from = new THREE.Vector3(nx, ny, surface(nx, ny) + 0.045),
      to = new THREE.Vector3(dx, dy, dz - 0.02),
      dir = to.clone().sub(from);
    neck.scale.set(1, dir.length(), 1);
    neck.position.copy(from).addScaledVector(dir, 0.5);
    neck.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    tethers.splice(0).forEach((t) => {
      t.geometry.dispose();
      t.removeFromParent();
    });
    for (const b of a.bridges) {
      const start = new THREE.Vector3(dx, dy, dz).add(
          new THREE.Vector3(b.x - dx, b.y - dy, 0).normalize().multiplyScalar(0.15),
        ),
        end = new THREE.Vector3(b.x, b.y, surface(b.x, b.y) + 0.012),
        mid = start.clone().lerp(end, 0.5);
      mid.z += 0.018;
      const t = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start, mid, end), 14, 0.011, 8),
        tetherMat,
      );
      t.castShadow = true;
      group.add(t);
      tethers.push(t);
    }
    built = `${state.entry}:${state.caseId}`;
  }
  const dark = new THREE.Color(0x6b2a2a),
    thin = new THREE.Color(0xe3b8a0),
    base = new THREE.Color(0x9e1f24);
  return {
    group,
    update(state, time) {
      const a = state.aneurysm;
      group.visible = Boolean(a);
      if (!a) return;
      if (built !== `${state.entry}:${state.caseId}`) build(state);
      const pulse = Math.sin((time * Math.PI * 2 * state.vitals.hr) / 60);
      const open = a.phase !== "clipped";
      const swell = open ? 1 + 0.05 * pulse + a.tension * 0.1 : 0.55;
      dome.scale.set(swell, swell, swell * (open ? 1 : 0.7));
      wall.color.copy(base).lerp(open ? thin : dark, open ? a.tension * 0.75 : 1);
      wall.emissive.setRGB(a.tension * 0.2 * (0.7 + 0.3 * pulse), a.tension * 0.04, 0);
      bleb.visible = a.phase === "intact" && a.tension > 0.45;
      bleb.position.copy(dome.position).add(new THREE.Vector3(0.07, 0.04, 0.11));
      bleb.scale.setScalar(0.6 + a.tension * 0.6);
      a.bridges.forEach((b, i) => {
        if (tethers[i]) tethers[i].visible = !b.done;
      });
      pool.visible = a.phase === "ruptured";
      if (pool.visible) {
        pool.position.set(a.dome[0], a.dome[1], surface(a.dome[0], a.dome[1]) + 0.045);
        pool.scale.set(0.3 + state.bleeding * 0.45 + 0.012 * pulse, 0.25 + state.bleeding * 0.38, 1);
      }
      placed.visible = a.phase === "clipped";
      if (placed.visible) {
        placed.position.set(a.clipSpot[0], a.clipSpot[1], surface(a.clipSpot[0], a.clipSpot[1]) + 0.1);
        placed.rotation.z = a.axis;
        (placed.getObjectByName("bladeA") as THREE.Mesh).position.y = 0.016;
        (placed.getObjectByName("bladeB") as THREE.Mesh).position.y = -0.016;
      }
      // Guide: ring on the next task, plus the artery axis for clip alignment.
      const next = a.bridges.find((b) => !b.done);
      const target: [number, number] | null =
        a.phase === "clipped"
          ? null
          : a.phase === "ruptured" && time > a.visibleUntil
            ? a.dome
            : next
              ? [next.x, next.y]
              : a.dissection < 0.9
                ? a.work
                : a.clipSpot;
      ring.visible = Boolean(target) && state.guided && state.status === "running" && a.phase !== "ruptured";
      if (target) ring.position.set(target[0], target[1], surface(target[0], target[1]) + 0.02);
      ring.scale.setScalar(1 + 0.08 * Math.sin(time * 4));
      const aligning = state.tool === "clip" && state.guided && a.phase !== "clipped" && !next && a.dissection >= 0.9;
      axisLine.visible = aligning && state.status === "running";
      axisLine.position.set(a.clipSpot[0], a.clipSpot[1], surface(a.clipSpot[0], a.clipSpot[1]) + 0.02);
      axisLine.rotation.z = a.axis;
    },
  };
}
