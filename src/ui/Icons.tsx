import type { CSSProperties } from "react";
export function Icon({
  name,
  size = 18,
  style,
}: {
  name:
    | "pause"
    | "sound"
    | "mute"
    | "arrow"
    | "close"
    | "check"
    | "lock"
    | "expand"
    | "help";
  size?: number;
  style?: CSSProperties;
}) {
  const paths = {
    pause: (
      <>
        <path d="M8 5v14M16 5v14" strokeWidth="3" />
      </>
    ),
    sound: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
      </>
    ),
    mute: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="m16 9 6 6m0-6-6 6" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h15m-6-6 6 6-6 6" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    check: (
      <>
        <path d="m5 12 4 4L19 6" />
      </>
    ),
    lock: (
      <>
        <rect x="6" y="10" width="12" height="11" rx="1" />
        <path d="M8 10V6a4 4 0 0 1 8 0v4" />
      </>
    ),
    expand: (
      <>
        <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 4 2l-1.5 1v2M12 17h.01" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
