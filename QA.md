# Prototype verification and next iteration

The first playable prototype passes the functional checks below. Its graphics remain substantially below the intended production-quality realism. This is a tested interaction foundation, not the finished game or a clinically validated simulator.

**Environment and methods**

- Hosted Vite development server: `http://localhost:5173`.
- Browser plugin is unavailable; regular Playwright with installed Chromium was used.
- Chromium ran headlessly with software WebGL (`--use-angle=swiftshader --enable-unsafe-swiftshader`). Software rendering was slow, approximately 2 FPS in some captures. These runs do not establish GPU performance on the user's computer.
- Native concept-sized captures: 1672 × 941. Additional checks: 1440 × 900, 1100 × 700, 960 × 600, 720 × 480, and 390 × 844 portrait handling.
- Actual UI/pointer/keyboard checks are separated from technical geometry tests using the development diagnostic API. Known-coordinate tests are not evidence that an unfamiliar human can aim, learn, or enjoy the game.
- All development and automation ran in the hosted workspace. No automation was run on the user's computer.

**Verified checks**

| Flow or check | Result and evidence |
| --- | --- |
| Production build | `npm run build` passes TypeScript and Vite. Vite reports a large Three.js bundle; later loading/profiling work remains. |
| Simulation/collision regressions | `npm test`: 14 pass. Covers bleeding away from the field, activation release, pause, shaft injury, actual injury position, rate consistency, vessel failure, true checkpoint state, completion sequence, thin-vessel sweep, static contact, and bipolar tine separation. |
| Page identity and rendering | Correct title, meaningful game screen, actual canvas scene, no framework error overlay. |
| Console health | Final room/surgery/failure/retry/portrait browser run captured no JavaScript or console errors. Initial favicon 404 was fixed. |
| First-person preparation | Start -> WASD approach tray -> select tool -> E pickup -> approach microscope -> E surgical view. Passed using real keyboard controls. |
| Select a different physical tool | Select bipolar at tray, E collects bipolar; selection and held tool agree. |
| Native room Escape | Escape exits mouse capture and pauses preparation. |
| Menus | Opening the field guide pauses the game; Escape closes the overlay and leaves it paused. |
| Pending movement | Moving target -> pause -> resume does not execute the old pending movement or cause injury. |
| Focus safety | Blur releases input and pauses. |
| Complete procedure path | Controlled approach -> aspirate all four pockets -> select irrigation -> rinse -> release -> inspection -> successful debrief, with zero injury. Actual held pointer input performed actions; diagnostic coordinates positioned the tool. Recorded simulated time was about 18.5 seconds, excluding preparation. No unsupported multi-minute duration claim is shown. |
| Failure path | Sustained actual geometry contact produces a recorded tissue injury and a failed outcome. |
| Retry | Guided retry restores a new safe attempt; stage snapshots preserve completed work and the saved injury/clarity/time state. |
| Portrait safety | Resizing during play to 390 × 844 pauses the game and shows desktop/landscape guidance; no horizontal overflow. |
| Results layout | Replay/next action is moved ahead of the detailed operative record. Gameplay prompts are hidden behind menus/results. The final small-layout check uses a clearly identified completed-state fixture; procedure completion itself was independently exercised above. |

**Independent harsh reviews and repairs**

Gameplay and technical reviewers inspected source, screenshots, and an earlier live browser build. Their critiques led to these fixes:

- Replaced the rejected dashboard UI with a full-screen scene and sparse game HUD.
- Added a first-person room, pickup interactions, and a stable surgical transition following the user's direction.
- Replaced a disconnected cortical strip with a continuous atlas-derived patch and added an exposure wall.
- Replaced floating, reflective fluid fragments with registered surface layers.
- Moved the tip marker from the ground projection to the actual visible tool tip.
- Fixed bleeding freezing outside the field and a latched action on re-entry.
- Fixed Escape resuming surgery behind a blocking menu.
- Replaced nominal checkpoints with saved stage snapshots.
- Cleared queued instrument motion on pause/focus loss/tool/camera changes.
- Replaced sparse, misaligned shaft tests with tool-specific connected capsule chains, including separate bipolar tines and swept vessel checks.
- Applied shaft injury even when the tip is outside the exposure.
- Returned actual contact points for bleeding, treatment, and event records instead of using a potentially healthy tool-tip position.
- Disabled the unfinished intermediate case and removed unsupported procedure-duration promises.
- Corrected physical tool prompts, tray duplication, looking/proximity requirements, and room resource cleanup.
- Improved small-screen objective contrast and brought replay controls ahead of the debrief.

