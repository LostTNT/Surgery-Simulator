import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import type { GameState } from "./simulation.ts";

type Surface = (x: number, y: number) => number;
export interface WoundObjects {
  update: (state: GameState, time: number) => void;
}
const SPURT = 90;
/**
 * Lasting consequences on the field: bruises where tissue was hurt, blood that
 * spurts with the heartbeat, and a pool that grows with the blood lost.
 */
export function buildWounds(
  scene: THREE.Scene,
  surface: Surface,
  cortex: THREE.Mesh,
): WoundObjects {
  const group = new THREE.Group();
  scene.add(group);
  const mask = document.createElement("canvas");
  mask.width = mask.height = 64;
  const ctx = mask.getContext("2d")!,
    gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.55, "#bbbbbb");
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const alpha = new THREE.CanvasTexture(mask);
  const bruiseMat = new THREE.MeshBasicMaterial({
    color: 0x3e0714,
    alphaMap: alpha,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    side: THREE.DoubleSide,
  });
  const bruises: THREE.Mesh[] = [];
  const seen = new Set<string>();
  const poolMat = new THREE.MeshPhysicalMaterial({
    color: 0x5c070b,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  });
  const pool = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12), poolMat);
  pool.scale.set(0.2, 0.2, 0.012);
  pool.visible = false;
  pool.castShadow = false;
  group.add(pool);
  const spurtGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(SPURT * 3);
  spurtGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const spurt = new THREE.Points(
    spurtGeo,
    new THREE.PointsMaterial({
      color: 0xa3141a,
      size: 0.03,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  spurt.frustumCulled = false;
  spurt.visible = false;
  group.add(spurt);
  let built = "";
  let lastBleed: [number, number] | null = null;
  function clear() {
    for (const b of bruises) {
      b.geometry.dispose();
      b.removeFromParent();
    }
    bruises.length = 0;
    seen.clear();
    lastBleed = null;
  }
  return {
    update(state, time) {
      group.visible = !state.drain;
      if (state.drain) return;
      const key = `${state.entry}:${state.caseId}`;
      if (key !== built) {
        built = key;
        clear();
      }
      for (const e of state.events) {
        if (e.type !== "injury" || !e.position) continue;
        const id = `${e.time}|${e.detail}`;
        if (seen.has(id)) continue;
        seen.add(id);
        if (bruises.length >= 14) continue;
        const [x, y] = e.position;
        const bruise = new THREE.Mesh(
          new DecalGeometry(
            cortex,
            new THREE.Vector3(x, y, surface(x, y)),
            new THREE.Euler(0, 0, 0),
            new THREE.Vector3(0.3, 0.26, 1.6),
          ),
          bruiseMat,
        );
        bruise.renderOrder = 4;
        group.add(bruise);
        bruises.push(bruise);
      }
      const bp = state.bleedPosition;
      const flowing = bp !== null && state.bleeding >= 0.05 && state.status === "running";
      if (bp) lastBleed = [bp[0], bp[1]];
      const beat = Math.max(0, Math.sin((time * Math.PI * 2 * state.vitals.hr) / 60));
      spurt.visible = Boolean(flowing && bp);
      if (spurt.visible && bp) {
        const strength = 0.35 + state.bleeding * 0.9;
        const base = surface(bp[0], bp[1]) + 0.03;
        for (let i = 0; i < SPURT; i++) {
          const phase = (i / SPURT + time * (0.8 + state.bleeding)) % 1;
          const a = i * 2.399,
            r = phase * 0.26 * strength * (0.5 + 0.5 * beat);
          positions[i * 3] = bp[0] + Math.cos(a) * r;
          positions[i * 3 + 1] = bp[1] + Math.sin(a) * r;
          positions[i * 3 + 2] =
            base + Math.sin(phase * Math.PI) * 0.34 * strength * (0.45 + 0.55 * beat);
        }
        spurtGeo.attributes.position.needsUpdate = true;
      }
      // The pool stays after the bleeding is controlled: it is blood already lost.
      const showPool = state.bloodLoss > 20 && lastBleed !== null;
      pool.visible = showPool;
      if (showPool && lastBleed) {
        const radius = 0.12 + Math.min(1, state.bloodLoss / 600) * 0.5;
        const wobble = flowing ? 1 + 0.02 * Math.sin(time * 5) : 1;
        pool.scale.set(radius * wobble, radius * 0.82 * wobble, 0.014);
        pool.position.set(lastBleed[0], lastBleed[1], surface(lastBleed[0], lastBleed[1]) + 0.012);
        poolMat.opacity = 0.6 + Math.min(0.32, state.bloodLoss / 1500);
      }
    },
  };
}
