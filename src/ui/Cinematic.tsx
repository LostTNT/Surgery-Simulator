import { useEffect, useRef, useState } from "react";

const LINE_MS = 3200;
/** A quiet, skippable arrival scene: the empty hospital before the operation. */
export function Cinematic({
  lines,
  clock,
  title,
  onDone,
}: {
  lines: string[];
  clock: string;
  title: string;
  onDone: () => void;
}) {
  const [shown, setShown] = useState(1);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (shown > lines.length) {
      const id = setTimeout(() => done.current(), 2600);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setShown((n) => n + 1), LINE_MS);
    return () => clearTimeout(id);
  }, [shown, lines.length]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (["Escape", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        done.current();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <section className="cinematic" role="dialog" aria-label="Arrival" onClick={() => done.current()}>
      <div className="cine-light" aria-hidden="true" />
      <div className="cine-clock" aria-hidden="true">{clock}</div>
      <div className="cine-lines" aria-live="polite">
        {lines.slice(0, Math.min(shown, lines.length)).map((line, i) => (
          <p key={i} className={i === Math.min(shown, lines.length) - 1 ? "latest" : "past"}>
            {line}
          </p>
        ))}
      </div>
      {shown > lines.length && <div className="cine-title">{title}</div>}
      <button
        className="cine-skip"
        onClick={(e) => {
          e.stopPropagation();
          done.current();
        }}
      >
        Skip intro
      </button>
    </section>
  );
}
