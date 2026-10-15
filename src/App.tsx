import { useEffect, useRef, useState } from "react";
import { Engine, type Snapshot } from "./game/engine";
import {
  CASES,
  TOOLS,
  STAGES,
  createState,
  fluidProgress,
  score,
  type CaseId,
  type Tool,
} from "./game/simulation";
import { Icon } from "./ui/Icons";

const tools: Tool[] = ["suction", "irrigation", "bipolar"];
const initial: Snapshot = {
  ...createState(),
  loaded: false,
  error: "",
  fps: 60,
  location: "room",
  roomPrompt: "",
  heldTool: null,
  nearTray: false,
};
type Overlay = "none" | "cases" | "guide" | "settings";
function savedProgress(): Partial<Record<CaseId, number>> {
  try {
    const value = JSON.parse(
      localStorage.getItem("suture.progress.v1") ?? "{}",
    );
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
function clock(t: number) {
  return `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(t % 60)
    .toString()
    .padStart(2, "0")}`;
}

export default function App() {
  const field = useRef<HTMLDivElement>(null),
    engine = useRef<Engine | null>(null);
  const [view, setView] = useState<Snapshot>(initial),
    [overlay, setOverlay] = useState<Overlay>("none");
  const [progress, setProgress] = useState(savedProgress),
    [fullscreen, setFullscreen] = useState(false);
  const [selected, setSelected] = useState<CaseId>("lab");
  useEffect(() => {
    if (engine.current)
      engine.current.onPauseRequest = () => {
        if (overlay !== "none") {
          setOverlay("none");
          return;
        }
        if (view.status === "running") engine.current?.pause();
        else if (view.status === "paused") engine.current?.resume();
      };
  }, [overlay, view.status]);
  useEffect(() => {
    if (!field.current) return;
    try {
      const game = new Engine(field.current, setView);
      engine.current = game;
      if (import.meta.env.DEV) window.__SUTURE__ = game;
      return () => {
        game.dispose();
        delete window.__SUTURE__;
      };
    } catch (e) {
      setView((s) => ({
        ...s,
        error: e instanceof Error ? e.message : "WebGL is unavailable.",
      }));
    }
  }, []);
  useEffect(() => {
    if (view.status !== "success") return;
    const result = score(view);
    setProgress((old) => {
      const next = {
        ...old,
        [view.caseId]: Math.max(old[view.caseId] ?? 0, result),
      };
      try {
        localStorage.setItem("suture.progress.v1", JSON.stringify(next));
      } catch {
        /* Progress remains available for this session. */
      }
      return next;
    });
  }, [view.status, view.caseId]);
  useEffect(() => {
    const onFull = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFull);
    return () => document.removeEventListener("fullscreenchange", onFull);
  }, []);
  function open(which: Overlay) {
    engine.current?.pause();
    setOverlay(which);
  }
  function close() {
    setOverlay("none");
  }
  function selectCase() {
    engine.current?.setCase(selected);
    setOverlay("none");
  }
  async function full() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* Browser may disable fullscreen in an embedded preview. */
    }
  }
  const playing = view.status === "running",
    ready = view.status === "ready",
    paused = view.status === "paused";
  const result = view.status === "success" || view.status === "failed";
  const menuOpen =
    overlay !== "none" ||
    ready ||
    paused ||
    result ||
    Boolean(view.error) ||
    !view.loaded;
  const objective = STAGES[Math.min(view.stage, 2)],
    caseInfo = CASES[view.caseId];
  const progressValue =
    view.stage === 0
      ? 0
      : view.stage === 1
        ? fluidProgress(view)
        : view.clarity;
  const failed = view.status === "failed";
  const inRoom = view.location === "room";
  return (
    <main
      className={`game ${menuOpen ? "has-menu" : ""} ${playing ? "is-playing" : ""} ${inRoom ? "in-room" : ""}`}
    >
      <div ref={field} className="operative-field" />
      <div className="lens-shade" aria-hidden="true" />
      <div className="film-grain" aria-hidden="true" />
      <header className="hud-top">
        <div className="identity">
          <button
            className="wordmark"
            onClick={() => open("cases")}
            aria-label="Suture case files"
          >
            SUTURE
          </button>
          <span className="identity-divider" />
          <span className="case-name">
            {inRoom ? "Preparation" : caseInfo.name}
          </span>
        </div>
        <div className="utilities">
          <button
            className="icon-button sound"
            onClick={() => engine.current?.toggleSound()}
            aria-label={view.sound ? "Mute audio" : "Enable audio"}
            title={view.sound ? "Mute audio" : "Enable audio"}
          >
            <Icon name={view.sound ? "sound" : "mute"} />
          </button>
          <span className="elapsed" aria-label="Elapsed time">
            {clock(view.elapsed)}
          </span>
          <span className="utility-divider" />
          <button
            className="pause-button"
            onClick={() => {
              if (playing) engine.current?.pause();
              else if (paused && overlay === "none") engine.current?.resume();
            }}
            aria-label={playing ? "Pause operation" : "Resume operation"}
            disabled={ready || result}
          >
            <Icon name="pause" size={16} />
            <span>ESC</span>
          </button>
        </div>
      </header>

      {!menuOpen && (
        <>
          <section className="objective" aria-live="polite">
            <div className="objective-step">
              {inRoom ? "PREPARATION" : `0${view.stage + 1}`}
              <span>{inRoom ? caseInfo.label.toUpperCase() : "/ 03"}</span>
              {view.guided && <span className="guided-mark">GUIDED</span>}
            </div>
            <h1>
              {inRoom
                ? view.heldTool
                  ? "Approach the microscope"
                  : "Prepare your station"
                : objective.title}
            </h1>
            {view.guided && (
              <p>
                {inRoom
                  ? view.heldTool
                    ? "Go to the patient’s head. Press E to enter the surgical view."
                    : "Collect an instrument from the sterile tray to your right."
                  : objective.detail}
              </p>
            )}
            {!inRoom && (
              <div className="objective-line">
                <span style={{ width: `${progressValue * 100}%` }} />
              </div>
            )}
          </section>
          {inRoom && (
            <>
              <div className="room-crosshair" aria-hidden="true" />
              {view.roomPrompt && (
                <div className="room-interaction">
                  <kbd>E</kbd>
                  <span>{view.roomPrompt}</span>
                  {view.nearTray && (
                    <small>1 / 2 / 3 · choose instrument</small>
                  )}
                </div>
              )}
            </>
          )}
          {!inRoom && view.guided && (
            <div
              className={`depth-ruler ${view.clearance < 0.035 ? "near-tissue" : ""}`}
              aria-label={`Tip clearance ${(view.clearance * 25).toFixed(1)} millimeters`}
            >
              <span className="depth-title">TIP CLEARANCE</span>
              <div className="ruler-track">
                {[20, 15, 10, 5, 0].map((n) => (
                  <span key={n} style={{ top: `${(20 - n) * 5}%` }}>
                    <i />
                    {n}
                  </span>
                ))}
                <b
                  style={{
                    top: `${Math.max(0, Math.min(100, (20 - view.clearance * 25) * 5))}%`,
                  }}
                />
              </div>
              <strong>
                {(view.clearance * 25).toFixed(1)}
                <small> mm</small>
              </strong>
            </div>
          )}
          {!inRoom && (
            <div
              className={`field-feedback ${view.feedback.kind}`}
              aria-live="polite"
            >
              <span className="feedback-dot" />
              <div>
                <strong>{view.feedback.title}</strong>
                {view.guided && <p>{view.feedback.detail}</p>}
              </div>
            </div>
          )}
          {!inRoom && view.guided && view.showAnatomy && (
            <div className="anatomy-key">
              <span>
                <i className="tissue-dot" />
                Cortical surface
              </span>
              <span>
                <i className="vessel-dot" />
                Vulnerable vessel
              </span>
              <span>
                <i className="collection-dot" />
                Extra-axial fluid
              </span>
            </div>
          )}
        </>
      )}

      <footer className="hud-bottom">
        <div className="control-hints">
          {inRoom ? (
            <>
              <div>
                <kbd>WASD</kbd>
                <span>Move</span>
              </div>
              <div>
                <kbd>MOUSE</kbd>
                <span>Look · click field to capture</span>
              </div>
              <div>
                <kbd>E</kbd>
                <span>Interact</span>
              </div>
            </>
          ) : (
            <>
              <div>
                <kbd>MOVE</kbd>
                <span>Position instrument</span>
              </div>
              <div>
                <kbd>SCROLL</kbd>
                <span>Adjust depth</span>
              </div>
              <div>
                <kbd>SHIFT</kbd>
                <span>Precision movement</span>
              </div>
            </>
          )}
          <button onClick={() => open("guide")}>
            <kbd>?</kbd>
            <span>Field guide</span>
          </button>
        </div>
        {(!inRoom || view.nearTray) && (
          <div className="instrument-area">
            <div className={`action-prompt ${view.action ? "active" : ""}`}>
              {inRoom ? (
                <span>SELECT AN INSTRUMENT · E TO COLLECT</span>
              ) : view.action ? (
                <>
                  <span className="action-dot" />
                  {TOOLS[view.tool].action}
                </>
              ) : (
                <>
                  <span>Hold</span>
                  <kbd>LMB</kbd>
                  <span>to operate</span>
                </>
              )}
            </div>
            <div className="instrument-tray" aria-label="Instrument selection">
              {tools.map((tool, i) => (
                <button
                  key={tool}
                  className={`instrument ${view.tool === tool ? "selected" : ""}`}
                  onClick={() => engine.current?.selectTool(tool)}
                  disabled={!view.loaded}
                  aria-pressed={view.tool === tool}
                  aria-label={`Select ${TOOLS[tool].name}`}
                  title={TOOLS[tool].purpose}
                >
                  <span className="instrument-label">
                    <kbd>{i + 1}</kbd>
                    {TOOLS[tool].name}
                  </span>
                  <span
                    className={`instrument-art instrument-${i}`}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
        {inRoom ? (
          <div className="held-instrument">
            <span>{view.heldTool ? "IN HAND" : "HANDS FREE"}</span>
            <strong>{view.heldTool ? TOOLS[view.heldTool].name : ""}</strong>
          </div>
        ) : (
          <div
            className={`vitals ${!playing ? "at-rest" : ""}`}
            aria-label="Patient monitoring"
          >
            <div>
              <span>HR</span>
              <strong>{view.bleeding > 0.6 ? 86 : 72}</strong>
              <svg viewBox="0 0 120 30" aria-hidden="true">
                <path
                  className="ecg"
                  d="M0 18h17l3-3 3 3h8l3-5 3 5 3-16 3 27 3-13 3 2h15l4-4 4 4h10l3-3 3 3h16l3-2 3 2h16"
                />
              </svg>
            </div>
            <div>
              <span>SpO₂</span>
              <strong>
                99<small>%</small>
              </strong>
              <svg viewBox="0 0 120 30" aria-hidden="true">
                <path d="M0 20q9 0 13-9t13 9 15-9 13 9 15-9 13 9 15-9 13 9" />
              </svg>
            </div>
            <span
              className={`field-condition ${view.bleeding > 0.02 ? "warning" : ""}`}
            >
              {failed
                ? "FIELD COMPROMISED"
                : view.bleeding > 0.02
                  ? "BLEEDING SOURCE ACTIVE"
                  : "SINUS RHYTHM"}
            </span>
          </div>
        )}
      </footer>

      {menuOpen && <div className="menu-scrim" />}
      {!view.loaded && !view.error && (
        <section className="loading-screen">
          <span className="loading-ring" />
          <p>Preparing the operating field</p>
          <span>Loading anatomy and instruments</span>
        </section>
      )}
      {view.error && (
        <section className="menu-panel">
          <div className="menu-eyebrow">OPERATING FIELD UNAVAILABLE</div>
          <h1>Unable to prepare the field.</h1>
          <p className="menu-description">{view.error}</p>
          <p className="menu-description">
            This game needs a desktop browser with WebGL 2 enabled.
          </p>
          <button className="primary-button" onClick={() => location.reload()}>
            Try again
            <Icon name="arrow" />
          </button>
        </section>
      )}

      {view.loaded && !view.error && overlay === "none" && ready && (
        <section className="menu-panel ready-panel">
          <div className="menu-eyebrow">
            {caseInfo.label.toUpperCase()}
            <span> / </span>
            {caseInfo.difficulty.toUpperCase()}
          </div>
          <h1>{caseInfo.name}</h1>
          <p className="menu-description">{caseInfo.brief}</p>
          <div className="brief-objectives">
            <span>
              01<span>Collect your instruments</span>
            </span>
            <span>
              02<span>Approach the microscope</span>
            </span>
            <span>
              03<span>Enter the surgical field</span>
            </span>
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={view.guided}
              onChange={(e) => engine.current?.setGuided(e.target.checked)}
            />
            <span className="toggle-switch" />
            <span>
              <strong>Guided assistance</strong>
              <small>Depth cues, contextual guidance and stage retries.</small>
            </span>
          </label>
          <button
            className="primary-button"
            onClick={() => engine.current?.start()}
          >
            Enter operating room
            <Icon name="arrow" />
          </button>
          <div className="menu-links">
            <button onClick={() => open("cases")}>Case files</button>
            <button onClick={() => open("guide")}>
              Controls & field guide
            </button>
          </div>
        </section>
      )}
      {view.loaded && overlay === "none" && paused && (
        <section className="menu-panel pause-panel">
          <div className="menu-eyebrow">
            {caseInfo.name.toUpperCase()}
            <span> / </span>
            {clock(view.elapsed)}
          </div>
          <h1>{inRoom ? "Preparation paused." : "Operation paused."}</h1>
          <p className="menu-description">The field is held. Take your time.</p>
          <button
            className="primary-button"
            onClick={() => engine.current?.resume()}
          >
            Return to the field
            <Icon name="arrow" />
          </button>
          <div className="pause-options">
            {view.guided && !inRoom && (
              <button onClick={() => engine.current?.restart(true)}>
                Retry this stage<span>Restore the stage checkpoint</span>
              </button>
            )}
            <button onClick={() => engine.current?.restart()}>
              Restart preparation
            </button>
            <button onClick={() => open("cases")}>Case files</button>
            <button onClick={() => open("guide")}>Field guide</button>
            <button onClick={() => open("settings")}>Settings</button>
          </div>
        </section>
      )}
      {overlay === "cases" && (
        <section className="menu-panel case-panel">
          <button className="back-button" onClick={close}>
            <Icon name="arrow" size={15} />
            Back
          </button>
          <div className="menu-eyebrow">PROCEDURES & PRACTICE</div>
          <h1>Case files</h1>
          <div className="case-list">
            {(Object.keys(CASES) as CaseId[]).map((id, i) => {
              const locked = id === "case02";
              return (
                <button
                  key={id}
                  className={`case-row ${selected === id ? "chosen" : ""}`}
                  disabled={locked}
                  onClick={() => setSelected(id)}
                >
                  <span className="case-index">
                    {String(i).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{CASES[id].name}</strong>
                    <small>
                      {CASES[id].difficulty} / {CASES[id].duration}
                    </small>
                  </span>
                  {locked ? (
                    <Icon name="lock" size={16} />
                  ) : progress[id] !== undefined ? (
                    <span className="case-score">
                      {progress[id]}
                      <Icon name="check" size={14} />
                    </span>
                  ) : (
                    <span className="case-radio" />
                  )}
                </button>
              );
            })}
          </div>
          <p className="case-detail">{CASES[selected].brief}</p>
          <button className="primary-button" onClick={selectCase}>
            Prepare selected case
            <Icon name="arrow" />
          </button>
          <p className="menu-footnote">
            The intermediate case and more procedures will follow after the
            first case is refined.
          </p>
        </section>
      )}
      {overlay === "guide" && (
        <section className="menu-panel guide-panel">
          <button className="back-button" onClick={close}>
            <Icon name="arrow" size={15} />
            Back
          </button>
          <div className="menu-eyebrow">FIELD GUIDE</div>
          <h1>Every movement matters.</h1>
          <div className="guide-controls">
            <div>
              <kbd>WASD</kbd>
              <span>
                Walk around the room. Move the mouse to look; arrow keys also
                look.
              </span>
            </div>
            <div>
              <kbd>E</kbd>
              <span>
                Collect a selected tool at the tray, then enter the microscope
                near the patient’s head.
              </span>
            </div>
            <div>
              <kbd>MOVE</kbd>
              <span>
                In the surgical view, move the instrument laterally. Its tip
                remains your reference.
              </span>
            </div>
            <div>
              <kbd>SCROLL</kbd>
              <span>
                Down lowers the tip; up withdraws. R / F also raise / lower.
              </span>
            </div>
            <div>
              <kbd>SHIFT</kbd>
              <span>Hold for finer motion and smaller depth increments.</span>
            </div>
            <div>
              <kbd>LMB</kbd>
              <span>Hold to operate. Release before repositioning.</span>
            </div>
            <div>
              <kbd>1 2 3</kbd>
              <span>
                Select suction, irrigation or bipolar. In the room, approach the
                tray first.
              </span>
            </div>
            <div>
              <kbd>H</kbd>
              <span>Toggle anatomy hints in guided mode.</span>
            </div>
            <div>
              <kbd>+ −</kbd>
              <span>Adjust microscope zoom.</span>
            </div>
            <div>
              <kbd>ESC</kbd>
              <span>
                Pause. Losing window focus also pauses. Click the field to
                recapture the mouse.
              </span>
            </div>
          </div>
          <div className="guide-note">
            <strong>Understand the sequence.</strong>
            <p>
              Approach a dark fluid pocket, lower to working depth, and use
              suction. Clear each pocket, then irrigate until the field is
              clear. Release the instrument for the final inspection.
            </p>
            <p>
              Tissue and vessel contact can cause lasting injury. A localized
              bleed can be treated with bipolar. Sustained contact or
              uncontrolled bleeding can end the attempt.
            </p>
          </div>
        </section>
      )}
      {overlay === "settings" && (
        <section className="menu-panel">
          <button className="back-button" onClick={close}>
            <Icon name="arrow" size={15} />
            Back
          </button>
          <div className="menu-eyebrow">PREFERENCES</div>
          <h1>Set your field.</h1>
          <label className="setting-row">
            <span>Guided assistance</span>
            <input
              type="checkbox"
              checked={view.guided}
              onChange={(e) => engine.current?.setGuided(e.target.checked)}
            />
          </label>
          <label className="setting-row">
            <span>Operating-room audio</span>
            <input
              type="checkbox"
              checked={view.sound}
              onChange={() => engine.current?.toggleSound()}
            />
          </label>
          <label className="setting-row">
            <span>Rendering quality</span>
            <select
              value={view.quality}
              onChange={(e) =>
                engine.current?.setQuality(
                  e.target.value as "high" | "balanced",
                )
              }
            >
              <option value="high">High</option>
              <option value="balanced">Balanced</option>
            </select>
          </label>
          <button className="setting-row" onClick={full}>
            <span>{fullscreen ? "Leave fullscreen" : "Enter fullscreen"}</span>
            <Icon name="expand" />
          </button>
          <p className="menu-footnote">
            Assistance changes your visual aids. Injury rules remain the same.
          </p>
        </section>
      )}
      {result && overlay === "none" && (
        <section
          className={`menu-panel result-panel ${failed ? "failed" : ""}`}
        >
          <div className="menu-eyebrow">
            {caseInfo.name.toUpperCase()}
            <span> / </span>SESSION REVIEW
          </div>
          <h1>
            {failed ? "A consequential contact." : "A controlled finish."}
          </h1>
          <p className="menu-description">
            {failed
              ? view.events.filter((e) => e.type === "failure").at(-1)?.detail
              : "The collection is cleared and the field has been inspected."}
          </p>
          <div className="result-stats">
            <div>
              <span>OUTCOME</span>
              <strong>
                {failed
                  ? "Compromised"
                  : view.injury > 0.08
                    ? "With injury"
                    : "Preserved"}
              </strong>
            </div>
            <div>
              <span>PRECISION</span>
              <strong>
                {score(view)}
                <small> / 100</small>
              </strong>
            </div>
            <div>
              <span>SESSION</span>
              <strong>{clock(view.elapsed)}</strong>
            </div>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              if (failed && view.guided) engine.current?.restart(true);
              else engine.current?.restart();
            }}
          >
            {failed ? "Try again" : "Practice again"}
            <Icon name="arrow" />
          </button>
          <div className="menu-links">
            <button onClick={() => open("cases")}>Case files</button>
            <button onClick={() => open("guide")}>Review controls</button>
          </div>
          <div className="debrief">
            <strong>
              {failed ? "Review the cause" : "Your operative record"}
            </strong>
            {view.events
              .filter((e) =>
                ["injury", "stage", "complete", "failure"].includes(e.type),
              )
              .slice(-4)
              .map((e, i) => (
                <div key={i}>
                  <time>{clock(e.time)}</time>
                  <span>{e.detail}</span>
                </div>
              ))}
          </div>
          <p className="menu-footnote">
            {view.guided ? "Guided assistance enabled." : "Unassisted session."}{" "}
            {view.injury > 0.01
              ? "Existing injury is included in this result."
              : "No tissue injury recorded."}
          </p>
        </section>
      )}
      <div className="small-screen">
        <Icon name="expand" size={26} />
        <h2>A little more room.</h2>
        <p>
          Suture uses a mouse and keyboard. Open it on a desktop, or turn your
          display to landscape.
        </p>
      </div>
      {menuOpen && view.loaded && (
        <div className="menu-bottom">
          <span>PREPARED-FIELD SIMULATION</span>
          <button onClick={() => open("settings")}>Settings</button>
          <button onClick={full} aria-label="Toggle fullscreen">
            <Icon name="expand" size={14} />
          </button>
        </div>
      )}
    </main>
  );
}
