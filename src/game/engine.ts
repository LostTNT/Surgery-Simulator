import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import { buildField, type FieldObjects } from "./scene";
import { SurgicalAudio } from "./audio";
import { OperatingRoom } from "./room";
import { sweepTool } from "./collision";
import { tissueMaterial } from "./materials";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BoneWindow, buildBurr } from "./access";
import { SoftTissue } from "./soft-tissue";
import { InstrumentTray, TRAY_TOOLS } from "./tool-tray";
import {
  createState,
  tick,
  pause,
  chooseTool,
  checkpoint,
  logEvent,
  beginInspection as startInspection,
  cancelInspection,
  initializeProcedure,
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
  depthAssist: boolean;
  depthOffset: number;
  targets: { x: number; y: number; remaining: number }[];
  bleedTarget: { x: number; y: number } | null;
  accessPhase: "bone" | "lifting" | "surgery";
  cutProgress: number;
  cutGuide: { x: number; y: number; done: boolean }[];
  roomWaypoint: { x: number; y: number; label: string } | null;
  workstationTarget: { x: number; y: number } | null;
  trayView: boolean;
  cameraMoving: boolean;
  traySlots: { tool: Tool; x: number; y: number }[];
}
export class Engine {
  state = createState();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.05, 350);
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
  onWorkstationRequest: () => void = () => {};
  stageSnapshots = new Map<number, GameState>();
  location: "room" | "surgery" = "room";
  room: OperatingRoom | null = null;
  heldTool: Tool | null = null;
  depthAssist = true;
  depthOffset = 0;
  composer: EffectComposer;
  occlusion: SSAOPass;
  beauty: RenderPass;
  bone: BoneWindow | null = null;
  softTissue: SoftTissue | null = null;
  accessPhase: "bone" | "lifting" | "surgery" = "bone";
  trayView = false;
  trayPan = 0;
  tray: InstrumentTray | null = null;
  autoQuality = true;
  slowFrames = 0;
  constructor(host: HTMLElement, onChange: (s: Snapshot) => void) {
    this.state.tool = "drill";
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
    this.renderer.toneMappingExposure = 0.88;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D surgical field",
    );
    host.appendChild(this.renderer.domElement);
    this.composer = new EffectComposer(this.renderer);
    this.beauty = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.beauty);
    this.occlusion = new SSAOPass(this.scene, this.camera, 512, 512, 12);
    this.occlusion.kernelRadius = 0.16;
    this.occlusion.minDistance = 0.00008;
    this.occlusion.maxDistance = 0.008;
    this.composer.addPass(this.occlusion);
    this.composer.addPass(new OutputPass());
    this.camera.up.set(0, 0, 1);
    this.updateCamera();
    const pmrem = new THREE.PMREMGenerator(this.renderer),
      room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04);
    this.scene.environment = env.texture;
    pmrem.dispose();
    room.dispose();
    this.cleanups.push(() => env.dispose());
    this.scene.environmentIntensity = 0.38;
    this.scene.add(new THREE.HemisphereLight(0xdce9ef, 0x25312c, 0.48));
    const light = new THREE.SpotLight(0xfff4e7, 80, 15, Math.PI / 7, 0.48, 2);
    light.position.set(-0.6, -1, 5.5);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.normalBias = 0.018;
    light.shadow.radius = 3;
    light.shadow.bias = -0.0005;
    this.scene.add(light, light.target);
    const fill = new THREE.DirectionalLight(0xc0e2ed, 0.32);
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
    let roomWaypoint: Snapshot["roomWaypoint"] = null;
    let workstationTarget: Snapshot["workstationTarget"] = null;
    if (this.room) {
      const p = (
        this.heldTool ? this.room.scopePosition : this.room.workstationPosition
      ).clone();
      if (this.heldTool) p.y += 0.6;
      p.project(this.room.camera);
      roomWaypoint = {
        x: THREE.MathUtils.clamp(
          ((p.x + 1) * this.host.clientWidth) / 2,
          80,
          this.host.clientWidth - 80,
        ),
        y: THREE.MathUtils.clamp(
          ((1 - p.y) * this.host.clientHeight) / 2,
          100,
          this.host.clientHeight - 150,
        ),
        label: this.heldTool ? "Microscope" : "Case workstation",
      };
      const monitor = this.room.workstationPosition.clone().project(this.room.camera);
      if (monitor.z > -1 && monitor.z < 1 && Math.abs(monitor.x) < 0.92 && Math.abs(monitor.y) < 0.8)
        workstationTarget = {
          x: ((monitor.x + 1) * this.host.clientWidth) / 2,
          y: ((1 - monitor.y) * this.host.clientHeight) / 2,
        };
    }
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
      depthAssist: this.depthAssist,
      depthOffset: this.depthOffset,
      targets: this.state.pockets.map((p) => ({
        ...this.project(p.x, p.y, this.surface(p.x, p.y) + 0.07),
        remaining: p.remaining,
      })),
      bleedTarget: this.state.bleedPosition
        ? this.project(
            this.state.bleedPosition[0],
            this.state.bleedPosition[1],
            this.surface(this.state.bleedPosition[0], this.state.bleedPosition[1]) + 0.07,
          )
        : null,
      accessPhase: this.accessPhase,
      cutProgress: this.bone?.cut.progress ?? 0,
      cutGuide:
        this.bone?.cut.path.map((p) => ({
          ...this.project(p.x, p.y, this.bone!.height(p.x, p.y)),
          done: this.bone!.cut.at(p.x, p.y) > 0.82,
        })) ?? [],
      roomWaypoint,
      workstationTarget,
      trayView: this.trayView,
      cameraMoving:
        Math.abs(
          this.trayPan - (this.location === "surgery" && this.trayView ? 1 : 0),
        ) > 0.001,
      traySlots:
        this.tray?.slots.map((s) => ({
          tool: s.tool,
          ...this.project(s.x - 0.12, s.y + 0.17, s.z),
        })) ?? [],
    };
  }
  emit() {
    if (!this.disposed) this.onChange(this.snapshot());
  }
  async load() {
    try {
      const loader = new GLTFLoader();
      const assetBase = import.meta.env.BASE_URL;
      const [
        anatomy,
        suction,
        irrigation,
        bipolar,
        drape,
        corticalTexture,
        boneTexture,
      ] = await Promise.all([
        loader.loadAsync(`${assetBase}models/cortex.glb`),
        loader.loadAsync(`${assetBase}models/suction.glb`),
        loader.loadAsync(`${assetBase}models/irrigation.glb`),
        loader.loadAsync(`${assetBase}models/bipolar.glb`),
        new THREE.TextureLoader().loadAsync(`${assetBase}textures/drape.png`),
        new THREE.TextureLoader().loadAsync(
          `${assetBase}textures/cortex-detail.webp`,
        ),
        new THREE.TextureLoader().loadAsync(`${assetBase}textures/bone.webp`),
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
          o.material = tissueMaterial(corticalTexture);
          o.geometry.boundsTree = new MeshBVH(o.geometry);
          o.raycast = acceleratedRaycast;
          o.receiveShadow = true;
          o.castShadow = true;
        }
      });
      if (!this.brain)
        throw new Error("The anatomy asset did not contain a surface.");
      this.scene.add(anatomy.scene);
      this.softTissue = new SoftTissue(this.brain);
      this.scene.updateMatrixWorld(true);
      this.field = buildField(
        this.scene,
        (x, y) => this.surface(x, y),
        drape,
        this.state.pockets,
        this.brain,
        boneTexture,
      );
      this.bone = new BoneWindow(this.scene, boneTexture);
      for (const [name, model] of [
        ["suction", suction],
        ["irrigation", irrigation],
        ["bipolar", bipolar],
      ] as const) {
        const group = new THREE.Group();
        group.add(model.scene);
        group.rotation.set(0, -0.85, -0.48);
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
      const burr = buildBurr();
      burr.name = "drill";
      burr.rotation.set(0, -0.85, -0.48);
      this.tools.drill = burr;
      this.scene.add(burr);
      this.room = new OperatingRoom(
        this.scene.environment as THREE.Texture,
        drape,
      );
      this.room.installTools(this.tools);
      this.tray = new InstrumentTray(this.scene, this.tools, drape);
      // A shared 3D room, expressed in the close camera's surgical units. The
      // cloned geometry/materials keep the optical view and walking view aligned.
      const station = new THREE.Matrix4().compose(
        new THREE.Vector3(0, 1.13, -1.03),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(-Math.PI / 2, 0, 0),
        ),
        new THREE.Vector3(0.035, 0.035, 0.035),
      );
      const backdrop = this.room.scene.clone(true);
      backdrop.traverse((o) => {
        if (o instanceof THREE.Light) {
          o.castShadow = false;
          if (o instanceof THREE.HemisphereLight) o.intensity = 0;
          else if (
            o instanceof THREE.PointLight ||
            o instanceof THREE.SpotLight
          ) {
            o.intensity *= 0.28 / (0.035 * 0.035);
            if (o.distance > 0) o.distance /= 0.035;
          } else o.intensity *= 0.28;
        }
        if (o instanceof THREE.Mesh) {
          const p = o.getWorldPosition(new THREE.Vector3());
          if (
            Math.abs(p.x - 0.04) < 0.22 &&
            Math.abs(p.z + 1.03) < 0.3 &&
            p.y > 0.85 &&
            p.y < 1.9
          )
            o.visible = false;
        }
      });
      backdrop.applyMatrix4(station.clone().invert());
      const preview = this.scene.clone(true);
      preview.traverse((o) => {
        if (o instanceof THREE.Light) o.visible = false;
        if (Object.values(this.tools).some((t) => t?.name && t.name === o.name))
          o.visible = false;
      });
      preview.applyMatrix4(station);
      this.room.scene.add(preview);
      this.scene.add(backdrop);
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
    const z = this.state.zoom * (1 - this.trayPan * 0.28);
    const fit = Math.min(1, this.camera.aspect / 0.95);
    const x = this.trayPan * 2.25;
    this.camera.position.set(
      x,
      (-2.65 - this.trayPan * 3.2) / z / fit - this.trayPan * 0.25,
      6.6 / z / fit,
    );
    this.camera.lookAt(x, -0.04 - this.trayPan * 0.25, -0.13);
    this.camera.updateMatrixWorld();
    this.pointer = null;
    this.dirty = true;
  }
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.updateCamera();
    if (this.room) {
      this.room.camera.aspect = w / h;
      this.room.camera.updateProjectionMatrix();
    }
    this.dirty = true;
  }
  lockPointer() {
    if (this.location === "room") {
      try {
        const result = this.renderer.domElement.requestPointerLock?.();
        if (result instanceof Promise) void result.catch(() => {});
      } catch {
        /* Drag and arrow-key look remain available. */
      }
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
    this.emit();
  }
  startSurgery() {
    if (!this.loaded) return;
    this.location = "surgery";
    this.trayView = this.heldTool === null;
    this.room?.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.start();
  }
  startRoom() {
    this.location = "room";
    this.start();
  }
  openWorkstation() {
    if (!this.loaded || this.location !== "room") return;
    this.freezeInput();
    this.room?.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.onWorkstationRequest();
  }
  setDepthAssist(value: boolean) {
    this.freezeInput();
    this.depthAssist = value;
    this.depthOffset = 0;
    this.emit();
  }
  liftBone() {
    if (
      this.state.status !== "running" ||
      this.accessPhase !== "bone" ||
      !this.bone?.lift()
    )
      return;
    this.freezeInput();
    this.accessPhase = "lifting";
    logEvent(this.state, "stage", "Bone window opened");
    this.emit();
  }
  beginInspection() {
    if (
      this.state.status !== "running" ||
      this.location !== "surgery" ||
      this.accessPhase !== "surgery" ||
      this.trayView ||
      this.trayPan > 0.001
    )
      return false;
    this.freezeInput();
    if (!startInspection(this.state)) {
      this.emit();
      return false;
    }
    // Rest the hand clear of the field so manual depth cannot cause injury
    // during a deliberate examination, even if the last working tip was low.
    this.tip.set(0, 0, this.surface(0, 0) + 0.65);
    this.target.copy(this.tip);
    this.previous.copy(this.tip);
    this.state.depth = this.tip.z;
    this.dirty = true;
    this.emit();
    return true;
  }
  aimAt(clientX: number, clientY: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((clientX - r.left) / r.width) * 2 - 1,
        1 - ((clientY - r.top) / r.height) * 2,
      ),
      this.camera,
    );
    if (this.accessPhase === "bone" && this.bone) {
      // Aim on the original convex shell so a deepening groove cannot pull
      // the pointer sideways. Working depth follows the carved surface.
      const p = new THREE.Vector3();
      let z = 0.5;
      for (let i = 0; i < 5; i++) {
        this.ray.ray.at(
          (z - this.ray.ray.origin.z) / this.ray.ray.direction.z,
          p,
        );
        z = this.bone.height(p.x, p.y);
      }
      this.target.x = THREE.MathUtils.clamp(p.x, -1.75, 1.75);
      this.target.y = THREE.MathUtils.clamp(p.y, -1.5, 1.5);
      return;
    }
    const aimMesh = this.accessPhase === "bone" ? this.bone?.mesh : this.brain;
    const hit = aimMesh ? this.ray.intersectObject(aimMesh, false)[0] : null;
    const point =
      hit?.point ??
      this.ray.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
        new THREE.Vector3(),
      );
    if (!point) return;
    this.target.x = THREE.MathUtils.clamp(point.x, -1.75, 1.75);
    this.target.y = THREE.MathUtils.clamp(point.y, -1.5, 1.5);
    this.pointer = { x: clientX, y: clientY };
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
  toggleTray() {
    if (this.state.status !== "running" || this.location !== "surgery") return;
    cancelInspection(this.state);
    this.freezeInput();
    this.trayView = !this.trayView;
    this.dirty = true;
    this.emit();
  }
  placeTool() {
    if (this.location !== "surgery" || !this.trayView || !this.heldTool) return;
    this.freezeInput();
    logEvent(this.state, "handoff", `Placed ${this.heldTool} on tray`);
    this.heldTool = null;
    this.tray?.update(null);
    this.dirty = true;
    this.emit();
  }
  selectTool(tool: Tool) {
    if (this.location === "surgery") {
      if (!this.trayView || this.heldTool) return;
      this.freezeInput();
      chooseTool(this.state, tool);
      this.tip.z = 1;
      this.target.copy(this.tip);
      this.previous.copy(this.tip);
      this.state.depth = this.tip.z;
      this.depthOffset = 0;
      this.heldTool = tool;
      this.trayView = false;
      this.tray?.update(tool);
      logEvent(this.state, "pickup", `Picked up ${tool} from surgical tray`);
    } else {
      this.freezeInput();
      chooseTool(this.state, tool);
    }
    this.dirty = true;
    this.emit();
  }
  interactRoom() {
    if (!this.room || this.location !== "room") return;
    if (this.room.prompt === "Use case workstation") {
      this.openWorkstation();
      return;
    }
    if (this.room.prompt === "Enter surgical view" && this.heldTool) {
      this.location = "surgery";
      if (this.accessPhase === "bone") {
        chooseTool(this.state, "drill");
        this.heldTool = "drill";
      }
      this.trayView = false;
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
    this.state.tool = "drill";
    this.accessPhase = "bone";
    this.bone?.reset();
    this.softTissue?.reset();
    this.depthOffset = 0;
    this.stageSnapshots.clear();
    this.state.sound = old.sound;
    this.state.quality = old.quality;
    this.location = "room";
    this.heldTool = null;
    this.trayView = false;
    this.trayPan = 0;
    this.tray?.update(null);
    this.room?.hold(null);
    this.room?.setCase(id);
    if (this.room) {
      this.room.position.set(1.85, 1.65, 2.65);
      this.room.yaw = 0.16;
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
      if (this.accessPhase !== "surgery") {
        this.bone?.reset();
        this.accessPhase = "bone";
        this.state.tool = "drill";
      }
      this.tip.set(0.55, -0.3, 0.62);
      this.heldTool = null;
      this.trayView = true;
      this.tray?.update(null);
      this.depthOffset = 0;
      this.softTissue?.reset();
      this.target.copy(this.tip);
      this.previous.copy(this.tip);
      this.field?.reset(this.state.pockets);
      this.pointer = null;
      this.emit();
    } else {
      const id = this.state.caseId;
      const wasSurgery = this.location === "surgery";
      this.setCase(id);
      if (wasSurgery) this.startSurgery();
      else this.start();
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
  setQuality(value: "high" | "balanced", automatic = false) {
    this.autoQuality = automatic;
    this.state.quality = value;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, value === "high" ? 1.6 : 0.8),
    );
    this.renderer.shadowMap.enabled = value === "high";
    this.composer.setPixelRatio(
      Math.min(window.devicePixelRatio, value === "high" ? 1.6 : 0.8),
    );
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
      if (!this.trayView && this.heldTool && !this.state.inspectionActive)
        this.aimAt(e.clientX, e.clientY);
    }) as EventListener);
    listen(canvas, "pointerdown", ((e: PointerEvent) => {
      if (e.button === 0 && this.state.status === "running") {
        if (this.location === "room") {
          const r = canvas.getBoundingClientRect();
          const captured = document.pointerLockElement === canvas;
          this.ray.setFromCamera(
            new THREE.Vector2(
              captured ? 0 : ((e.clientX - r.left) / r.width) * 2 - 1,
              captured ? 0 : 1 - ((e.clientY - r.top) / r.height) * 2,
            ),
            this.room!.camera,
          );
          if (this.room?.isWorkstationHit(this.ray)) {
            this.openWorkstation();
            return;
          }
          this.lockPointer();
          return;
        }
        if (this.trayView) {
          const r = canvas.getBoundingClientRect();
          this.ray.setFromCamera(
            new THREE.Vector2(
              ((e.clientX - r.left) / r.width) * 2 - 1,
              1 - ((e.clientY - r.top) / r.height) * 2,
            ),
            this.camera,
          );
          const hit = this.tray?.hit(this.ray);
          if (this.heldTool && hit === "place") this.placeTool();
          else if (hit && hit !== "place") this.selectTool(hit);
          return;
        }
        if (!this.heldTool || this.trayPan > 0.001) return;
        cancelInspection(this.state);
        this.state.action = true;
        this.aimAt(e.clientX, e.clientY);
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
        if (this.depthAssist) {
          this.depthOffset = THREE.MathUtils.clamp(
            this.depthOffset - Math.sign(e.deltaY) * 0.018,
            -0.18,
            0.65,
          );
          return;
        }
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
            this.accessPhase === "bone"
              ? "drill"
              : (["suction", "irrigation", "bipolar"] as const)[+k - 1],
          );
        return;
      }
      if (e.key.toLowerCase() === "t") this.toggleTray();
      if (e.key.toLowerCase() === "e") {
        if (e.repeat) return;
        e.preventDefault();
        if (this.trayView) this.placeTool();
        else if (this.accessPhase === "surgery") this.beginInspection();
        else this.liftBone();
      }
      if (["1", "2", "3", "4"].includes(e.key)) {
        if (this.trayView && !this.heldTool)
          this.selectTool(TRAY_TOOLS[+e.key - 1]);
        else if (!this.trayView) this.toggleTray();
      }
      if (e.key.toLowerCase() === "h") this.toggleAnatomy();
      if (e.key.toLowerCase() === "q") this.setDepthAssist(!this.depthAssist);
      if (e.key.toLowerCase() === "f" && !this.depthAssist)
        this.target.z = Math.max(
          -0.55,
          this.target.z - (this.precision ? 0.01 : 0.035),
        );
      if (e.key.toLowerCase() === "r" && !this.depthAssist)
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
    if (!this.depthAssist && model && tree instanceof MeshBVH) {
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
    // The assisted hand tracks the real surface and keeps the shaft elevated.
    // Manual mode retains the swept shaft/vessel collision challenge.
    if (this.depthAssist) {
      clearance = this.tip.z - this.surface(this.tip.x, this.tip.y);
      shaftContact = false;
      if (clearance < 0.035)
        vessel =
          this.field?.vessels.find((v) =>
            v.points.some(
              (p) => p.distanceToSquared(this.tip) < (v.radius + 0.04) ** 2,
            ),
          )?.name ?? null;
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
    const frameDelta = (now - this.last) / 1000;
    const delta = Math.min(frameDelta, 0.1);
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
          if (this.depthAssist && !this.state.inspectionActive) {
            const bone = this.accessPhase !== "surgery";
            const surface = (x: number, y: number) =>
              bone && this.bone
                ? this.bone.height(x, y) - this.bone.cut.at(x, y) * 0.16
                : this.surface(x, y);
            const clearance = this.state.action ? (bone ? 0.025 : 0.11) : 0.38;
            this.target.z =
              surface(this.target.x, this.target.y) +
              clearance +
              this.depthOffset;
            this.tip.lerp(this.target, this.precision ? 0.18 : 0.48);
            // Follow every intervening ridge instead of cutting through it.
            this.tip.z =
              surface(this.tip.x, this.tip.y) + clearance + this.depthOffset;
            this.state.depth = this.tip.z;
          } else if (!this.state.inspectionActive)
            this.tip.lerp(this.target, this.precision ? 0.18 : 0.48);
          if (this.accessPhase !== "surgery") {
            this.state.elapsed += 1 / 60;
            this.state.clearance =
              this.tip.z -
              (this.bone
                ? this.bone.height(this.tip.x, this.tip.y) -
                  this.bone.cut.at(this.tip.x, this.tip.y) * 0.16
                : 0.5);
            if (
              this.accessPhase === "bone" &&
              this.state.action &&
              this.state.tool === "drill" &&
              this.state.clearance < 0.12 &&
              this.state.clearance > -0.12
            )
              this.bone?.carve(this.tip.x, this.tip.y, 1 / 60);
            this.accumulator -= 1 / 60;
            continue;
          }
          const operative =
            !this.trayView && this.heldTool !== null && this.trayPan <= 0.001;
          const c: Contact = operative
            ? this.contact()
            : {
                clearance: 0.38,
                inField: false,
                pocket: -1,
                vessel: null,
                shaftContact: false,
                tip: [this.tip.x, this.tip.y, this.tip.z],
                bleedDistance: Infinity,
              };
          const oldStage = this.state.stage;
          tick(this.state, c, 1 / 60);
          this.softTissue?.update(
            this.tip,
            c.clearance,
            this.state.action,
            1 / 60,
          );
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
      if (this.location === "surgery" && this.state.status === "running") {
        this.bone?.update(delta);
        if (
          this.accessPhase === "lifting" &&
          (this.bone?.liftTime ?? 0) > 1.3
        ) {
          this.accessPhase = "surgery";
          initializeProcedure(this.state);
          if (this.state.bleedPosition) {
            const [x, y] = this.state.bleedPosition;
            this.state.bleedPosition[2] = this.surface(x, y) + 0.03;
          }
          this.stageSnapshots.set(0, structuredClone(this.state));
          this.depthOffset = 0;
          this.trayView = true;
          this.freezeInput();
        }
      }
      for (const [name, model] of Object.entries(this.tools))
        if (model) {
          model.visible =
            this.location === "surgery" &&
            name === this.heldTool &&
            !this.state.inspectionActive;
          if (this.trayView) model.position.set(0.7, -2.5, 1.6);
          else model.position.copy(this.tip);
          if (
            name === "drill" &&
            this.state.action &&
            this.state.status === "running"
          )
            model.children[0].rotation.x += delta * 50;
        }
      const panTarget = this.location === "surgery" && this.trayView ? 1 : 0;
      if (Math.abs(this.trayPan - panTarget) > 0.0001) {
        this.trayPan = THREE.MathUtils.damp(
          this.trayPan,
          panTarget,
          8,
          Math.min(frameDelta, 0.5),
        );
        if (Math.abs(this.trayPan - panTarget) < 0.001)
          this.trayPan = panTarget;
        this.updateCamera();
      }
      this.tray?.update(this.heldTool);
      if (this.dirty) {
        this.field?.update(
          this.state,
          this.tip,
          this.surface(this.tip.x, this.tip.y),
          now / 1000,
        );
        if (
          this.field &&
          (this.accessPhase !== "surgery" || this.trayView || !this.heldTool || this.state.inspectionActive)
        ) {
          this.field.guide.visible = false;
          this.field.contact.visible = false;
          this.field.stream.visible = false;
        }
        if (this.field)
          this.field.contact.quaternion.copy(this.camera.quaternion);
        const scene =
          this.location === "room" && this.room ? this.room.scene : this.scene;
        const camera =
          this.location === "room" && this.room
            ? this.room.camera
            : this.camera;
        if (this.state.quality === "high") {
          this.beauty.scene = scene;
          this.beauty.camera = camera;
          this.occlusion.scene = scene;
          this.occlusion.camera = camera;
          const u = this.occlusion.ssaoMaterial.uniforms;
          u.cameraNear.value = camera.near;
          u.cameraFar.value = camera.far;
          u.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
          u.cameraInverseProjectionMatrix.value.copy(
            camera.projectionMatrixInverse,
          );
          this.composer.render();
        } else this.renderer.render(scene, camera);
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
        if (
          this.autoQuality &&
          this.state.status === "running" &&
          this.state.quality === "high"
        ) {
          this.slowFrames = this.fps < 25 ? this.slowFrames + 1 : 0;
          if (this.slowFrames >= 2) this.setQuality("balanced", true);
        }
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
    this.composer.passes.forEach((pass) => pass.dispose());
    this.composer.dispose();
    this.renderer.domElement.remove();
  }
}

declare global {
  interface Window {
    __SUTURE__?: Engine;
  }
}
