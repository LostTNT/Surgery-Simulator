import { useEffect, useRef, useState } from "react";
import { Engine, type Snapshot } from "./game/engine";
import { CASES, createState, score, type CaseId } from "./game/simulation";
import { GameHud } from "./ui/GameHud";
import { Icon } from "./ui/Icons";

type Overlay = "none" | "cases" | "guide" | "settings";
const initial: Snapshot = {
  ...createState(),
  loaded: false,
  error: "",
  fps: 60,
  location: "room",
  roomPrompt: "",
  heldTool: null,
  nearTray: false,
  depthAssist: true,
  depthOffset: 0,
  targets: [],
  bleedTarget: null,
  workstationTarget: null,
  accessPhase: "bone",
  cutProgress: 0,
  cutGuide: [],
  roomWaypoint: null,
  trayView: false,
  cameraMoving: false,
  traySlots: [],
};
function clock(t: number) {
  return `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(t % 60)
    .toString()
    .padStart(2, "0")}`;
}
function savedProgress(): Partial<Record<CaseId, number>> {
  try {
    const value = JSON.parse(
      localStorage.getItem("suture.progress.v2") ?? "{}",
    );
    return Object.fromEntries(
      Object.entries(value ?? {}).filter(
        ([key, n]) =>
          key in CASES &&
          typeof n === "number" &&
          Number.isFinite(n) &&
          n >= 0 &&
          n <= 100,
      ),
    );
  } catch {
    return {};
  }
}

