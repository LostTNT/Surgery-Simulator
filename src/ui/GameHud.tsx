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
import { Icon } from "./Icons";

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
    needsBipolar = !bleedingControlled,
    canExamine = !opening && inspectionReady(view),
    examining = view.inspectionActive,
    showControlStep = caseInfo.initialBleeding > 0 || needsBipolar;
  const step = opening ? 0 : !collectionClear || needsBipolar ? 1 : !rinsed ? 2 : 3;
  const required: Tool | null = opening
    ? "drill"
    : needsBipolar
      ? "bipolar"
      : step === 1
        ? "suction"
        : step === 2 ? "irrigation" : null;
  const current = view.heldTool ? TOOLS[view.heldTool].name : "";
  const percent = Math.round(
    (opening
      ? view.cutProgress
      : needsBipolar
        ? Math.max(0, 1 - view.bleeding / Math.max(caseInfo.initialBleeding, 0.15))
        : step === 1
        ? fluidProgress(view)
        : step === 2
          ? Math.min(1, view.clarity / caseInfo.clarityRequired)
          : Math.min(1, view.inspectionTime / INSPECTION_SECONDS)) * 100,
  );
  const titles = [
    view.accessPhase === "lifting"
      ? "Opening the window…"
      : cutReady
        ? "Lift the bone flap"
        : "Open the bone window",
    "Clear the collection",
    "Rinse the field",
    examining ? "Examining the field…" : "Examine the field",
  ];
  const details = [
    cutReady
      ? "The cut is complete. Lift the freed flap to continue."
      : "Hold the burr along the dotted path. Move slowly to cut through.",
    "Aim at a numbered pocket. Hold to remove fluid.",
    "Pick up irrigation. Hold over the field to rinse.",
    examining
      ? "Keep instruments idle while the final check completes."
      : "All checks are ready. Click Examine field to finish the procedure.",
  ];
  const title = room
    ? view.heldTool
      ? "Approach the microscope"
      : "Choose your procedure"
    : view.trayView
      ? view.heldTool
        ? "Place your tool on the tray"
        : "Pick up an instrument"
      : examining
        ? titles[3]
        : needsBipolar && !opening
          ? "Control the bleeding source"
      : !view.heldTool && required && !(opening && cutReady)
        ? "Pick up " + TOOLS[required].name
        : titles[step];
  const detail = room
    ? view.heldTool
      ? "Walk to the patient’s head. Press E to enter surgery."
      : "Walk to the lit case workstation. Click its screen or press E to choose a surgery."
    : view.trayView
      ? view.heldTool
        ? `Set down ${current} to free your hand. One instrument at a time.`
        : required
          ? `Choose ${TOOLS[required].name} for the next task.`
          : "The field is ready. Return to the field to examine it."
      : examining
        ? details[3]
      : !view.heldTool && required && !(opening && cutReady)
        ? "Press T or click Instrument tray to reach your tools."
        : view.heldTool && required && view.heldTool !== required
          ? `Return ${current} to the tray and pick up ${TOOLS[required].name}.`
          : needsBipolar && !opening
            ? "Hold bipolar on the marked source until bleeding stops."
            : details[step];
  const steps = [
    { label: "Open", done: !opening, active: opening },
    ...(showControlStep
      ? [{ label: "Control", done: bleedingControlled, active: !opening && needsBipolar }]
      : []),
    { label: "Clear", done: collectionClear, active: !opening && !needsBipolar && !collectionClear },
    { label: "Rinse", done: rinsed, active: !opening && !needsBipolar && collectionClear && !rinsed },
    { label: "Examine", done: false, active: !opening && canExamine },
  ];
  return (
    <>
      <section className="objective" aria-live="polite">
        <h1>{title}</h1>
        <p>{detail}</p>
        {!room && (
          <>
            <ol className="procedure-steps">
              {steps.map(({ label, active, done }, i) => (
                <li
                  key={label}
                  className={active ? "current" : done ? "done" : ""}
                >
                  <span>
                    {done ? <Icon name="check" size={13} /> : i + 1}
                  </span>
                  <small>{label}</small>
                </li>
              ))}
            </ol>
            <div className="task-progress">
              <span>
                {opening
                  ? "Bone cutting path"
                  : needsBipolar
                    ? "Bleeding controlled"
                  : step === 1
                    ? `${cleared} / ${view.pockets.length} pockets cleared`
                    : step === 2
                      ? `Rinse · target ${Math.round(caseInfo.clarityRequired * 100)}% clarity`
                      : examining ? "Examination in progress" : "Examination not started"}
              </span>
              <strong>{percent}%</strong>
              <i>
                <b style={{ width: `${percent}%` }} />
              </i>
            </div>
          </>
        )}
      </section>
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
      ) : view.trayView ? (
        <>
          <div className="tray-labels">
            {!view.cameraMoving &&
              view.traySlots.map((slot, i) => (
                <button
                  key={slot.tool}
                  className={`tray-tool-pick ${view.heldTool === slot.tool ? "empty-slot" : ""} ${required === slot.tool ? "next-tool" : ""}`}
                  disabled={view.heldTool !== null}
                  onClick={() => onTool(slot.tool)}
                  aria-label={`Pick up ${TOOLS[slot.tool].name}`}
                >
                  <kbd>{i + 1}</kbd>
                  <span>
                    {TOOLS[slot.tool].name}
                    <small>
                      {view.heldTool === slot.tool
                        ? "In your hand"
                        : view.heldTool
                          ? "Place your tool first"
                          : required === slot.tool ? "Next task · pick up" : "Pick up"}
                    </small>
                  </span>
                </button>
              ))}
          </div>
          <div className="tray-controls">
            {view.heldTool ? (
              <button className="primary-button" onClick={onPlace}>
                Place {current}
                <kbd>E</kbd>
                <Icon name="arrow" size={16} />
              </button>
            ) : (
              <span className="empty-hand-message">
                Hand free · choose an instrument
              </span>
            )}
            <button className="secondary-button" onClick={onTray}>
              Return to field<kbd>T</kbd>
            </button>
          </div>
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
              !view.cameraMoving &&
              view.guided &&
              view.targets.map((p, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  style={{ left: p.x, top: p.y }}
                  className={`target-marker ${p.remaining <= POCKET_CLEAR_THRESHOLD ? "cleared" : ""}`}
                >
                  <span>
                    {p.remaining <= POCKET_CLEAR_THRESHOLD ? (
                      <Icon name="check" size={14} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {view.action && p.remaining > POCKET_CLEAR_THRESHOLD && p.remaining < 0.97 && (
                    <small>{Math.round((1 - p.remaining) * 100)}%</small>
                  )}
                </div>
              ))}
            {!opening && !view.cameraMoving && view.bleedTarget && view.bleeding >= 0.025 && (
              <div
                className="bleed-marker"
                style={{ left: view.bleedTarget.x, top: view.bleedTarget.y }}
                role="img"
                aria-label="Bleeding source. Use bipolar on the marked point."
              >
                <i />
                <span>Bleeding source<small>Use bipolar here</small></span>
              </div>
            )}
          </div>
          {!opening && (
            <section
              className={`examine-panel ${canExamine ? "is-ready" : ""} ${examining ? "is-examining" : ""}`}
              aria-label="Final examination checklist"
            >
              <div className="examine-heading">
                <strong>Final examination</strong>
                <span>{examining ? "Checking…" : canExamine ? "Ready" : "Preparation"}</span>
              </div>
              <ul className="examine-checklist">
                {[
                  { done: collectionClear, label: `${cleared}/${view.pockets.length} pockets cleared` },
                  { done: rinsed, label: `Rinsed · ${Math.round(view.clarity * 100)}/${Math.round(caseInfo.clarityRequired * 100)}% clarity` },
                  { done: bleedingControlled, label: bleedingControlled ? "Bleeding controlled" : "Control bleeding with bipolar" },
                ].map(({ done, label }) => (
                  <li key={label} className={done ? "complete" : ""}>
                    <span>{done ? <Icon name="check" size={12} /> : <i />}</span>
                    {label}
                  </li>
                ))}
              </ul>
              <button
                className="examine-button"
                onClick={onInspect}
                disabled={!canExamine || examining}
              >
                {examining ? `Examining · ${percent}%` : "Examine field"}
                {examining ? <span className="examine-spinner" /> : <kbd>E</kbd>}
              </button>
              <p>
                {examining
                  ? "Leave tools idle. Operating cancels this check."
                  : canExamine
                    ? "Start a 2.5-second check with instruments safely lifted."
                    : "Complete all three checks to examine the field."}
              </p>
            </section>
          )}
          {view.heldTool && !examining && (
            <aside className="depth-control">
              <button onClick={onDepth}>
                <span
                  className={`status-dot ${view.depthAssist ? "on" : ""}`}
                />
                {view.depthAssist ? "Assisted depth" : "Manual depth"}
                <kbd>Q</kbd>
              </button>
              <div
                className={`clearance ${!opening && view.clearance < 0.035 ? "danger" : ""}`}
              >
                <span>TIP CLEARANCE</span>
                <strong>
                  {Math.max(-9.9, view.clearance * 25).toFixed(1)}
                  <small> mm</small>
                </strong>
                <div className="clearance-bar">
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(100, (view.clearance / 0.5) * 100))}%`,
                    }}
                  />
                </div>
              </div>
              <p>
                {view.depthAssist
                  ? opening
                    ? "Rigid bone · burr removes material"
                    : "Soft tissue · pressure deforms"
                  : "Scroll to raise / lower"}
              </p>
              {view.depthAssist && Math.abs(view.depthOffset) > 0.005 && (
                <button className="reset-depth" onClick={onDepth}>
                  Reset depth trim
                </button>
              )}
            </aside>
          )}
          {opening ? (
            <div className="bone-action">
              {view.accessPhase === "lifting" ? (
                <span>Lifting the rigid flap…</span>
              ) : cutReady ? (
                <button className="primary-button" onClick={onLift}>
                  Lift bone flap<kbd>E</kbd>
                  <Icon name="arrow" size={17} />
                </button>
              ) : (
                <>
                  <strong>
                    {!view.heldTool
                      ? "Your hand is empty"
                      : view.tool !== "drill"
                        ? "Pick up the bone burr"
                        : view.action
                          ? "Cutting bone"
                          : "Trace the dotted path"}
                  </strong>
                  <span>
                    {view.heldTool
                      ? "Hold to drill · release to stop"
                      : "Open the instrument tray to begin."}
                  </span>
                </>
              )}
            </div>
          ) : !examining && !canExamine ? (
            <div
              className={`field-feedback ${view.feedback.kind}`}
              aria-live="polite"
            >
              <span className="feedback-dot" />
              <div>
                <strong>
                  {view.action
                    ? TOOLS[view.tool].action.toLowerCase()
                    : !view.heldTool
                        ? "Your hand is empty"
                        : "Ready when you are"}
                </strong>
                <span>
                  {view.action
                    ? view.feedback.title
                    : !view.heldTool
                      ? "Open the tray to pick up a tool."
                      : "Aim at the field, then hold to operate."}
                </span>
              </div>
            </div>
          ) : null}
        </>
      )}
      <footer className="hud-bottom">
        <div className="control-hints">
          <span>
            <kbd>{room ? "WASD" : "MOVE"}</kbd>
            {room ? "Walk" : "Aim"}
          </span>
          <span>
            <kbd>{room ? "MOUSE" : "HOLD"}</kbd>
            {room ? "Look" : "Operate"}
          </span>
          <button onClick={onHelp}>
            <Icon name="help" size={16} />
            <span>Help</span>
          </button>
        </div>
        {!room && !view.trayView && (
          <div className="hand-and-tray">
            <span>
              <small>IN HAND</small>
              <strong>{current || "Empty hand"}</strong>
            </span>
            <button onClick={onTray}>
              Instrument tray<kbd>T</kbd>
              <Icon name="arrow" size={16} />
            </button>
          </div>
        )}
        {room ? (
          <div className="held-instrument">
            <span>{view.heldTool ? "IN HAND" : "HANDS FREE"}</span>
            <strong>{current || "Choose a case at the workstation"}</strong>
          </div>
        ) : (
          <div className="vitals" aria-label="Simulated patient monitoring">
            <svg viewBox="0 0 48 28">
              <path d="M0 16h9l3-4 3 4 3-13 4 24 4-14 3 3h19" />
            </svg>
            <strong>
              {view.bleeding > 0.6 ? 86 : 72}
              <small> bpm</small>
            </strong>
            <i />
            <span>O₂</span>
            <strong>
              99<small>%</small>
            </strong>
            {view.injury > 0.01 && (
              <span className="injury-readout">
                Tissue injury {Math.round(view.injury * 100)}%
              </span>
            )}
          </div>
        )}
      </footer>
    </>
  );
}
