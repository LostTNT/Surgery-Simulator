import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import { buildField, type FieldObjects } from "./scene";
import { SurgicalAudio } from "./audio";
import { OperatingRoom } from "./room";
import { sweepTool } from "./collision";
import { tissueMaterial } from "./materials";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { addGlove, latex as gloveLatex } from "./gloves";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { gradeShader, makeSplat } from "./grade";
import { Skull } from "./skull";
import { loadPatientHead, placeHead, HEAD_POSE, type PatientHead } from "./patient";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BoneWindow, buildBurr } from "./access";
import { SoftTissue } from "./soft-tissue";
import { InstrumentTray, TRAY_TOOLS, CLIP_TRAY_TOOLS, TUMOR_TRAY_TOOLS } from "./tool-tray";
import { buildTumor, type TumorObjects } from "./tumor";
import { buildWounds, type WoundObjects } from "./wounds";
import { buildAneurysm, buildClip, type AneurysmObjects } from "./aneurysm";
import { DIFFICULTIES, vitalsLevel, type Difficulty } from "./vitals";
import {
  createState,
  tick,
  pause,
  chooseTool,
  checkpoint,
  aimDrain,
  driveDrain,
  secureDrain,
  logEvent,
  beginInspection as startInspection,
  cancelInspection,
  initializeProcedure,
  CASES,
  TOOLS,
  type GameState,
  type CaseId,
  type Quality,
  type Tool,
  type Contact,
} from "./simulation";

const CLEAN_GLOVE = new THREE.Color(0xd9c39a),
  BLOODY_GLOVE = new THREE.Color(0x6b2a24);