export default function App() {
  const field = useRef<HTMLDivElement>(null),
    engine = useRef<Engine | null>(null),
    resumeAfterMenu = useRef(false),
    returnToWorkstation = useRef(false);
  const [view, setView] = useState<Snapshot>(initial),
    [overlay, setOverlay] = useState<Overlay>("none"),
    [progress, setProgress] = useState(savedProgress),
    [selected, setSelected] = useState<CaseId>("lab");
  const playing = view.status === "running",
    ready = view.status === "ready",
    paused = view.status === "paused",
    result = view.status === "success" || view.status === "failed",
    failed = view.status === "failed";
  const menuOpen = overlay !== "none" || !playing;
  const caseInfo = CASES[view.caseId];
  function close() {
    if (returnToWorkstation.current) {
      returnToWorkstation.current = false;
      setOverlay("cases");
      return;
    }
    setOverlay("none");
    if (resumeAfterMenu.current) engine.current?.resume();
    resumeAfterMenu.current = false;
  }
  function open(which: Overlay) {
    if (overlay === "none") {
      resumeAfterMenu.current = playing;
      returnToWorkstation.current = false;
    }
    if (overlay === "cases" && (which === "guide" || which === "settings"))
      returnToWorkstation.current = true;
    if (which === "cases") {
      setSelected(view.caseId);
      returnToWorkstation.current = false;
    }
    engine.current?.pause();
    setOverlay(which);
  }
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
    if (engine.current) {
      engine.current.onWorkstationRequest = () => open("cases");
      engine.current.onPauseRequest = () => {
        if (overlay !== "none") close();
        else if (playing) engine.current?.pause();
        else if (paused) engine.current?.resume();
      };
    }
  });
  useEffect(() => {
    if (view.status !== "success") return;
    setProgress((old) => {
      const next = {
        ...old,
        [view.caseId]: Math.max(old[view.caseId] ?? 0, score(view)),
      };
      try {
        localStorage.setItem("suture.progress.v2", JSON.stringify(next));
      } catch {
        /* Session still works without storage. */
      }
      return next;
    });
  }, [view.status, view.caseId]);
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* Embedded previews may disallow fullscreen. */
    }
  }
  function chooseCase() {
    engine.current?.setCase(selected);
    engine.current?.startSurgery();
    resumeAfterMenu.current = false;
    setOverlay("none");
  }
  function returnToRoom() {
    resumeAfterMenu.current = false;
    setOverlay("none");
    engine.current?.startRoom();
  }
  const title =
    overlay === "guide"
      ? "How to play"
      : overlay === "settings"
        ? "Make it your own."
        : overlay === "cases"
          ? "Case workstation"
          : failed
            ? "Take a breath. Try again."
            : result
              ? "A controlled finish."
              : paused
                ? "Take your time."
                : "Your operating room.";
  return (
    <main
      className={`game ${menuOpen ? "has-menu" : "is-playing"} ${view.location === "room" ? "in-room" : ""} ${overlay === "cases" ? "workstation-open" : ""}`}
    >
      <div ref={field} className="operative-field" />
      <div className="lens-shade" aria-hidden="true" />
      <header className="hud-top">
        <div className="identity">
          <button
            className="wordmark"
            onClick={() => open("cases")}
            aria-label="Suture case files"
          >
            SUTURE
          </button>
          <i />
          <span>
            {view.location === "room" ? "Operating room" : caseInfo.label}
          </span>
        </div>
        <div className="utilities">
          <button
            className="icon-button"
            onClick={() => engine.current?.toggleSound()}
            aria-label={view.sound ? "Mute audio" : "Enable audio"}
          >
            <Icon name={view.sound ? "sound" : "mute"} />
          </button>
          <time>{clock(view.elapsed)}</time>
          {overlay === "none" && (playing || paused) && (
            <button
              className="pause-button"
              onClick={() =>
                playing ? engine.current?.pause() : engine.current?.resume()
              }
            >
              <Icon name="pause" size={15} />
              <span>{playing ? "Pause" : "Resume"}</span>
            </button>
          )}
        </div>
      </header>
      {!menuOpen && (
        <GameHud
          view={view}
          onTool={(tool) => engine.current?.selectTool(tool)}
          onHelp={() => open("guide")}
          onDepth={() =>
            engine.current?.setDepthAssist(
              Math.abs(view.depthOffset) > 0.005 ? true : !view.depthAssist,
            )
          }
          onTray={() => engine.current?.toggleTray()}
          onPlace={() => engine.current?.placeTool()}
          onLift={() => engine.current?.liftBone()}
          onInspect={() => engine.current?.beginInspection()}
          onInteract={() => engine.current?.interactRoom()}
          onSkip={() => engine.current?.startSurgery()}
          onWorkstation={() => engine.current?.openWorkstation()}
        />
      )}
      {menuOpen && <div className="menu-scrim" />}
      {!view.loaded && !view.error && (
        <div className="loading-screen" role="status">
          <span className="loading-ring" />
          <h1>Preparing your station</h1>
          <p>Loading the room, anatomy and instruments…</p>
        </div>
      )}
      {view.error && (
        <section className="menu-panel" role="alert">
          <h1>Unable to prepare the field.</h1>
          <p>{view.error}</p>
          <p>Try a browser with WebGL 2 enabled.</p>
          <button className="primary-button" onClick={() => location.reload()}>
            Try again
            <Icon name="arrow" />
          </button>
        </section>
      )}
      {view.loaded && !view.error && menuOpen && (
        <section
          className={`menu-panel ${overlay === "guide" ? "guide-panel" : ""} ${overlay === "cases" ? "workstation-panel" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {overlay !== "none" && overlay !== "cases" && (
            <button className="back-button" onClick={close}>
              <Icon name="arrow" size={16} />
              {returnToWorkstation.current ? "Back to workstation" : "Back"}
            </button>
          )}
          {overlay !== "cases" && <h1>{title}</h1>}
          {overlay === "none" && ready && (
            <>
              <p className="menu-description">
                Choose a procedure at the case workstation, pick up your
                instruments, and step up to the microscope.
              </p>
              <ol className="brief-objectives">
                <li>
                  <span>01</span>Explore your operating room
                </li>
                <li>
                  <span>02</span>Choose from four playable procedures
                </li>
                <li>
                  <span>03</span>Follow one clear task at a time
                </li>
              </ol>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={view.depthAssist}
                  onChange={(e) =>
                    engine.current?.setDepthAssist(e.target.checked)
                  }
                />
                <span className="toggle-switch" />
                <span>
                  <strong>Assisted depth</strong>
                  <small>Follows the surface. Lifts when you release.</small>
                </span>
              </label>
              <button
                className="primary-button"
                onClick={() => engine.current?.startRoom()}
              >
                Enter operating room
                <Icon name="arrow" />
              </button>
              <button
                className="secondary-button"
                onClick={() => engine.current?.startSurgery()}
              >
                Start surgery
                <Icon name="arrow" size={17} />
              </button>
              <div className="menu-links">
                <button onClick={() => open("cases")}>Case files</button>
                <button onClick={() => open("guide")}>How to play</button>
              </div>
            </>
          )}
          {overlay === "none" && paused && (
            <>
              <p className="menu-description">
                Your progress is held. Return whenever you’re ready.
              </p>
              <button
                className="primary-button"
                onClick={() => engine.current?.resume()}
              >
                Return to the game
                <Icon name="arrow" />
              </button>
              <div className="pause-options">
                <button onClick={() => open("guide")}>
                  How to play
                  <Icon name="help" size={16} />
                </button>
                <button onClick={() => open("settings")}>
                  Controls & graphics
                  <Icon name="arrow" size={16} />
                </button>
                {view.location === "surgery" && view.guided && (
                  <button onClick={() => engine.current?.restart(true)}>
                    Retry current stage
                    <Icon name="arrow" size={16} />
                  </button>
                )}
                <button onClick={() => engine.current?.restart()}>
                  Restart procedure
                  <Icon name="arrow" size={16} />
                </button>
                <button
                  onClick={() => {
                    engine.current?.setCase(view.caseId);
                    engine.current?.startRoom();
                  }}
                >
                  Explore operating room
                  <Icon name="arrow" size={16} />
                </button>
                <button onClick={() => open("cases")}>
                  Change case
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            </>
          )}
          {overlay === "cases" && (
            <div className="workstation-screen">
              <div className="workstation-status"><span />SUTURE / PROCEDURE LIBRARY<span>ONLINE</span></div>
              <h1>Case workstation</h1>
              <p className="menu-description">
                Select a procedure to prepare your surgical field.
              </p>
              <div className="case-list">
                {(Object.keys(CASES) as CaseId[]).map((id) => (
                  <button
                    key={id}
                    aria-pressed={selected === id}
                    className={`case-row ${selected === id ? "chosen" : ""}`}
                    onClick={() => setSelected(id)}
                  >
                    <span className="case-index">{id === "lab" ? "LAB" : id.slice(4)}</span>
                    <span>
                      <strong>{CASES[id].name}</strong>
                      <small>
                        {CASES[id].difficulty} · {CASES[id].pockets.length} pockets
                      </small>
                    </span>
                    {progress[id] !== undefined ? (
                      <span className="case-score">
                        Best {progress[id]}
                        <Icon name="check" size={14} />
                      </span>
                    ) : (
                      <span className="case-radio" />
                    )}
                  </button>
                ))}
              </div>
              <p className="case-detail">{CASES[selected].brief}</p>
              <ol className="workstation-objectives">
                {CASES[selected].objectives.map((objective, i) => (
                  <li key={objective.title} title={objective.detail}>
                    <span>{i + 1}</span>
                    <strong>{objective.title}</strong>
                  </li>
                ))}
              </ol>
              <button className="primary-button" onClick={chooseCase}>
                Prepare & start surgery
                <Icon name="arrow" />
              </button>
              <button className="secondary-button" onClick={returnToRoom}>
                Return to room
              </button>
              <footer className="workstation-footer">
                <span>Fictional surgical game</span>
                <button onClick={() => open("guide")}>How to play</button>
                <button onClick={() => open("settings")}>Settings</button>
              </footer>
            </div>
          )}
          {overlay === "guide" && (
            <>
              <p className="menu-description">
                Follow the current task. Pause whenever you need.
              </p>
              <div className="guide-controls">
                {[
                  [
                    "MOVE",
                    "Aim directly at the numbered fluid pockets. The instrument follows your pointer.",
                  ],
                  [
                    "HOLD",
                    "Hold the left mouse button (or touch and hold) to use the selected instrument. Release to lift.",
                  ],
                  [
                    "T / 1–4",
                    "T pans to the instrument tray. Place the held tool before picking up another. Click a tool, or use 1–4 at the tray.",
                  ],
                  [
                    "SCROLL",
                    "Fine-tune depth. Scroll down to lower; up to raise. Assisted mode follows the surface; Q switches to manual.",
                  ],
                  [
                    "WASD / E",
                    "In the room: walk with WASD. Click the case monitor or press E nearby. Click elsewhere to look around; E also uses the tray or microscope. Arrow keys can look.",
                  ],
                  [
                    "ESC",
                    "Pause at any time. Losing focus pauses automatically.",
                  ],
                ].map(([key, text]) => (
                  <div key={key}>
                    <kbd>{key}</kbd>
                    <p>{text}</p>
                  </div>
                ))}
              </div>
              <div className="guide-note">
                <strong>Your procedure</strong>
                <ol className="guide-procedure">
                  <li>Trace the dotted bone path with the burr, then lift the flap.</li>
                  <li>If bleeding is marked, use bipolar on that source first.</li>
                  <li>Use suction on every numbered fluid pocket.</li>
                  <li>Rinse with irrigation until the clarity target is met.</li>
                  <li>Click Examine field, then leave the tools idle for 2.5 seconds.</li>
                </ol>
                <p>
                  The Examine checklist shows exactly what is left. Releasing
                  a tool stops operating; it does not start the final examination.
                </p>
                <p>
                  Bone is rigid and can be carved away. Tissue yields under
                  pressure and rebounds. These are simplified game material
                  responses. Manual depth enables full tissue and shaft contact.
                  Lower gently with the scroll wheel or F; withdraw with R.
                  Bipolar on healthy tissue causes injury in either mode.
                </p>
              </div>
            </>
          )}
          {overlay === "settings" && (
            <>
              <p className="menu-description">
                Keep the hand steady and the view comfortable.
              </p>
              <label className="setting-row">
                <span>
                  <strong>Assisted depth</strong>
                  <small>Surface following and automatic withdrawal</small>
                </span>
                <input
                  type="checkbox"
                  checked={view.depthAssist}
                  onChange={(e) =>
                    engine.current?.setDepthAssist(e.target.checked)
                  }
                />
              </label>
              <label className="setting-row">
                <span>
                  <strong>Target guides</strong>
                  <small>Numbered pockets and stage checkpoints</small>
                </span>
                <input
                  type="checkbox"
                  checked={view.guided}
                  onChange={(e) => engine.current?.setGuided(e.target.checked)}
                />
              </label>
              <label className="setting-row">
                <span>
                  <strong>Graphics</strong>
                  <small>High adds soft shadows and ambient occlusion</small>
                </span>
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
              <button
                className="setting-row"
                onClick={() => engine.current?.toggleSound()}
              >
                <span>Sound</span>
                <span>{view.sound ? "On" : "Off"}</span>
              </button>
              <button className="setting-row" onClick={fullscreen}>
                <span>Toggle fullscreen</span>
                <Icon name="expand" />
              </button>
            </>
          )}
          {overlay === "none" && result && (
            <>
              <p className="menu-description">
                {failed
                  ? view.events.filter((e) => e.type === "failure").at(-1)
                      ?.detail
                  : "Collection cleared. Field rinsed. Final inspection complete."}
              </p>
              <div className="result-stats">
                <div>
                  <span>PRECISION</span>
                  <strong>
                    {score(view)}
                    <small>/100</small>
                  </strong>
                </div>
                <div>
                  <span>PROCEDURE</span>
                  <strong>{clock(view.elapsed)}</strong>
                </div>
                <div>
                  <span>TISSUE INJURY</span>
                  <strong>
                    {Math.round(view.injury * 100)}
                    <small>%</small>
                  </strong>
                </div>
              </div>
              <button
                className="primary-button"
                onClick={() => engine.current?.restart(failed && view.guided)}
              >
                {failed ? "Try again" : "Play again"}
                <Icon name="arrow" />
              </button>
              {!failed && view.caseId === "lab" && (
                <button
                  className="secondary-button"
                  onClick={() => {
                    engine.current?.setCase("case01");
                    engine.current?.startSurgery();
                  }}
                >
                  Try the challenge
                  <Icon name="arrow" size={17} />
                </button>
              )}
              <div className="debrief">
                {view.events
                  .filter((e) =>
                    ["stage", "complete", "injury"].includes(e.type),
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
                {view.depthAssist ? "Assisted depth" : "Manual depth"} ·{" "}
                {view.guided ? "Target guides enabled" : "Unassisted targets"}
              </p>
            </>
          )}
        </section>
      )}
      {menuOpen && view.loaded && overlay !== "cases" && (
        <footer className="menu-bottom">
          <span>Fictional surgical game · Not medical training</span>
          <div>
            <button onClick={() => open("settings")}>Settings</button>
            <button onClick={fullscreen} aria-label="Toggle fullscreen">
              <Icon name="expand" size={16} />
            </button>
          </div>
        </footer>
      )}
    </main>
  );
}
