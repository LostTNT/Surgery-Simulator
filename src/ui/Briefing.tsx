import { CASES, type CaseId } from "../game/simulation";
import { PATIENTS } from "../game/patients";
import { DIFFICULTIES, type Difficulty } from "../game/vitals";
import { Icon } from "./Icons";
import { ScanImage } from "./ScanImage";

const CONTROLS: Record<string, [string, string][]> = {
  washout: [["MOUSE", "Look & aim"], ["W A S D", "Move & lean"], ["HOLD", "Operate"], ["1-3", "Instrument"], ["Z", "Microscope"]],
  aneurysm: [["MOUSE", "Look & aim"], ["W A S D", "Move & lean"], ["HOLD", "Operate"], ["1-3", "Instrument"], ["WHEEL", "Rotate clip"]],
  tumor: [["MOUSE", "Look & aim"], ["W A S D", "Move & lean"], ["HOLD", "Operate"], ["1-2", "Instrument"], ["Z", "Microscope"]],
  drain: [["MOUSE", "Aim"], ["SPACE", "Advance"], ["R", "Withdraw"], ["E", "Secure"]],
};
export function Briefing({
  caseId,
  difficulty,
  onDifficulty,
  onStart,
  onBack,
}: {
  caseId: CaseId;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const p = PATIENTS[caseId],
    c = CASES[caseId];
  const practice = caseId === "lab";
  return (
    <div className="briefing">
      <button className="back-button" onClick={onBack}>
        <Icon name="arrow" size={16} />
        Back to cases
      </button>
      <div className="briefing-status">
        <span>{c.label.toUpperCase()}</span>
        <span>{practice ? "PRACTICE" : "PRE-OPERATIVE BRIEFING"}</span>
      </div>
      <div className="briefing-grid">
        <div className="briefing-text">
          <h1>{p.diagnosis}</h1>
          <p className="briefing-patient">
            <strong>{p.name}</strong>
            {p.age > 0 && <> · {p.age} · {p.role}</>}
          </p>
          <p className="briefing-presentation">{p.presentation}</p>
          <ul className="briefing-history">
            {p.history.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <div className="briefing-plan">
            <span>PLAN</span>
            <p>{p.plan}</p>
          </div>
          <div className="briefing-stakes">
            <span>WHAT IS AT STAKE</span>
            <p>{p.stakes}</p>
          </div>
          <div className="briefing-controls" aria-label="Controls">
            {CONTROLS[c.kind].map(([k, v]) => (
              <span key={k}>
                <kbd>{k}</kbd>
                {v}
              </span>
            ))}
          </div>
        </div>
        <ScanImage kind={p.scan} caption={p.scanCaption} />
      </div>
      <fieldset className="difficulty">
        <legend>Operating standard</legend>
        {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={difficulty === d}
            className={difficulty === d ? "chosen" : ""}
            onClick={() => onDifficulty(d)}
          >
            <strong>{DIFFICULTIES[d].name}</strong>
            <small>{DIFFICULTIES[d].blurb}</small>
          </button>
        ))}
      </fieldset>
      <button className="primary-button" onClick={onStart}>
        Scrub in
        <Icon name="arrow" />
      </button>
      <p className="briefing-disclaimer">
        Fictional patient, simplified game. Not medical training or advice.
      </p>
    </div>
  );
}
