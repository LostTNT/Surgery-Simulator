export type Tool = "suction" | "irrigation" | "bipolar" | "drill";
export type Status = "ready" | "running" | "paused" | "success" | "failed";
export type CaseId = "lab" | "case01" | "case02" | "case03";
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
}
export interface ProcedureCase {
  name: string;
  label: string;
  difficulty: string;
  brief: string;
  duration: string;
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
    name: "Instrument lab",
    label: "Practice field",
    difficulty: "Practice",
    duration: "REPEATABLE",
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
    name: "Extra-axial collection",
    label: "Case 01",
    difficulty: "Introductory",
    duration: "PREPARED FIELD",
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
    name: "Focal bleeding control",
    label: "Case 02",
    difficulty: "Intermediate",
    duration: "BLEEDING CONTROL",
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
    name: "Loculated collection washout",
    label: "Case 03",
    difficulty: "Intermediate",
    duration: "SIX-POCKET WASHOUT",
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
  };
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
    s.bleeding < BLEEDING_CONTROL_THRESHOLD
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
  return 1 - s.pockets.reduce((a, p) => a + p.remaining, 0) / s.pockets.length;
}
export function score(s: GameState) {
  return Math.max(
    0,
    Math.round(100 - s.injury * 75 - (s.bleeding > 0.01 ? 15 : 0)),
  );
}
export function tick(s: GameState, c: Contact, dt: number) {
  if (s.status !== "running" || !Number.isFinite(dt) || dt <= 0) return;
  s.elapsed += dt;
  s.clearance = c.clearance;
  if (s.action) cancelInspection(s);
  if (!c.inField) s.action = false;
  if (s.bleeding > 0.02) {
    s.bleeding = Math.min(1, s.bleeding + dt * 0.006);
    if (s.bleeding >= 1) {
      s.status = "failed";
      s.action = false;
      logEvent(s, "failure", "The bleeding source remained uncontrolled.");
      return;
    }
  }
  const active = s.action && c.inField;
  if (active) s.activeTime += dt;
  const p = c.pocket >= 0 ? s.pockets[c.pocket] : null;
  const working = c.clearance <= 0.24 && c.clearance >= 0.012;
  const nearSource = s.bleedPosition !== null && s.bleeding > 0 && c.bleedDistance < 0.2;
  const physicalContact = (c.inField && c.clearance < -0.035) || c.shaftContact;
  const thermalInjury =
    active && s.tool === "bipolar" && !nearSource && c.clearance < 0.18;
  if (physicalContact || thermalInjury) {
    cancelInspection(s);
    const rate = c.vessel ? 2.7 : thermalInjury ? 1.5 : 1.15;
    s.injury = Math.min(1, s.injury + dt * rate);
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
      s.bleeding = Math.min(1, s.bleeding + dt * 0.16);
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
    : createState(s.caseId, s.guided, s.entry + 1);
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
