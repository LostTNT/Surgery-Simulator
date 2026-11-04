export type ScanKind =
  | "lab"
  | "subdural"
  | "focal"
  | "loculated"
  | "aneurysm"
  | "tumor"
  | "hydrocephalus";
export interface Patient {
  name: string;
  age: number;
  role: string;
  presentation: string;
  history: string[];
  diagnosis: string;
  plan: string;
  stakes: string;
  scan: ScanKind;
  scanCaption: string;
  /** Short, quiet scene-setting lines shown as you scrub in. */
  arrival: string[];
  /** Time on the hospital clock. */
  clock: string;
}
/**
 * Fictional patients. The medical framing is a plausible game setup, simplified
 * on purpose; it is not clinical teaching material.
 */
export const PATIENTS: Record<string, Patient> = {
  lab: {
    name: "Practice model",
    age: 0,
    role: "Simulation phantom",
    presentation: "A calibrated practice field with no patient at risk.",
    history: ["Learn the burr, suction, irrigation and bipolar before real cases."],
    diagnosis: "Training field",
    plan: "Open a bone window, clear four pockets, rinse, examine.",
    stakes: "Nothing is at risk here. Learn how each instrument behaves.",
    scan: "lab",
    scanCaption: "Phantom field",
    clock: "00:00",
    arrival: [
      "The simulation suite is dark except for one lamp.",
      "Nothing here can be hurt. Learn the instruments properly.",
      "The real wards are not this forgiving.",
    ],
  },
  case01: {
    name: "Arthur Bell",
    age: 74,
    role: "Retired bus driver",
    presentation: "Three weeks of worsening headache and a new weakness in the left hand.",
    history: [
      "Fell in the garden about a month ago; no loss of consciousness.",
      "Takes a blood thinner for an irregular heartbeat.",
      "Daughter reports he has become sleepy and a little confused.",
    ],
    diagnosis: "Chronic subdural haematoma",
    plan: "Open the bone, drain the old collection, irrigate until the fluid runs clear.",
    stakes:
      "An old collection presses on the brain. Draining it is usually rewarding, but rough handling of the thin surface vessels brings bleeding the patient's blood thinner makes harder to stop.",
    scan: "subdural",
    scanCaption: "CT head, axial: crescent collection pressing the brain across the midline",
    clock: "02:47",
    arrival: [
      "02:47. Level 4, east wing.",
      "The corridor lights hum. Every bed on the ward is empty but one.",
      "Arthur Bell's daughter signed the forms an hour ago and went to find coffee. She has not come back.",
      "Water runs cold in the scrub sink. You are the only one awake.",
    ],
  },
  case02: {
    name: "Maya Okafor",
    age: 29,
    role: "Cycle courier",
    presentation: "Thrown from her bike an hour ago. Drowsy, then worse on the way in.",
    history: [
      "Helmet cracked on impact.",
      "No medical history; no medications.",
      "Pupil changes in the ambulance prompted an urgent scan.",
    ],
    diagnosis: "Acute bleed from a torn surface vessel",
    plan: "Open the bone, find and coagulate the source first, then clear the blood and rinse.",
    stakes:
      "A vessel is bleeding now. Every minute costs blood and pressure. Control the source before anything else, and do not cauterize healthy brain.",
    scan: "focal",
    scanCaption: "CT head, axial: fresh bleed with local swelling",
    clock: "23:15",
    arrival: [
      "23:15. Trauma bay, ground floor.",
      "The ambulance crew left in a hurry. Their wet footprints are still on the floor.",
      "Maya Okafor's helmet is on the bench, split open.",
      "Nobody has come to relieve you. The monitor is already counting.",
    ],
  },
  case03: {
    name: "Leo Brandt",
    age: 17,
    role: "Student",
    presentation: "A week of sinus infection, then fever, severe headache and a seizure.",
    history: [
      "Started on antibiotics yesterday without much change.",
      "Scan shows infected fluid in several separate pockets.",
      "Pockets are walled off from one another and each needs its own washout.",
    ],
    diagnosis: "Loculated subdural empyema",
    plan: "Open the bone, evacuate each separate pocket, then wash out thoroughly.",
    stakes:
      "Infected fluid sits in six separate pockets. Leave one behind and the infection comes back; hurry and you damage the brain surface that is already inflamed.",
    scan: "loculated",
    scanCaption: "CT head, axial: multiple walled-off collections",
    clock: "04:20",
    arrival: [
      "04:20. Paediatric side, Level 2.",
      "The vending machine hums to itself in the dark.",
      "Leo Brandt's mother is asleep in the chair outside theatre, still holding his school bag.",
      "The infection has been waiting a week. It will not wait much longer.",
    ],
  },
  case04: {
    name: "Helena Voss",
    age: 52,
    role: "Primary school teacher",
    presentation: "Sudden worst-ever headache last week; scans found an unruptured aneurysm.",
    history: [
      "Aneurysm sits on a branch of an artery on the brain surface.",
      "She is healthy otherwise and chose surgery over observation.",
      "Anaesthetist notes the walls look thin on imaging.",
    ],
    diagnosis: "Unruptured aneurysm, surface artery",
    plan: "Open the bone, free the neck of the aneurysm, place a clip across it without pinching the artery.",
    stakes:
      "A thin-walled bulge on a living artery. Handled roughly it can burst. If it does, you have seconds: control the bleeding, see the neck and clip it.",
    scan: "aneurysm",
    scanCaption: "CT angiogram, axial: bright round aneurysm on a branch vessel",
    clock: "01:58",
    arrival: [
      "01:58. Neurosurgical theatre 3.",
      "The ward was quiet at midnight. Now it is silent in a different way.",
      "Helena Voss asked you one thing before the anaesthetic: tell my class I will see them soon.",
      "The aneurysm has been growing for years. Tonight you decide when it stops.",
    ],
  },
  case05: {
    name: "Daniel Reyes",
    age: 41,
    role: "Electrician",
    presentation: "Two seizures this month and a growing numbness in the right hand.",
    history: [
      "A slow-growing tumour sits next to the area that moves the right hand.",
      "Goal is to remove as much as is safe while keeping hand function.",
      "Feeding vessels supply the tumour and will bleed when divided.",
    ],
    diagnosis: "Meningioma beside the motor cortex",
    plan: "Open the bone, shrink the tumour piece by piece, seal its feeding vessels, stay clear of the marked motor area.",
    stakes:
      "Take too little and it grows back; take too much and Daniel loses the use of his hand. The line between them is on your screen.",
    scan: "tumor",
    scanCaption: "MRI, axial: enhancing mass with swelling beside the motor strip",
    clock: "03:30",
    arrival: [
      "03:30. Level 5, imaging corridor.",
      "The lights turn on for you one by one and off again behind you.",
      "Daniel Reyes keeps flexing his right hand in his sleep, as if checking it is still there.",
      "Take what you must. Leave what he needs.",
    ],
  },
  case06: {
    name: "Priya Nair",
    age: 63,
    role: "Retired nurse",
    presentation: "Collapsed at home after a sudden severe headache; now barely rousable.",
    history: [
      "Scan shows blood has blocked the fluid channels; the ventricles are swollen.",
      "Pressure inside the head is rising by the minute.",
      "Time matters more than anything else.",
    ],
    diagnosis: "Acute hydrocephalus",
    plan: "Place a ventricular drain through a small burr hole to let the trapped fluid out.",
    stakes:
      "You cannot see the target. Aim from the scan: too shallow and nothing drains, too deep or off-line and you injure the brain.",
    scan: "hydrocephalus",
    scanCaption: "CT head, axial: swollen ventricles, midline marked",
    clock: "05:12",
    arrival: [
      "05:12. Emergency neurosurgery.",
      "The lifts are stopped. The night porter is gone. The corridor is a long white tube.",
      "Priya Nair was a nurse on this ward for thirty years. Her badge is still pinned to her coat.",
      "Pressure is rising. Everything else can wait.",
    ],
  },
};
/** Short surgeon's note shown in the debrief for an injury type. */
export function lessonFor(detail: string): string {
  const d = detail.toLowerCase();
  if (d.includes("rupture"))
    return "A thin aneurysm wall can burst under rough handling. Free the neck gently with short passes, and have suction ready.";
  if (d.includes("parent"))
    return "A clip must close the aneurysm neck without narrowing the artery it grows from. Align across the neck and check both sides.";
  if (d.includes("motor") || d.includes("eloquent"))
    return "Near the motor area, stop before you reach it. Some tumour left behind can be treated later; lost hand function cannot be restored.";
  if (d.includes("vessel") || d.includes("sinus"))
    return "Surface vessels carry real flow. Keep the tip above them and move with the shaft clear of the vessel.";
  if (d.includes("thermal"))
    return "Bipolar heat spreads. Touch only the bleeding point, in short bursts, and release as soon as bleeding stops.";
  if (d.includes("cortical") || d.includes("tissue"))
    return "Pressing on the brain surface bruises it. Hover just above the fluid and let the instrument do the work.";
  if (d.includes("bleeding") || d.includes("pressure") || d.includes("unstable"))
    return "An uncontrolled bleed drains the patient quickly. Take control of the source first, everything else can wait.";
  return "";
}

