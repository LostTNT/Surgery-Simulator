import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import { buildField, type FieldObjects } from "./scene";
import { SurgicalAudio } from "./audio";
import { OperatingRoom } from "./room";
import { sweepTool } from "./collision";
import {
  createState,
  tick,
  pause,
  chooseTool,
  checkpoint,
  logEvent,
  type GameState,
  type CaseId,
  type Tool,
  type Contact,
} from "./simulation";

export interface Snapshot extends GameState {
  loaded: boolean;
  error: string;
  fps: number;
  location: "room" | "surgery";
  roomPrompt: string;
  heldTool: Tool | null;
  nearTray: boolean;
}
export class Engine {
  state = createState();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.05, 60);
  renderer: THREE.WebGLRenderer;
  host: HTMLElement;
  brain: THREE.Mesh | null = null;
  field: FieldObjects | null = null;
  tools: Partial<Record<Tool, THREE.Group>> = {};
  tip = new THREE.Vector3(0.55, -0.3, 0.62);
  target = this.tip.clone();
  previous = this.tip.clone();
  ray = new THREE.Raycaster();
  down = new THREE.Vector3(0, 0, -1);
  audio = new SurgicalAudio();
  loaded = false;
  error = "";
  disposed = false;
  frameId = 0;
  dirty = true;
  fps = 60;
  last = performance.now();
  accumulator = 0;
  publishAt = 0;
  frameCount = 0;
  fpsAt = 0;
  precision = false;
  pointer: { x: number; y: number } | null = null;
  observer: ResizeObserver;
  onChange: (s: Snapshot) => void;
  cleanups: (() => void)[] = [];
  onPauseRequest: () => void = () => {
    if (this.state.status === "running") this.pause();
    else if (this.state.status === "paused") this.resume();
  };
  stageSnapshots = new Map<number, GameState>();
  location: "room" | "surgery" = "room";
  room: OperatingRoom | null = null;
  heldTool: Tool | null = null;
  constructor(host: HTMLElement, onChange: (s: Snapshot) => void) {
    this.host = host;
    this.onChange = onChange;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.setClearColor(0x081414);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D surgical field",
    );
    host.appendChild(this.renderer.domElement);
    this.camera.up.set(0, 0, 1);
    this.updateCamera();
    const pmrem = new THREE.PMREMGenerator(this.renderer),
      room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04);
    this.scene.environment = env.texture;
    pmrem.dispose();
    room.dispose();
    this.cleanups.push(() => env.dispose());
    this.scene.add(new THREE.HemisphereLight(0xe6f3ec, 0x263335, 2));
    const light = new THREE.SpotLight(0xffe9d5, 54, 15, Math.PI / 3, 0.6, 2);
    light.position.set(-0.6, -1, 5.5);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0005;
    this.scene.add(light, light.target);
    const fill = new THREE.DirectionalLight(0x9ed4de, 1.5);
    fill.position.set(3, 2, 4);
    this.scene.add(fill);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.bindInput();
    this.resize();
    void this.load();
    this.frameId = requestAnimationFrame(this.frame);
  }
  snapshot(): Snapshot {
    return {
      ...this.state,
      pockets: this.state.pockets.map((p) => ({ ...p })),
      events: [...this.state.events],
      feedback: { ...this.state.feedback },
      loaded: this.loaded,
      error: this.error,
      fps: this.fps,
      location: this.location,
      roomPrompt: this.room?.prompt ?? "",
      heldTool: this.heldTool,
      nearTray: this.room?.nearTray ?? false,
    };
  }
  emit() {
    if (!this.disposed) this.onChange(this.snapshot());
  }
  async load() {
    try {
      const loader = new GLTFLoader();
      const assetBase = import.meta.env.BASE_URL;
      const [anatomy, suction, irrigation, bipolar, drape, corticalTexture] =
        await Promise.all([
          loader.loadAsync(`${assetBase}models/cortex.glb`),
          loader.loadAsync(`${assetBase}models/suction.glb`),
          loader.loadAsync(`${assetBase}models/irrigation.glb`),
          loader.loadAsync(`${assetBase}models/bipolar.glb`),
          new THREE.TextureLoader().loadAsync(`${assetBase}textures/drape.png`),
          new THREE.TextureLoader().loadAsync(`${assetBase}textures/cortex.png`),
        ]);
      if (this.disposed) return;
      anatomy.scene.updateMatrixWorld(true);
      corticalTexture.colorSpace = THREE.SRGBColorSpace;
      corticalTexture.anisotropy = 8;
      anatomy.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          this.brain = o;
          o.name = "cortex";
          const positions = o.geometry.getAttribute("position"),
            uv = new Float32Array(positions.count * 2);
          for (let i = 0; i < positions.count; i++) {
            uv[i * 2] = (positions.getX(i) + 1.88) / 3.76;
            uv[i * 2 + 1] = (positions.getY(i) + 1.6) / 3.2;
          }
          o.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
          o.material = new THREE.MeshPhysicalMaterial({
            map: corticalTexture,
            color: 0xd4a99a,
            roughness: 0.48,
            clearcoat: 0.18,
            clearcoatRoughness: 0.3,
            side: THREE.DoubleSide,
          });
          o.geometry.boundsTree = new MeshBVH(o.geometry);
          o.raycast = acceleratedRaycast;
          o.receiveShadow = true;
          o.castShadow = true;
        }
      });
      if (!this.brain)
        throw new Error("The anatomy asset did not contain a surface.");
      this.scene.add(anatomy.scene);
      this.scene.updateMatrixWorld(true);
      this.field = buildField(
        this.scene,
        (x, y) => this.surface(x, y),
        drape,
        this.state.pockets,
        this.brain,
      );
      for (const [name, model] of [
        ["suction", suction],
        ["irrigation", irrigation],
        ["bipolar", bipolar],
      ] as const) {
        const group = new THREE.Group();
        group.add(model.scene);
        group.rotation.set(0, -0.52, -0.48);
        group.name = name;
        group.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.tools[name] = group;
        this.scene.add(group);
      }
      this.room = new OperatingRoom(
        this.scene.environment as THREE.Texture,
        drape,
      );
      this.room.installTools(this.tools);
      this.room.camera.aspect = this.camera.aspect;
      this.room.camera.updateProjectionMatrix();
      if (this.renderer.extensions.has("KHR_parallel_shader_compile"))
        await this.renderer.compileAsync(this.scene, this.camera);
      else this.renderer.compile(this.scene, this.camera);
      this.loaded = true;
      this.dirty = true;
      this.emit();
    } catch (e) {
      this.error =
        e instanceof Error ? e.message : "Unable to load the operating field.";
      this.emit();
    }
  }
  surface(x: number, y: number) {
    if (!this.brain) return -0.1;
    this.ray.set(new THREE.Vector3(x, y, 3), this.down);
    this.ray.firstHitOnly = true;
    const hit = this.ray.intersectObject(this.brain, false)[0];
    return hit ? hit.point.z : -0.35;
  }
  updateCamera() {
    const z = this.state.zoom;
    this.camera.position.set(0.0, -2.65 / z, 6.6 / z);
    this.camera.lookAt(0, -0.04, -0.13);
    this.camera.updateMatrixWorld();
    this.pointer = null;
    this.dirty = true;
  }
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.room) {
      this.room.camera.aspect = w / h;
      this.room.camera.updateProjectionMatrix();
    }
    if (w < 680 && h > w && this.state.status === "running") this.pause();
    this.dirty = true;
  }
  lockPointer() {
    if (this.location === "room") {
      const result = this.renderer.domElement.requestPointerLock();
      if (result instanceof Promise) void result.catch(() => {});
    }
  }
  freezeInput() {
    this.state.action = false;
    this.target.copy(this.tip);
    this.previous.copy(this.tip);
    this.state.depth = this.tip.z;
    this.pointer = null;
  }
  start() {
    if (!this.loaded) return;
    this.state.status = "running";
    this.freezeInput();
    this.last = performance.now();
    this.accumulator = 0;
    this.audio.setEnabled(this.state.sound);
    logEvent(
      this.state,
      "start",
      this.location === "room"
        ? "Entered preparation room"
        : "Entered operating field",
    );
    this.dirty = true;
    this.lockPointer();
    this.emit();
  }
  pause() {
    pause(this.state);
    this.freezeInput();
    this.room?.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.emit();
    this.dirty = true;
  }
  resume() {
    if (this.state.status === "paused") this.start();
  }
  selectTool(tool: Tool) {
    this.freezeInput();
    chooseTool(this.state, tool);
    if (this.location === "surgery") {
      this.heldTool = tool;
      this.room?.hold(tool);
    }
    this.dirty = true;
    this.emit();
  }
  interactRoom() {
    if (!this.room || this.location !== "room") return;
    if (this.room.prompt === "Enter surgical view" && this.heldTool) {
      this.location = "surgery";
      this.room.keys.clear();
      if (document.pointerLockElement) document.exitPointerLock();
      this.state.action = false;
      this.pointer = null;
      logEvent(this.state, "approach", "Entered stable surgical view");
    } else if (this.room.nearTray) {
      this.heldTool = this.state.tool;
      this.room.hold(this.heldTool);
      logEvent(this.state, "pickup", `Collected ${this.heldTool}`);
    }
    this.dirty = true;
    this.emit();
  }
  setCase(id: CaseId) {
    const old = this.state;
    this.state = createState(id, old.guided, old.entry + 1);
    this.stageSnapshots.clear();
    this.state.sound = old.sound;
    this.state.quality = old.quality;
    this.location = "room";
    this.heldTool = null;
    this.room?.hold(null);
    if (this.room) {
      this.room.position.set(1.6, 1.65, 2.5);
      this.room.yaw = 0.43;
      this.room.pitch = -0.09;
      this.room.keys.clear();
      this.room.updateCamera();
    }
    if (document.pointerLockElement) document.exitPointerLock();
    this.tip.set(0.55, -0.3, 0.62);
    this.target.copy(this.tip);
    this.previous.copy(this.tip);
    this.field?.reset(this.state.pockets);
    this.updateCamera();
    this.dirty = true;
    this.emit();
  }
  restart(check = false) {
    if (check) {
      this.state = checkpoint(
        this.state,
        this.stageSnapshots.get(this.state.stage),
      );
      this.tip.set(0.55, -0.3, 0.62);
      this.target.copy(this.tip);
      this.previous.copy(this.tip);
      this.field?.reset(this.state.pockets);
      this.pointer = null;
      this.emit();
    } else {
      const id = this.state.caseId;
      this.setCase(id);
      this.start();
    }
    this.dirty = true;
  }
  toggleSound() {
    this.state.sound = !this.state.sound;
    this.audio.setEnabled(this.state.sound);
    this.emit();
  }
  setGuided(value: boolean) {
    this.state.guided = value;
    this.state.action = false;
    this.emit();
    this.dirty = true;
  }
  setQuality(value: "high" | "balanced") {
    this.state.quality = value;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, value === "high" ? 1.6 : 1),
    );
    this.renderer.shadowMap.enabled = value === "high";
    this.resize();
    this.emit();
  }
  toggleAnatomy() {
    this.state.showAnatomy = !this.state.showAnatomy;
    this.emit();
    this.dirty = true;
  }
  zoom(delta: number) {
    this.freezeInput();
    this.state.zoom = THREE.MathUtils.clamp(
      this.state.zoom + delta,
      0.85,
      1.35,
    );
    this.updateCamera();
    this.emit();
  }
  bindInput() {
    const canvas = this.renderer.domElement;
    const listen = (
      el: EventTarget,
      event: string,
      fn: EventListener,
      options?: AddEventListenerOptions,
    ) => {
      el.addEventListener(event, fn, options);
      this.cleanups.push(() => el.removeEventListener(event, fn, options));
    };
    listen(canvas, "pointermove", ((e: PointerEvent) => {
      if (this.state.status !== "running") return;
      if (this.location === "room") {
        if (!document.pointerLockElement && e.buttons === 1) {
          this.room?.look(e.movementX, e.movementY);
          this.dirty = true;
        }
        return;
      }
      if (!this.pointer) {
        this.pointer = { x: e.clientX, y: e.clientY };
        return;
      }
      const r = canvas.getBoundingClientRect(),
        factor =
          ((this.precision ? 0.24 : 1) * 3.6) / r.height / this.state.zoom;
      const dx = (e.clientX - this.pointer.x) * factor,
        dy = (e.clientY - this.pointer.y) * factor;
      this.target.x = THREE.MathUtils.clamp(this.target.x + dx, -1.65, 1.65);
      this.target.y = THREE.MathUtils.clamp(
        this.target.y - dy * 1.08,
        -1.4,
        1.4,
      );
      this.pointer = { x: e.clientX, y: e.clientY };
    }) as EventListener);
    listen(canvas, "pointerdown", ((e: PointerEvent) => {
      if (e.button === 0 && this.state.status === "running") {
        if (this.location === "room") {
          this.lockPointer();
          return;
        }
        this.state.action = true;
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    }) as EventListener);
    listen(document, "mousemove", ((e: MouseEvent) => {
      if (
        this.location === "room" &&
        this.state.status === "running" &&
        document.pointerLockElement === canvas
      ) {
        this.room?.look(e.movementX, e.movementY);
        this.dirty = true;
      }
    }) as EventListener);
    listen(document, "pointerlockchange", (() => {
      if (
        this.location === "room" &&
        this.state.status === "running" &&
        !document.pointerLockElement
      )
        this.pause();
    }) as EventListener);
    listen(window, "pointerup", (() => {
      this.state.action = false;
    }) as EventListener);
    listen(canvas, "lostpointercapture", (() => {
      if (this.state.action) this.pause();
    }) as EventListener);
    listen(canvas, "pointerleave", (() => {
      if (!this.state.action) this.pointer = null;
    }) as EventListener);
    listen(canvas, "pointercancel", (() => this.pause()) as EventListener);
    listen(
      canvas,
      "wheel",
      ((e: WheelEvent) => {
        e.preventDefault();
        if (this.state.status !== "running" || this.location !== "surgery")
          return;
        this.target.z = THREE.MathUtils.clamp(
          this.target.z -
            Math.sign(e.deltaY) * (this.precision ? 0.012 : 0.045),
          -0.55,
          1.2,
        );
        this.state.depth = this.target.z;
      }) as EventListener,
      { passive: false },
    );
    listen(window, "blur", (() => {
      this.precision = false;
      this.pause();
    }) as EventListener);
    listen(document, "visibilitychange", (() => {
      if (document.hidden) this.pause();
    }) as EventListener);
    listen(window, "keydown", ((e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "Shift") this.precision = true;
      if (e.key === "Escape" || e.key.toLowerCase() === "p") {
        e.preventDefault();
        this.onPauseRequest();
        return;
      }
      if (this.state.status !== "running") return;
      if (this.location === "room") {
        const k = e.key.toLowerCase();
        if (
          [
            "w",
            "a",
            "s",
            "d",
            "arrowleft",
            "arrowright",
            "arrowup",
            "arrowdown",
          ].includes(k)
        ) {
          this.room?.keys.add(k);
          e.preventDefault();
        }
        if (k === "e") this.interactRoom();
        if (["1", "2", "3"].includes(k) && this.room?.nearTray)
          this.selectTool(
            (["suction", "irrigation", "bipolar"] as const)[+k - 1],
          );
        return;
      }
      if (["1", "2", "3"].includes(e.key))
        this.selectTool(
          (["suction", "irrigation", "bipolar"] as const)[+e.key - 1],
        );
      if (e.key.toLowerCase() === "h") this.toggleAnatomy();
      if (e.key.toLowerCase() === "f")
        this.target.z = Math.max(
          -0.55,
          this.target.z - (this.precision ? 0.01 : 0.035),
        );
      if (e.key.toLowerCase() === "r")
        this.target.z = Math.min(
          1.2,
          this.target.z + (this.precision ? 0.01 : 0.035),
        );
      if (e.key === "=" || e.key === "+") this.zoom(0.1);
      if (e.key === "-") this.zoom(-0.1);
    }) as EventListener);
    listen(window, "keyup", ((e: KeyboardEvent) => {
      if (e.key === "Shift") this.precision = false;
      this.room?.keys.delete(e.key.toLowerCase());
    }) as EventListener);
  }
  contact(): Contact {
    let clearance = Infinity,
      vessel: string | null = null,
      shaftContact = false,
      injuryPoint: THREE.Vector3 | null = null;
    const movement = this.tip.distanceTo(this.previous),
      steps = Math.max(1, Math.min(20, Math.ceil(movement / 0.025)));
    for (let i = 0; i <= steps; i++) {
      const p = new THREE.Vector3().lerpVectors(
          this.previous,
          this.tip,
          i / steps,
        ),
        height = this.surface(p.x, p.y);
      clearance = Math.min(clearance, p.z - height);
    }
    const model = this.tools[this.state.tool],
      tree = this.brain?.geometry.boundsTree;
    if (model && tree instanceof MeshBVH) {
      const hit = sweepTool(
        this.state.tool,
        this.previous,
        this.tip,
        model.quaternion,
        tree,
        this.field?.vessels ?? [],
        (x, y) => this.surface(x, y),
      );
      shaftContact = hit.tissue;
      vessel = hit.vessel;
      injuryPoint = hit.hitPoint;
    }
    const inField =
      (this.tip.x * this.tip.x) / (1.62 * 1.62) +
        (this.tip.y * this.tip.y) / (1.35 * 1.35) <
      1;
    let pocket = -1;
    for (let i = 0; i < this.state.pockets.length; i++) {
      const p = this.state.pockets[i],
        r = p.radius * (Math.sqrt(p.remaining) * 0.85 + 0.15);
      if (
        p.remaining > 0.001 &&
        Math.hypot(this.tip.x - p.x, (this.tip.y - p.y) / 0.8) < r
      ) {
        pocket = i;
        break;
      }
    }
    const bp = this.state.bleedPosition;
    return {
      clearance,
      inField,
      pocket,
      vessel,
      shaftContact,
      tip: [this.tip.x, this.tip.y, this.tip.z],
      ...(injuryPoint
        ? {
            injuryPoint: [injuryPoint.x, injuryPoint.y, injuryPoint.z] as [
              number,
              number,
              number,
            ],
          }
        : {}),
      bleedDistance: bp
        ? Math.hypot(this.tip.x - bp[0], this.tip.y - bp[1])
        : Infinity,
    };
  }
  frame = (now: number) => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.frame);
    const delta = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (this.loaded) {
      if (this.state.status === "running" && this.location === "room") {
        this.room?.update(delta, this.heldTool, now / 1000, this.state.tool);
        this.dirty = true;
      } else if (this.state.status === "running") {
        this.accumulator += delta;
        while (this.accumulator >= 1 / 60) {
          this.previous.copy(this.tip);
          // Small, bounded interpolation keeps motion stable without adding floaty inertia.
          this.tip.lerp(this.target, 0.72);
          const c = this.contact(),
            oldStage = this.state.stage;
          tick(this.state, c, 1 / 60);
          this.accumulator -= 1 / 60;
          if (this.state.stage !== oldStage)
            this.stageSnapshots.set(
              this.state.stage,
              structuredClone(this.state),
            );
          if (this.state.status !== "running") {
            this.state.action = false;
            break;
          }
        }
        this.dirty = true;
      } else this.accumulator = 0;
      for (const [name, model] of Object.entries(this.tools))
        if (model) {
          model.visible = name === this.state.tool;
          model.position.copy(this.tip);
        }
      if (this.dirty) {
        this.field?.update(
          this.state,
          this.tip,
          this.surface(this.tip.x, this.tip.y),
          now / 1000,
        );
        if (this.field)
          this.field.contact.quaternion.copy(this.camera.quaternion);
        this.renderer.render(
          this.location === "room" && this.room ? this.room.scene : this.scene,
          this.location === "room" && this.room
            ? this.room.camera
            : this.camera,
        );
        this.dirty = false;
        this.frameCount++;
      }
      this.audio.update(
        now / 1000,
        this.state.action,
        this.state.tool,
        this.state.status === "running",
      );
      if (now - this.fpsAt > 1000) {
        this.fps =
          this.state.status === "running"
            ? Math.round((this.frameCount * 1000) / (now - this.fpsAt))
            : 60;
        this.frameCount = 0;
        this.fpsAt = now;
      }
      if (now - this.publishAt > 100) {
        this.publishAt = now;
        this.emit();
      }
    }
  };
  project(x: number, y: number, z?: number) {
    const v = new THREE.Vector3(x, y, z ?? this.surface(x, y)).project(
      this.camera,
    );
    return {
      x: ((v.x + 1) * this.host.clientWidth) / 2,
      y: ((1 - v.y) * this.host.clientHeight) / 2,
    };
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.observer.disconnect();
    this.cleanups.forEach((f) => f());
    this.audio.dispose();
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    for (const scene of [this.scene, this.room?.scene])
      scene?.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
          geometries.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            materials.add(m);
        }
      });
    for (const m of materials) {
      for (const v of Object.values(m))
        if (v instanceof THREE.Texture) textures.add(v);
      m.dispose();
    }
    geometries.forEach((g) => g.dispose());
    textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

declare global {
  interface Window {
    __SUTURE__?: Engine;
  }
}