One early player-agent action attempt was invalidated by concurrent live edits. It is not counted as a completion/failure or fairness test. Subsequent root browser runs used a frozen build while exercising each test.

**Visual comparison ledger**

References:

- Surgical HUD: `/workspace/generated_images/exec-b14fb567-ae90-4da4-bc42-fc98d1964ef2.png`.
- First-person preparation: `/workspace/generated_images/exec-6fb1fdae-3462-4f30-a3d3-a22810c24813.png`.
- Rejected dashboard reference is retained only as conversation history; it is not the active specification.

Both active references and the latest actual room/surgery browser screenshots were opened with `view_image` in the same comparison pass at 1672 × 941. Further screenshots check partial aspiration, failure, results, and portrait handling.

| Comparison point | Actual implementation and remaining difference |
| --- | --- |
| Layout | Full-bleed scene, upper-left objective, upper-right timer/pause/audio, bottom controls and compact instrument selection match the sparse-game direction. Separate menus are necessary functional states. |
| Typography | Sans-serif Barlow and monospaced data replace the rejected serif website treatment. Deliberately small controls need further human readability feedback. |
| Palette | Dark teal drape, warm-white HUD, sage selection, and muted room materials follow the references. Actual room materials remain much simpler than the reference. |
| Copy | Brand, instrument names, interaction hints, and objective hierarchy are preserved. Intentional additions cover first-person preparation, case brief, injuries, guide, pause/settings, and debrief. `TIP CLEARANCE` replaces ambiguous `DEPTH`; audio defaults off; unfinished content is visibly planned. No website navigation/hero/dashboard copy remains. |
| Scene/asset treatment | All movement and operation use actual 3D scenes and tools. The generated photoreal concept is not used as a scene backdrop. This is an intentional functional adaptation, with a large remaining realism gap. |
| Anatomy | Continuous tissue and texture improve on the original balloon-like result. Broad ridges, thin vessel shapes, a uniform bone rim, and stamped fluid regions remain conspicuously constructed. |
| Room | A physical table, tray, microscope, lamps, storage, live monitor, and walking corridor establish a game space. Equipment detail, material variety, patient/hand art, lighting, and contact shadows still need production work. |
| Responsive handling | Desktop HUD adapts; portrait blocks unsupported play and pauses safely. Touch surgery is outside this build. |

The HUD and workflow have been verified against the revised direction. The anatomical and room art do **not** meet a 10/10 concept-fidelity or production-realism bar. A faithful-production claim would be inaccurate.

**Next iteration**

1. Refine one anatomical exposure and one instrument to production-art quality before adding content: tissue form/materials, meaningful vascular anatomy, blood volume/visibility, realistic bone/tissue boundaries, and a readable working tip.
2. Improve room models, contact lighting, material variation, and instrument/hand presentation while preserving the functional walking loop.
3. Observe fresh human players learning depth and contact; revise input mapping and guidance from that evidence. Agent tests do not establish tactile feel or enjoyment.
4. Profile a real GPU-backed desktop browser, tune loading/render settings, then extend browser coverage to Firefox and real Safari where available. Hosted software performance is not a hardware benchmark.
5. Obtain qualified clinical review and resolve reference-asset redistribution before public release. Expand to the intermediate case only after the first case passes these gates.

**Evidence**

- `docs/qa/operating-room.png`: current preparation/room view.
- `docs/qa/surgical-field.png`: current active surgical view.
- `docs/qa/partial-aspiration.png`: an actual partial-removal state from the completion run.
- `docs/qa/failure.png`: actual geometry-induced failure.
- `docs/qa/portrait.png`: unsupported portrait state and safety pause.
- `docs/qa/result-layout.png`: small-layout completed-state fixture for CTA visibility.

Reproduce the longer hosted tests against the development server with `npm run qa` and `npm run qa:completion`. They use `/usr/bin/chromium` and write evidence under `/tmp/suture-qa`; adapt the executable path on other systems.
