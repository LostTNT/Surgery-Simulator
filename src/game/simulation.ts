import { gradeAttempt } from "./grading.ts";
import {
  BASE_VITALS,
  COLLAPSE_PRESSURE,
  DIFFICULTIES,
  MAX_BLOOD_LOSS_ML,
  stepVitals,
  type Difficulty,
  type Vitals,
} from "./vitals.ts";
export type { Difficulty, Vitals };
export type Tool = "suction" | "irrigation" | "bipolar" | "drill" | "clip";
export type Status = "ready" | "running" | "paused" | "success" | "failed";
export type CaseId = "lab" | "case01" | "case02" | "case03" | "case04" | "case05" | "case06";
export type CaseKind = "washout" | "aneurysm" | "tumor" | "drain";
export type Vec = [number, number, number];
export interface Pocket {
  x: number;
  y: number;
  radius: number;
  remaining: number;
  initial: number;
}
export interface Feedback {
  title: string;
  detail: string;
  kind: "neutral" | "good" | "warning" | "danger";
}
export interface GameEvent {
  time: number;
  type: string;
  detail: string;
  position?: Vec;
}
export interface Contact {
  clearance: number;
  inField: boolean;
  pocket: number;
  vessel: string | null;
  shaftContact: boolean;
  tip: Vec;
  bleedDistance: number;
  injuryPoint?: Vec;
  /** Tip speed in scene units per second. */
  speed?: number;
}
export interface AneurysmState {
  /** Dome centre, neck centre and the working spot for freeing the neck (scene x, y). */
  dome: [number, number];
  neck: [number, number];
  work: [number, number];
  /** Where a correctly placed clip centres, and the artery's direction (radians). */
  clipSpot: [number, number];
  axis: number;
  bridges: { x: number; y: number; progress: number; done: boolean }[];
  dissection: number;
  tension: number;
  phase: "intact" | "ruptured" | "clipped";
  /** Time until which the neck is visible after suctioning a rupture. */
  visibleUntil: number;
  clipProgress: number;
  attempts: number;
}
export const ANEURYSM_AXIS = 1.896;
export function createAneurysm(): AneurysmState {
  const axis = ANEURYSM_AXIS,
    ax = Math.cos(axis),
    ay = Math.sin(axis),
    px = -ay,
    py = ax,
    neck: [number, number] = [0.323, 0.458];
  const dome: [number, number] = [neck[0] + 0.17 * px, neck[1] + 0.17 * py];
  return {
    dome,
    neck,
    work: [neck[0] - 0.04 * px, neck[1] - 0.04 * py],
    clipSpot: [neck[0] + 0.05 * px, neck[1] + 0.05 * py],
    axis,
    bridges: [1, -1].map((side) => ({
      x: dome[0] + side * 0.2 * ax,
      y: dome[1] + side * 0.2 * ay,
      progress: 0,
      done: false,
    })),
    dissection: 0,
    tension: 0,
    phase: "intact",
    visibleUntil: -1,
    clipProgress: 0,
    attempts: 0,
  };
}
export interface TumorState {
  /** Motor cortex: touching it with an active instrument injures function. */
  motor: { x: number; y: number; rx: number; ry: number };
  feeders: { x: number; y: number; progress: number; done: boolean; bleeding: boolean }[];
  /** Which feeder supplies each lobule (index into `feeders`). */
  link: number[];
  cleared: boolean[];
  motorContact: number;
  /** Fraction of tumour that must be removed before the field can be examined. */
  target: number;
}
export const TUMOR_TARGET = 0.85;
export function createTumor(): TumorState {
  return {
    motor: { x: 0.64, y: 0.3, rx: 0.32, ry: 0.5 },
    feeders: [
      { x: -0.88, y: 0.3, progress: 0, done: false, bleeding: false },
      { x: -0.05, y: 0.8, progress: 0, done: false, bleeding: false },
      { x: -0.2, y: -0.44, progress: 0, done: false, bleeding: false },
    ],
    link: [0, 1, 2, 1, 2],
    cleared: [false, false, false, false, false],
    motorContact: 0,
    target: TUMOR_TARGET,
  };
}
export function tumorResected(s: GameState) {
  return s.pockets.length === 0 ? 1 : 1 - s.pockets.reduce((a, p) => a + p.remaining, 0) / s.pockets.length;
}
export function tumorDone(s: GameState) {
  return (
    !!s.tumor &&
    s.tumor.feeders.every((f) => f.done) &&
    tumorResected(s) >= s.tumor.target
  );
}
export interface DrainState {
  /** Burr hole on the skull. Scan units are millimetres on a 200-unit slice. */
  entry: [number, number];
  target: { x: number; y: number; rx: number; ry: number };
  /** x of the midline falx; crossing it injures the other hemisphere. */
  midline: number;
  hazards: { x: number; y: number; r: number; name: string; hit: boolean }[];
  angle: number;
  depth: number;
  motion: -1 | 0 | 1;
  icp: number;
  inVentricle: boolean;
  wasInside: boolean;
  seen: boolean;
  crossed: boolean;
  passedThrough: boolean;
  secured: boolean;
  passes: number;
  maxDepth: number;
}
export const DRAIN_INSERT_SPEED = 9;
export const DRAIN_WITHDRAW_SPEED = 28;
export const DRAIN_MAX_DEPTH = 95;
export const DRAIN_SKULL = 7;
export function createDrain(): DrainState {
  return {
    entry: [62, 28],
    target: { x: 80, y: 98, rx: 12, ry: 21 },
    midline: 104,
    hazards: [{ x: 69, y: 62, r: 2.8, name: "sulcal vessel", hit: false }],
    angle: 1.5,
    depth: 0,
    motion: 0,
    icp: 31,
    inVentricle: false,
    wasInside: false,
    seen: false,
    crossed: false,
    passedThrough: false,
    secured: false,
    passes: 0,
    maxDepth: 0,
  };
}
export function drainTip(d: DrainState): [number, number] {
  return [d.entry[0] + Math.cos(d.angle) * d.depth, d.entry[1] + Math.sin(d.angle) * d.depth];
}
/** Aim is locked once the catheter has entered the brain. */
export function aimDrain(s: GameState, angle: number) {
  const d = s.drain;
  if (!d || s.status !== "running" || d.secured || d.depth > 4) return;
  d.angle = Math.min(2.45, Math.max(0.55, angle));
}
export function driveDrain(s: GameState, motion: -1 | 0 | 1) {
  const d = s.drain;
  if (!d || s.status !== "running" || d.secured) return;
  d.motion = motion;
}
export function secureDrain(s: GameState) {
  const d = s.drain;
  if (!d || s.status !== "running" || d.secured) return;
  d.motion = 0;
  if (d.depth < DRAIN_SKULL + 2) {
    setFeedback(s, "Insert the catheter first.", "Hold to advance it into the brain.", "warning");
    return;
  }
  if (!d.inVentricle) {
    setFeedback(s, "No CSF return.", "The tip is not in the ventricle. Withdraw and re-aim.", "warning");
    say(s, "Nothing is draining. Pressure is still climbing.", "warning");
    return;
  }
  d.secured = true;
  logEvent(s, "stage", `Catheter secured at ${Math.round(d.depth)} mm`);
  setFeedback(s, "Catheter secured.", "Fluid is draining. Pressure is falling.", "good");
  say(s, "Pressure is coming down. That is a good drain.", "good");
}
export interface GameState {
  caseId: CaseId;
  status: Status;
  guided: boolean;
  tool: Tool;
  stage: number;
  elapsed: number;
  removed: number;
  clarity: number;
  injury: number;
  bleeding: number;
  bleedPosition: Vec | null;
  pockets: Pocket[];
  feedback: Feedback;
  events: GameEvent[];
  activeTime: number;
  usefulTime: number;
  contactTime: number;
  inspectionTime: number;
  inspectionActive: boolean;
  procedureStarted: boolean;
  sourceControlled: boolean;
  clearance: number;
  action: boolean;
  sound: boolean;
  quality: "high" | "balanced";
  showAnatomy: boolean;
  depth: number;
  zoom: number;
  entry: number;
  difficulty: Difficulty;
  vitals: Vitals;
  /** Blood lost so far, in millilitres. */
  bloodLoss: number;
  /** Acute physiological stress from sudden events (0..1). */
  shock: number;
  /** Seconds the patient has spent below the collapse pressure. */
  unstable: number;
  minSys: number;
  /** Latest anaesthetist remark; `id` increments for each new one. */
  callout: { id: number; text: string; kind: Feedback["kind"]; at: number } | null;
  said: string[];
  complicationsTriggered: number;
  complicationsHandled: number;
  /** Complications the surgeon caused (a rupture, an unsealed feeder, a missed drain pass). */
  mistakes: number;
  aneurysm: AneurysmState | null;
  tumor: TumorState | null;
  drain: DrainState | null;
  twistsDone: boolean[];
  /** Name of the unresolved complication, if any (used to count handled ones). */
  activeComplication: string | null;
  /** Orientation of the held clip in radians. */
  clipAngle: number;
}
/** A mid-operation complication that triggers once a given pocket has been cleared. */
export interface Twist {
  after: number;
  kind: "rebleed" | "refill";
  /** Lowest operating standard that sees it. Resident never does. */
  from: "attending" | "chief";
  /** rebleed: where it bleeds. */
  position?: Vec;
  /** refill: which pocket re-collects, and to what level. */
  pocket?: number;
  amount?: number;
  say: string;
  title: string;
  detail: string;
}
export interface ProcedureCase {
  kind: CaseKind;
  twists?: Twist[];
  /** The bone window is already open: the resident has completed access. */
  preOpened?: boolean;
  name: string;
  label: string;
  difficulty: string;
  brief: string;
  duration: string;
  /** Target time in seconds used for the pace grade. */
  parSeconds: number;
  pockets: readonly (readonly [number, number, number])[];
  suctionRate: number;
  irrigationRate: number;
  clarityRequired: number;
  bleedingSource: Vec | null;
  initialBleeding: number;
  objectives: { title: string; detail: string; tool: Tool }[];
}
export const INSPECTION_SECONDS = 2.5;
export const POCKET_CLEAR_THRESHOLD = 0.015;
export const BLEEDING_CONTROL_THRESHOLD = 0.025;
const introductoryPockets = [
  [0.68, 0.55, 0.38],
  [0.88, -0.03, 0.34],
  [0.58, -0.62, 0.4],
  [-0.42, 0.68, 0.33],
] as const;
export const CASES: Record<CaseId, ProcedureCase> = {
  lab: {
    kind: "washout",
    name: "Instrument lab",
    label: "Practice field",
    difficulty: "Practice",
    duration: "REPEATABLE",
    parSeconds: 360,
    brief:
      "Open a bone window with the burr, then clear and rinse a fictional practice field. Assisted depth helps you learn the instruments.",
    pockets: introductoryPockets,
    suctionRate: 0.48,
    irrigationRate: 0.24,
    clarityRequired: 0.88,
    bleedingSource: null,
    initialBleeding: 0,
    objectives: [
      { title: "Open the window", detail: "Drill the marked path and lift the bone flap.", tool: "drill" },
      { title: "Clear 4 pockets", detail: "Aspirate each numbered fluid pocket.", tool: "suction" },
      { title: "Rinse and inspect", detail: "Rinse to 88% clarity, then choose Examine field.", tool: "irrigation" },
    ],
  },
  case01: {
    kind: "washout",
    name: "Extra-axial collection",
    twists: [
      {
        after: 1,
        kind: "rebleed",
        from: "attending",
        position: [0.52, 0.2, 0],
        say: "The old membrane is oozing. He is on a blood thinner. Control it.",
        title: "The membrane is bleeding.",
        detail: "Pick up bipolar and seal the marked point before you continue.",
      },
      {
        after: 3,
        kind: "rebleed",
        from: "chief",
        position: [-0.15, 0.5, 0],
        say: "Another bleeder along the membrane. Keep ahead of it.",
        title: "A second membrane bleeder.",
        detail: "Seal the marked point with bipolar.",
      },
    ],
    label: "Case 01",
    difficulty: "Introductory",
    duration: "PREPARED FIELD",
    parSeconds: 300,
    brief:
      "Open the bone window, then remove a localized fluid collection with slower aspiration. Protect the soft surface and inspect the cleared field.",
    pockets: introductoryPockets,
    suctionRate: 0.3,
    irrigationRate: 0.24,
    clarityRequired: 0.88,
    bleedingSource: null,
    initialBleeding: 0,
    objectives: [
      { title: "Open the window", detail: "Drill the marked path and lift the bone flap.", tool: "drill" },
      { title: "Clear 4 pockets", detail: "Use slower aspiration above the soft surface.", tool: "suction" },
      { title: "Rinse and inspect", detail: "Rinse to 88% clarity, then choose Examine field.", tool: "irrigation" },
    ],
  },
  case02: {
    kind: "washout",
    name: "Focal bleeding control",
    twists: [
      {
        after: 2,
        kind: "rebleed",
        from: "attending",
        position: [-0.1, -0.5, 0],
        say: "There was a second vessel under the clot. It is bleeding now.",
        title: "A second source was hiding.",
        detail: "It was under the clot. Seal the newly marked source with bipolar.",
      },
      {
        after: 3,
        kind: "refill",
        from: "chief",
        pocket: 0,
        amount: 0.5,
        say: "Blood is tracking back into the first pocket.",
        title: "The first pocket is refilling.",
        detail: "Suction it again, then finish rinsing.",
      },
    ],
    label: "Case 02",
    difficulty: "Intermediate",
    duration: "BLEEDING CONTROL",
    parSeconds: 270,
    brief:
      "Open the bone window and locate the marked bleeding source. Control it with bipolar before aspirating four fluid pockets, rinsing, and examining the field.",
    pockets: [
      [0.6, 0.58, 0.3],
      [0.87, -0.05, 0.28],
      [0.48, -0.62, 0.3],
      [-0.5, 0.58, 0.29],
    ],
    suctionRate: 0.28,
    irrigationRate: 0.22,
    clarityRequired: 0.9,
    bleedingSource: [0.12, -0.24, 0],
    initialBleeding: 0.36,
    objectives: [
      { title: "Open the window", detail: "Drill the marked path and lift the bone flap.", tool: "drill" },
      { title: "Control the source", detail: "Apply bipolar at the marked source until bleeding stops.", tool: "bipolar" },
      { title: "Clear 4 pockets", detail: "Fluid removal unlocks after bleeding is controlled.", tool: "suction" },
      { title: "Rinse and inspect", detail: "Rinse to 90% clarity, then choose Examine field.", tool: "irrigation" },
    ],
  },
  case03: {
    kind: "washout",
    name: "Loculated collection washout",
    twists: [
      {
        after: 2,
        kind: "refill",
        from: "attending",
        pocket: 0,
        amount: 0.55,
        say: "A septation gave way. Pus is draining into the first pocket again.",
        title: "A wall between pockets gave way.",
        detail: "Pocket 1 has re-filled. Clear it again before you rinse.",
      },
      {
        after: 4,
        kind: "rebleed",
        from: "chief",
        position: [-0.3, -0.2, 0],
        say: "The inflamed surface is bleeding. Seal it.",
        title: "Inflamed tissue is bleeding.",
        detail: "Use bipolar on the marked point.",
      },
    ],
    label: "Case 03",
    difficulty: "Intermediate",
    duration: "SIX-POCKET WASHOUT",
    parSeconds: 420,
    brief:
      "Open the bone window, then clear six separated fluid pockets across the exposure. A slower rinse must reach 96% clarity before the final examination.",
    pockets: [
      [-0.78, 0.56, 0.27],
      [-0.12, 0.74, 0.25],
      [0.64, 0.53, 0.28],
      [0.88, -0.16, 0.25],
      [0.23, -0.67, 0.29],
      [-0.6, -0.49, 0.27],
    ],
    suctionRate: 0.26,
    irrigationRate: 0.15,
    clarityRequired: 0.96,
    bleedingSource: null,
    initialBleeding: 0,
    objectives: [
      { title: "Open the window", detail: "Drill the marked path and lift the bone flap.", tool: "drill" },
      { title: "Clear all 6 pockets", detail: "Each separated pocket must be fully aspirated.", tool: "suction" },
      { title: "Complete the washout", detail: "Rinse to 96% clarity; this field needs a longer washout.", tool: "irrigation" },
      { title: "Examine the field", detail: "Choose Examine field after clearing and rinsing.", tool: "irrigation" },
    ],
  },
  case04: {
    kind: "aneurysm",
    preOpened: true,
    name: "Aneurysm clipping",
    label: "Case 04",
    difficulty: "Advanced",
    duration: "RUPTURE RISK",
    parSeconds: 300,
    brief:
      "The bone is open. Release the two tethers with bipolar, free the neck with gentle suction, then clip across the neck without pinching the artery. If the wall tears, suction to see and clip fast.",
    pockets: [],
    suctionRate: 0.3,
    irrigationRate: 0.24,
    clarityRequired: 0,
    bleedingSource: null,
    initialBleeding: 0,
    objectives: [
      { title: "Release the tethers", detail: "Coagulate both marked tethering vessels with bipolar. Stay clear of the dome.", tool: "bipolar" },
      { title: "Free the neck", detail: "Use gentle suction at the marked spot beside the neck.", tool: "suction" },
      { title: "Clip the neck", detail: "Rotate with A/D, align across the neck and hold to close. Do not pinch the artery.", tool: "clip" },
      { title: "Examine the field", detail: "Check that the aneurysm is sealed and bleeding is controlled.", tool: "irrigation" },
    ],
  },
  case05: {
    kind: "tumor",
    preOpened: true,
    name: "Tumour resection",
    label: "Case 05",
    difficulty: "Advanced",
    duration: "MOTOR CORTEX",
    parSeconds: 330,
    brief:
      "The bone is open. Seal the three feeding vessels with bipolar, then debulk the tumour with suction until at least 85% is gone. Stay out of the green motor area: it moves the patient's hand.",
    pockets: [
      [-0.45, 0.2, 0.34],
      [-0.1, 0.45, 0.3],
      [-0.15, -0.05, 0.32],
      [0.08, 0.3, 0.24],
      [-0.62, -0.2, 0.26],
    ],
    suctionRate: 0.2,
    irrigationRate: 0.2,
    clarityRequired: 0,
    bleedingSource: null,
    initialBleeding: 0,
    objectives: [
      { title: "Seal the feeders", detail: "Coagulate each marked feeding vessel before cutting beyond it.", tool: "bipolar" },
      { title: "Debulk the tumour", detail: "Aspirate the tumour in pieces. Never touch the motor area.", tool: "suction" },
      { title: "Examine the field", detail: "Check the resection and that the motor area is intact.", tool: "irrigation" },
    ],
  },
  case06: {
    kind: "drain",
    preOpened: true,
    name: "Ventricular drain",
    label: "Case 06",
    difficulty: "Emergency",
    duration: "ICP RISING",
    parSeconds: 120,
    brief:
      "Pressure inside the head is climbing. Aim the catheter from the burr hole at the swollen ventricle on the scan, advance it, and secure it the moment fluid returns. Avoid the vessel and the midline.",
    pockets: [],
    suctionRate: 0,
    irrigationRate: 0,
    clarityRequired: 0,
    bleedingSource: null,
    initialBleeding: 0,
    objectives: [
      { title: "Aim the catheter", detail: "Point from the burr hole toward the dark ventricle.", tool: "suction" },
      { title: "Advance and find CSF", detail: "Hold to advance. Release as fluid returns.", tool: "suction" },
      { title: "Secure and drain", detail: "Secure the catheter and let the pressure fall.", tool: "suction" },
    ],
  },
};
export const TOOLS: Record<
  Tool,
  { name: string; action: string; purpose: string }
