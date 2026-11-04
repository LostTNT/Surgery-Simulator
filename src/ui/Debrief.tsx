import { CASES, type GameState } from "../game/simulation";
import { gradeAttempt } from "../game/grading";
import { lessonFor } from "../game/patients";

function clock(t: number) {
  return `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(t % 60)
    .toString()
    .padStart(2, "0")}`;
}
const TIMELINE = new Set([
  "stage",
  "source",
  "injury",
  "complication",
  "resolved",
  "callout",
  "complete",
  "failure",
  "rupture",
  "clip",
]);
export function Debrief({
  view,
  best,
  children,
}: {
  view: GameState;
  best?: number;
  children?: React.ReactNode;
}) {
  const failed = view.status === "failed",
    grade = gradeAttempt(view, CASES[view.caseId].parSeconds);
  const timeline = view.events.filter((e) => TIMELINE.has(e.type)).slice(-9);
  const lessons = [
    ...new Set(
      view.events
        .filter((e) => ["injury", "failure", "rupture", "complication"].includes(e.type))
        .map((e) => lessonFor(e.detail))
        .filter(Boolean),
    ),
  ].slice(0, 3);
  return (
    <div className="debrief-report">
      <div className="grade-row">
        <div className={`grade-letter grade-${grade.letter}`} aria-label={`Grade ${grade.letter}`}>
          {grade.letter}
        </div>
        <div>
          <span>{failed ? "OPERATION ENDED" : "OPERATION COMPLETE"}</span>
          <strong>
            {grade.points}
            <small>/100</small>
          </strong>
          {best !== undefined && !failed && (
            <em>{grade.points >= best ? "New best for this case" : `Best ${best}`}</em>
          )}
        </div>
      </div>
      {children}
      <div className="grade-parts">
        {grade.parts.map((p) => (
          <div key={p.label}>
            <span>{p.label}</span>
            <i>
              <b style={{ width: `${(p.value / p.max) * 100}%` }} />
            </i>
            <small>{p.note}</small>
          </div>
        ))}
      </div>
      <div className="debrief">
        {timeline.map((e, i) => (
          <div key={i} className={`t-${e.type}`}>
            <time>{clock(e.time)}</time>
            <span>{e.detail}</span>
          </div>
        ))}
      </div>
      {lessons.length > 0 && (
        <div className="surgeon-notes">
          <span>SURGEON'S NOTES</span>
          {lessons.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}
    </div>
  );
}
