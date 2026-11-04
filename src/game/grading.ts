import type { GameState } from "./simulation.ts";

export type Letter = "S" | "A" | "B" | "C" | "D" | "F";
export interface GradePart {
  label: string;
  value: number;
  max: number;
  note: string;
}
export interface Grade {
  letter: Letter;
  points: number;
  parts: GradePart[];
}
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export function letterFor(points: number): Letter {
  return points >= 95
    ? "S"
    : points >= 85
      ? "A"
      : points >= 72
        ? "B"
        : points >= 58
          ? "C"
          : points >= 40
            ? "D"
            : "F";
}
/**
 * Grade a finished or failed attempt. `par` is the case's target time in seconds.
 * A failed operation is capped below a passing grade.
 */
export function gradeAttempt(s: GameState, par: number): Grade {
  const resection = s.tumor && s.pockets.length
    ? 1 - s.pockets.reduce((a, p) => a + p.remaining, 0) / s.pockets.length
    : 1;
  const injury = 30 * (1 - clamp01(s.injury)),
    blood = 25 * (1 - clamp01(s.bloodLoss / 600)),
    speed = 15 * clamp01(1 - Math.max(0, s.elapsed - par) / par),
    stability = 15 * clamp01((s.minSys - 60) / 40),
    complications =
      s.complicationsTriggered === 0
        ? 15
        : 15 * clamp01(s.complicationsHandled / s.complicationsTriggered);
  const parts: GradePart[] = [
    {
      label: "Tissue protection",
      value: injury,
      max: 30,
      note: `${Math.round(s.injury * 100)}% tissue injury`,
    },
    {
      label: "Blood loss",
      value: blood,
      max: 25,
      note: `${Math.round(s.bloodLoss)} ml`,
    },
    {
      label: "Patient stability",
      value: stability,
      max: 15,
      note: `Lowest pressure ${Math.round(s.minSys)} systolic`,
    },
    {
      label: "Complications",
      value: complications,
      max: 15,
      note:
        s.complicationsTriggered === 0
          ? "None occurred"
          : `${s.complicationsHandled} of ${s.complicationsTriggered} handled`,
    },
    s.tumor
      ? {
          label: "Extent of resection",
          value: 15 * clamp01((resection - 0.5) / 0.45),
          max: 15,
          note: `${Math.round(resection * 100)}% removed`,
        }
      : {
          label: "Pace",
          value: speed,
          max: 15,
          note: `${Math.round(s.elapsed)}s against a ${par}s target`,
        },
  ];
  let points = Math.round(parts.reduce((a, p) => a + p.value, 0));
  if (s.status === "failed") points = Math.min(points, 39);
  return { letter: letterFor(points), points, parts };
}
