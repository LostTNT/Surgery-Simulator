import type { Snapshot } from "../game/engine";
import {
  CASES,
  fluidProgress,
  inspectionReady,
  INSPECTION_SECONDS,
  POCKET_CLEAR_THRESHOLD,
  TOOLS,
  type Tool,
} from "../game/simulation";
import { vitalsLevel } from "../game/vitals";
import { Icon } from "./Icons";
import { Ecg } from "./Ecg";

export function GameHud({
  view,
  onTool,
  onHelp,
  onDepth,
  onInteract,
  onSkip,
  onLift,
  onTray,
  onPlace,
  onInspect,
  onWorkstation,
}: {
  view: Snapshot;
  onTool: (tool: Tool) => void;
  onHelp: () => void;
  onDepth: () => void;
  onLift: () => void;
  onInteract: () => void;
  onSkip: () => void;
  onTray: () => void;
  onPlace: () => void;
  onInspect: () => void;
  onWorkstation: () => void;
}) {
  const room = view.location === "room",
    opening = view.accessPhase !== "surgery",
    cutReady = view.cutProgress >= 0.97,
    caseInfo = CASES[view.caseId],
    cleared = view.pockets.filter((p) => p.remaining <= POCKET_CLEAR_THRESHOLD).length,
    collectionClear = cleared === view.pockets.length,
    rinsed = view.clarity >= caseInfo.clarityRequired,
    bleedingControlled = view.sourceControlled && view.bleeding < 0.025,
    needsBipolar = !view.aneurysm && !bleedingControlled,
    canExamine = !opening && inspectionReady(view),
    examining = view.inspectionActive,
    showControlStep = caseInfo.initialBleeding > 0 || needsBipolar;
  const an = view.aneurysm;
  const anStage = !an
    ? 0
    : an.bridges.some((b) => !b.done)
      ? 0
      : an.dissection < 0.9
        ? 1
        : an.phase !== "clipped"
          ? 2
          : 3;
  const tu = view.tumor;
  const tuResected = tu ? 1 - view.pockets.reduce((a, p) => a + p.remaining, 0) / Math.max(1, view.pockets.length) : 0;
  const tuStage = !tu ? 0 : tu.feeders.some((f) => !f.done) ? 0 : tuResected < tu.target ? 1 : 2;
  const step = an ? anStage : tu ? tuStage : opening ? 0 : !collectionClear || needsBipolar ? 1 : !rinsed ? 2 : 3;
  const required: Tool | null = tu
    ? needsBipolar
      ? "bipolar"
      : (["bipolar", "suction", null] as const)[tuStage]
    : an
    ? opening
      ? null
      : ([ "bipolar", "suction", "clip", null ] as const)[anStage]
    : opening
    ? "drill"
    : needsBipolar
      ? "bipolar"
      : step === 1
        ? "suction"
        : step === 2 ? "irrigation" : null;
  const current = view.heldTool ? TOOLS[view.heldTool].name : "";
  // Danger and warnings must not wait for the player to press a button.
  const urgent = view.feedback.kind === "danger" || view.feedback.kind === "warning";
  const anPercent = an
    ? anStage === 0
      ? an.bridges.reduce((s, b) => s + b.progress, 0) / an.bridges.length
      : anStage === 1
        ? Math.min(1, an.dissection / 0.9)
        : anStage === 2
          ? an.clipProgress
          : Math.min(1, view.inspectionTime / INSPECTION_SECONDS)
    : 0;
  const tuPercent = tu
    ? tuStage === 0
      ? tu.feeders.reduce((s, f) => s + (f.done ? 1 : f.progress), 0) / tu.feeders.length
      : tuStage === 1
        ? Math.min(1, tuResected / tu.target)
        : Math.min(1, view.inspectionTime / INSPECTION_SECONDS)
    : 0;
  const percent = Math.round(
    tu ? tuPercent * 100 : an ? anPercent * 100 : (opening
      ? view.cutProgress
      : needsBipolar
        ? Math.max(0, 1 - view.bleeding / Math.max(caseInfo.initialBleeding, 0.15))
        : step === 1
        ? fluidProgress(view)
        : step === 2
          ? Math.min(1, view.clarity / caseInfo.clarityRequired)
          : Math.min(1, view.inspectionTime / INSPECTION_SECONDS)) * 100,
  );
  const anTitles = ["Release the tethers", "Free the neck", "Clip the neck", examining ? "Examining the field…" : "Examine the field"];
  const anDetails = [
    "Hold bipolar on each marked tether for a moment. Stay well clear of the dome.",
    "Hold gentle suction at the marked spot beside the neck. Slow hands keep the wall calm.",
    "Rotate the clip with A / D until it lies along the artery, centre it on the neck and hold to close.",
    examining ? "Keep instruments idle while the final check completes." : "The aneurysm is secured. Click Examine field to finish.",
  ];
  const tuTitles = ["Seal the feeders", "Debulk the tumour", examining ? "Examining the field…" : "Examine the field"];
  const tuDetails = [
    "Hold bipolar on each marked feeding vessel for a moment. Cutting past an unsealed feeder makes it bleed.",
    "Hold suction on the pale tumour, a piece at a time. Keep out of the green motor area.",
    examining ? "Keep instruments idle while the final check completes." : "Resection is complete and the motor area is intact. Click Examine field.",
  ];
  const titles = tu ? tuTitles : an ? anTitles : [
    view.accessPhase === "lifting"
      ? "Opening the window…"
      : cutReady
        ? "Lift the bone flap"
        : "Open the bone window",
    "Clear the collection",
    "Rinse the field",
    examining ? "Examining the field…" : "Examine the field",
  ];
  const details = tu ? tuDetails : an ? anDetails : [
    cutReady
      ? "The cut is complete. Lift the freed flap to continue."
      : "Hold the burr along the dotted path. Move slowly to cut through.",
    "Aim at a numbered pocket. Hold to remove fluid.",
    "Pick up irrigation. Hold over the field to rinse.",
    examining
      ? "Keep instruments idle while the final check completes."
      : "All checks are ready. Click Examine field to finish the procedure.",
  ];
  const key = (tool: Tool | null) => (tool ? view.belt.indexOf(tool) + 1 : 0);
  const title = room
    ? view.heldTool
      ? "Approach the microscope"
      : "Choose your procedure"
    : examining
      ? titles[3]
      : needsBipolar && !opening
        ? "Seal the bleeder"
        : view.heldTool && required && view.heldTool !== required
          ? `Ask for ${TOOLS[required].name}`
          : titles[step];
  const detail = room
    ? view.heldTool
      ? "Walk to the patient’s head. Press E to enter surgery."
      : "Walk to the lit case workstation. Click its screen or press E to choose a surgery."
    : examining
      ? details[3]
      : view.heldTool && required && view.heldTool !== required
        ? `Press ${key(required)} and the scrub nurse hands you the ${TOOLS[required].name.toLowerCase()}.`
        : needsBipolar && !opening
          ? "Hold bipolar on the marked source until the bleeding stops."
          : details[step];
  const steps = tu
    ? ["Feeders", "Debulk", "Examine"].map((label, i) => ({
        label,
        done: i < tuStage || (i === 2 && view.status === "success"),
        active: i === tuStage,
      }))
    : an
    ? ["Tethers", "Neck", "Clip", "Examine"].map((label, i) => ({
        label,
        done: i < anStage || (i === 3 && view.status === "success"),
        active: i === anStage,
      }))
    : [
    { label: "Open", done: !opening, active: opening },
    ...(showControlStep
      ? [{ label: "Control", done: bleedingControlled, active: !opening && needsBipolar }]
      : []),
    { label: "Clear", done: collectionClear, active: !opening && !needsBipolar && !collectionClear },
    { label: "Rinse", done: rinsed, active: !opening && !needsBipolar && collectionClear && !rinsed },
    { label: "Examine", done: false, active: !opening && canExamine },
  ];
  const stepNo = Math.max(0, steps.findIndex((s) => s.active)) + 1;
  const stepLabel = steps.find((s) => s.active)?.label ?? steps[steps.length - 1].label;
  const tensionPct = an && an.phase !== "clipped" ? an.tension : 0;
  return (
    <>
      {room ? (
        <section className="objective" aria-live="polite">
          <h1>{title}</h1>
          <p>{detail}</p>
        </section>
      ) : (
        <section className="obj" aria-live="polite">
          <small>
            STEP {stepNo}/{steps.length} · {stepLabel.toUpperCase()}
          </small>
          <h1 key={title}>{title}</h1>
          <i className="hair">
            <b style={{ width: `${percent}%` }} />
          </i>
          {an && an.phase !== "clipped" && (
            <i className={`hair tension ${an.phase === "ruptured" ? "ruptured" : tensionPct > 0.6 ? "high" : ""}`} title="Dome wall tension">
              <b style={{ width: `${Math.round(tensionPct * 100)}%` }} />
            </i>
          )}
          <p key={`d-${title}`} className="obj-detail">{detail}</p>
        </section>
      )}
      {room ? (
        <>
          <div className="room-crosshair" />
          {view.roomWaypoint && (view.heldTool || !view.workstationTarget) && (
            <div
              className="room-waypoint"
              style={{ left: view.roomWaypoint.x, top: view.roomWaypoint.y }}
            >
              <span>{view.roomWaypoint.label}</span>
              <svg
                width="16"
                height="25"
                viewBox="0 0 16 25"
                fill="none"
                stroke="currentColor"
              >
                <path d="M8 0v22m-4-4 4 4 4-4" />
              </svg>
            </div>
          )}
          {view.roomPrompt && (
            <button className="room-interaction" onClick={onInteract}>
              <kbd>E</kbd>
              <span>{view.roomPrompt}</span>
            </button>
          )}
          {view.workstationTarget && (
            <button
              className="workstation-interaction"
              style={{ left: view.workstationTarget.x, top: view.workstationTarget.y }}
              onClick={onWorkstation}
            >
              Use case workstation<Icon name="arrow" size={14} />
            </button>
          )}
          <button className="skip-room" onClick={onSkip}>
            Go straight to surgery
            <Icon name="arrow" size={16} />
          </button>
        </>
      ) : (
        <>
          {opening &&
            !view.cameraMoving &&
            view.accessPhase === "bone" &&
            view.guided && (
              <svg className="bone-guide" aria-hidden="true">
                {view.cutGuide.map((p, i) => {
                  const next = view.cutGuide[(i + 1) % view.cutGuide.length];
                  return (
                    <line
                      key={i}
                      className={p.done ? "done" : ""}
                      x1={p.x}
                      y1={p.y}
                      x2={next.x}
                      y2={next.y}
                    />
                  );
                })}
              </svg>
            )}
          <div className="target-layer">
            {!opening &&
              view.guided &&
              view.targets.map((p, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  style={{ left: p.x, top: p.y }}
                  className={`target-ring ${p.remaining <= POCKET_CLEAR_THRESHOLD ? "cleared" : ""}`}
                >
                  <i />
                  {view.action && p.remaining > POCKET_CLEAR_THRESHOLD && p.remaining < 0.97 && (
                    <small>{Math.round((1 - p.remaining) * 100)}%</small>
                  )}
                </div>
              ))}
            {!opening && view.bleedTarget && view.bleeding >= 0.025 && (
              <div
                className="bleed-ring"
                style={{ left: view.bleedTarget.x, top: view.bleedTarget.y }}
                role="img"
                aria-label={an ? "Ruptured aneurysm. Clip the neck." : "Bleeding source. Use bipolar on the marked point."}
              >
                <i />
              </div>
            )}
          </div>
          {!opening && (canExamine || examining) && (
            <div className="centre-prompt">
              <button className="prompt" onClick={onInspect} disabled={examining}>
                {examining ? `EXAMINING ${percent}%` : "EXAMINE FIELD"}
                {!examining && <kbd>E</kbd>}
              </button>
            </div>
          )}
          {opening && (
            <div className="centre-prompt">
              {view.accessPhase === "lifting" ? (
                <span className="prompt-text">Lifting the flap…</span>
              ) : cutReady ? (
                <button className="prompt" onClick={onLift}>
                  LIFT BONE FLAP<kbd>E</kbd>
                </button>
              ) : null}
            </div>
          )}
          {!examining && !canExamine && !(opening && cutReady) && (view.action || urgent) && (
            <div className={`subtitle field ${view.feedback.kind}`} aria-live="polite">
              <strong>{view.action ? TOOLS[view.tool].action : view.feedback.title}</strong>
              <span>{view.action ? view.feedback.title : view.feedback.detail}</span>
            </div>
          )}
          {view.locked && <div className="reticle" aria-hidden="true" />}
          {view.canLock && !view.locked && view.status === "running" && (
            <div className="look-hint">CLICK TO TAKE CONTROL · MOUSE LOOK · W A S D MOVE · Z MICROSCOPE</div>
          )}
          <nav className="belt" aria-label="Instruments">
            {view.belt.map((tool, i) => (
              <button
                key={tool}
                className={`slot ${view.heldTool === tool ? "active" : ""} ${required === tool && view.heldTool !== tool ? "next" : ""}`}
                disabled={view.swapping}
                aria-label={`Pick up ${TOOLS[tool].name}`}
                aria-pressed={view.heldTool === tool}
                onClick={() => onTool(tool)}
              >
                <kbd>{i + 1}</kbd>
                <ToolGlyph tool={tool} />
                <span>{TOOLS[tool].name}</span>
              </button>
            ))}
          </nav>
          {view.nurse && view.swapping && (
            <div className="nurse" key={view.nurse.id}>
              NURSE — {view.nurse.text}
            </div>
          )}
        </>
      )}
      {view.callout && view.elapsed - view.callout.at < 7 && view.status === "running" && (
        <div key={view.callout.id} className={`callout subtitle ${view.callout.kind}`} role="status">
          <small>ANAESTHESIA —</small>
          <span>{view.callout.text}</span>
        </div>
      )}
      {room ? (
        <footer className="hud-bottom">
          <div className="control-hints">
            <span><kbd>WASD</kbd>Walk</span>
            <span><kbd>MOUSE</kbd>Look</span>
            <button onClick={onHelp}>
              <Icon name="help" size={16} />
              <span>Help</span>
            </button>
          </div>
          <div className="held-instrument">
            <span>{view.heldTool ? "IN HAND" : "HANDS FREE"}</span>
            <strong>{current || "Choose a case at the workstation"}</strong>
          </div>
        </footer>
      ) : (
        <div className={`vitals-strip level-${vitalsLevel(view.vitals)}`} aria-label="Simulated patient monitoring">
          <Ecg hr={view.vitals.hr} level={vitalsLevel(view.vitals)} />
          <div className="readout">
            <span><small>HR</small><b>{Math.round(view.vitals.hr)}</b></span>
            <span><small>BP</small><b>{Math.round(view.vitals.sys)}/{Math.round(view.vitals.dia)}</b></span>
            <span><small>SpO₂</small><b>{Math.round(view.vitals.spo2)}</b></span>
            {view.bloodLoss > 50 && <span className="loss"><small>LOSS</small><b>{Math.round(view.bloodLoss)}ml</b></span>}
          </div>
        </div>
      )}
    </>
  );
}
function ToolGlyph({ tool }: { tool: Tool }) {
  const d: Record<Tool, string> = {
    suction: "M4 24 L20 8 Q24 4 28 8 M20 8 L22 6",
    irrigation: "M6 24 L22 10 M22 10 Q26 6 28 10 M10 26 Q14 22 12 18",
    bipolar: "M4 26 L18 6 L20 6 M8 28 L22 8 L24 8",
    drill: "M4 24 L20 12 M20 12 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0",
    clip: "M6 26 L14 8 L22 8 L26 26 M14 8 L16 26",
  };
  return (
    <svg viewBox="0 0 32 32" className="glyph" aria-hidden="true">
      <path d={d[tool]} />
    </svg>
  );
}
