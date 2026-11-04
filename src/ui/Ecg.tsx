import { useEffect, useRef } from "react";

/** A scrolling ECG trace that runs at the patient's real heart rate. */
export function Ecg({ hr, level }: { hr: number; level: "stable" | "watch" | "critical" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ hr, level });
  live.current = { hr, level };
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width,
      H = canvas.height;
    let x = 0,
      phase = 0,
      last = performance.now(),
      id = 0;
    const colours = { stable: "#39ff9c", watch: "#ffb547", critical: "#ff4a4a" };
    // One beat: small P wave, sharp QRS spike, rounded T wave (0..1).
    const beat = (p: number) => {
      if (p < 0.1) return 0.12 * Math.sin((p / 0.1) * Math.PI);
      if (p > 0.16 && p < 0.2) return -0.15 * Math.sin(((p - 0.16) / 0.04) * Math.PI);
      if (p >= 0.2 && p < 0.26) return 1 * Math.sin(((p - 0.2) / 0.06) * Math.PI);
      if (p >= 0.26 && p < 0.3) return -0.25 * Math.sin(((p - 0.26) / 0.04) * Math.PI);
      if (p > 0.42 && p < 0.58) return 0.22 * Math.sin(((p - 0.42) / 0.16) * Math.PI);
      return 0;
    };
    const tick = (now: number) => {
      id = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { hr, level } = live.current;
      const speed = 90; // px per second
      const steps = Math.max(1, Math.round(dt * speed));
      for (let i = 0; i < steps; i++) {
        phase = (phase + (hr / 60) / speed) % 1;
        const jitter = level === "critical" ? (Math.random() - 0.5) * 0.18 : 0;
        const y = H * 0.62 - (beat(phase) + jitter) * H * 0.5;
        ctx.clearRect(x, 0, 6, H);
        ctx.strokeStyle = colours[level];
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - 1, (ctx as unknown as { _y?: number })._y ?? y);
        ctx.lineTo(x, y);
        ctx.stroke();
        (ctx as unknown as { _y?: number })._y = y;
        x = (x + 1) % W;
      }
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  return <canvas ref={ref} className="ecg-canvas" width={132} height={34} aria-hidden="true" />;
}
