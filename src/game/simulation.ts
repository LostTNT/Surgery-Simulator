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
export type CaseId = "lab" | "case01" | "case02" | "case03" | "case04";
export type CaseKind = "washout" | "aneurysm";
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
export const ANEURYSM_AXIS = 0.894;
export function createAneurysm(): AneurysmState {
  const axis = ANEURYSM_AXIS,
    ax = Math.cos(axis),
    ay = Math.sin(axis),
    px = -ay,
    py = ax,
    neck: [number, number] = [0.22, -0.1];
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
  aneurysm: AneurysmState | null;
  /** Orientation of the held clip in radians. */
  clipAngle: number;
}
export interface ProcedureCase {
  kind: CaseKind;
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
    aneurysm: procedure.kind === "aneurysm" ? createAneurysm() : null,
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
    pocketsCleared(s) &&
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
  if (blind) {
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
  if (side < 0.015 && Math.abs(along) < 0.12) {
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
/** Blood loss, monitor values, remarks and collapse. Returns true if the patient failed. */
function stepPhysiology(s: GameState, dt: number): boolean {
  const bleeding = s.bleeding > 0.02;
  if (bleeding)
    s.bloodLoss += dt * s.bleeding * (s.aneurysm?.phase === "ruptured" ? 9 : 5);
  else s.shock = Math.max(0, s.shock - dt * 0.02);
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
    s.bleeding = Math.min(1, s.bleeding + dt * 0.006 * hazard(s));
    if (s.bleeding >= 1) {
      s.status = "failed";
      s.action = false;
      logEvent(s, "failure", "The bleeding source remained uncontrolled.");
      return;
    }
  }
  if (stepPhysiology(s, dt)) return;
  stepAneurysm(s, c, dt);
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
  // Heat on the dome wall is judged by the aneurysm's own tension, not as cortical injury.
  const nearDome =
    s.aneurysm?.phase === "intact" && near(s.aneurysm.dome, c.tip[0], c.tip[1], 0.15);
  const thermalInjury =
    active && s.tool === "bipolar" && !nearSource && !nearBridge && !nearDome && c.clearance < 0.18;
  if (physicalContact || thermalInjury) {
    cancelInspection(s);
    const rate = c.vessel ? 2.7 : thermalInjury ? 1.5 : 1.15;
    s.injury = Math.min(1, s.injury + dt * rate * hazard(s));
    s.contactTime += dt;
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
  if (pocketsCleared(s) && s.stage < 2) {
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