> = {
  drill: {
    name: "Bone burr",
    action: "DRILLING",
    purpose:
      "Remove rigid bone along the marked path, then lift the freed flap.",
  },
  suction: {
    name: "Suction",
    action: "ASPIRATING",
    purpose:
      "Remove fluid while keeping the tip clear of the cortical surface.",
  },
  irrigation: {
    name: "Irrigation",
    action: "IRRIGATING",
    purpose:
      "Rinse the cleared field. Irrigation improves clarity; it does not reverse injury.",
  },
  clip: {
    name: "Aneurysm clip",
    action: "CLOSING CLIP",
    purpose:
      "Rotate with A/D, centre it across the aneurysm neck and hold to close. Misplacement is removed and costs time.",
  },
  bipolar: {
    name: "Bipolar",
    action: "COAGULATING",
    purpose:
      "Treat a localized bleeding source. Activation on healthy tissue causes injury.",
  },
};
export const STAGES = [
  {
    title: "Find your depth",
    detail: "Keep the tip in view. Approach the collection.",
  },
  {
    title: "Clear the collection",
    detail: "Hold suction just above the fluid. Protect the cortical surface.",
  },
  {
    title: "Inspect the field",
    detail: "Rinse to the target clarity, then choose Examine field.",
  },
];
const initialFeedback = {
  title: "A deliberate approach.",
  detail: "Scroll down to lower the tip. Hold Shift for fine movement.",
  kind: "neutral" as const,
};
export function createState(
  caseId: CaseId = "lab",
  guided = true,
  entry = 0,
  difficulty: Difficulty = "attending",
): GameState {
  const procedure = CASES[caseId];
  return {
    caseId,
    status: "ready",
    guided,
    tool: "suction",
    stage: 0,
    elapsed: 0,
    removed: 0,
    clarity: 0,
    injury: 0,
    bleeding: 0,
    bleedPosition: null,
    pockets: procedure.pockets.map(([x, y, radius]) => ({
      x,
      y,
      radius,
      remaining: 1,
      initial: 1,
    })),
    feedback: { ...initialFeedback },
    events: [],
    activeTime: 0,
    usefulTime: 0,
    contactTime: 0,
    inspectionTime: 0,
    inspectionActive: false,
    procedureStarted: false,
    sourceControlled: procedure.bleedingSource === null,
    clearance: 0.5,
    action: false,
    sound: false,
    quality: "high",
    showAnatomy: false,
    depth: 0.62,
    zoom: 1.13,
    entry,
    difficulty,
    vitals: { ...BASE_VITALS },
    bloodLoss: 0,
    shock: 0,
    unstable: 0,
    minSys: BASE_VITALS.sys,
    callout: null,
    said: [],
    complicationsTriggered: 0,
    complicationsHandled: 0,
    mistakes: 0,
    aneurysm: procedure.kind === "aneurysm" ? createAneurysm() : null,
    tumor: procedure.kind === "tumor" ? createTumor() : null,
    drain: procedure.kind === "drain" ? createDrain() : null,
    twistsDone: (procedure.twists ?? []).map(() => false),
    activeComplication: null,
    clipAngle: procedure.kind === "aneurysm" ? ANEURYSM_AXIS + 0.75 : 0,
  };
}
/** Anaesthetist remark. A key makes it fire once per attempt. */
export function say(
  s: GameState,
  text: string,
  kind: Feedback["kind"] = "neutral",
  key?: string,
) {
  if (key) {
    if (s.said.includes(key)) return;
    s.said.push(key);
  }
  s.callout = { id: (s.callout?.id ?? 0) + 1, text, kind, at: s.elapsed };
  logEvent(s, "callout", text);
}
export function hazard(s: GameState) {
  return DIFFICULTIES[s.difficulty].hazard;
}
export function setFeedback(
  s: GameState,
  title: string,
  detail: string,
  kind: Feedback["kind"] = "neutral",
) {
  if (s.feedback.title !== title || s.feedback.detail !== detail || s.feedback.kind !== kind)
    s.feedback = { title, detail, kind };
}
export function logEvent(
  s: GameState,
  type: string,
  detail: string,
  position?: Vec,
) {
  s.events.push({
    time: s.elapsed,
    type,
    detail,
    ...(position ? { position: [...position] as Vec } : {}),
  });
  if (s.events.length > 240) s.events.shift();
}
/** Call once the flap has opened; preparation time must not advance a bleed. */
export function initializeProcedure(s: GameState, sourcePosition?: Vec) {
  if (s.procedureStarted) return;
  s.procedureStarted = true;
  const procedure = CASES[s.caseId];
  if (procedure.bleedingSource) {
    s.bleedPosition = [...(sourcePosition ?? procedure.bleedingSource)];
    s.bleeding = procedure.initialBleeding;
    s.sourceControlled = false;
    logEvent(s, "source", "Prepared bleeding source exposed", s.bleedPosition);
    setFeedback(
      s,
      "Control the marked bleeding source.",
      "Choose bipolar and activate just above the source. Clear fluid after bleeding stops.",
      "warning",
    );
  }
}
export function pocketsCleared(s: GameState) {
  return s.pockets.every((p) => p.remaining <= POCKET_CLEAR_THRESHOLD);
}
export function inspectionReady(s: GameState) {
  return (
    s.status === "running" &&
    s.sourceControlled &&
    (s.tumor ? tumorDone(s) : pocketsCleared(s)) &&
    s.clarity >= CASES[s.caseId].clarityRequired &&
    s.bleeding < BLEEDING_CONTROL_THRESHOLD &&
    (!s.aneurysm || s.aneurysm.phase === "clipped")
  );
}
export function cancelInspection(s: GameState) {
  s.inspectionActive = false;
  s.inspectionTime = 0;
}
export function beginInspection(s: GameState): boolean {
  if (s.status !== "running") return false;
  if (s.inspectionActive) return true;
  if (!inspectionReady(s)) {
    cancelInspection(s);
    if (!s.sourceControlled || s.bleeding >= BLEEDING_CONTROL_THRESHOLD)
      setFeedback(s, "Control bleeding before examining.", "Use bipolar at the marked bleeding source.", "warning");
    else if (s.tumor && !tumorDone(s))
      setFeedback(
        s,
        s.tumor.feeders.some((f) => !f.done) ? "Feeders remain open." : "More tumour to remove.",
        s.tumor.feeders.some((f) => !f.done)
          ? "Seal every feeding vessel with bipolar."
          : `Debulk to at least ${Math.round(s.tumor.target * 100)}% resection.`,
        "warning",
      );
    else if (!pocketsCleared(s)) {
      const left = s.pockets.filter((p) => p.remaining > POCKET_CLEAR_THRESHOLD).length;
      setFeedback(s, "Fluid remains in the field.", `Clear the ${left} remaining ${left === 1 ? "pocket" : "pockets"} with suction.`, "warning");
    } else
      setFeedback(s, "Rinse before examining.", `Use irrigation to reach ${Math.round(CASES[s.caseId].clarityRequired * 100)}% clarity.`, "warning");
    return false;
  }
  s.action = false;
  s.stage = 2;
  s.inspectionTime = 0;
  s.inspectionActive = true;
  logEvent(s, "inspection", "Final field examination started");
  setFeedback(s, "Examining the field.", "Instruments are resting. The final check takes 2.5 seconds.", "good");
  return true;
}
export function pause(s: GameState) {
  s.action = false;
  if (s.status === "running") s.status = "paused";
}
export function chooseTool(s: GameState, tool: Tool) {
  cancelInspection(s);
  s.action = false;
  s.tool = tool;
  setFeedback(s, TOOLS[tool].name, TOOLS[tool].purpose);
}
export function fluidProgress(s: GameState) {
  if (s.pockets.length === 0) return 1;
  return 1 - s.pockets.reduce((a, p) => a + p.remaining, 0) / s.pockets.length;
}
export function score(s: GameState) {
  return gradeAttempt(s, CASES[s.caseId].parSeconds).points;
}
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const near = (a: readonly number[], x: number, y: number, r: number) =>
  Math.hypot(x - a[0], y - a[1]) < r;
