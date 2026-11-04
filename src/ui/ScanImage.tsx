import type { ScanKind } from "../game/patients";

/**
 * A stylised axial scan drawn in SVG. Every scan is illustrative: it shows where
 * the problem sits in this game, not real imaging.
 */
export function ScanImage({ kind, caption }: { kind: ScanKind; caption: string }) {
  const shift = kind === "subdural" ? 9 : kind === "tumor" ? 5 : 0;
  const ventricle = kind === "hydrocephalus" ? 1.9 : 1;
  const id = `scan-${kind}`;
  return (
    <figure className="scan" aria-label={caption}>
      <svg viewBox="0 0 200 200" role="img" aria-label={caption}>
        <defs>
          <radialGradient id={`${id}-brain`} cx="50%" cy="46%" r="60%">
            <stop offset="0" stopColor="#8d9391" />
            <stop offset="0.7" stopColor="#6d7472" />
            <stop offset="1" stopColor="#4f5654" />
          </radialGradient>
          <radialGradient id={`${id}-glow`}>
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id={`${id}-grain`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
            <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.16 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <clipPath id={`${id}-clip`}>
            <ellipse cx="100" cy="102" rx="70" ry="80" />
          </clipPath>
        </defs>
        <rect width="200" height="200" fill="#050b0a" />
        <ellipse cx="100" cy="102" rx="79" ry="89" fill="#e9eceb" />
        <ellipse cx="100" cy="102" rx="73" ry="83" fill="#2c3331" />
        <ellipse cx="100" cy="102" rx="70" ry="80" fill={`url(#${id}-brain)`} />
        <g clipPath={`url(#${id}-clip)`}>
          <line x1={100 + shift * 0.4} y1="22" x2={100 + shift * 0.4} y2="182" stroke="#4a504e" strokeWidth="1.2" />
          {/* ventricles */}
          <g fill="#262c2b" transform={`translate(${shift} 0)`}>
            <path
              d={`M${100 - 5 * ventricle} 92 q${-17 * ventricle} ${-4 * ventricle} ${-17 * ventricle} ${12 * ventricle} q${3} ${14 * ventricle} ${17 * ventricle} ${7 * ventricle} z`}
            />
            <path
              d={`M${100 + 5 * ventricle} 92 q${17 * ventricle} ${-4 * ventricle} ${17 * ventricle} ${12 * ventricle} q${-3} ${14 * ventricle} ${-17 * ventricle} ${7 * ventricle} z`}
            />
          </g>
          {kind === "subdural" && (
            <path d="M32 112 C28 70 54 34 92 28 C64 48 52 80 56 118 C58 142 70 158 88 172 C54 168 34 146 32 112Z" fill="#383e3d" stroke="#aeb4b2" strokeWidth="0.8" />
          )}
          {kind === "focal" && (
            <>
              <circle cx="132" cy="70" r="30" fill="#4c5352" opacity="0.8" />
              <path d="M118 58 q18 -8 28 6 q8 16 -6 26 q-18 6 -26 -10 q-4 -12 4 -22z" fill="#f4f6f5" />
            </>
          )}
          {kind === "loculated" && (
            <g fill="#3b4140" stroke="#c4c9c7" strokeWidth="0.9">
              <ellipse cx="48" cy="70" rx="12" ry="19" transform="rotate(-18 48 70)" />
              <ellipse cx="82" cy="36" rx="17" ry="8" />
              <ellipse cx="144" cy="52" rx="14" ry="10" transform="rotate(25 144 52)" />
              <ellipse cx="160" cy="112" rx="8" ry="20" />
              <ellipse cx="124" cy="168" rx="16" ry="8" />
              <ellipse cx="54" cy="148" rx="13" ry="10" />
            </g>
          )}
          {kind === "aneurysm" && (
            <g stroke="#f8faf9" strokeLinecap="round" fill="none">
              <path d="M24 120 C52 108 70 90 96 84 C120 78 142 60 170 52" strokeWidth="3" />
              <path d="M96 84 C100 108 94 128 80 150" strokeWidth="2.2" />
              <path d="M130 70 C144 86 156 98 170 100" strokeWidth="1.8" />
              <circle cx="108" cy="66" r="11" fill="#ffffff" stroke="none" />
              <circle cx="108" cy="66" r="19" fill={`url(#${id}-glow)`} stroke="none" opacity="0.5" />
            </g>
          )}
          {kind === "tumor" && (
            <>
              <path d="M98 20 C150 20 178 70 150 104 C132 124 92 120 80 94 C68 64 76 20 98 20Z" fill="#3b4140" opacity="0.7" />
              <ellipse cx="124" cy="68" rx="24" ry="26" fill="#f1f4f2" />
              <path d="M46 30 C80 40 120 36 156 24" fill="none" stroke="#b9e3a8" strokeWidth="3" strokeDasharray="5 4" />
            </>
          )}
          <rect width="200" height="200" fill="#808080" filter={`url(#${id}-grain)`} opacity="0.55" />
        </g>
        <g fontFamily="ui-monospace, monospace" fontSize="8" fill="#9fb8a8">
          <text x="8" y="14">AX</text>
          <text x="8" y="194">R</text>
          <text x="185" y="194">L</text>
        </g>
        {kind !== "lab" && (
          <g fill="none" stroke="#f0c9a3" strokeWidth="1.2">
            {kind === "subdural" && <path d="M26 112 l-14 0 m3 -4 l-3 4 l3 4" />}
            {kind === "focal" && <circle cx="132" cy="72" r="38" strokeDasharray="3 3" />}
            {kind === "aneurysm" && <circle cx="108" cy="66" r="20" strokeDasharray="3 3" />}
            {kind === "tumor" && <circle cx="124" cy="68" r="34" strokeDasharray="3 3" />}
            {kind === "hydrocephalus" && <path d="M100 92 l0 -50 m-4 6 l4 -6 l4 6" />}
          </g>
        )}
        {kind === "lab" && (
          <g stroke="#4f6a5b" strokeWidth="0.6">
            {[40, 70, 100, 130, 160].map((n) => (
              <g key={n}>
                <line x1={n} y1="24" x2={n} y2="180" />
                <line x1="24" y1={n + 2} x2="176" y2={n + 2} />
              </g>
            ))}
          </g>
        )}
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