const AFTER_DEATH: Record<string, string> = {
  case01: "His daughter came back with the coffee. It was cold by the time anyone told her.",
  case02: "Her mother is in the waiting room. Nobody has told her yet.",
  case03: "His mother is still asleep in the chair outside, holding his school bag.",
  case04: "Her class will be told on Monday.",
  case05: "His right hand lay open on the sheet.",
  case06: "Her ward badge is still pinned to her coat.",
};
const GOOD_END: Record<string, string> = {
  lab: "",
  case01: "Arthur woke up asking for tea, and whether his daughter had finished the crossword.",
  case02: "Maya woke at dawn and asked who had stolen her bike.",
  case03: "Leo's fever broke by morning. His mother is still holding the school bag.",
  case04: "Helena woke up and asked, slowly, whether her class had behaved.",
  case05: "Daniel flexed his right hand twice and laughed at the ceiling.",
  case06: "Priya's headache eased within the hour. She asked whose shift it was.",
};
function hhmm(start: string, seconds: number) {
  const [h, m] = start.split(":").map(Number);
  const total = (h * 60 + m + Math.round(seconds / 60)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
/** One quiet sentence about what the operation meant for the patient. */
export function outcomeLine(s: {
  caseId: string;
  status: string;
  elapsed: number;
  injury: number;
  bloodLoss: number;
  events: { type: string; detail: string }[];
}): string {
  const p = PATIENTS[s.caseId];
  if (!p || s.caseId === "lab") return "";
  const first = p.name.split(" ")[0];
  const seen = (re: RegExp) => s.events.some((e) => re.test(e.detail));
  if (s.status === "failed") {
    const died = s.events.some(
      (e) => e.type === "failure" && /pressure collapsed|blood was lost|herniat|bleeding source/i.test(e.detail),
    );
    return died
      ? `Time of death ${hhmm(p.clock, s.elapsed)}. ${AFTER_DEATH[s.caseId] ?? ""}`
      : `${first} survived the night, but the damage done in theatre was severe.`;
  }
  if (seen(/motor/i)) return `${first} woke up with a weak, clumsy right hand. Physiotherapy starts tomorrow.`;
  if (seen(/midline/i)) return `${first} woke up but struggled to find words for days.`;
  if (seen(/parent artery/i)) return `${first} had a small stroke after the clip and will need months of recovery.`;
  if (s.injury > 0.4) return `${first} woke up, but the recovery will be long.`;
  if (s.bloodLoss > 600) return `${first} needed a transfusion and a night in intensive care.`;
  return GOOD_END[s.caseId] ?? "";
}
