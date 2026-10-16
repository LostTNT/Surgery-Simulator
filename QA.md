# Interactive redesign verification

The flow under test is: load Suture → Start surgery → pick up the burr from the tray → carve the guided bone path → lift the flap → place the burr → pick up suction → clear four pockets → place suction → pick up irrigation → rinse → release → successful session review.

## Automated checks

`npm test` covers 20 cases: collision sweeps, actual contact locations, pause/input release, time-step agreement, injury and persistent bleeding, checkpoints, complete objective progression, local bone removal, path coverage, reset, and localized soft-tissue deformation/rebound, visible 3D instrument picking and placement into an empty slot.

`npm run build` type-checks and builds the static app. The production build uses `VITE_BASE_PATH=/Surgery-Simulator/`.

`node tools/qa-hosting.cjs http://localhost:4174/Surgery-Simulator/` runs real pointer and button interactions through the full procedure. It reads visible guide/target geometry, never mutates hidden simulation state, checks the page title and framework-overlay absence, and collects runtime/console/HTTP errors. Captures go to `/tmp/suture-qa/`, outside committed source. `npm run qa` and `npm run qa:completion` run the same visible interaction regression against the development server.

Browser plugin availability: **absent**. Playwright Chromium with SwiftShader is the available fallback. Software rendering is slow in this environment; the test explicitly selects Balanced graphics and allows time for real progress. This establishes behavior, not hardware GPU frame rate or human enjoyment.

## Visual comparison ledger

References are recorded in [DESIGN.md](DESIGN.md). Concept and implementation captures are inspected using `view_image`.

| Comparison | Evidence and resolution |
| --- | --- |
| Composition | Full-screen surgical field, compact top identity/utilities, task at upper left, centered hand/tray controls and lower-right monitoring retained. |
| Task copy and progress | Clear/Rinse/Inspect retained; Open added for the user's bone-access request. Cutting coverage, cleared-pocket count, clarity and final inspection use real state. |
| Palette and typography | Barlow 400/500, warm white text, sage selection, near-black teal overlays; deliberate compact control and monospace numerical styles. |
| Guide visibility | The initial faint world-space cutting dots were replaced with a readable native dashed guide, registered to the convex 3D surface. |
| Text contrast | Added a restrained shade behind the task where bone otherwise crossed the text. Target labels keep a fixed center while percentages appear beside them. |
| Instrument art and handoffs | Physical 3D instruments sit on a sterile tray in the room. Picking requires a free hand; placement returns the held tool to its slot. Native labels and 3D ray picking share the same state. |
| Bone and tissue | Generated material textures, physical lighting, bump detail and wrap-light tissue shader replace the old flat material treatment. Cut geometry and pressure deformation remain actual 3D. |
| Responsive framing | Camera distance adapts to narrow aspect ratios so the cutting path fits. Menus scroll on short screens; tools and monitoring use compact variants. |

Intentional visual differences: atlas and authored runtime geometry replace photographic concept anatomy; the flap is a rigid game mesh; material removal is a height field; tissue response is a localized spring approximation. The physical tray and limited camera pan supersede the first concept’s instant inventory dock. Clearance replaces the concept's invented force number. Native guides wait for the camera to settle so target coordinates stay registered. See DESIGN.md for the complete deviation record. No claim of photographic fidelity or validated biomechanics is made.

Above-the-fold copy audit: SUTURE, practice/room identity, Pause, current task and instructions, native progress steps, tool names, Help and monitoring are deliberate game UI. Bone-access instructions, assisted/manual depth controls, cutting/lifting feedback and room wayfinding are required additions to implement the user's later requests. One-tool handoffs, Place and Return to field controls implement the user’s later request for physical tool handling. No marketing/navigation sections were added.

## Remaining limits

Hardware GPU performance, Safari/Firefox, clinical accuracy and novice enjoyment need human/device testing. Desktop mouse and keyboard are the complete room-control experience; surgery supports touch and hold. This version omits skin access, dura dissection, closure and full tissue resection. Remote Pages activation and the public URL must be checked separately from local production testing; a successful upload alone does not establish a live site.

## Independent review

A user-requested subagent reviewed the release. Findings fixed: non-operative manual shaft contact while reaching/placing; checkpoint tool/model mismatch; hidden instrument geometry intercepting empty-slot placement; and header Resume allowing the simulation to run beneath a modal. Instrument pickup now raises the tip and clears depth trim. Retrying returns all instruments to the tray with a free hand.

## Release checks

The production interaction regression completed the full procedure with physical tray handoffs and reached the successful session review: precision 100/100, tissue injury 0%. The procedure timer recorded 00:44; this is game time, not the slower software-renderer wall time. The run collected no runtime, console or HTTP errors.

The subagent independently confirmed the four review fixes, reran all 20 tests and checked the diff. A lightweight harness exercised the actual Engine frame logic for manual tray/empty-hand/pan injury guards, bleeding advancement and checkpoint hand restoration.

Additional release checks passed at 1120×760, the concepts' native 1536×1024, 390×844 portrait and 844×390 landscape: room walking → pickup → microscope; assisted/manual toggles; help/pause; the full cutting path within the portrait canvas; and a real CDP touch-and-hold cut. Every runtime model/material request stayed under the repository subpath, the production debug API was absent, and no browser/HTTP errors were collected. A separate browser fixture confirmed the review guards for manual handoffs, bleeding, checkpoints and modal Resume.

Final 1536×1024 captures were compared with the recorded bone/tray concepts using `view_image`. The last render check confirmed room lighting, camera far range and another one-tool handoff without browser errors. The layout, task hierarchy, native controls, typography and palette were checked against the design; photographic anatomy and instrument arrangement remain the explicit 3D adaptations in DESIGN.md.
