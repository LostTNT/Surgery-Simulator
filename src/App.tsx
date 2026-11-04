import { useEffect, useRef, useState } from "react";
import { Engine, type Snapshot } from "./game/engine";
import { CASES, createState, score, type CaseId } from "./game/simulation";
import { GameHud } from "./ui/GameHud";
import { Icon } from "./ui/Icons";
import { Briefing } from "./ui/Briefing";
import { Debrief } from "./ui/Debrief";
import { DrainGame } from "./ui/DrainGame";
import { Cinematic } from "./ui/Cinematic";
import { letterFor } from "./game/grading";
import { PATIENTS } from "./game/patients";
import { DIFFICULTIES, vitalsLevel, type Difficulty } from "./game/vitals";

type Overlay = "none" | "cases" | "briefing" | "arrival" | "guide" | "settings";
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
    [selected, setSelected] = useState<CaseId>("case04"),
    [difficulty, setDifficulty] = useState<Difficulty>("attending");
  const playing = view.status === "running",
    ready = view.status === "ready",
    paused = view.status === "paused",
    result = view.status === "success" || view.status === "failed",
    failed = view.status === "failed";
  const menuOpen = overlay !== "none" || !playing;
  const alarm =
    playing &&
    overlay === "none" &&
    (vitalsLevel(view.vitals) === "critical" ||
      view.aneurysm?.phase === "ruptured" ||
      (view.drain?.icp ?? 0) > 48);
  const caseInfo = CASES[view.caseId];
  const live = playing && overlay === "none";
  // The patient fading: colour drains and vision narrows as pressure falls.
  const fade = live ? Math.min(1, Math.max(0, (104 - view.vitals.sys) / 44)) : 0;
  const haze = live ? Math.min(0.6, view.bleeding * 0.45 + view.bloodLoss / 1800) : 0;
  const lastEvent = view.events[view.events.length - 1];
  const [jolt, setJolt] = useState(false);
  const joltKey = lastEvent ? `${lastEvent.time}|${lastEvent.detail}` : "";
  useEffect(() => {
    if (!lastEvent || !live) return;
    if (!["injury", "rupture"].includes(lastEvent.type)) return;
    setJolt(true);
    const id = setTimeout(() => setJolt(false), 480);
    return () => clearTimeout(id);
  }, [joltKey]);
  const spoken = useRef(0);
  useEffect(() => {
    const c = view.callout;
    if (!c || !view.sound || !live || c.id === spoken.current) return;
    spoken.current = c.id;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(c.text);
      u.rate = c.kind === "danger" ? 1.08 : 0.92;
      u.pitch = 0.75;
      u.volume = 0.55;
      synth.speak(u);
    } catch {
      /* speech is optional */
    }
  }, [view.callout?.id, view.sound, live]);
  const failureDetail = view.events.filter((e) => e.type === "failure").at(-1)?.detail ?? "";
  const died = failed && /pressure collapsed|blood was lost|herniat|bleeding source/i.test(failureDetail);
  function close() {
    if (overlay === "arrival") {
      finishArrival();
      return;
    }
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
      // Start new players on a high-stakes case, not the practice field.
      setSelected(view.caseId === "lab" && !view.procedureStarted ? selected : view.caseId);
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
    setOverlay("briefing");
  }
  function scrubIn() {
    engine.current?.setDifficulty(difficulty);
    engine.current?.setCase(selected);
    resumeAfterMenu.current = false;
    returnToWorkstation.current = false;
    // Sound is part of the scene. Honour an explicit "off" from an earlier visit.
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("suture.sound");
    } catch {
      /* storage unavailable */
    }
    if (!view.sound && stored !== "off") engine.current?.toggleSound();
    setOverlay("arrival");
  }
  function finishArrival() {
    setOverlay("none");
    engine.current?.startSurgery();
  }
  function toggleSound() {
    engine.current?.toggleSound();
    try {
      localStorage.setItem("suture.sound", view.sound ? "off" : "on");
    } catch {
      /* storage unavailable */
    }
  }
  function returnToRoom() {
    resumeAfterMenu.current = false;
    setOverlay("none");
    engine.current?.startRoom();
  }
  const title =
    overlay === "briefing"
      ? "Pre-operative briefing"
      : overlay === "guide"
      ? "How to play"
      : overlay === "settings"
        ? "Make it your own."
        : overlay === "cases"
          ? "Case workstation"
          : died
            ? "The patient did not survive."
            : failed
            ? "Take a breath. Try again."
            : result
              ? "A controlled finish."
              : paused
                ? "Take your time."
                : "Your operating room.";
  return (
    <main
      className={`game ${menuOpen ? "has-menu" : "is-playing"} ${view.location === "room" ? "in-room" : ""} ${overlay === "cases" ? "workstation-open" : ""} ${overlay === "briefing" ? "briefing-open" : ""} ${jolt ? "jolt" : ""} ${died ? "is-dead" : ""}`}
    >
      <div
        ref={field}
        className="operative-field"
        style={fade > 0.02 ? { filter: `saturate(${1 - fade * 0.7}) brightness(${1 - fade * 0.25})` } : undefined}
      />
      <div className="lens-shade" aria-hidden="true" />
      {alarm && <div className="alarm-vignette" aria-hidden="true" />}
      {haze > 0.02 && <div className="blood-haze" style={{ opacity: haze }} aria-hidden="true" />}
      {fade > 0.02 && <div className="fade-vignette" style={{ opacity: fade }} aria-hidden="true" />}
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
            onClick={toggleSound}
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
      {!menuOpen && view.drain && view.location === "surgery" && (
        <DrainGame
          view={view}
          onAim={(a) => engine.current?.drainAim(a)}
          onDrive={(m) => engine.current?.drainDrive(m)}
          onSecure={() => engine.current?.drainSecure()}
        />
      )}
      {!menuOpen && !(view.drain && view.location === "surgery") && (
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
      {view.loaded && !view.error && overlay === "arrival" && (
        <Cinematic
          lines={PATIENTS[selected].arrival}
          clock={PATIENTS[selected].clock}
          title={`${CASES[selected].label.toUpperCase()} · ${PATIENTS[selected].diagnosis.toUpperCase()}`}
          onDone={finishArrival}
        />
      )}
      {view.loaded && !view.error && menuOpen && overlay !== "arrival" && (
        <section
          className={`menu-panel ${overlay === "guide" ? "guide-panel" : ""} ${overlay === "cases" ? "workstation-panel" : ""} ${overlay === "briefing" ? "briefing-panel" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {overlay !== "none" && overlay !== "cases" && overlay !== "briefing" && (
            <button className="back-button" onClick={close}>
              <Icon name="arrow" size={16} />
              {returnToWorkstation.current ? "Back to workstation" : "Back"}
            </button>
          )}
          {overlay !== "cases" && overlay !== "briefing" && <h1>{title}</h1>}
          {overlay === "briefing" && (
            <Briefing
              caseId={selected}
              difficulty={difficulty}
              onDifficulty={setDifficulty}
              onStart={scrubIn}
              onBack={() => setOverlay("cases")}
            />
          )}
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
                  <span>02</span>Choose from six procedures and read the patient briefing
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
                onClick={() => open("cases")}
              >
                Choose a case
                <Icon name="arrow" />
              </button>
              <button
                className="secondary-button"
                onClick={() => engine.current?.startRoom()}
              >
                Enter operating room
                <Icon name="arrow" size={17} />
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
                        {id === "lab" ? "Practice" : `${PATIENTS[id].name}, ${PATIENTS[id].age}`} · {CASES[id].difficulty} · {CASES[id].kind === "washout" ? `${CASES[id].pockets.length} pockets` : CASES[id].duration.toLowerCase()}
                      </small>
                    </span>
                    {progress[id] !== undefined ? (
                      <span className="case-score">
                        <b className={`mini-grade grade-${letterFor(progress[id]!)}`}>{letterFor(progress[id]!)}</b>
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
                <strong>Every case</strong>
                <ol className="guide-procedure">
                  <li>Read the briefing and choose an operating standard.</li>
                  <li>Scrub in. Pick up instruments at the tray with T, one at a time.</li>
                  <li>Watch the monitor: bleeding and injury move the patient's vitals, and the anaesthetist will tell you.</li>
                  <li>Finish with Examine field. You are graded on tissue protection, blood loss, stability, complications and pace.</li>
                </ol>
                <strong>Washout cases (Lab, 01 to 03)</strong>
                <p>
                  Trace the bone path with the burr and lift the flap. Seal marked bleeders with bipolar,
                  clear every numbered pocket with suction, rinse to the clarity target, then examine.
                  Complications such as re-bleeds and refilling pockets appear at Attending and Chief.
                </p>
                <strong>Case 04 · Aneurysm</strong>
                <p>
                  Release the two tethers with bipolar, free the neck with gentle suction, then
                  align the clip with A / D and hold to close. Fast hands near the dome raise wall
                  tension. If it ruptures, suction to see the neck and clip it quickly.
                </p>
                <strong>Case 05 · Tumour</strong>
                <p>
                  Seal the three feeding vessels, then debulk with suction. Stay out of the green
                  motor area. Cutting past an unsealed feeder makes it bleed.
                </p>
                <strong>Case 06 · Ventricular drain</strong>
                <p>
                  Aim from the burr hole with the pointer, hold Space or the mouse to advance, and
                  press E when fluid returns. Avoid the bright vessel and the midline.
                </p>
                <p>
                  Bone is rigid and can be carved away; tissue yields and rebounds. Manual depth (Q)
                  adds full shaft contact. Everything here is a simplified game response.
                </p>
              </div>
              <div className="guide-note about">
                <strong>About</strong>
                <p>
                  Suture is an educational game about neurosurgery. It is not medical training,
                  advice or a clinical simulator. Patients are fictional and the procedures are
                  simplified. The cortical surface is derived from FreeSurfer fsaverage5 through
                  Nilearn; notices are in the project's licenses folder.
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
                  disabled={view.difficulty === "chief"}
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
                onClick={toggleSound}
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
                  : view.aneurysm
                    ? "The aneurysm is clipped and the artery is open. Final inspection complete."
                    : view.tumor
                      ? "The tumour is debulked and the feeders are sealed. Final inspection complete."
                      : view.drain
                        ? "The drain is in place and the pressure has settled."
                        : "Collection cleared. Field rinsed. Final inspection complete."}
              </p>
              <Debrief view={view} best={progress[view.caseId]}>
              <button
                className="primary-button"
                onClick={() => engine.current?.restart(failed && view.guided)}
              >
                {failed ? "Try again" : "Play again"}
                <Icon name="arrow" />
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  engine.current?.pause();
                  open("cases");
                }}
              >
                Choose another case
                <Icon name="arrow" size={17} />
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
              </Debrief>
              <p className="menu-footnote">
                {DIFFICULTIES[view.difficulty].name} ·{" "}
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
