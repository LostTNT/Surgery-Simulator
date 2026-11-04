import { useEffect, useRef } from "react";
import {
  DRAIN_MAX_DEPTH,
  DRAIN_SKULL,
  drainTip,
  type GameState,
} from "../game/simulation";
import { vitalsLevel } from "../game/vitals";
import { Icon } from "./Icons";

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const m = svg.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}
export function DrainGame({
  view,
  onAim,
  onDrive,
  onSecure,
}: {
  view: GameState;
  onAim: (angle: number) => void;
  onDrive: (motion: -1 | 0 | 1) => void;
  onSecure: () => void;
}) {
  const d = view.drain!;
  const svg = useRef<SVGSVGElement>(null);
  const running = view.status === "running";
  // Handlers change identity every render; keep them in refs so key listeners
  // are not torn down (which would release the catheter) on each state update.
  const handlers = useRef({ onDrive, onSecure });
  handlers.current = { onDrive, onSecure };
  useEffect(() => {
    const { current } = handlers;
    const onDrive = (m: -1 | 0 | 1) => current.onDrive(m);
    const onSecure = () => current.onSecure();
    const down = (e: KeyboardEvent) => {
      if (e.repeat || !running) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "arrowdown" || k === "w") {
        e.preventDefault();
        onDrive(1);
      } else if (k === "r" || k === "arrowup" || k === "s") {
        e.preventDefault();
        onDrive(-1);
      } else if (k === "e" || k === "enter") {
        e.preventDefault();
        onSecure();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ([" ", "arrowdown", "w", "r", "arrowup", "s"].includes(k)) onDrive(0);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      onDrive(0);
    };
  }, [running]);
  const [ex, ey] = d.entry,
    [tx, ty] = drainTip(d),
    g = d.target,
    mirror = 2 * d.midline - g.x;
  const inserting = d.depth > 4;
  const stage = d.secured ? 3 : d.inVentricle ? 2 : inserting ? 1 : 0;
  const titles = [
    "Aim the catheter",
    "Advance and find fluid",
    "Fluid is returning. Secure it.",
    "Draining",
  ];
  const details = [
    "Move the pointer to aim from the burr hole at the swollen ventricle. The straight line may not be the safe one.",
    "Hold the mouse button or Space to advance. Release when fluid returns.",
    "Release, then press E or Secure catheter before you pass through.",
    "Pressure is falling. Hold still while the field settles.",
  ];
  const icp = d.icp,
    icpLevel = icp > 48 ? "critical" : icp > 38 ? "watch" : "stable";
  const level = vitalsLevel(view.vitals);
  const dx = Math.cos(d.angle),
    dy = Math.sin(d.angle);
  return (
    <section className="drain" aria-label="Ventricular drain navigation">
      <div className="drain-info objective">
        <h1>{titles[stage]}</h1>
        <p>{details[stage]}</p>
        <ol className="procedure-steps">
          {["Aim", "Advance", "Secure"].map((label, i) => (
            <li key={label} className={i === stage ? "current" : i < stage ? "done" : ""}>
              <span>{i < stage ? <Icon name="check" size={13} /> : i + 1}</span>
              <small>{label}</small>
            </li>
          ))}
        </ol>
        <div className={`icp icp-${icpLevel}`}>
          <div>
            <span>INTRACRANIAL PRESSURE</span>
            <strong>
              {Math.round(icp)}
              <small> mmHg</small>
            </strong>
          </div>
          <i>
            <b style={{ width: `${Math.min(100, ((icp - 10) / 52) * 100)}%` }} />
          </i>
        </div>
      </div>
      <div className="drain-stage">
        <svg
          ref={svg}
          viewBox="0 0 200 200"
          role="img"
          aria-label="Axial CT with a burr hole at the upper left. Move the pointer to aim the catheter."
          onPointerMove={(e) => {
            if (!svg.current || !running) return;
            const p = svgPoint(svg.current, e.clientX, e.clientY);
            if (p) onAim(Math.atan2(p.y - ey, p.x - ex));
          }}
          onPointerDown={(e) => {
            if (e.button !== 0 || !running) return;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            onDrive(1);
          }}
          onPointerUp={() => onDrive(0)}
          onPointerCancel={() => onDrive(0)}
        >
          <defs>
            <radialGradient id="dg-brain" cx="50%" cy="46%" r="60%">
              <stop offset="0" stopColor="#8d9391" />
              <stop offset="0.7" stopColor="#6d7472" />
              <stop offset="1" stopColor="#4f5654" />
            </radialGradient>
            <clipPath id="dg-clip">
              <ellipse cx="100" cy="102" rx="70" ry="80" />
            </clipPath>
          </defs>
          <rect width="200" height="200" fill="#050b0a" />
          <ellipse cx="100" cy="102" rx="79" ry="89" fill="#e9eceb" />
          <ellipse cx="100" cy="102" rx="73" ry="83" fill="#2c3331" />
          <ellipse cx="100" cy="102" rx="70" ry="80" fill="url(#dg-brain)" />
          <g clipPath="url(#dg-clip)">
            <line x1={d.midline} y1="22" x2={d.midline} y2="182" stroke="#515856" strokeWidth="1.2" />
            <ellipse cx={g.x} cy={g.y} rx={g.rx} ry={g.ry} fill="#202625" transform={`rotate(-8 ${g.x} ${g.y})`} />
            <ellipse cx={mirror} cy={g.y} rx={g.rx} ry={g.ry} fill="#202625" transform={`rotate(8 ${mirror} ${g.y})`} />
            {d.hazards.map((h) => (
              <g key={h.name}>
                <circle cx={h.x} cy={h.y} r={h.r + 2.4} fill="#ffffff" opacity="0.22" />
                <circle cx={h.x} cy={h.y} r={h.r} fill={h.hit ? "#ff9a85" : "#ffffff"} />
              </g>
            ))}
          </g>
          <g fontFamily="ui-monospace, monospace" fontSize="6" fill="#9fb8a8">
            <text x="6" y="12">AXIAL</text>
            <text x="6" y="196">R</text>
            <text x="190" y="196">L</text>
            {view.guided &&
              d.hazards.map((h) => (
                <text key={h.name} x={h.x + 7} y={h.y + 2} fill="#e8f0ec">
                  {h.name}
                </text>
              ))}
            {view.guided && (
              <text x={d.midline + 3} y="30" fill="#c8d6cc">
                midline
              </text>
            )}
          </g>
          {/* Aim line: full ruler when guided, a short stub otherwise */}
          {!d.secured && (
            <g stroke="#f0c9a3" fill="none" strokeWidth="0.7" strokeDasharray="2 2.4" opacity="0.9">
              <line
                x1={ex}
                y1={ey}
                x2={ex + dx * (view.guided ? 105 : 16)}
                y2={ey + dy * (view.guided ? 105 : 16)}
              />
            </g>
          )}
          {view.guided &&
            !d.secured &&
            [20, 30, 40, 50, 60, 70, 80, 90].map((mm) => (
              <g key={mm}>
                <circle cx={ex + dx * mm} cy={ey + dy * mm} r="0.9" fill="#f0c9a3" />
                {mm % 20 === 0 && (
                  <text
                    x={ex + dx * mm - dy * 6 + 1}
                    y={ey + dy * mm + dx * 6 + 2}
                    fontSize="4.6"
                    fontFamily="ui-monospace, monospace"
                    fill="#f0c9a3"
                  >
                    {mm}
                  </text>
                )}
              </g>
            ))}
          {/* Burr hole and catheter */}
          <circle cx={ex} cy={ey} r="2.6" fill="#050b0a" stroke="#f4f6f5" strokeWidth="0.9" />
          {d.depth > 0.5 && (
            <>
              <line
                x1={ex}
                y1={ey}
                x2={tx}
                y2={ty}
                stroke={d.inVentricle ? "#9dd4ff" : "#e6edf0"}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx={tx} cy={ty} r="2.1" fill={d.inVentricle ? "#9dd4ff" : "#ffffff"} />
            </>
          )}
          {d.inVentricle && !d.secured && (
            <circle cx={tx} cy={ty} r="6" fill="none" stroke="#9dd4ff" strokeWidth="0.8">
              <animate attributeName="r" values="3;11" dur="0.9s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0" dur="0.9s" repeatCount="indefinite" />
            </circle>
          )}
        </svg>
      </div>
      <aside className="drain-side">
        <div className="drain-depth">
          <span>CATHETER DEPTH</span>
          <strong>
            {Math.round(d.depth)}
            <small> mm</small>
          </strong>
          <i>
            <b
              style={{
                width: `${(d.depth / DRAIN_MAX_DEPTH) * 100}%`,
                background: d.inVentricle ? "#9dd4ff" : undefined,
              }}
            />
            <em style={{ left: `${(DRAIN_SKULL / DRAIN_MAX_DEPTH) * 100}%` }} />
          </i>
          <p>
            {d.depth <= DRAIN_SKULL
              ? "Through the skull"
              : d.inVentricle
                ? "In the ventricle · CSF returning"
                : d.passedThrough
                  ? "Through the far wall"
                  : "In brain tissue"}
          </p>
        </div>
        <button
          className="primary-button"
          disabled={!running || d.secured}
          onPointerDown={() => onDrive(1)}
          onPointerUp={() => onDrive(0)}
          onPointerLeave={() => onDrive(0)}
        >
          Advance (hold)
          <kbd>Space</kbd>
        </button>
        <button
          className="secondary-button"
          disabled={!running || d.secured || d.depth <= 0}
          onPointerDown={() => onDrive(-1)}
          onPointerUp={() => onDrive(0)}
          onPointerLeave={() => onDrive(0)}
        >
          Withdraw (hold)
          <kbd>R</kbd>
        </button>
        <button
          className={`secure-button ${d.inVentricle ? "ready" : ""}`}
          disabled={!running || d.secured}
          onClick={onSecure}
        >
          Secure catheter
          <kbd>E</kbd>
        </button>
        <p className="drain-hint">
          {d.passes > 0
            ? `${d.passes} ${d.passes === 1 ? "pass has" : "passes have"} missed. Each one bruises the brain.`
            : "Dark ovals are the swollen ventricles. A bright dot is a vessel."}
        </p>
      </aside>
      {view.callout && view.elapsed - view.callout.at < 7 && running && (
        <div key={view.callout.id} className={`callout ${view.callout.kind}`} role="status">
          <small>ANAESTHESIA</small>
          <span>{view.callout.text}</span>
        </div>
      )}
      <div className={`vitals drain-vitals level-${level}`} aria-label="Simulated patient monitoring">
        <div className="vital"><small>HR</small><strong>{Math.round(view.vitals.hr)}</strong></div>
        <div className="vital"><small>BP</small><strong>{Math.round(view.vitals.sys)}/{Math.round(view.vitals.dia)}</strong></div>
        <div className="vital"><small>SpO₂</small><strong>{Math.round(view.vitals.spo2)}%</strong></div>
        {view.injury > 0.01 && <span className="injury-readout">Tissue injury {Math.round(view.injury * 100)}%</span>}
      </div>
    </section>
  );
}
