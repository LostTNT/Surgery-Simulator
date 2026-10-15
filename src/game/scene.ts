import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import type { GameState, Pocket } from "./simulation";

export interface Vessel {
  name: string;
  points: THREE.Vector3[];
  radius: number;
}
export interface FieldObjects {
  vessels: Vessel[];
  pools: THREE.Mesh[];
  stains: THREE.Mesh[];
  guide: THREE.Mesh;
  contact: THREE.Mesh;
  bleed: THREE.Mesh;
  stream: THREE.Points;
  reset: (pockets: Pocket[]) => void;
  update: (
    state: GameState,
    tip: THREE.Vector3,
    contactZ: number,
    time: number,
  ) => void;
}
type Surface = (x: number, y: number) => number;
const metal = new THREE.MeshStandardMaterial({
  color: 0x8c9b9e,
  metalness: 0.94,
  roughness: 0.23,
});
function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  parent: THREE.Object3D,
) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function ringGeometry(inner: number, outer: number, z: number, cloth = false) {
  const p: number[] = [],
    uv: number[] = [],
    indices: number[] = [],
    colors: number[] = [];
  const radial = cloth ? 18 : 5,
    angular = 160;
  for (let j = 0; j <= radial; j++)
    for (let i = 0; i <= angular; i++) {
      const a = (i / angular) * Math.PI * 2,
        r = inner + ((outer - inner) * j) / radial;
      const uneven =
        1 + 0.018 * Math.sin(a * 7) + 0.012 * Math.sin(a * 13 + 0.5);
      const fold = cloth
        ? (Math.sin(a * 11 + r * 3) * 0.055 + Math.sin(a * 5 - r * 2) * 0.07) *
          Math.min(1, (r - inner) * 2)
        : Math.sin(a * 19) * 0.008;
      p.push(
        Math.cos(a) * r * uneven,
        Math.sin(a) * r * 0.84 * uneven,
        z +
          fold +
          (cloth
            ? 0.035 * Math.sin(r * 5)
            : Math.sin((j / radial) * Math.PI) * 0.055),
      );
      uv.push((p[p.length - 3] + 6) / 12, (p[p.length - 2] + 6) / 12);
      const n = (Math.sin(i * 4.7 + j * 3.2) + 1) * 0.5;
      colors.push(
        cloth ? 1 : 0.78 + n * 0.14,
        cloth ? 1 : 0.64 + n * 0.1,
        cloth ? 1 : 0.43 + n * 0.09,
      );
      if (j < radial && i < angular) {
        const k = j * (angular + 1) + i;
        indices.push(
          k,
          k + 1,
          k + angular + 1,
          k + 1,
          k + angular + 2,
          k + angular + 1,
        );
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function lineTube(
  points: THREE.Vector3[],
  radius: number,
  material: THREE.Material,
  parent: THREE.Object3D,
) {
  return mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      Math.max(12, points.length * 3),
      radius,
      8,
      false,
    ),
    material,
    parent,
  );
}
function fluidGeometry(p: Pocket, surface: Surface) {
  const v: number[] = [p.x, p.y, surface(p.x, p.y) + 0.055],
    ind: number[] = [];
  const sides = 48,
    rings = 5;
  for (let j = 1; j <= rings; j++)
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2,
        r =
          ((p.radius * j) / rings) *
          (1 + 0.12 * Math.sin(a * 3 + p.x) + 0.07 * Math.cos(a * 5));
      const x = p.x + Math.cos(a) * r,
        y = p.y + Math.sin(a) * r * 0.8;
      v.push(
        x,
        y,
        surface(x, y) + 0.016 + Math.sin((j / rings) * Math.PI) * 0.008,
      );
      if (j === 1) ind.push(0, 1 + i, 1 + ((i + 1) % sides));
      else {
        const k = 1 + (j - 1) * sides + i,
          k2 = 1 + (j - 1) * sides + ((i + 1) % sides);
        ind.push(k, k2, k - sides, k2, k2 - sides, k - sides);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}

export function buildField(
  scene: THREE.Scene,
  surface: Surface,
  drape: THREE.Texture,
  pockets: Pocket[],
  cortex: THREE.Mesh,
): FieldObjects {
  drape.colorSpace = THREE.SRGBColorSpace;
  drape.wrapS = drape.wrapT = THREE.RepeatWrapping;
  drape.repeat.set(16, 16);
  drape.anisotropy = 8;
  const cloth = new THREE.MeshStandardMaterial({
    map: drape,
    bumpMap: drape,
    bumpScale: 0.016,
    roughness: 0.98,
    color: 0x6b8b83,
    side: THREE.DoubleSide,
  });
  mesh(ringGeometry(1.98, 12, 0.4, true), cloth, scene);
  const bone = new THREE.MeshStandardMaterial({
    color: 0xf4d6a3,
    vertexColors: true,
    roughness: 0.52,
    side: THREE.DoubleSide,
  });
  mesh(ringGeometry(1.72, 2.02, 0.3), bone, scene);
  const edge = new THREE.MeshPhysicalMaterial({
    color: 0x8c3b36,
    roughness: 0.37,
    clearcoat: 0.6,
    side: THREE.DoubleSide,
  });
  mesh(ringGeometry(1.65, 1.73, 0.255), edge, scene);
  const periosteum = new THREE.MeshStandardMaterial({
    color: 0xb07866,
    roughness: 0.49,
    side: THREE.DoubleSide,
  });
  mesh(ringGeometry(1.93, 1.99, 0.36), periosteum, scene);
  // Continuous inner exposure wall prevents a black gap between cortex and rim.
  const wallPoints: number[] = [],
    wallIndex: number[] = [];
  for (let i = 0; i <= 160; i++) {
    const a = (i / 160) * Math.PI * 2,
      x = Math.cos(a),
      y = Math.sin(a),
      uneven = 1 + 0.018 * Math.sin(a * 7) + 0.012 * Math.sin(a * 13 + 0.5);
    wallPoints.push(
      x * 1.67 * uneven,
      y * 1.67 * 0.84 * uneven,
      0.255,
      x * 1.79,
      y * 1.79 * 0.84,
      -0.66,
    );
    if (i < 160) {
      const k = i * 2;
      wallIndex.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(wallPoints, 3),
  );
  wallGeo.setIndex(wallIndex);
  wallGeo.computeVertexNormals();
  mesh(
    wallGeo,
    new THREE.MeshStandardMaterial({
      color: 0x66392f,
      roughness: 0.7,
      side: THREE.DoubleSide,
    }),
    scene,
  );

  // Authored retractor: a thin curved blade, bracket and two machined screws.
  const retractor = new THREE.Group();
  scene.add(retractor);
  const blade = new THREE.BoxGeometry(0.13, 0.6, 0.085);
  mesh(blade, metal, retractor).position.set(-1.7, -0.1, 0.43);
  lineTube(
    [
      new THREE.Vector3(-1.72, -0.2, 0.43),
      new THREE.Vector3(-1.98, -0.35, 0.68),
      new THREE.Vector3(-2.5, -0.45, 0.7),
    ],
    0.045,
    metal,
    retractor,
  );
  mesh(new THREE.BoxGeometry(0.42, 0.5, 0.07), metal, retractor).position.set(
    -2.03,
    -0.35,
    0.72,
  );
  for (const y of [-0.49, -0.23]) {
    const screw = mesh(
      new THREE.CylinderGeometry(0.058, 0.058, 0.03, 24),
      metal,
      retractor,
    );
    screw.rotation.x = Math.PI / 2;
    screw.position.set(-2.03, y, 0.77);
    const slot = mesh(
      new THREE.BoxGeometry(0.065, 0.011, 0.003),
      new THREE.MeshBasicMaterial({ color: 0x273435 }),
      retractor,
    );
    slot.position.set(-2.03, y, 0.788);
  }

  const vessels: Vessel[] = [];
  const artery = new THREE.MeshPhysicalMaterial({
    color: 0x6f1e1d,
    roughness: 0.28,
    clearcoat: 0.75,
    clearcoatRoughness: 0.18,
  });
  const vein = new THREE.MeshPhysicalMaterial({
    color: 0x3c2630,
    roughness: 0.3,
    clearcoat: 0.7,
  });
  function vessel(
    name: string,
    xy: number[][],
    radius: number,
    material = artery,
  ) {
    const curve = new THREE.CatmullRomCurve3(
      xy.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    );
    const points = curve
      .getPoints(65)
      .map(
        (p) =>
          new THREE.Vector3(
            p.x,
            p.y,
            surface(p.x, p.y) + radius * 0.65 + 0.013,
          ),
      );
    lineTube(points, radius, material, scene);
    vessels.push({ name, points, radius });
  }
  vessel(
    "cortical vessel",
    [
      [-1.06, -0.82],
      [-0.7, -0.55],
      [-0.38, -0.3],
      [-0.24, 0.07],
      [-0.4, 0.45],
      [-0.35, 0.92],
    ],
    0.024,
  );
  vessel(
    "cortical branch",
    [
      [-0.35, -0.28],
      [-0.03, -0.33],
      [0.22, -0.1],
      [0.38, 0.18],
      [0.29, 0.57],
    ],
    0.015,
  );
  vessel(
    "cortical branch",
    [
      [-0.25, 0.06],
      [-0.65, 0.2],
      [-0.92, 0.5],
      [-1.17, 0.67],
    ],
    0.014,
  );
  vessel(
    "cortical vein",
    [
      [-0.82, 0.93],
      [-0.72, 0.58],
      [-0.8, 0.18],
      [-0.57, -0.14],
      [-0.72, -0.51],
      [-0.61, -0.96],
    ],
    0.022,
    vein,
  );
  vessel(
    "fine cortical branch",
    [
      [0.24, -0.12],
      [0.49, -0.38],
      [0.4, -0.7],
      [0.15, -1.05],
    ],
    0.01,
  );
  // Delicate, irregular surface branches stay attached to the atlas surface.
  let seed = 317;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let k = 0; k < 38; k++) {
    const x = (rand() - 0.5) * 2.65,
      y = (rand() - 0.5) * 2.25;
    if ((x * x) / 2.5 + (y * y) / 1.7 > 1) continue;
    const angle = rand() * Math.PI * 2,
      len = 0.13 + rand() * 0.2;
    const pts = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      const a = x + Math.cos(angle) * len * t,
        b = y + Math.sin(angle) * len * t + Math.sin(t * 4) * 0.025;
      return new THREE.Vector3(a, b, surface(a, b) + 0.009);
    });
    lineTube(
      pts,
      0.0035,
      new THREE.MeshStandardMaterial({ color: 0xa2473c, roughness: 0.4 }),
      scene,
    );
  }
  const poolGroup = new THREE.Group();
  scene.add(poolGroup);
  let pools: THREE.Mesh[] = [],
    stains: THREE.Mesh[] = [];
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = maskCanvas.height = 128;
  const ctx = maskCanvas.getContext("2d")!,
    gradient = ctx.createRadialGradient(64, 64, 32, 64, 64, 63);
  gradient.addColorStop(0, "white");
  gradient.addColorStop(0.75, "#eeeeee");
  gradient.addColorStop(1, "black");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const mask = new THREE.CanvasTexture(maskCanvas);
  const fluid = new THREE.MeshPhysicalMaterial({
    color: 0x450f0c,
    alphaMap: mask,
    roughness: 0.58,
    envMapIntensity: 0.2,
    metalness: 0,
    clearcoat: 0.08,
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  const stainMat = new THREE.MeshStandardMaterial({
    color: 0x791f19,
    alphaMap: mask,
    roughness: 0.6,
    transparent: true,
    opacity: 0.27,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const markerMat = new THREE.MeshBasicMaterial({
    color: 0xd6dfc2,
    transparent: true,
    opacity: 0.65,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const guide = mesh(
    new THREE.RingGeometry(0.075, 0.078, 48),
    markerMat,
    scene,
  );
  guide.renderOrder = 20;
  const contact = mesh(
    new THREE.RingGeometry(0.025, 0.028, 40),
    markerMat.clone(),
    scene,
  );
  contact.renderOrder = 22;
  const bleed = mesh(
    new THREE.SphereGeometry(0.13, 24, 12),
    fluid.clone(),
    scene,
  );
  bleed.scale.z = 0.15;
  bleed.visible = false;
  const streamGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(60 * 3);
  streamGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const stream = new THREE.Points(
    streamGeo,
    new THREE.PointsMaterial({
      color: 0xd4e2dc,
      size: 0.014,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  );
  scene.add(stream);
  stream.visible = false;
  function reset(p: Pocket[]) {
    poolGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    poolGroup.clear();
    pools = [];
    stains = [];
    for (const pocket of p) {
      const g = new DecalGeometry(
        cortex,
        new THREE.Vector3(pocket.x, pocket.y, surface(pocket.x, pocket.y)),
        new THREE.Euler(0, 0, 0),
        new THREE.Vector3(pocket.radius * 2, pocket.radius * 1.6, 2),
      );
      const st = mesh(g.clone(), stainMat.clone(), poolGroup);
      st.renderOrder = 1;
      stains.push(st);
      const m = mesh(g, fluid.clone(), poolGroup);
      m.castShadow = false;
      m.renderOrder = 2;
      pools.push(m);
    }
  }
  reset(pockets);
  return {
    vessels,
    pools,
    stains,
    guide,
    contact,
    bleed,
    stream,
    reset,
    update(state, tip, z, time) {
      for (let i = 0; i < pools.length; i++) {
        const p = state.pockets[i],
          m = pools[i];
        const scale = Math.sqrt(Math.max(0.001, p.remaining));
        // Lower the fluid surface as it clears; keep its contact geometry registered.
        m.scale.set(1, 1, 1);
        m.position.z = 0;
        m.visible = p.remaining > 0.003;
        (m.material as THREE.MeshPhysicalMaterial).opacity =
          0.88 * Math.pow(p.remaining, 0.65);
        (stains[i].material as THREE.MeshStandardMaterial).opacity =
          0.24 * (1 - state.clarity * 0.8);
      }
      const target = state.pockets.find((p) => p.remaining > 0.01);
      guide.visible =
        Boolean(target) &&
        state.guided &&
        (state.showAnatomy || state.stage === 0) &&
        state.status === "running";
      if (target)
        guide.position.set(
          target.x,
          target.y,
          surface(target.x, target.y) + 0.095,
        );
      contact.visible = state.status === "running";
      contact.position.copy(tip);
      const cm = contact.material as THREE.MeshBasicMaterial;
      cm.color.set(state.clearance < 0.035 ? 0xe8a78b : 0xc4dac4);
      cm.opacity = state.guided ? 0.65 : 0.35;
      contact.scale.setScalar(
        Math.min(2.5, 0.75 + Math.max(0, state.clearance) * 2),
      );
      bleed.visible = state.bleeding > 0.012 && state.bleedPosition !== null;
      if (state.bleedPosition) {
        bleed.position.copy(new THREE.Vector3(...state.bleedPosition));
        bleed.position.z = surface(bleed.position.x, bleed.position.y) + 0.03;
        bleed.scale.setScalar(0.4 + state.bleeding * 1.6);
        bleed.scale.z = 0.2;
      }
      stream.visible =
        state.action &&
        state.status === "running" &&
        state.tool === "irrigation" &&
        state.clearance < 0.4;
      if (stream.visible) {
        for (let i = 0; i < 60; i++) {
          const t = (i / 60 + time * 1.3) % 1,
            a = i * 2.399;
          positions[i * 3] = tip.x + Math.cos(a) * t * 0.12;
          positions[i * 3 + 1] = tip.y + Math.sin(a) * t * 0.12;
          positions[i * 3 + 2] =
            THREE.MathUtils.lerp(tip.z, z + 0.03, t) +
            Math.sin(t * Math.PI) * 0.055;
        }
        streamGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
