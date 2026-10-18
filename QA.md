# Interactive redesign verification

The current flow under test is: load Suture → select a procedure at the case workstation → Prepare & start surgery → pick up the burr from the tray → carve the guided bone path → lift the flap → complete the case's tool handoffs and objectives → rinse to its clarity target → confirm the readiness checklist → click Examine field → successful session review.

Case 02 adds a deliberate bleeding source that must be controlled with bipolar before suction or irrigation. Case 03 has six separated pockets and a slower washout to 96% clarity. The lab and Case 01 retain four pockets and an 88% clarity target; Case 02 requires 90%.

The room monitor is a real interaction target: click the visible workstation or press E nearby to choose a case. Its Prepare & start surgery button opens the selected field directly. Room lighting combines dim ambient light with focused surgical lamps; room navigation and monitor readability need visual checking alongside the operative view.

## Automated checks

`npm test` passed all 28 tests for the current local changes on October 18, 2026. Coverage includes collision sweeps, actual contact locations, pause/input release, time-step agreement, injury and persistent bleeding, checkpoints, local bone removal, path coverage, reset, localized soft-tissue deformation/rebound, visible 3D instrument picking and placement into an empty slot. New tests complete both new procedures, verify that the source starts only after opening, prevent fluid removal before source control, require every pocket to be cleared, and exercise explicit examination readiness, timing, interruption and pause/resume.

`npm run build` type-checks and builds the static app. The production build uses `VITE_BASE_PATH=/Surgery-Simulator/`.

`node tools/qa-hosting.cjs http://localhost:4174/Surgery-Simulator/` runs real pointer and button interactions through the full procedure. It reads visible guide/target geometry, never mutates hidden simulation state, checks the page title and framework-overlay absence, and collects runtime/console/HTTP errors. Captures go to `/tmp/suture-qa/<case>-<stage>.png`, outside committed source. `npm run qa` and `npm run qa:completion` run the same visible interaction regression against the development server.

Select a case with `--case=lab`, `--case=case01`, `--case=case02` or `--case=case03`; the default is the lab. A positional URL changes the target server. `SUTURE_CASE` and `SUTURE_URL` provide environment alternatives. For example:

```sh
npm run qa -- --case=case02
npm run qa:completion -- --case=case03
node tools/qa-hosting.cjs http://localhost:4174/Surgery-Simulator/ --case=case02
```

The regression selects the requested field through the visible workstation and explicitly starts Examine field after checking the readiness requirements. Releasing irrigation must leave the session running until the examination is started. Passing unit tests does not establish a passing browser run; current browser results should be recorded separately from the previous release evidence below.

Browser plugin availability: **absent**. Playwright Chromium with SwiftShader is the available fallback. Software rendering is slow in this environment; the test explicitly selects Balanced graphics and allows time for real progress. This establishes behavior, not hardware GPU frame rate or human enjoyment.

## Current interface checks · October 18, 2026

The production preview at `http://localhost:4173` passed the workstation flow at 1440×900 and 390×844: enter the room, click the actual monitor screen, select a case, return to the room, open the monitor with E, visit Settings and return with the same selection, then prepare the selected surgery. The mobile monitor and all four tray buttons stay within the viewport. Page identity, meaningful content, framework-overlay absence and console health passed with no relevant errors.

A separate 390×844 held-burr check confirmed that every cutting-guide endpoint remains visible and the depth control stays compact and on screen. The current QA runner defaults to `SUTURE_DPR=0.5` to reduce software raster work while retaining a 960×640 CSS viewport; set `SUTURE_DPR=1` for full-density captures. The desktop and mobile interface checks above used full density.

The complete Case 02 production workflow passed using `SUTURE_DPR=0.25 node tools/qa.cjs --case=case02 http://localhost:4173`: all 80 cutting points, flap lift, bipolar source control, four fluid pockets, 90% rinse, explicit examination progress, and the success screen. Releasing irrigation alone did not finish the case. Result: 100/100 precision, 0% injury, 00:45 simulation time, zero browser errors and zero warnings. Captures include `case02-ready-to-examine.png`, `case02-examining.png`, and `case02-result.png` in `/tmp/suture-qa`.

Case 03 completion passes the simulation tests but its complete browser workflow remains untested. Case 01's complete browser workflow was not rerun. The lab browser check covered portrait layout and partial cutting, with its complete procedure covered by simulation tests.

## Visual comparison ledger

References are recorded in [DESIGN.md](DESIGN.md). Concept and implementation captures are inspected using `view_image`.

