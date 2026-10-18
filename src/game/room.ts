import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CASES, TOOLS, type CaseId, type Tool } from "./simulation";

export class OperatingRoom {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(64, 1, 0.04, 35);
  position = new THREE.Vector3(1.85, 1.65, 2.65);
  yaw = 0.16;
  pitch = -0.09;
  keys = new Set<string>();
  held: THREE.Group | null = null;
  prompt = "";
  nearTray = false;
  nearWorkstation = false;
  canOperate = false;
  lookDragging = false;
  monitorTexture: THREE.CanvasTexture;
  monitorContext: CanvasRenderingContext2D;
  lastMonitor = 0;
  toolModels: Partial<Record<Tool, THREE.Group>> = {};
  trayTools: Partial<Record<Tool, THREE.Group>> = {};
  trayPosition = new THREE.Vector3(1.45, 1, 0.15);
  scopePosition = new THREE.Vector3(0.05, 1.3, -1.1);
  workstationPosition = new THREE.Vector3(2.65, 1.48, -0.65);
  workstationTexture: THREE.CanvasTexture;
  workstationContext: CanvasRenderingContext2D;
  workstationScreen: THREE.Mesh;
  workstationCase: CaseId = "lab";
  constructor(environment: THREE.Texture, drape: THREE.Texture) {
    this.scene.background = new THREE.Color(0x111c22);
    this.scene.environment = environment;
    const white = new THREE.MeshStandardMaterial({
      color: 0xd9e0dd,
      roughness: 0.55,
    });
    const wall = new THREE.MeshStandardMaterial({
      color: 0x71848a,
      roughness: 0.86,
    });
    const ceiling = new THREE.MeshStandardMaterial({
      color: 0x586c77,
      roughness: 0.9,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x8b999a,
      metalness: 0.82,
      roughness: 0.28,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x192321,
      roughness: 0.6,
    });
    const black = new THREE.MeshStandardMaterial({
      color: 0x0d1514,
      roughness: 0.42,
    });
    const green = new THREE.MeshStandardMaterial({
      color: 0x2b4849,
      roughness: 0.78,
    });
    const emit = new THREE.MeshStandardMaterial({
      color: 0xfff5dd,
      emissive: 0xffefd4,
      emissiveIntensity: 4,
    });
    const practicalEmit = new THREE.MeshStandardMaterial({
      color: 0x9ab5be,
      emissive: 0x91b5c4,
      emissiveIntensity: 0.48,
    });
    const cloth = drape.clone();
    cloth.repeat.set(2, 3);
    cloth.needsUpdate = true;
    const fabric = new THREE.MeshStandardMaterial({
      map: cloth,
      color: 0x829e91,
      roughness: 1,
      bumpMap: cloth,
      bumpScale: 0.004,
      side: THREE.DoubleSide,
    });
    const add = (
      g: THREE.BufferGeometry,
      m: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = this.scene,
    ) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    };
    const box = (
      w: number,
      h: number,
      d: number,
      m: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) =>
      add(
        new RoundedBoxGeometry(
          w,
          h,
          d,
          2,
          Math.min(0.014, w / 5, h / 5, d / 5),
        ),
        m,
        x,
        y,
        z,
      );
    const rod = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      r: number,
      m: THREE.Material,
    ) => {
      const o = add(
        new THREE.CylinderGeometry(r, r, a.distanceTo(b), 16),
        m,
        0,
        0,
        0,
      );
      o.position.copy(a).add(b).multiplyScalar(0.5);
      o.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      );
      return o;
    };
    const wheel = (x: number, z: number, y = 0.12) => {
      const o = add(
        new THREE.CylinderGeometry(0.065, 0.065, 0.045, 18),
        dark,
        x,
        y,
        z,
      );
      o.rotation.z = Math.PI / 2;
      rod(
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(x, y + 0.12, z),
        0.018,
        steel,
      );
    };
    box(
      8,
      0.1,
      9,
      new THREE.MeshStandardMaterial({
        color: 0x405651,
        roughness: 0.32,
        metalness: 0.12,
      }),
      0,
      -0.05,
      0,
    );
    for (let i = -4; i <= 4; i++)
      box(
        0.007,
        0.001,
        9,
        new THREE.MeshStandardMaterial({ color: 0x485551, roughness: 0.7 }),
        i,
        0.003,
        0,
      );
    for (let i = -4; i <= 4; i++)
      box(
        8,
        0.001,
        0.007,
        new THREE.MeshStandardMaterial({ color: 0x485551, roughness: 0.7 }),
        0,
        0.003,
        i,
      );
    box(8, 1.2, 0.1, green, 0, 0.6, -4.4);
    box(8, 2, 0.1, wall, 0, 2.2, -4.4);
    for (const x of [-4, 4]) {
      box(0.1, 1.2, 9, green, x, 0.6, 0);
      box(0.1, 2, 9, wall, x, 2.2, 0);
    }
    box(8, 3.3, 0.1, wall, 0, 1.65, 4.5);
    box(8, 0.1, 9, ceiling, 0, 3.3, 0);
    for (let x = -3; x <= 3; x += 1.5)
      for (let z = -3; z < 4; z += 1.5) {
        box(0.015, 0.01, 1.5, steel, x, 3.24, z);
        box(1.5, 0.01, 0.015, steel, x + 0.75, 3.24, z - 0.75);
      }
    for (const x of [-2, 2])
      for (const z of [-2, 2])
        box(0.9, 0.025, 0.55, practicalEmit, x, 3.22, z);
    // Cool, dim room light keeps the equipment readable around the warm field.
    this.scene.add(new THREE.HemisphereLight(0xa9c4d6, 0x273331, 0.28));
    this.scene.environmentIntensity = 0.09;
    const fill = new THREE.PointLight(0xa1c9df, 2.8, 9, 2);
    fill.position.set(2.4, 2.8, 2);
    this.scene.add(fill);
    const rearFill = new THREE.PointLight(0x94b4c8, 1.4, 7, 2);
    rearFill.position.set(-2.7, 2.5, -2.6);
    this.scene.add(rearFill);
    // Adjustable table, support and foot-end hardware.
    box(0.55, 0.16, 1.2, steel, 0, 0.15, 0);
    box(0.28, 0.5, 0.45, steel, 0, 0.45, 0);
    box(0.72, 0.12, 2.05, dark, 0, 0.77, -0.1);
    box(0.85, 0.08, 2.2, steel, 0, 0.85, -0.1);
    for (const x of [-0.3, 0.3]) for (const z of [-0.45, 0.45]) wheel(x, z);
    for (const x of [-0.47, 0.47])
      rod(
        new THREE.Vector3(x, 0.83, -0.9),
        new THREE.Vector3(x, 0.83, 0.8),
        0.018,
        steel,
      );
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [],
      nx = 42,
      nz = 65;
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const x = (i / nx - 0.5) * 1.48,
          z = (j / nz - 0.5) * 2.45 + 0.12;
        const torso =
          0.24 *
          Math.exp(-Math.pow(x / 0.31, 4)) *
          Math.exp(-Math.pow((z + 0.22) / 0.75, 4));
        const legs =
          0.11 *
          Math.exp(-Math.pow(x / 0.28, 4)) *
          Math.exp(-Math.pow((z - 0.6) / 0.75, 4));
        const edge =
          Math.max(0, Math.abs(x) - 0.39) * 1.05 + Math.max(0, z - 1.1) * 0.8;
        const y =
          0.91 +
          Math.max(torso, legs) -
          edge +
          0.018 * Math.sin(x * 31 + z * 7) * Math.min(1, Math.abs(x) * 1.8);
        pos.push(x, y, z);
        uv.push(i / nx, j / nz);
        if (i < nx && j < nz) {
          const k = j * (nx + 1) + i;
          idx.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2);
        }
      }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    cg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    cg.setIndex(idx);
    cg.computeVertexNormals();
    add(cg, fabric, 0, 0, 0);
    const head = add(
      new THREE.SphereGeometry(0.155, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xc29b80, roughness: 0.7 }),
      0,
      1.02,
      -1.02,
    );
    head.scale.set(0.85, 0.8, 1.15);
    const cap = add(
      new THREE.SphereGeometry(0.17, 32, 18),
      fabric,
      0,
      0.99,
      -1.08,
    );
    cap.scale.set(1, 0.75, 1.2);
    const site = add(
      new THREE.CylinderGeometry(0.087, 0.085, 0.016, 40),
      new THREE.MeshPhysicalMaterial({
        color: 0xb27667,
        roughness: 0.45,
        clearcoat: 0.1,
      }),
      0,
      1.122,
      -1.05,
    );
    const rim = add(
      new THREE.TorusGeometry(0.087, 0.012, 10, 48),
      fabric,
      0,
      1.135,
      -1.05,
    );
    rim.rotation.x = Math.PI / 2;
    // Sterile instrument trolley, turned toward the player.
    box(0.85, 0.045, 0.66, steel, 1.45, 0.94, 0.15);
    box(0.8, 0.025, 0.61, fabric, 1.45, 0.968, 0.15);
    box(0.78, 0.035, 0.57, steel, 1.45, 0.28, 0.15);
    for (const x of [1.08, 1.82])
      for (const z of [-0.12, 0.42]) {
        rod(
          new THREE.Vector3(x, 0.14, z),
          new THREE.Vector3(x, 0.94, z),
          0.018,
          steel,
        );
        wheel(x, z);
      }
    for (const z of [-0.19, 0.49])
      rod(
        new THREE.Vector3(1.04, 1, z),
        new THREE.Vector3(1.86, 1, z),
        0.012,
        steel,
      );
    for (let j = 0; j < 3; j++) {
      const bowl = add(
        new THREE.CylinderGeometry(0.075, 0.048, 0.032, 28),
        steel,
        1.2 + j * 0.2,
        0.996,
        0.34,
      );
      bowl.material = steel;
    }
    box(
      0.19,
      0.03,
      0.16,
      new THREE.MeshStandardMaterial({ color: 0xd7dcd0, roughness: 1 }),
      1.13,
      0.997,
      -0.035,
    );
    // Microscope: stable base, articulated arm, binocular optics.
    box(0.55, 0.08, 0.6, white, -0.82, 0.12, -1.2);
    rod(
      new THREE.Vector3(-0.82, 0.2, -1.2),
      new THREE.Vector3(-0.82, 1.88, -1.2),
      0.065,
      white,
    );
    rod(
      new THREE.Vector3(-0.82, 1.88, -1.2),
      new THREE.Vector3(-0.32, 2.12, -1.03),
      0.09,
      white,
    );
    rod(
      new THREE.Vector3(-0.32, 2.12, -1.03),
      new THREE.Vector3(0.04, 1.8, -1.03),
      0.075,
      white,
    );
    box(0.3, 0.3, 0.23, white, 0.04, 1.68, -1.03);
    for (const x of [-0.055, 0.135]) {
      const lens = add(
        new THREE.CylinderGeometry(0.044, 0.051, 0.18, 24),
        black,
        x,
        1.73,
        -0.86,
      );
      lens.rotation.x = Math.PI / 2;
    }
    add(
      new THREE.CylinderGeometry(0.07, 0.08, 0.17, 32),
      white,
      0.04,
      1.43,
      -1.03,
    );
    add(
      new THREE.CylinderGeometry(0.062, 0.062, 0.015, 32),
      black,
      0.04,
      1.34,
      -1.03,
    );
    for (const x of [-1.02, -0.62]) for (const z of [-1.4, -1]) wheel(x, z);
    // Two circular surgical lights and their articulated suspension.
    for (const side of [-1, 1]) {
      const center = new THREE.Vector3(side * 0.63, 2.45, -0.48);
      rod(
        new THREE.Vector3(side * 0.9, 3.24, -1.05),
        new THREE.Vector3(side * 0.9, 2.77, -0.8),
        0.035,
        white,
      );
      rod(
        new THREE.Vector3(side * 0.9, 2.77, -0.8),
        center.clone().add(new THREE.Vector3(0, 0.09, 0)),
        0.035,
        steel,
      );
      const lamp = new THREE.Group();
      lamp.position.copy(center);
      const surgicalTarget = new THREE.Vector3(0, 1.12, -1.02);
      const lampDirection = surgicalTarget.clone().sub(center).normalize();
      lamp.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, -1, 0),
        lampDirection,
      );
      this.scene.add(lamp);
      // The actual emitter sits just below the face of the visible lamp head.
      const surgicalLight = new THREE.SpotLight(
        0xfff5e8,
        side === -1 ? 31 : 25,
        5,
        0.37,
        0.55,
        2,
      );
      surgicalLight.position.copy(center).add(
        new THREE.Vector3(side * 0.15, -0.075, 0).applyQuaternion(lamp.quaternion),
      );
      surgicalLight.target.position.copy(surgicalTarget);
      surgicalLight.castShadow = true;
      surgicalLight.shadow.mapSize.set(1024, 1024);
      surgicalLight.shadow.camera.near = 0.1;
      surgicalLight.shadow.camera.far = 5;
      surgicalLight.shadow.normalBias = 0.008;
      surgicalLight.shadow.bias = -0.0002;
      surgicalLight.shadow.radius = 3;
      this.scene.add(surgicalLight, surgicalLight.target);
      add(
        new THREE.CylinderGeometry(0.37, 0.39, 0.075, 56),
        white,
        0,
        0,
        0,
        lamp,
      );
      add(
        new THREE.CylinderGeometry(0.345, 0.345, 0.008, 56),
        new THREE.MeshStandardMaterial({
          color: 0xb8c1b9,
          metalness: 0.7,
          roughness: 0.25,
        }),
        0,
        -0.043,
        0,
        lamp,
      );
      for (let j = 0; j < 18; j++) {
        const a = (j / 18) * Math.PI * 2;
        add(
          new THREE.CylinderGeometry(0.029, 0.033, 0.01, 12),
          emit,
          Math.cos(a) * 0.27,
          -0.05,
          Math.sin(a) * 0.27,
          lamp,
        );
      }
      for (let j = 0; j < 10; j++) {
        const a = (j / 10) * Math.PI * 2;
        add(
          new THREE.CylinderGeometry(0.027, 0.03, 0.012, 12),
          emit,
          Math.cos(a) * 0.15,
          -0.053,
          Math.sin(a) * 0.15,
          lamp,
        );
      }
      add(
        new THREE.CylinderGeometry(0.027, 0.027, 0.12, 16),
        white,
        0,
        -0.09,
        0,
        lamp,
      );
    }
    // Rear cabinets, panel joints and restrained practical equipment.
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x6c8b89,
      metalness: 0.1,
      roughness: 0.17,
      transparent: true,
      opacity: 0.36,
    });
    for (const x of [-2.6, -1.35, 1.5, 2.75]) {
      box(1.05, 1.85, 0.035, steel, x, 1.22, -4.26);
      box(0.94, 1.5, 0.025, dark, x, 1.33, -4.23);
      for (const side of [-1, 1])
        box(0.035, 1.85, 0.45, steel, x + side * 0.51, 1.22, -4.05);
      box(1.05, 0.035, 0.45, steel, x, 2.13, -4.05);
      box(1.05, 0.035, 0.45, steel, x, 0.31, -4.05);
      for (const side of [-1, 1]) {
        box(0.44, 1.5, 0.025, glass, x + side * 0.24, 1.33, -3.77);
        rod(
          new THREE.Vector3(x + side * 0.06, 1.1, -3.735),
          new THREE.Vector3(x + side * 0.06, 1.4, -3.735),
          0.009,
          steel,
        );
      }
      for (let shelf = 0; shelf < 3; shelf++) {
        box(0.96, 0.025, 0.35, steel, x, 0.8 + shelf * 0.45, -4.02);
        for (let bottle = 0; bottle < 4; bottle++) {
          const m = new THREE.MeshStandardMaterial({
            color: bottle % 2 ? 0xa9bcae : 0xd4d9d0,
            roughness: 0.6,
          });
          box(
            0.12,
            0.16,
            0.12,
            m,
            x - 0.3 + bottle * 0.2,
            0.9 + shelf * 0.45,
            -4,
          );
        }
      }
    }
    box(0.065, 2.35, 1.15, steel, 3.9, 1.2, -2.2);
    box(
      0.025,
      2.22,
      1.02,
      new THREE.MeshStandardMaterial({ color: 0x8eaaa2, roughness: 0.5 }),
      3.85,
      1.2,
      -2.2,
    );
    box(0.03, 0.75, 0.45, glass, 3.82, 1.65, -2.2);
    rod(
      new THREE.Vector3(3.79, 0.95, -1.88),
      new THREE.Vector3(3.79, 1.2, -1.88),
      0.015,
      steel,
    );
    // Live in-world monitor (code-native chart, not baked image UI).
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 320;
    this.monitorContext = canvas.getContext("2d")!;
    this.monitorTexture = new THREE.CanvasTexture(canvas);
    this.monitorTexture.colorSpace = THREE.SRGBColorSpace;
    box(0.63, 0.5, 0.11, white, -1.25, 1.6, -0.3);
    const screen = add(
      new THREE.PlaneGeometry(0.54, 0.34),
      new THREE.MeshBasicMaterial({ map: this.monitorTexture }),
      -1.25,
      1.63,
      -0.237,
    );
    box(0.65, 0.09, 0.5, steel, -1.25, 1.25, -0.38);
    box(0.57, 0.55, 0.43, white, -1.25, 0.83, -0.38);
    for (const x of [-1.49, -1.01])
      for (const z of [-0.57, -0.19]) {
        rod(
          new THREE.Vector3(x, 0.15, z),
          new THREE.Vector3(x, 0.57, z),
          0.018,
          steel,
        );
        wheel(x, z);
      }
    for (let i = 0; i < 5; i++)
      add(
        new THREE.SphereGeometry(0.009, 10, 6),
        i === 4
          ? new THREE.MeshStandardMaterial({
              color: 0x5f8f5f,
              emissive: 0x1f4a20,
            })
          : dark,
        -1.46 + i * 0.07,
        1.405,
        -0.235,
      );
    // Separate case workstation: a readable physical screen beside the table.
    // Its face points toward the entrance; it never replaces the vitals display.
    const workstationCanvas = document.createElement("canvas");
    workstationCanvas.width = 1280;
    workstationCanvas.height = 896;
    this.workstationContext = workstationCanvas.getContext("2d")!;
    this.workstationTexture = new THREE.CanvasTexture(workstationCanvas);
    this.workstationTexture.colorSpace = THREE.SRGBColorSpace;
    this.workstationTexture.anisotropy = 4;
    box(1.18, 0.87, 0.105, dark, 2.65, 1.48, -0.72);
    box(1.09, 0.78, 0.018, black, 2.65, 1.49, -0.658);
    this.workstationScreen = add(
      new THREE.PlaneGeometry(1.035, 0.725),
      new THREE.MeshBasicMaterial({ map: this.workstationTexture, toneMapped: false }),
      2.65,
      1.49,
      -0.645,
    );
    box(0.12, 0.8, 0.12, steel, 2.65, 0.75, -0.76);
    box(0.8, 0.055, 0.65, dark, 2.65, 0.17, -0.68);
    box(1.08, 0.055, 0.52, steel, 2.65, 0.99, -0.5);
    box(0.7, 0.018, 0.24, black, 2.58, 1.027, -0.45);
    // Restrained keyboard grooves, enough to read as a computer cart.
    for (let row = 0; row < 4; row++)
      box(0.63, 0.002, 0.006, steel, 2.58, 1.038, -0.54 + row * 0.055);
    for (const x of [2.34, 2.96])
      for (const z of [-0.9, -0.44]) wheel(x, z);
    const workstationGlow = new THREE.PointLight(0x74bcca, 0.55, 1.4, 2);
    workstationGlow.position.set(2.65, 1.52, -0.3);
    this.scene.add(workstationGlow);
    this.setCase(this.workstationCase);
    const clock = document.createElement("canvas");
    clock.width = 256;
    clock.height = 256;
    const ctx = clock.getContext("2d")!;
    ctx.fillStyle = "#dce0d5";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#23332c";
    ctx.lineWidth = 3;
    for (let n = 0; n < 12; n++) {
      const a = (n / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96);
      ctx.lineTo(128 + Math.sin(a) * 108, 128 - Math.cos(a) * 108);
      ctx.stroke();
    }
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(174, 91);
    ctx.moveTo(128, 128);
    ctx.lineTo(114, 59);
    ctx.stroke();
    const ct = new THREE.CanvasTexture(clock);
    ct.colorSpace = THREE.SRGBColorSpace;
    const face = add(
      new THREE.CircleGeometry(0.22, 48),
      new THREE.MeshBasicMaterial({ map: ct }),
      0.08,
      2.5,
      -4.31,
    );
    const bezel = add(
      new THREE.TorusGeometry(0.23, 0.012, 8, 48),
      steel,
      0.08,
      2.5,
      -4.32,
    );
    this.scene.add(this.camera);
    this.updateCamera();
    this.updateMonitor(0);
  }
  installTools(models: Partial<Record<Tool, THREE.Group>>) {
    this.toolModels = models;
    (["drill", "suction", "irrigation", "bipolar"] as Tool[]).forEach(
      (name, i) => {
        const m = models[name]?.clone();
        if (m) {
          m.scale.setScalar(0.085);
          m.rotation.set(0, -0.1, 0);
          m.position.set(1.18, 0.99, -0.08 + i * 0.09);
          this.scene.add(m);
          this.trayTools[name] = m;
        }
      },
    );
  }
  hold(tool: Tool | null) {
    if (this.held) {
      this.camera.remove(this.held);
      this.held = null;
    }
    for (const [name, model] of Object.entries(this.trayTools))
      if (model) model.visible = name !== tool;
    if (tool && this.toolModels[tool]) {
      this.held = this.toolModels[tool]!.clone();
      this.held.visible = true;
      this.held.scale.setScalar(0.13);
      this.held.rotation.set(0.08, -0.7, 2.95);
      this.held.position.set(0.38, -0.3, -0.62);
      this.camera.add(this.held);
    }
  }
  updateCamera() {
    this.camera.position.copy(this.position);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.updateMatrixWorld();
  }
  look(dx: number, dy: number) {
    this.yaw -= dx * 0.002;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.002, -1.15, 1.15);
    this.updateCamera();
  }
  isWorkstationHit(ray: THREE.Raycaster) {
    this.workstationScreen.updateWorldMatrix(true, false);
    return ray.intersectObject(this.workstationScreen, false).some(
      (hit) => hit.distance < 4.5,
    );
  }
  setCase(id: CaseId) {
    this.workstationCase = id;
    const ctx = this.workstationContext;
    const current = CASES[id];
    ctx.fillStyle = "#101d25";
    ctx.fillRect(0, 0, 1280, 896);
    ctx.fillStyle = "#82c5c8";
    ctx.fillRect(0, 0, 1280, 8);
    ctx.font = "600 31px sans-serif";
    ctx.fillText("CASE WORKSTATION", 58, 74);
    ctx.fillStyle = "#78929e";
    ctx.font = "23px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("OPERATING ROOM 04", 1220, 74);
    ctx.textAlign = "left";
    ctx.fillStyle = "#edf2f1";
    ctx.font = "500 49px sans-serif";
    ctx.fillText("Choose your procedure", 58, 153);
    ctx.fillStyle = "#1c333e";
    ctx.fillRect(58, 188, 1164, 130);
    ctx.fillStyle = "#89c4c1";
    ctx.font = "600 22px sans-serif";
    ctx.fillText("CURRENTLY ASSIGNED", 82, 227);
    ctx.fillStyle = "#ffffff";
    ctx.font = "500 36px sans-serif";
    ctx.fillText(current.name, 82, 281);
    const cases = Object.entries(CASES) as [CaseId, (typeof CASES)[CaseId]][];
    const rowHeight = Math.min(68, 408 / cases.length);
    cases.forEach(([caseId, procedure], index) => {
      const y = 350 + index * rowHeight;
      const selected = caseId === id;
      ctx.fillStyle = selected ? "#284650" : "#172832";
      ctx.fillRect(58, y, 1164, rowHeight - 8);
      ctx.fillStyle = selected ? "#a2dbd1" : "#708c99";
      ctx.font = "600 20px sans-serif";
      ctx.fillText(procedure.label.toUpperCase(), 80, y + rowHeight * 0.57);
      ctx.fillStyle = selected ? "#ffffff" : "#d3dfe1";
      ctx.font = "25px sans-serif";
      ctx.fillText(procedure.name, 314, y + rowHeight * 0.57);
      ctx.fillStyle = selected ? "#a2dbd1" : "#7e959f";
      ctx.textAlign = "right";
      ctx.font = "20px sans-serif";
      ctx.fillText(selected ? "ASSIGNED" : procedure.difficulty, 1198, y + rowHeight * 0.57);
      ctx.textAlign = "left";
    });
    ctx.fillStyle = "#a1d2cb";
    ctx.fillRect(58, 790, 1164, 69);
    ctx.fillStyle = "#122a32";
    ctx.font = "600 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CLICK SCREEN  /  PRESS E TO OPEN CASES", 640, 834);
    ctx.textAlign = "left";
    this.workstationTexture.needsUpdate = true;
  }
  update(
    dt: number,
    held: Tool | null,
    time: number,
    selected: Tool = "suction",
  ) {
    const speed = 1.7 * dt,
      forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)),
      right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const movement = new THREE.Vector3();
    if (this.keys.has("w")) movement.add(forward);
    if (this.keys.has("s")) movement.sub(forward);
    if (this.keys.has("d")) movement.add(right);
    if (this.keys.has("a")) movement.sub(right);
    if (movement.lengthSq() > 0) {
      movement.normalize().multiplyScalar(speed);
      const next = this.position.clone().add(movement);
      next.x = THREE.MathUtils.clamp(next.x, -3.5, 3.5);
      next.z = THREE.MathUtils.clamp(next.z, -3.5, 3.8);
      // Keep the player's body clear of the table, carts and microscope stand.
      const blocked = (x: number, z: number) =>
        (Math.abs(x) < 0.68 && z > -1.5 && z < 1.45) ||
        (x > 0.88 && x < 2.02 && z > -0.42 && z < 0.77) ||
        (x > 2.04 && x < 3.26 && z > -1.12 && z < -0.13) ||
        (x > -1.8 && x < -0.84 && z > -0.88 && z < 0.17);
      if (!blocked(next.x, this.position.z)) this.position.x = next.x;
      if (!blocked(this.position.x, next.z)) this.position.z = next.z;
    }
    if (this.keys.has("arrowleft")) this.yaw += dt;
    if (this.keys.has("arrowright")) this.yaw -= dt;
    if (this.keys.has("arrowup"))
      this.pitch = Math.min(1.1, this.pitch + dt * 0.7);
    if (this.keys.has("arrowdown"))
      this.pitch = Math.max(-1.1, this.pitch - dt * 0.7);
    this.updateCamera();
    const distance = (p: THREE.Vector3) =>
      Math.hypot(this.position.x - p.x, this.position.z - p.z);
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const looking = (p: THREE.Vector3) =>
      direction.dot(p.clone().sub(this.position).normalize()) > 0.35;
    this.nearTray =
      distance(this.trayPosition) < 1.45 && looking(this.trayPosition);
    this.canOperate =
      distance(this.scopePosition) < 1.65 && looking(this.scopePosition);
    const workstationDirection = this.workstationPosition.clone().sub(this.position).normalize();
    this.nearWorkstation =
      distance(this.workstationPosition) < 4.1 &&
      this.position.z > this.workstationPosition.z &&
      direction.dot(workstationDirection) > 0.88;
    this.prompt =
      this.nearWorkstation
        ? "Use case workstation"
        : held &&
      this.canOperate &&
      distance(this.scopePosition) < distance(this.trayPosition)
        ? "Enter surgical view"
        : this.nearTray
          ? "Take " + TOOLS[selected].name
          : this.canOperate
            ? held
              ? "Enter surgical view"
              : "Collect an instrument from the tray"
            : "";
    if (time - this.lastMonitor > 0.2) {
      this.lastMonitor = time;
      this.updateMonitor(time);
    }
  }
  updateMonitor(time: number) {
    const ctx = this.monitorContext;
    ctx.fillStyle = "#061212";
    ctx.fillRect(0, 0, 512, 320);
    ctx.strokeStyle = "#36564b";
    ctx.lineWidth = 1;
    for (let x = 0; x < 512; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 320);
      ctx.stroke();
    }
    for (let y = 0; y < 320; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    for (let row = 0; row < 2; row++) {
      ctx.strokeStyle = row ? "#83bbd3" : "#9fd486";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x < 350; x++) {
        const t = (x + time * 60) % 110;
        const pulse = row
          ? Math.sin((t / 110) * Math.PI * 2) * 11
          : t > 41 && t < 45
            ? -(t - 41) * 13
            : t >= 45 && t < 49
              ? -52 + (t - 45) * 22
              : t >= 49 && t < 52
                ? 36 - (t - 49) * 12
                : Math.sin(t / 14) * 2;
        const y = 85 + row * 120 + pulse;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = "#a2d490";
    ctx.font = "56px monospace";
    ctx.fillText("72", 390, 94);
    ctx.fillStyle = "#94c5d9";
    ctx.fillText("99", 390, 213);
    ctx.fillStyle = "#a3b8ac";
    ctx.font = "15px monospace";
    ctx.fillText("HR", 392, 35);
    ctx.fillText("SpO2", 392, 154);
    ctx.fillText("SINUS RHYTHM    118 / 76", 22, 285);
    this.monitorTexture.needsUpdate = true;
  }
}
