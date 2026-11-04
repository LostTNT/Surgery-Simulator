/**
 * Simulated anaesthesia monitor. Pure functions so the rules are unit-testable.
 * Values are a game approximation of how a patient might respond; they are not
 * physiological or clinical models.
 */
export interface Vitals {
  hr: number;
  sys: number;
  dia: number;
  spo2: number;
}
export type Difficulty = "resident" | "attending" | "chief";
export const DIFFICULTIES: Record<
  Difficulty,
  { name: string; blurb: string; hazard: number; collapseSeconds: number; guided: boolean }
> = {
  resident: {
    name: "Resident",
    blurb: "Target guides on. Injury and bleeding build more slowly.",
    hazard: 0.7,
    collapseSeconds: 22,
    guided: true,
  },
  attending: {
    name: "Attending",
    blurb: "Standard rules. Guides can be toggled.",
    hazard: 1,
    collapseSeconds: 14,
    guided: true,
  },
  chief: {
    name: "Chief",
    blurb: "No guides, faster consequences, less time to recover the patient.",
    hazard: 1.3,
    collapseSeconds: 9,
    guided: false,
  },
};
export const BASE_VITALS: Vitals = { hr: 72, sys: 124, dia: 78, spo2: 99 };
export const COLLAPSE_PRESSURE = 70;
export const MAX_BLOOD_LOSS_ML = 1500;

export interface VitalsDrivers {
  bleeding: number;
  bloodLoss: number;
  injury: number;
  shock: number;
}
export function vitalsTarget(d: VitalsDrivers): Vitals {
  const loss = Math.min(1, d.bloodLoss / 1200);
  const active = Math.min(1, Math.max(0, d.bleeding - 0.02) * 1.15);
  const shock = Math.min(1, d.shock);
  const sys = Math.max(
    38,
    BASE_VITALS.sys - 38 * active - 62 * loss - 16 * d.injury - 46 * shock,
  );
  return {
    hr: Math.min(
      178,
      BASE_VITALS.hr + 34 * active + 52 * loss + 20 * d.injury + 40 * shock,
    ),
    sys,
    dia: Math.max(24, BASE_VITALS.dia - (BASE_VITALS.sys - sys) * 0.55),
    spo2: Math.max(
      78,
      BASE_VITALS.spo2 - 7 * Math.max(0, loss - 0.35) - 9 * shock * shock,
    ),
  };
}
/** Exponential approach: independent of frame rate. */
export function approach(current: number, target: number, tau: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}
export function stepVitals(v: Vitals, d: VitalsDrivers, dt: number): Vitals {
  const t = vitalsTarget(d);
  return {
    hr: approach(v.hr, t.hr, 4, dt),
    sys: approach(v.sys, t.sys, 6, dt),
    dia: approach(v.dia, t.dia, 6, dt),
    spo2: approach(v.spo2, t.spo2, 8, dt),
  };
}
export type VitalsLevel = "stable" | "watch" | "critical";
export function vitalsLevel(v: Vitals): VitalsLevel {
  if (v.sys < COLLAPSE_PRESSURE + 5 || v.spo2 < 90) return "critical";
  if (v.sys < 105 || v.hr > 105 || v.spo2 < 95) return "watch";
  return "stable";
}
