export type Tool = "suction" | "irrigation" | "bipolar" | "drill";
export type Status = "ready" | "running" | "paused" | "success" | "failed";
export type CaseId = "lab" | "case01" | "case02";
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
  clearance: number;
  action: boolean;
  sound: boolean;
  quality: "high" | "balanced";
  showAnatomy: boolean;
  depth: number;
  zoom: number;
  entry: number;
}
export const CASES: Record<
  CaseId,
  {
    name: string;
    label: string;
    difficulty: string;
    brief: string;
    duration: string;
  }
> = {
  lab: {
    name: "Instrument lab",
    label: "Practice field",
    difficulty: "Practice",
    duration: "REPEATABLE",
    brief:
      "Open a bone window with the burr, then clear and rinse a fictional practice field. Assisted depth helps you learn the instruments.",
  },
  case01: {
    name: "Extra-axial collection",
    label: "Case 01",
    difficulty: "Introductory",
    duration: "PREPARED FIELD",
    brief:
      "Open the bone window, then remove a localized fluid collection with slower aspiration. Protect the soft surface and inspect the cleared field.",
  },
  case02: {
    name: "A narrower margin",
    label: "Case 02",
    difficulty: "Intermediate · planned",
    duration: "COMING LATER",
    brief:
      "An intermediate case is planned after the introductory procedure passes its quality checks. More procedure families will follow.",
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
    detail: "Rinse the field, then release the instrument to inspect.",
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
  const locations =
    caseId === "case02"
      ? [
          [0.56, 0.58, 0.29],
          [0.82, 0.07, 0.28],
          [0.55, -0.53, 0.3],
          [-0.48, 0.64, 0.28],
        ]
      : [
          [0.68, 0.55, 0.38],
          [0.88, -0.03, 0.34],
          [0.58, -0.62, 0.4],
          [-0.42, 0.68, 0.33],
        ];
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
    pockets: locations.map(([x, y, radius]) => ({
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
  if (s.feedback.title !== title || s.feedback.kind !== kind)
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
export function pause(s: GameState) {
  s.action = false;
  if (s.status === "running") s.status = "paused";
}
export function chooseTool(s: GameState, tool: Tool) {
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
  if (s.status !== "running") return;
  s.elapsed += dt;
  s.clearance = c.clearance;
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
  const nearSource = s.bleedPosition !== null && c.bleedDistance < 0.2;
  const physicalContact = (c.inField && c.clearance < -0.035) || c.shaftContact;
  const thermalInjury =
    active && s.tool === "bipolar" && !nearSource && c.clearance < 0.18;
  if (physicalContact || thermalInjury) {
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
  if (active && s.tool === "suction") {
    if (p && p.remaining > 0.001 && working) {
      p.remaining = Math.max(
        0,
        p.remaining - dt * (s.caseId === "lab" ? 0.48 : 0.3),
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
      s.clarity = Math.min(1, s.clarity + dt * 0.24);
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
      s.usefulTime += dt;
      setFeedback(
        s,
        "Bleeding source controlled.",
        "Use brief activation. Existing injury remains.",
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
  if (fluidProgress(s) > 0.985 && s.stage < 2) {
    s.stage = 2;
    logEvent(s, "stage", "Collection cleared");
    setFeedback(
      s,
      "Collection cleared.",
      "Select irrigation, rinse the field, then release to inspect.",
      "good",
    );
  }
  if (s.stage === 2 && s.clarity > 0.88 && s.bleeding < 0.025 && !s.action) {
    s.inspectionTime += dt;
    setFeedback(
      s,
      "Inspecting the field.",
      "Keep the instrument inactive while the field is assessed.",
      "good",
    );
    if (s.inspectionTime > 2.5) {
      s.status = "success";
      s.action = false;
      logEvent(s, "complete", "Field cleared and inspected");
    }
  } else s.inspectionTime = 0;
}
export function checkpoint(s: GameState, saved?: GameState): GameState {
  const n = saved
    ? structuredClone(saved)
    : createState(s.caseId, s.guided, s.entry + 1);
  n.sound = s.sound;
  n.quality = s.quality;
  n.status = "running";
  n.action = false;
  n.entry = s.entry + 1;
  logEvent(
    n,
    "retry",
    saved ? "Stage checkpoint restored" : "Prepared field restarted",
  );
  return n;
}