/** Signed offset of a point from the artery line: [along the artery, toward the dome]. */
export function neckFrame(a: AneurysmState, x: number, y: number) {
  const dx = x - a.neck[0],
    dy = y - a.neck[1],
    ax = Math.cos(a.axis),
    ay = Math.sin(a.axis);
  return { along: dx * ax + dy * ay, side: dx * -ay + dy * ax };
}
export function ruptureAneurysm(s: GameState, cause: string) {
  const a = s.aneurysm;
  if (!a || a.phase !== "intact") return;
  a.phase = "ruptured";
  a.tension = 1;
  s.bleedPosition = [a.dome[0], a.dome[1], 0];
  s.bleeding = Math.max(s.bleeding, 0.7);
  s.sourceControlled = false;
  s.shock = Math.min(1, s.shock + 0.5);
  s.complicationsTriggered++;
  s.mistakes++;
  s.action = false;
  logEvent(s, "rupture", `Aneurysm ruptured: ${cause}`, [a.dome[0], a.dome[1], 0]);
  setFeedback(
    s,
    "The aneurysm has ruptured.",
    "Suction over the dome to see the neck, then clip it. Bipolar will not seal this.",
    "danger",
  );
  say(s, "Rupture! Pressure is dropping. Get that clip on.", "danger", "rupture");
}
function applyClip(s: GameState, a: AneurysmState, c: Contact) {
  a.attempts++;
  const [tx, ty] = c.tip;
  const blind = a.phase === "ruptured" && s.elapsed > a.visibleUntil;
  let { along, side } = neckFrame(a, tx, ty);
  // A neck hidden by blood cannot be judged: the clip lands off-line.
  const half = Math.PI / 2;
  let angErr = Math.abs(
    ((((s.clipAngle - a.axis + half) % Math.PI) + Math.PI) % Math.PI) - half,
  );
  const trueSide = side;
  if (blind) {
    // Blood hides the neck, so the clip lands off-line. This never counts as pinching the artery.
    angErr += 0.5;
    side -= 0.06;
  }
  const dist = Math.hypot(along, side - 0.05);
  if (a.dissection < 0.9 || a.bridges.some((b) => !b.done)) {
    a.tension = Math.min(0.97, a.tension + 0.2);
    logEvent(s, "clip", "Clip slipped: the neck was not yet free");
    setFeedback(s, "Clip slipped.", "Tissue still tethers the neck. Release the tethers and free the neck first.", "warning");
    return;
  }
  if (!blind && trueSide < 0.015 && Math.abs(along) < 0.12) {
    s.mistakes++;
    s.injury = Math.min(1, s.injury + 0.22);
    a.tension = Math.min(0.97, a.tension + 0.1);
    logEvent(s, "injury", "Clip narrowed the parent artery and was removed", [tx, ty, 0]);
    setFeedback(s, "Parent artery pinched.", "The clip was removed. Sit it on the dome side of the artery.", "danger");
    say(s, "Flow dropped through the parent vessel. Reposition.", "warning");
    return;
  }
  if (dist > 0.085 || angErr > 0.4) {
    a.tension = Math.min(0.97, a.tension + 0.12);
    logEvent(s, "clip", blind ? "Clip placed blind and missed the neck" : "Clip missed the neck and was removed");
    setFeedback(s, "The neck still fills.", blind ? "Suction first so you can see the neck." : "Centre the clip across the neck and rotate with A/D.", "warning");
    return;
  }
  const wasRuptured = a.phase === "ruptured";
  a.phase = "clipped";
  a.tension = 0;
  s.bleeding = 0;
  s.bleedPosition = null;
  s.sourceControlled = true;
  if (wasRuptured) s.complicationsHandled++;
  logEvent(s, "clip", wasRuptured ? "Clip placed across the ruptured neck" : "Clip placed across the neck");
  setFeedback(s, "Clip is on.", "The dome is collapsing. Release the tool and examine the field.", "good");
  say(s, wasRuptured ? "Bleeding has stopped. Nice recovery." : "Aneurysm is secured.", "good");
}
function stepAneurysm(s: GameState, c: Contact, dt: number) {
  const a = s.aneurysm;
  if (!a || a.phase === "clipped") return;
  const [tx, ty] = c.tip,
    active = s.action && c.inField,
    speed = c.speed ?? 0;
  if (a.phase === "intact") {
    let rise = 0;
    if (near(a.dome, tx, ty, 0.17) && c.clearance < 0.075 && c.clearance > -0.2) rise += 0.55;
    if (active && s.tool === "bipolar" && near(a.dome, tx, ty, 0.12)) rise += 0.95;
    if (active && s.tool === "suction" && near(a.dome, tx, ty, 0.14) && c.clearance < 0.15) rise += 0.35;
    if (speed > 0.9 && near(a.dome, tx, ty, 0.32) && c.clearance < 0.2)
      rise += 0.4 * Math.min(2.5, speed);
    a.tension = clamp(a.tension + (rise > 0 ? rise * dt * hazard(s) : -dt * 0.14));
    if (rise > 0 && a.tension > 0.55)
      say(s, "The dome wall is getting very thin. Back off.", "warning", "thin");
    if (a.tension >= 1) {
      ruptureAneurysm(
        s,
        s.tool === "bipolar" ? "heat reached the dome wall" : "the dome wall was stressed",
      );
      return;
    }
  } else if (active && s.tool === "suction" && near(a.dome, tx, ty, 0.24)) {
    a.visibleUntil = s.elapsed + 5;
  }
  if (active && s.tool === "bipolar" && c.clearance > 0 && c.clearance < 0.2)
    for (const b of a.bridges)
      if (!b.done && near([b.x, b.y], tx, ty, 0.075)) {
        b.progress = Math.min(1, b.progress + dt / 1.2);
        if (b.progress >= 1) {
          b.done = true;
          s.action = false;
          logEvent(s, "stage", "Tethering vessel released", [b.x, b.y, 0]);
          setFeedback(
            s,
            a.bridges.every((x) => x.done) ? "Both tethers released." : "One tether released.",
            a.bridges.every((x) => x.done)
              ? "Pick up suction and free the neck at the marked spot."
              : "Find the other marked tether.",
            "good",
          );
        }
      }
  if (
    active &&
    s.tool === "suction" &&
    a.bridges.every((b) => b.done) &&
    a.dissection < 1 &&
    near(a.work, tx, ty, 0.1) &&
    c.clearance > 0.02 &&
    c.clearance < 0.22
  ) {
    a.dissection = Math.min(1, a.dissection + dt * 0.12);
    if (a.dissection >= 0.9 && !s.said.includes("neck-free")) {
      s.said.push("neck-free");
      logEvent(s, "stage", "Aneurysm neck freed", [a.neck[0], a.neck[1], 0]);
      setFeedback(s, "The neck is free.", "Pick up the aneurysm clip. Rotate with A/D and hold to close.", "good");
    }
  }
  if (s.tool === "clip") {
    if (active) a.clipProgress = Math.min(1, a.clipProgress + dt / 0.7);
    else a.clipProgress = Math.max(0, a.clipProgress - dt * 2);
    if (a.clipProgress >= 1) {
      a.clipProgress = 0;
      s.action = false;
      applyClip(s, a, c);
    }
  } else a.clipProgress = 0;
}
function stepTumor(s: GameState, c: Contact, dt: number) {
  const t = s.tumor;
  if (!t) return;
  const [tx, ty] = c.tip,
    active = s.action && c.inField,
    m = t.motor;
  const inMotor = ((tx - m.x) / m.rx) ** 2 + ((ty - m.y) / m.ry) ** 2 < 1;
  if (active && inMotor && c.clearance < 0.3 && (s.tool === "suction" || s.tool === "bipolar")) {
    s.injury = Math.min(1, s.injury + dt * 0.55 * hazard(s));
    t.motorContact += dt;
    if (!s.said.includes("motor")) {
      s.said.push("motor");
      logEvent(s, "injury", "Motor area contact: eloquent cortex", [tx, ty, 0]);
      say(s, "That is the motor strip. I am seeing hand twitches. Back off.", "danger");
    }
    setFeedback(s, "Motor area. Withdraw.", "This cortex moves the hand. Work only on the pale tumour.", "danger");
  }
  if (active && s.tool === "bipolar" && c.clearance > 0 && c.clearance < 0.2)
    for (const f of t.feeders)
      if (!f.done && !f.bleeding && near([f.x, f.y], tx, ty, 0.085)) {
        f.progress = Math.min(1, f.progress + dt / 1.0);
        if (f.progress >= 1) {
          f.done = true;
          s.action = false;
          logEvent(s, "stage", "Feeding vessel sealed", [f.x, f.y, 0]);
          setFeedback(
            s,
            t.feeders.every((x) => x.done) ? "All feeders sealed." : "Feeder sealed.",
            t.feeders.every((x) => x.done)
              ? "Pick up suction and debulk the tumour."
              : "Find the next marked feeder.",
            "good",
          );
        }
      }
  s.pockets.forEach((p, i) => {
    if (p.remaining > POCKET_CLEAR_THRESHOLD || t.cleared[i]) return;
    t.cleared[i] = true;
    const f = t.feeders[t.link[i]];
    if (f && !f.done && !f.bleeding) {
      f.bleeding = true;
      s.bleedPosition = [f.x, f.y, 0];
      s.bleeding = Math.max(s.bleeding, 0.45);
      s.sourceControlled = false;
      s.activeComplication = "feeder";
      s.complicationsTriggered++;
      s.mistakes++;
      s.action = false;
      logEvent(s, "complication", "Cut past an unsealed feeding vessel; it began to bleed", [f.x, f.y, 0]);
      setFeedback(s, "A feeder is bleeding.", "Switch to bipolar and seal the marked vessel.", "danger");
      say(s, "Bleeding at the tumour bed. Control it.", "warning");
    }
  });
}
function stepDrain(s: GameState, dt: number) {
  const d = s.drain;
  if (!d) return;
  if (d.secured) {
    d.icp = Math.max(10, d.icp - dt * 3.4);
    s.shock = Math.max(0, s.shock - dt * 0.05);
    if (d.icp <= 16) {
      s.complicationsHandled = s.complicationsTriggered;
      s.status = "success";
      s.action = false;
      logEvent(s, "complete", "Pressure normalised through the ventricular drain");
    }
    return;
  }
  d.icp = Math.min(80, d.icp + dt * (0.5 + s.injury * 0.4) * hazard(s));
  s.shock = clamp((d.icp - 30) / 32);
  if (d.icp > 40) say(s, `Pressure ${Math.round(d.icp)}. Pupils are sluggish. Hurry.`, "warning", "icp42");
  if (d.icp > 50) say(s, "She is herniating. Get that drain in.", "danger", "icp52");
  if (d.icp >= 60) {
    s.status = "failed";
    s.action = false;
    logEvent(s, "failure", "Intracranial pressure rose until the brain herniated. The patient could not be saved.");
    return;
  }
  const speed = d.motion > 0 ? DRAIN_INSERT_SPEED : DRAIN_WITHDRAW_SPEED;
  const before = d.depth;
  d.depth = clamp(d.depth + d.motion * speed * dt, 0, DRAIN_MAX_DEPTH);
  if (d.depth >= DRAIN_MAX_DEPTH) d.motion = 0;
  d.maxDepth = Math.max(d.maxDepth, d.depth);
  const [tx, ty] = drainTip(d);
  const inBrain = d.depth > DRAIN_SKULL;
  const g = d.target;
  d.inVentricle = inBrain && ((tx - g.x) / g.rx) ** 2 + ((ty - g.y) / g.ry) ** 2 < 1;
  if (d.inVentricle && !d.seen) {
    d.seen = true;
    d.wasInside = true;
    logEvent(s, "stage", `CSF return at ${Math.round(d.depth)} mm`);
    setFeedback(s, "CSF return.", "You are in the ventricle. Stop here and secure the catheter.", "good");
    say(s, "Clear fluid is coming back. Secure it.", "good");
  }
  if (d.wasInside && !d.inVentricle && d.motion > 0 && !d.passedThrough) {
    d.passedThrough = true;
    s.injury = Math.min(1, s.injury + 0.12);
    logEvent(s, "injury", "Catheter passed through the far wall of the ventricle");
    say(s, "You are through the other side. Stop.", "danger");
  }
  if (d.passedThrough && d.motion > 0 && !d.inVentricle) s.injury = Math.min(1, s.injury + dt * 0.4 * hazard(s));
  if (inBrain && tx > d.midline) {
    s.injury = Math.min(1, s.injury + dt * 0.35 * hazard(s));
    if (!d.crossed) {
      d.crossed = true;
      logEvent(s, "injury", "Catheter crossed the midline into the other hemisphere");
      setFeedback(s, "Past the midline.", "You are in the wrong hemisphere. Withdraw.", "danger");
    }
  }
  for (const h of d.hazards)
    if (!h.hit && inBrain && Math.hypot(tx - h.x, ty - h.y) < h.r + 1.5) {
      h.hit = true;
      s.injury = Math.min(1, s.injury + 0.25);
      d.icp += 4;
      logEvent(s, "injury", `Catheter clipped a ${h.name}`);
      setFeedback(s, `Clipped a ${h.name}.`, "A small bleed will raise the pressure. Re-aim to avoid it next time.", "danger");
      say(s, "Small bleed along the tract. Pressure ticked up.", "warning");
    }
  if (d.motion < 0 && d.depth <= 1 && before > 1 && d.maxDepth >= 10) {
    d.passes++;
    s.complicationsTriggered++;
    s.mistakes++;
    s.injury = Math.min(1, s.injury + 0.08);
    logEvent(s, "complication", `Pass ${d.passes} found no fluid; the catheter was withdrawn`);
    setFeedback(s, "Withdrawn.", "Re-aim from the burr hole and try again.", "warning");
    d.maxDepth = 0;
    d.seen = false;
    d.wasInside = false;
    d.passedThrough = false;
    d.crossed = false;
    for (const h of d.hazards) h.hit = false;
  }
}
const TIER = { resident: 0, attending: 1, chief: 2 } as const;
/** Fire any complication whose trigger pocket has just been cleared. */
function stepTwists(s: GameState) {
  const twists = CASES[s.caseId].twists;
  if (!twists || !s.procedureStarted) return;
  // A refilled pocket that is cleared again counts as a handled complication.
  if (s.activeComplication?.startsWith("refill:")) {
    const idx = Number(s.activeComplication.slice(7));
    if ((s.pockets[idx]?.remaining ?? 0) <= POCKET_CLEAR_THRESHOLD) {
      s.complicationsHandled++;
      s.activeComplication = null;
      logEvent(s, "resolved", "The refilled pocket was cleared again");
    }
  }
  twists.forEach((tw, i) => {
    if (s.twistsDone[i]) return;
    if (TIER[s.difficulty] < TIER[tw.from]) return;
    if ((s.pockets[tw.after]?.remaining ?? 1) > POCKET_CLEAR_THRESHOLD) return;
    if (s.bleeding > BLEEDING_CONTROL_THRESHOLD || s.activeComplication) return;
    s.twistsDone[i] = true;
    s.complicationsTriggered++;
    s.action = false;
    cancelInspection(s);
    logEvent(s, "complication", tw.title);
    if (tw.kind === "rebleed" && tw.position) {
      s.bleedPosition = [...tw.position];
      s.bleeding = 0.4;
      s.sourceControlled = false;
      s.activeComplication = "rebleed";
    } else if (tw.kind === "refill" && tw.pocket !== undefined) {
      const p = s.pockets[tw.pocket];
      if (p) p.remaining = Math.max(p.remaining, tw.amount ?? 0.5);
      s.clarity *= 0.6;
      s.stage = Math.min(s.stage, 1);
      s.activeComplication = `refill:${tw.pocket}`;
    }
    setFeedback(s, tw.title, tw.detail, "danger");
    say(s, tw.say, "warning");
  });
}
/** Sustained injury ends the operation no matter which procedure caused it. */
function checkInjuryFailure(s: GameState) {
  if (s.status !== "running" || s.injury < 1) return;
  s.status = "failed";
  s.action = false;
  logEvent(s, "failure", "Sustained tissue injury compromised the field.");
}
/** Blood loss, monitor values, remarks and collapse. Returns true if the patient failed. */
function stepPhysiology(s: GameState, dt: number): boolean {
  const bleeding = s.bleeding > 0.02;
  if (bleeding)
    s.bloodLoss += dt * s.bleeding * (s.aneurysm?.phase === "ruptured" ? 9 : 5);
  else {
    // A long operation wears the patient down: brain swelling, anaesthetic depth, blood pressure.
    const par = CASES[s.caseId].parSeconds;
    const floor =
      s.difficulty === "resident" || s.drain
        ? 0
        : Math.min(0.4, (Math.max(0, s.elapsed - par * 0.85) / par) * 0.4 * hazard(s));
    if (floor > 0.05)
      say(s, "We have been under a long time. The brain is getting tight. Let us move.", "warning", "overtime");
    s.shock = Math.max(floor, s.shock - dt * 0.02);
  }
  s.vitals = stepVitals(
    s.vitals,
    { bleeding: s.bleeding, bloodLoss: s.bloodLoss, injury: s.injury, shock: s.shock },
    dt,
  );
  s.minSys = Math.min(s.minSys, s.vitals.sys);
  const sys = Math.round(s.vitals.sys);
  if (s.vitals.hr > 115) say(s, "Heart rate is climbing.", "warning", "hr115");
  if (s.vitals.sys < 105)
    say(s, "Blood pressure is trending down.", "warning", "bp105");
  if (s.vitals.sys < 88)
    say(s, `Pressure ${sys} and falling. I need that bleeding controlled.`, "danger", "bp88");
  if (s.vitals.sys < COLLAPSE_PRESSURE + 8)
    say(s, "We are about to lose the pressure. Act now.", "danger", "bp78");
  if (
    s.said.includes("bp88") &&
    !bleeding &&
    s.vitals.sys > 100 &&
    !s.said.includes("recover")
  )
    say(s, "Pressure is recovering. Good work.", "good", "recover");
  if (s.vitals.sys < COLLAPSE_PRESSURE) s.unstable += dt;
  else s.unstable = Math.max(0, s.unstable - dt * 0.5);
  const limit = DIFFICULTIES[s.difficulty].collapseSeconds;
  if (s.unstable > limit * 0.5)
    say(s, "Pressure is not coming back. Decide now.", "danger", "unstable-half");
  if (s.unstable >= limit || s.bloodLoss >= MAX_BLOOD_LOSS_ML) {
    s.status = "failed";
    s.action = false;
    logEvent(
      s,
      "failure",
      s.bloodLoss >= MAX_BLOOD_LOSS_ML
        ? "Too much blood was lost. The patient could not be stabilised."
        : "The patient's blood pressure collapsed while the bleeding continued.",
    );
    return true;
  }
  return false;
}
export function tick(s: GameState, c: Contact, dt: number) {
  if (s.status !== "running" || !Number.isFinite(dt) || dt <= 0) return;
  s.elapsed += dt;
  s.clearance = c.clearance;
  if (s.action) cancelInspection(s);
  if (!c.inField) s.action = false;
  if (s.bleeding > 0.02) {
    s.bleeding = Math.min(1, s.bleeding + dt * 0.011 * hazard(s));
    if (s.bleeding >= 1) {
      s.status = "failed";
      s.action = false;
      logEvent(s, "failure", "The bleeding source remained uncontrolled.");
      return;
    }
  }
  if (stepPhysiology(s, dt)) return;
  stepAneurysm(s, c, dt);
  stepTumor(s, c, dt);
  checkInjuryFailure(s);
  if (s.status !== "running") return;
  if (s.drain) {
    stepDrain(s, dt);
    checkInjuryFailure(s);
    return;
  }
  stepTwists(s);
  if (s.status !== "running") return;
  const active = s.action && c.inField;
  if (active) s.activeTime += dt;
  const p = c.pocket >= 0 ? s.pockets[c.pocket] : null;
  const working = c.clearance <= 0.24 && c.clearance >= 0.012;
  const nearSource =
    s.bleedPosition !== null &&
    s.bleeding > 0 &&
    c.bleedDistance < 0.2 &&
    s.aneurysm?.phase !== "ruptured";
  const physicalContact = (c.inField && c.clearance < -0.035) || c.shaftContact;
  const nearBridge =
    s.aneurysm?.bridges.some((b) => !b.done && near([b.x, b.y], c.tip[0], c.tip[1], 0.1)) ?? false;
  const nearFeeder =
    s.tumor?.feeders.some((f) => !f.done && near([f.x, f.y], c.tip[0], c.tip[1], 0.11)) ?? false;
  // Heat on the dome wall is judged by the aneurysm's own tension, not as cortical injury.
  const nearDome =
    s.aneurysm?.phase === "intact" && near(s.aneurysm.dome, c.tip[0], c.tip[1], 0.15);
  const thermalInjury =
    active && s.tool === "bipolar" && !nearSource && !nearBridge && !nearFeeder && !nearDome && c.clearance < 0.18;
  if (physicalContact || thermalInjury) {
    cancelInspection(s);
    const rate = c.vessel ? 2.7 : thermalInjury ? 1.5 : 1.15;
    s.injury = Math.min(1, s.injury + dt * rate * hazard(s));
    s.contactTime += dt;
    if (s.contactTime > 0.09) say(s, "The patient flinched. Easy, easy.", "warning", "flinch");
    if (s.contactTime > 0.09 && s.bleedPosition === null) {
      s.bleedPosition = [...(c.injuryPoint ?? c.tip)];
      s.bleeding = 0.14;
      logEvent(
        s,
        "injury",
        c.vessel
          ? `Contact with ${c.vessel}`
          : thermalInjury
            ? "Thermal injury to healthy tissue"
            : "Cortical surface contact",
        c.injuryPoint ?? c.tip,
      );
    }
    if (s.contactTime > 0.09) {
      s.bleeding = Math.min(1, s.bleeding + dt * 0.16 * hazard(s));
      setFeedback(
        s,
        c.vessel ? "Vessel contact. Withdraw." : "Tissue contact. Withdraw.",
        "Raise the instrument. The injury persists during this attempt.",
        "danger",
      );
    }
    if (s.injury >= 1) {
      s.status = "failed";
      s.action = false;
      logEvent(
        s,
        "failure",
        c.vessel
          ? `Sustained contact injured ${c.vessel}.`
          : "Sustained tissue injury compromised the field.",
        c.injuryPoint ?? c.tip,
      );
    }
    return;
  }
  s.contactTime = Math.max(0, s.contactTime - dt * 0.65);
  // An examination also runs with the instrument safely resting off the field.
  // Simply releasing an instrument never starts this explicit final check.
  if (s.inspectionActive) {
    if (!inspectionReady(s)) {
      cancelInspection(s);
      setFeedback(s, "Examination interrupted.", "Restore a clear, stable field, then choose Examine field again.", "warning");
    } else {
      s.inspectionTime = Math.min(INSPECTION_SECONDS, s.inspectionTime + dt);
      setFeedback(s, "Examining the field.", "Instruments are resting. The final check takes 2.5 seconds.", "good");
      if (s.inspectionTime >= INSPECTION_SECONDS - 1e-9) {
        s.inspectionTime = INSPECTION_SECONDS;
        s.inspectionActive = false;
        s.status = "success";
        s.action = false;
        logEvent(s, "complete", "Field cleared, rinsed, and explicitly examined");
      }
      return;
    }
  }
  if (!c.inField) {
    setFeedback(
      s,
      "Stay within the exposure.",
      "Reposition above the working field.",
    );
    return;
  }
  if (s.stage === 0 && p && working) {
    s.stage = 1;
    logEvent(s, "stage", "Approach established", c.tip);
    setFeedback(
      s,
      "Depth established.",
      "Hold the action button to remove fluid. Keep the tip above the surface.",
      "good",
    );
  }
  if (active && !s.sourceControlled && s.tool !== "bipolar") {
    setFeedback(s, "Control bleeding first.", "Apply bipolar at the marked source before aspirating or rinsing.", "warning");
    return;
  }
  if (active && s.tool === "suction") {
    if (p && p.remaining > 0.001 && working) {
      p.remaining = Math.max(
        0,
        p.remaining - dt * CASES[s.caseId].suctionRate,
      );
      s.usefulTime += dt;
      s.removed = fluidProgress(s);
      setFeedback(
        s,
        "Controlled aspiration.",
        "Maintain clearance. Release before repositioning.",
        "good",
      );
    } else if (c.clearance > 0.24)
      setFeedback(
        s,
        "The tip is above the fluid.",
        "Lower gently using the scroll wheel or F key.",
      );
    else if (!p || p.remaining <= 0.001)
      setFeedback(
        s,
        "Move to the remaining collection.",
        "Dark fluid remains at another part of the exposure.",
      );
  } else if (active && s.tool === "irrigation") {
    if (working) {
      s.clarity = Math.min(1, s.clarity + dt * CASES[s.caseId].irrigationRate);
      s.usefulTime += dt;
      setFeedback(
        s,
        "Rinsing the field.",
        "Keep the tip clear of tissue. Residual staining will remain.",
        "good",
      );
    } else
      setFeedback(
        s,
        "Approach the working plane.",
        "Irrigate from above the surface.",
      );
  } else if (active && s.tool === "bipolar") {
    if (nearSource && working) {
      s.bleeding = Math.max(0, s.bleeding - dt * 0.32);
      if (s.bleeding < BLEEDING_CONTROL_THRESHOLD) {
        s.bleeding = 0;
        s.bleedPosition = null;
        s.action = false;
        if (!s.sourceControlled) {
          s.sourceControlled = true;
          logEvent(s, "source", "Prepared bleeding source controlled");
        }
        if (s.activeComplication) {
          s.complicationsHandled++;
          logEvent(
            s,
            "resolved",
            s.activeComplication === "feeder"
              ? "Bleeding from a feeding vessel controlled"
              : "The new bleeding point was controlled",
          );
          s.activeComplication = null;
          const f = s.tumor?.feeders.find((x) => x.bleeding);
          if (f) {
            f.bleeding = false;
            f.done = true;
          }
        }
      }
      s.usefulTime += dt;
      setFeedback(
        s,
        s.bleeding === 0 ? "Bleeding source controlled." : "Treating the bleeding source.",
        s.bleeding === 0 ? "Release the action button. Continue with suction." : "Continue briefly until bleeding stops. Existing injury remains.",
        "good",
      );
    } else if (c.clearance > 0.18)
      setFeedback(
        s,
        "No contact with the bleeding source.",
        "Bipolar action is localized. Protect surrounding tissue.",
      );
  } else if (s.bleeding > 0.02)
    setFeedback(
      s,
      "A bleeding source needs attention.",
      "Inspect the marked injury and choose bipolar.",
      "warning",
    );
  else if (c.clearance < 0.035)
    setFeedback(
      s,
      "Close to the surface.",
      "Raise slightly before repositioning.",
      "warning",
    );
  else if (p && p.remaining > 0.001 && working)
    setFeedback(
      s,
      "Working depth.",
      "Hold the action button to operate.",
      "good",
    );
  else if (c.clearance > 0.24)
    setFeedback(
      s,
      "Above the working plane.",
      "Lower deliberately. The tip marker shows your approach.",
    );
  if (!s.tumor && pocketsCleared(s) && s.stage < 2) {
    s.stage = 2;
    logEvent(s, "stage", "Collection cleared");
    setFeedback(
      s,
      "Collection cleared.",
      `Select irrigation and rinse to ${Math.round(CASES[s.caseId].clarityRequired * 100)}% clarity, then choose Examine field.`,
      "good",
    );
  }
  if (inspectionReady(s))
    setFeedback(s, "Ready for final examination.", "Choose Examine field to rest the instruments and start the final check.", "good");
}
export function checkpoint(s: GameState, saved?: GameState): GameState {
  const n = saved
    ? structuredClone(saved)
    : createState(s.caseId, s.guided, s.entry + 1, s.difficulty);
  n.sound = s.sound;
  n.quality = s.quality;
  n.status = "running";
  n.action = false;
  cancelInspection(n);
  n.entry = s.entry + 1;
  logEvent(
    n,
    "retry",
    saved ? "Stage checkpoint restored" : "Prepared field restarted",
  );
  return n;
}