const DEATH = /pressure collapsed|blood was lost|herniat|bleeding source/i;
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
  belt: Tool[];
  swapping: boolean;
  locked: boolean;
  canLock: boolean;
  scope: boolean;
}
export class Engine {
  state = createState();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(52, 1, 0.03, 350);
  renderer: THREE.WebGLRenderer;
  host: HTMLElement;
  brain: THREE.Mesh | null = null;
  field: FieldObjects | null = null;
  aneurysm: AneurysmObjects | null = null;
  tumor: TumorObjects | null = null;
  wounds: WoundObjects | null = null;
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
  bokeh: BokehPass;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  camBase = new THREE.Vector3();
  camLook = new THREE.Vector3();
  beauty: RenderPass;
  bone: BoneWindow | null = null;
  softTissue: SoftTissue | null = null;
  accessPhase: "bone" | "lifting" | "surgery" = "bone";
  trayView = false;
  skull = new Skull();
  patient: PatientHead | null = null;
  /** Re-sample the skull surface after the head has moved (also used to tune the pose in development). */
  rebuildSkull(pose?: Partial<typeof HEAD_POSE> & { rz?: number }) {
    if (!this.patient) return;
    Object.assign(HEAD_POSE, pose);
    if (pose?.rz !== undefined) this.patient.mesh.rotation.z = pose.rz;
    placeHead(this.patient.mesh);
    let mesh: THREE.Mesh | null = null;
    this.patient.mesh.traverse((o) => {
      if (!mesh && o instanceof THREE.Mesh) mesh = o;
    });
    if (mesh) this.skull.build(mesh);
  }
  lamp: THREE.SpotLight | null = null;
  pmrem!: THREE.PMREMGenerator;
  /** A press made while the instrument is still being handed over starts working once it arrives. */
  pendingPress = false;
  lastClient = { x: 0, y: 0 };
  /** The arrival fly-in: the camera glides from the doorway to your place at the head of the table. */
  arrival: { t: number; dur: number; start: number } | null = null;
  beginArrival(seconds: number) {
    this.location = "surgery";
    this.heldTool = null;
    this.trayView = false;
    this.arrival = { t: 0, dur: Math.max(4, seconds), start: performance.now() };
    this.state.status = "ready";
    this.dirty = true;
  }
  endArrival() {
    this.arrival = null;
    if (this.lamp) this.lamp.intensity = 230;
  }
  stepArrival() {
    const a = this.arrival;
    if (!a) return;
    // Wall-clock time, so the camera move stays in step with the subtitles on slow machines.
    a.t = (performance.now() - a.start) / 1000;
    const u = Math.min(1, a.t / a.dur),
      e = u * u * (3 - 2 * u);
    const from = new THREE.Vector3(-7.4, -9.2, 3.4),
      to = new THREE.Vector3(0, -2.3, 5.8);
    this.fp.pos.lerpVectors(from, to, e);
    const head = new THREE.Vector3(0, 0, -0.4),
      toward = head.clone().sub(this.fp.pos).normalize(),
      home = new THREE.Vector3(0, 2.3, -5.9).normalize(),
      dir = toward.lerp(home, Math.pow(e, 2.2)).normalize();
    this.fp.yaw = Math.atan2(dir.y, dir.x);
    this.fp.pitch = Math.asin(dir.z);
    // The operating lamp stutters on like a tired fluorescent, then holds.
    if (this.lamp) {
      const s = a.t;
      const flick = s < 0.7 ? 0 : s < 1.6 ? (Math.sin(s * 47) > 0.2 ? 1 : 0.08) : s < 2.4 ? (Math.sin(s * 23) > -0.5 ? 1 : 0.3) : 1;
      this.lamp.intensity = 230 * flick;
    }
    this.updateCamera();
  }
  /** First-person rig: where the surgeon's eyes are in the operating-room world. */
  fp = { pos: new THREE.Vector3(0, -2.3, 5.8), yaw: Math.PI / 2, pitch: -1.2 };
  fpKeys = new Set<string>();
  locked = false;
  lockFailed = false;
  scope = false;
  /** Automation and touch cannot capture the pointer; they keep the fixed pose and pointer aim. */
  get canLock() {
    return typeof navigator !== "undefined" && !navigator.webdriver && !this.lockFailed;
  }
  /** Browsers refuse a new lock for about a second after Esc; that must not disable mouse look for good. */
  markLockFailed() {
    this.lockFailed = true;
    setTimeout(() => {
      this.lockFailed = false;
      this.emit();
    }, 1500);
  }
  /** Give the mouse back on purpose, without the unlock being treated as the player pressing Esc. */
  releaseLock() {
    if (!document.pointerLockElement) return;
    this.releasing = true;
    document.exitPointerLock();
  }
  releasing = false;
  mouseDown = false;
  resetCamera() {
    this.fp.pos.set(0, -2.3, 5.8);
    this.fp.yaw = Math.PI / 2;
    this.fp.pitch = -1.2;
    this.fpKeys.clear();
    this.updateCamera();
  }
  forward() {
    const { yaw, pitch } = this.fp;
    return new THREE.Vector3(Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch));
  }
  /** 0..1 spike that smears the lens when the surgeon hurts the patient. */
  jolt = 0;
  lastHurt = "";
  /** 0..1 blood on the lens; wiped by suction or irrigation. */
  lensBlood = 0;
  swap: { t: number; to: Tool; done: boolean } | null = null;
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
    this.renderer.toneMappingExposure = 1.0;
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
    // A microscope has a very shallow depth of field and bright wet highlights bloom.
    this.bokeh = new BokehPass(this.scene, this.camera, {
      focus: 7,
      aperture: 0.00006,
      maxblur: 0.0065,
    });
    this.composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.34, 0.35, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(gradeShader);
    this.grade.uniforms.tSplat.value = new THREE.CanvasTexture(makeSplat());
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.camera.up.set(0, 0, 1);
    this.updateCamera();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const env = this.pmrem.fromScene(room, 0.04);
    this.scene.environment = env.texture;
    room.dispose();
    this.cleanups.push(() => env.dispose());
    this.scene.environmentIntensity = 0.2;
    this.scene.add(new THREE.HemisphereLight(0x8fb3c8, 0x0e1413, 0.16));
    // One hard, warm operating lamp: the head sits in a pool of light, the room falls away.
    const light = new THREE.SpotLight(0xfff0dc, 230, 18, Math.PI / 8, 0.38, 2);
    light.position.set(-1.8, -1.6, 7.4);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.normalBias = 0.018;
    light.shadow.radius = 3;
    light.shadow.bias = -0.0005;
    this.scene.add(light, light.target);
    this.lamp = light;
    const fill = new THREE.DirectionalLight(0x9fc4dc, 0.12);
    fill.position.set(3, 2, 4);
    this.scene.add(fill);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.bindInput();
    this.resize();
    void this.load();
    this.frameId = requestAnimationFrame(this.frame);
  }
  /** Instruments the scrub nurse can hand you right now. */
  get belt(): Tool[] {
    const kind = CASES[this.state.caseId].kind;
    if (kind === "washout")
      return this.accessPhase === "surgery"
        ? ["suction", "irrigation", "bipolar"]
        : ["drill"];
    return this.tray?.tools ?? TRAY_TOOLS;
  }
  /** Put the right instrument in hand without animation (start of an operation or a retry). */
  equipDefault() {
    const tool = this.belt[0];
    this.heldTool = tool;
    chooseTool(this.state, tool);
    this.swap = null;
    this.trayView = false;
    this.tray?.update(tool);
    this.tip.set(0.55, -0.3, 0.62);
    this.target.copy(this.tip);
    this.previous.copy(this.tip);
  }
  /** Ask the scrub nurse for an instrument: the old one drops, the new one rises. */
  swapTool(tool: Tool) {
    if (this.location !== "surgery" || this.state.status !== "running") return;
    if (this.swap || tool === this.heldTool || !this.belt.includes(tool)) return;
    cancelInspection(this.state);
    this.freezeInput();
    if (this.mouseDown) this.pendingPress = true;
    this.swap = { t: 0, to: tool, done: false };
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
      belt: this.belt,
      swapping: this.swap !== null,
      locked: this.locked,
      canLock: this.canLock,
      scope: this.scope,
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
      try {
        // A real operating-room HDRI (Poly Haven, CC0) gives wet tissue and steel true reflections.
        const hdr = await new HDRLoader().loadAsync(`${assetBase}env/surgery_1k.hdr`);
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        const env = this.pmrem.fromEquirectangular(hdr);
        this.scene.environment = env.texture;
        this.scene.environmentIntensity = 0.55;
        hdr.dispose();
      } catch {
        /* the built-in room environment stays */
      }
      try {
        const head = await loadPatientHead(assetBase, loader);
        if (this.disposed) return;
        this.patient = head;
        this.rebuildSkull();
        this.scene.add(head.mesh);
      } catch {
        this.patient = null; // the flat plate with a gentle dome remains
      }
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
          if (this.skull.hasHead) {
            // Bend the cortex to follow the curve of the patient's skull, so it sits under the bone.
            const base = this.skull.bone(0, 0);
            for (let i = 0; i < positions.count; i++)
              positions.setZ(
                i,
                positions.getZ(i) + (this.skull.bone(positions.getX(i), positions.getY(i)) - base),
              );
            positions.needsUpdate = true;
            o.geometry.computeVertexNormals();
            o.geometry.computeBoundingBox();
            o.geometry.computeBoundingSphere();
          }
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
        this.skull,
      );
      this.aneurysm = buildAneurysm(this.scene, (x, y) => this.surface(x, y));
      this.tumor = buildTumor(this.scene, (x, y) => this.surface(x, y), this.brain);
      this.wounds = buildWounds(this.scene, (x, y) => this.surface(x, y), this.brain);
      this.bone = new BoneWindow(this.scene, boneTexture, this.skull);
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
      const clip = buildClip();
      clip.name = "clip";
      this.tools.clip = clip;
      this.scene.add(clip);
      const burr = buildBurr();
      burr.name = "drill";
      burr.rotation.set(0, -0.85, -0.48);
      this.tools.drill = burr;
      this.scene.add(burr);
      for (const [name, tool] of Object.entries(this.tools))
        if (tool) {
          // Instruments were modelled small: a real bipolar is about 20 cm.
          if (name === "suction" || name === "irrigation" || name === "bipolar") tool.scale.setScalar(1.7);
          if (name === "drill") tool.scale.setScalar(1.35);
          addGlove(tool.getObjectByName("shaft") ?? tool);
        }
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
            o.intensity *= 0.14 / (0.035 * 0.035);
            if (o.distance > 0) o.distance /= 0.035;
          } else o.intensity *= 0.14;
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
    const f = this.forward();
    // Keep the same horizontal view on narrow (portrait) screens by widening the vertical angle.
    const baseFov = (this.scope ? 24 : 52) / this.state.zoom,
      aspect = this.camera.aspect || 1.6;
    this.camera.fov =
      aspect < 1.3
        ? Math.min(98, THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) * 1.3) / aspect)))
        : baseFov;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.fp.pos);
    this.camBase.copy(this.fp.pos);
    this.camLook.copy(this.fp.pos).addScaledVector(f, 10);
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(this.camLook);
    this.camera.updateMatrixWorld();
    this.pointer = null;
    this.dirty = true;
  }
  /** Walk, lean and look. W/S move along the view so you can lean in over the head. */
  stepCamera(dt: number) {
    if (this.location !== "surgery" || this.state.status !== "running") return;
    const f = this.forward(),
      right = new THREE.Vector3(f.y, -f.x, 0).normalize(),
      move = new THREE.Vector3();
    if (this.fpKeys.has("w")) move.add(f);
    if (this.fpKeys.has("s")) move.sub(f);
    if (this.fpKeys.has("d")) move.add(right);
    if (this.fpKeys.has("a")) move.sub(right);
    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar((this.precision ? 1.1 : 3.4) * dt);
    const p = this.fp.pos.add(move);
    // You are standing at the head of the table: a band of positions around the patient's head.
    p.z = THREE.MathUtils.clamp(p.z, 3.4, 7.4);
    const radius = Math.hypot(p.x, p.y);
    const azimuth = Math.atan2(p.y, p.x);
    const side = -Math.PI / 2;
    const swing = THREE.MathUtils.clamp(Math.atan2(Math.sin(azimuth - side), Math.cos(azimuth - side)), -1.0, 1.0);
    const r = THREE.MathUtils.clamp(radius, 0.6, 8.2);
    p.x = Math.cos(side + swing) * r;
    p.y = Math.sin(side + swing) * r;
    this.fp.pitch = THREE.MathUtils.clamp(this.fp.pitch, -1.5, 0.2);
    this.updateCamera();
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
    try {
      const result = this.renderer.domElement.requestPointerLock?.();
      if (result instanceof Promise)
        void result.catch(() => this.markLockFailed());
    } catch {
      this.markLockFailed();
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
    this.trayView = false;
    this.resetCamera();
    if (!this.heldTool || !this.belt.includes(this.heldTool)) this.equipDefault();
    this.room?.keys.clear();
    this.releaseLock();
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
    this.releaseLock();
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
  aimAt(clientX: number, clientY: number, strict = false) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((clientX - r.left) / r.width) * 2 - 1,
        1 - ((clientY - r.top) / r.height) * 2,
      ),
      this.camera,
    );
    if (this.accessPhase === "bone" && this.bone) {
      if (strict && this.ray.ray.direction.z > -0.15) return; // looking sideways: nothing to cut
      // Aim on the original convex shell so a deepening groove cannot pull
      // the pointer sideways. Working depth follows the carved surface.
      // The skull is curved, so solve ray.z(t) = bone(x, y) by marching and bisecting.
      const p = new THREE.Vector3();
      const gap = (t: number) => {
        this.ray.ray.at(t, p);
        return p.z - this.bone!.height(p.x, p.y);
      };
      let lo = 0,
        hi = 0,
        found = false;
      for (let t = 0.25; t < 60; t += 0.25) {
        if (gap(t) <= 0) {
          hi = t;
          lo = t - 0.25;
          found = true;
          break;
        }
      }
      if (!found) return;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (gap(mid) > 0) lo = mid;
        else hi = mid;
      }
      this.ray.ray.at(hi, p);
      this.target.x = THREE.MathUtils.clamp(p.x, -1.75, 1.75);
      this.target.y = THREE.MathUtils.clamp(p.y, -1.5, 1.5);
      return;
    }
    const aimMesh = this.accessPhase === "bone" ? this.bone?.mesh : this.brain;
    const hit = aimMesh ? this.ray.intersectObject(aimMesh, false)[0] : null;
    if (strict && !hit) return; // looking away from the field: the tool stays where it was
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
    this.releaseLock();
    this.emit();
    this.dirty = true;
  }
  resume() {
    if (this.state.status !== "paused") return;
    this.start();
    // The Resume click is a user gesture, so the mouse can be captured again straight away.
    if (this.location === "surgery" && this.canLock) this.lockPointer();
  }
  toggleTray() {
    // The scrub nurse hands you instruments now; there is no tray trip in surgery.
    return;
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
      this.swapTool(tool);
      return;
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
      this.releaseLock();
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
  /** Open or reset the bone window for the current case and lay out its tray. */
  prepareAccess() {
    const procedure = CASES[this.state.caseId];
    this.bone?.reset();
    if (procedure.preOpened && this.bone) {
      this.bone.openInstant();
      this.accessPhase = "lifting";
      this.state.tool = "suction";
    } else {
      this.accessPhase = "bone";
      this.state.tool = "drill";
    }
    this.tray?.setTools(
      procedure.kind === "aneurysm"
        ? CLIP_TRAY_TOOLS
        : procedure.kind === "tumor"
          ? TUMOR_TRAY_TOOLS
          : TRAY_TOOLS,
    );
  }
  setCase(id: CaseId) {
    const old = this.state;
    this.state = createState(id, old.guided, old.entry + 1, old.difficulty);
    this.prepareAccess();
    this.scope = false;
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
    this.releaseLock();
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
      if (this.accessPhase !== "surgery") this.prepareAccess();
      this.equipDefault();
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
  setScope(on: boolean) {
    if (this.scope === on) return;
    this.scope = on;
    this.updateCamera();
    this.emit();
  }
  aimCentre() {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.aimAt(r.left + r.width / 2, r.top + r.height / 2, true);
  }
  drainAim(angle: number) {
    const d = this.state.drain;
    if (!d) return;
    const before = d.angle;
    aimDrain(this.state, angle);
    if (d.angle !== before) {
      this.emit();
      this.publishAt = performance.now();
    }
  }
  drainDrive(motion: -1 | 0 | 1) {
    driveDrain(this.state, motion);
  }
  drainSecure() {
    secureDrain(this.state);
    this.emit();
  }
  setDifficulty(value: Difficulty) {
    this.state.difficulty = value;
    this.state.guided = DIFFICULTIES[value].guided;
    this.state.action = false;
    this.emit();
    this.dirty = true;
  }
  /**
   * Graphics presets. Low and Balanced draw straight to screen; High adds ambient
   * occlusion, bloom and the colour grade; Ultra adds a true microscope depth of field,
   * sharper shadows and full pixel density.
   */
  setQuality(value: Quality, automatic = false) {
    this.autoQuality = automatic;
    this.state.quality = value;
    const dpr = window.devicePixelRatio || 1,
      ratio = { low: 0.75, balanced: 1, high: 1.5, ultra: 2 }[value];
    this.renderer.setPixelRatio(Math.min(dpr, ratio));
    this.composer.setPixelRatio(Math.min(dpr, ratio));
    this.renderer.shadowMap.enabled = value !== "low";
    if (this.lamp) {
      const size = value === "ultra" ? 4096 : value === "high" ? 2048 : 1024;
      if (this.lamp.shadow.mapSize.x !== size) {
        this.lamp.shadow.mapSize.set(size, size);
        this.lamp.shadow.map?.dispose();
        this.lamp.shadow.map = null;
      }
      this.lamp.shadow.radius = value === "ultra" ? 4 : 3;
    }
    this.occlusion.enabled = true;
    this.bokeh.enabled = value === "ultra";
    this.bloom.enabled = true;
    this.slowFrames = 0;
    this.resize();
    this.emit();
  }
  toggleAnatomy() {
    if (this.state.difficulty === "chief") return;
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
      if (this.locked) return; // locked: the crosshair aims, mouse movement turns your head
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
        if (this.canLock && !this.locked) {
          // First click takes the controls; the next one operates.
          this.lockPointer();
          return;
        }
        this.lastClient = { x: e.clientX, y: e.clientY };
        this.mouseDown = true;
        if (this.swap) {
          this.pendingPress = true;
          return;
        }
        if (!this.heldTool || this.trayPan > 0.001) return;
        cancelInspection(this.state);
        this.state.action = true;
        if (this.locked) this.aimCentre();
        else this.aimAt(e.clientX, e.clientY);
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    }) as EventListener);
    listen(document, "mousemove", ((e: MouseEvent) => {
      if (
        this.location === "surgery" &&
        this.state.status === "running" &&
        document.pointerLockElement === canvas
      ) {
        const k = (this.scope ? 0.0009 : 0.0021) * (this.precision ? 0.45 : 1);
        this.fp.yaw -= e.movementX * k;
        this.fp.pitch = THREE.MathUtils.clamp(this.fp.pitch - e.movementY * k, -1.52, 0.4);
        this.updateCamera();
        return;
      }
      if (
        this.location === "room" &&
        this.state.status === "running" &&
        document.pointerLockElement === canvas
      ) {
        this.room?.look(e.movementX, e.movementY);
        this.dirty = true;
      }
    }) as EventListener);
    listen(document, "pointerlockerror", (() => {
      this.markLockFailed();
      this.emit();
    }) as EventListener);
    listen(document, "pointerlockchange", (() => {
      this.locked = document.pointerLockElement === canvas;
      const intentional = this.releasing;
      this.releasing = false;
      if (!intentional && this.state.status === "running" && !document.pointerLockElement && this.canLock)
        this.pause();
      this.emit();
    }) as EventListener);
    listen(window, "pointerup", (() => {
      this.pendingPress = false;
      this.mouseDown = false;
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
        if (this.state.tool === "clip" && this.heldTool === "clip") {
          this.state.clipAngle -= Math.sign(e.deltaY) * (this.precision ? 0.03 : 0.1);
          this.dirty = true;
          return;
        }
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
          -1.2,
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
      if (this.state.drain && this.location === "surgery") return;
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
      if (["w", "a", "s", "d"].includes(e.key.toLowerCase())) {
        this.fpKeys.add(e.key.toLowerCase());
        e.preventDefault();
      }
      if (e.key.toLowerCase() === "z") this.setScope(!this.scope);
      if (
        this.state.tool === "clip" &&
        this.heldTool === "clip" &&
        !this.trayView &&
        ["arrowleft", "arrowright"].includes(e.key.toLowerCase())
      ) {
        const step = this.precision ? 0.025 : 0.09;
        const dir = e.key.toLowerCase() === "arrowleft" ? 1 : -1;
        this.state.clipAngle += dir * step;
        e.preventDefault();
        this.dirty = true;
      }
      if (e.key.toLowerCase() === "e") {
        if (e.repeat) return;
        e.preventDefault();
        if (this.trayView) this.placeTool();
        else if (this.accessPhase === "surgery") this.beginInspection();
        else this.liftBone();
      }
      if (["1", "2", "3", "4"].includes(e.key)) {
        const tool = this.belt[+e.key - 1];
        if (tool) this.swapTool(tool);
      }
      if (e.key.toLowerCase() === "h") this.toggleAnatomy();
      if (e.key.toLowerCase() === "m") this.setDepthAssist(!this.depthAssist);
      if (e.key.toLowerCase() === "f" && !this.depthAssist)
        this.target.z = Math.max(
          -1.2,
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
      this.fpKeys.delete(e.key.toLowerCase());
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
      speed: movement * 60,
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
      // The mouse must be free the moment the operation stops, so result buttons can be clicked.
      if (this.state.status !== "running" && document.pointerLockElement) document.exitPointerLock();
      if (this.arrival) {
        this.stepArrival();
        this.dirty = true;
      }
      if (this.state.status === "running" && this.location === "room") {
        this.room?.update(delta, this.heldTool, now / 1000, this.state.tool);
        this.dirty = true;
      } else if (this.state.status === "running") {
        this.stepCamera(delta);
        if (this.locked && this.heldTool && !this.trayView && !this.state.inspectionActive) this.aimCentre();
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
          if (this.accessPhase === "surgery" && this.heldTool && !this.state.inspectionActive && !this.trayView) {
            // A real hand shakes more when tired and when the patient is crashing.
            const stress = 1 + Math.max(0, this.state.vitals.hr - 80) / 40 + Math.min(1, this.state.elapsed / 240);
            const amp = this.state.difficulty === "resident" ? 0 : 0.0035 * stress * (this.state.difficulty === "chief" ? 1.6 : 1);
            const tt = this.state.elapsed;
            this.tip.x += Math.sin(tt * 13.1) * amp;
            this.tip.y += Math.cos(tt * 11.3 + 1.7) * amp;
          }
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
          this.trayView = false;
          // Bone work is over: the burr goes back and the nurse hands you the next instrument.
          if (this.heldTool === "drill" || !this.belt.includes(this.heldTool as Tool)) this.equipDefault();
          this.freezeInput();
        }
      }
      const last = this.state.events[this.state.events.length - 1];
      if (last && (last.type === "injury" || last.type === "rupture")) {
        const id = `${last.time}|${last.detail}`;
        if (id !== this.lastHurt) {
          this.lastHurt = id;
          this.jolt = 1;
          if (last.type === "rupture" || this.state.bleeding > 0.3) this.lensBlood = 1;
        }
      }
      let swapOffset = 0;
      if (this.swap && this.state.status === "running") {
        const s = this.swap;
        s.t += delta;
        const ease = (x: number) => x * x * (3 - 2 * x);
        if (s.t < 0.18) swapOffset = ease(Math.min(1, s.t / 0.18));
        else {
          if (!s.done) {
            s.done = true;
            chooseTool(this.state, s.to);
            this.heldTool = s.to;
            this.tray?.update(s.to);
            this.depthOffset = 0;
            this.state.nurse = { id: (this.state.nurse?.id ?? 0) + 1, text: `${TOOLS[s.to].name}.` };
            logEvent(this.state, "pickup", `Handed ${s.to}`);
          }
          swapOffset = 1 - ease(Math.min(1, (s.t - 0.18) / 0.27));
          if (s.t >= 0.45) {
            this.swap = null;
            if (this.pendingPress && this.heldTool && this.state.status === "running") {
              this.pendingPress = false;
              this.state.action = true;
              if (this.locked) this.aimCentre();
              else this.aimAt(this.lastClient.x, this.lastClient.y);
            }
          }
        }
        this.dirty = true;
      }
      for (const [name, model] of Object.entries(this.tools))
        if (model) {
          model.visible =
            this.location === "surgery" &&
            name === this.heldTool &&
            !this.state.inspectionActive;
          if (name === this.heldTool && !this.trayView) {
            // The instrument runs from the tip back toward your own gloved hand,
            // low and to the right of your view, like a real first-person hold.
            const orient = model.getObjectByName("shaft") ?? model;
            const axis = (orient.userData.axis as THREE.Vector3 | undefined) ?? new THREE.Vector3(1, 0, 0);
            const f = this.forward(),
              right = new THREE.Vector3(f.y, -f.x, 0).normalize(),
              hand = this.fp.pos
                .clone()
                .addScaledVector(f, 2.5)
                .addScaledVector(right, 2.6)
                .addScaledVector(new THREE.Vector3(0, 0, 1), -3.2);
            const dir = hand.sub(this.tip).normalize();
            orient.quaternion.setFromUnitVectors(axis.clone().normalize(), dir);
          }
          if (this.trayView) model.position.set(0.7, -2.5, 1.6);
          else model.position.copy(this.tip).add(new THREE.Vector3(0.6 * swapOffset, -1.0 * swapOffset, 0.1 * swapOffset));
          // The glove stains as the patient loses blood.
          gloveLatex.color.lerpColors(CLEAN_GLOVE, BLOODY_GLOVE, Math.min(1, this.state.bloodLoss / 420));
          const bloodTip = (model.getObjectByName("shaft") ?? model).getObjectByName("bloodTip");
          if (bloodTip) {
            const amount = Math.min(1, this.state.bloodLoss / 160 + this.state.bleeding * 0.4);
            bloodTip.visible = amount > 0.12 && name !== "irrigation";
            bloodTip.scale.set(1, 0.6 + amount * 0.9, 0.6 + amount * 0.9);
          }
          if (name === "clip") {
            const jaws = model.getObjectByName("jaws");
            if (jaws) {
              jaws.rotation.z = this.state.clipAngle;
              const close = this.state.aneurysm?.clipProgress ?? 0;
              for (const [blade, sign] of [["bladeA", 1], ["bladeB", -1]] as const) {
                const b = jaws.getObjectByName(blade);
                if (b) b.position.y = sign * (0.045 - 0.03 * close);
              }
            }
          }
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
        if (
          this.location === "surgery" &&
          this.state.status === "running" &&
          !this.trayView &&
          this.trayPan < 0.001
        ) {
          // Breathing and pulse make the view alive; fatigue and shock make it worse.
          const t = now / 1000,
            beat = Math.sin((t * Math.PI * 2 * this.state.vitals.hr) / 60),
            stress = 1 + Math.min(1.6, this.state.shock * 2 + this.state.injury);
          const s = 0.009 * stress;
          this.camera.position.set(
            this.camBase.x + Math.sin(t * 0.7) * s + beat * 0.0012,
            this.camBase.y + Math.sin(t * 0.5 + 1) * s,
            this.camBase.z + Math.sin(t * 0.9 + 2) * s * 0.6 + Math.max(0, beat) * 0.0022,
          );
          this.camera.lookAt(this.camLook);
          this.camera.updateMatrixWorld();
        }
        this.aneurysm?.update(this.state, now / 1000);
        this.tumor?.update(this.state, now / 1000);
        this.wounds?.update(this.state, now / 1000);
        this.field?.update(
          this.state,
          this.tip,
          this.surface(this.tip.x, this.tip.y),
          now / 1000,
        );
        if (this.field && this.state.tumor) {
          // Tumour lobules replace the fluid decals for this procedure.
          for (const m of [...this.field.pools, ...this.field.stains]) m.visible = false;
        }
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
        if (this.state.quality === "high" || this.state.quality === "ultra") {
          this.beauty.scene = scene;
          this.beauty.camera = camera;
          this.occlusion.scene = scene;
          this.occlusion.camera = camera;
          this.bokeh.scene = scene;
          this.bokeh.camera = camera;
          // Focus on the instrument tip; the rest of the field softens around it.
          const focus = camera.position.distanceTo(this.tip);
          (this.bokeh.uniforms as { focus: { value: number } }).focus.value =
            this.location === "surgery" ? focus : 6;
          // Mood: calm, tense, crisis. It eases in so a collapse feels like the room closing in.
          const crisis = Math.min(
            1,
            Math.max(
              this.state.shock * 1.4,
              (110 - this.state.vitals.sys) / 45,
              this.state.aneurysm?.phase === "ruptured" ? 0.9 : 0,
            ),
          );
          const g = this.grade.uniforms as Record<string, { value: number }>;
          g.uCrisis.value += (Math.max(0, crisis) - g.uCrisis.value) * 0.05;
          g.uTime.value = now / 1000;
          if (this.state.action && (this.state.tool === "suction" || this.state.tool === "irrigation"))
            this.lensBlood = Math.max(0, this.lensBlood - 0.02);
          else this.lensBlood = Math.max(0, this.lensBlood - 0.0015);
          g.uBlood.value = this.lensBlood;
          g.uAberration.value = 0.0012 + g.uCrisis.value * 0.0035 + (this.jolt > 0 ? 0.006 * this.jolt : 0);
          this.jolt = Math.max(0, this.jolt - 0.06);
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
        this.state.vitals.hr,
        vitalsLevel(this.state.vitals) === "critical",
        this.state.status === "failed" &&
          this.state.events.some((e) => e.type === "failure" && DEATH.test(e.detail)),
        this.state.bleeding,
        this.state.vitals.spo2,
      );
      if (now - this.fpsAt > 1000) {
        this.fps =
          this.state.status === "running"
            ? Math.round((this.frameCount * 1000) / (now - this.fpsAt))
            : 60;
        this.frameCount = 0;
        this.fpsAt = now;
        if (this.autoQuality && this.state.status === "running" && this.state.quality !== "low") {
          // Step down one preset at a time when the frame rate collapses.
          this.slowFrames = this.fps < 24 ? this.slowFrames + 1 : 0;
          if (this.slowFrames >= 3) {
            const order: Quality[] = ["low", "balanced", "high", "ultra"];
            this.setQuality(order[order.indexOf(this.state.quality) - 1], true);
          }
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
          if (o.customDepthMaterial) materials.add(o.customDepthMaterial);
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