| Comparison | Evidence and resolution |
| --- | --- |
| Composition | Full-screen surgical field, compact top identity/utilities, task at upper left, centered hand/tray controls and lower-right monitoring retained. |
| Task copy and progress | Open/Clear/Rinse/Examine use real cutting coverage, per-case pocket counts, clarity targets and explicit examination progress. Case 02 adds source control. A final checklist explains which requirements remain. |
| Palette and typography | Barlow 400/500, warm white text, sage selection, near-black teal overlays; deliberate compact control and monospace numerical styles. |
| Guide visibility | The initial faint world-space cutting dots were replaced with a readable native dashed guide, registered to the convex 3D surface. |
| Text contrast | Added a restrained shade behind the task where bone otherwise crossed the text. Target labels keep a fixed center while percentages appear beside them. |
| Instrument art and handoffs | Physical 3D instruments sit on a sterile tray in the room. Picking requires a free hand; placement returns the held tool to its slot. Native labels and 3D ray picking share the same state. |
| Bone and tissue | Generated material textures, physical lighting, bump detail and wrap-light tissue shader replace the old flat material treatment. Cut geometry and pressure deformation remain actual 3D. |
| Inner cut edge | The new exposed-field capture revealed a see-through gap behind the lifted flap. A tapered bone-to-tissue wall now gives the cut shell thickness; the refreshed capture closes the gap and leaves targets visible. Lift/reset geometry and cleanup checks also passed. |
| Responsive framing | Camera distance adapts to narrow aspect ratios so the cutting path fits. Menus scroll on short screens; tools and monitoring use compact variants. |
| Room and case selection | A lit in-world workstation opens the case library by clicking or E nearby. Preparing a case starts its surgical field directly. Dim ambient room light and focused patient lamps define the intended visual hierarchy. |

Intentional visual differences: atlas and authored runtime geometry replace photographic concept anatomy; the flap is a rigid game mesh; material removal is a height field; tissue response is a localized spring approximation. The physical tray and limited camera pan supersede the first concept’s instant inventory dock. Clearance replaces the concept's invented force number. Native guides wait for the camera to settle so target coordinates stay registered. See DESIGN.md for the complete deviation record. No claim of photographic fidelity or validated biomechanics is made.

Above-the-fold copy audit: SUTURE, practice/room identity, Pause, current task and instructions, native progress steps, tool names, Help and monitoring are deliberate game UI. Bone-access instructions, assisted/manual depth controls, cutting/lifting feedback and room wayfinding are required additions to implement the user's later requests. One-tool handoffs, Place and Return to field controls implement the user’s later request for physical tool handling. No marketing/navigation sections were added.

## Remaining limits

Hardware GPU performance, Safari/Firefox, clinical accuracy and novice enjoyment need human/device testing. Desktop mouse and keyboard are the complete room-control experience; surgery supports touch and hold. This version omits skin access, dura dissection, closure and full tissue resection.

## Previous release review

A user-requested subagent reviewed the release. Findings fixed: non-operative manual shaft contact while reaching/placing; checkpoint tool/model mismatch; hidden instrument geometry intercepting empty-slot placement; and header Resume allowing the simulation to run beneath a modal. Instrument pickup now raises the tip and clears depth trim. Retrying returns all instruments to the tray with a free hand.

## Previous release checks · October 16, 2026

The following records describe the previously published release. These older browser results do not verify the new procedures, workstation or examination flow; current verification is recorded above.

On October 16, 2026, the repository owner confirmed that https://losttnt.github.io/Surgery-Simulator/ works and shows the updated game. This is a user confirmation; the workspace's network policy prevents an automated check of the remote site.

The production interaction regression completed the full procedure with physical tray handoffs and reached the successful session review: precision 100/100, tissue injury 0%. The procedure timer recorded 00:44; this is game time, not the slower software-renderer wall time. The run collected no runtime, console or HTTP errors.

The subagent independently confirmed the four review fixes, reran all 20 tests and checked the diff. A lightweight harness exercised the actual Engine frame logic for manual tray/empty-hand/pan injury guards, bleeding advancement and checkpoint hand restoration.

Additional release checks passed at 1120×760, the concepts' native 1536×1024, 390×844 portrait and 844×390 landscape: room walking → pickup → microscope; assisted/manual toggles; help/pause; the full cutting path within the portrait canvas; and a real CDP touch-and-hold cut. Every runtime model/material request stayed under the repository subpath, the production debug API was absent, and no browser/HTTP errors were collected. A separate browser fixture confirmed the review guards for manual handoffs, bleeding, checkpoints and modal Resume.

Final 1536×1024 captures were compared with the recorded bone/tray concepts using `view_image`. The last render check confirmed room lighting, camera far range and another one-tool handoff without browser errors. The layout, task hierarchy, native controls, typography and palette were checked against the design; photographic anatomy and instrument arrangement remain the explicit 3D adaptations in DESIGN.md.
