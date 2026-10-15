# Neurosurgery game: research, build, and iteration plan

Planning baseline: October 15, 2026. No deadline has been set. Development and automated browser testing run in the hosted workspace so the user's computer remains available. The initial interaction prototype now exists; its actual limitations and verification are documented in README.md and QA.md. This roadmap describes the longer production goal.

Current iteration: the user rejected the dashboard concept and requested a realistic game interface plus a first-person operating room. The prototype now combines room preparation, physical tool collection, and a stable close surgical view. Independent reviewers identified visual, contact, bleeding, pause, and checkpoint defects; fixes and retests are in progress. Intermediate procedures remain future content. Current art is an early 3D pass, not a completed AA production standard.

**1. Product decisions**

- Desktop-browser, single-player neurosurgery game with direct instrument manipulation.
- Calm, meticulous work with tension arising from the patient's situation and the player's actions.
- Realistic surgical blood, exposed anatomy, and tissue detail are authorized parts of the visual direction. Their presentation should remain coherent with the actual procedure and its simulated events.
- Severe, understandable consequences and learnable, stable controls.
- A forgiving guided mode and an unassisted mode. Both share anatomy, contact rules, and injury thresholds. Assistance is recorded in results.
- Procedures are mission families; individual patient cases can offer introductory and medium difficulty within the same family.
- Initial release: a repeatable practice exercise and one polished introductory patient case. A medium case follows only after the first passes its quality gates. Additional procedure families come later.
- A close surgical view concentrates detail. Camera, exposure, and zoom must suit the actual selected procedure rather than force all procedures into an identical microscope presentation.
- Project positioning: medically informed entertainment and anatomy exploration. Clinical training effectiveness and medical accuracy require separate evidence.

**2. What the research and independent reviews changed**

Three sub-agents independently reviewed gameplay/fairness, technical/art feasibility, and procedure suitability. Their findings are critiques and engineering judgments, not player or clinical validation.

| Initial assumption | Decision after review |
| --- | --- |
| Build two different launch procedures | Prove one procedure first; add a medium case and new procedures after quality gates. |
| Wheel-controlled depth is settled | Test wheel depth against deliberate, modifier-held depth control. Direct manipulation is settled; its input mapping is not. |
| Detailed visuals establish realism | Anatomy, tool roles, visible contact, and consequence logic must agree. |
| A small surgical task automatically makes a good mission | Require observable decisions, manipulation, and corrective action before committing to the procedure. |
| A browser playtest establishes feel | Agent tests find defects; ordinary human playtests establish learnability and enjoyment. |
| Post-failure explanation makes severe damage fair | Relevant depth and risk must already be perceptible before the mistake. |

Verified technical findings:

- Three.js provides mouse raycasting and WebGL 2 rendering. Raycasting selects points/objects; it does not supply surgical contact mechanics.
- React Three Fiber recommends avoiding React state updates in frame loops and high-frequency pointer events. Simulation must live outside React's UI render cycle.
- Surgical simulation literature and iMSTK documentation separate visual, collision, and physical representations. Local deformable tissue is a tractable starting point; full cutting, fluid, and volumetric tissue systems have substantial additional costs.
- The iMSTK README states development/support ended May 2, 2025. Use its documentation as research, not as the project's browser foundation.
- The three-mesh-bvh hierarchy needs appropriate updates after geometry deformation. A moving rendered vessel with an unchanged injury collider would be unacceptable.
- Original ventriculostomy-planning software models hidden imaging targets, trajectories, and vessel margins. This supports treating EVD placement as a separate navigation challenge rather than a visible-target microscope task.

Clinical research limitation: requests to NHS, NINDS, Johns Hopkins, and PMC returned proxy/network-policy 403 errors. Rechecks after the user enabled all domains still failed in the running workspace. Those pages were not read and are not evidence for the procedure recommendation. Medical choices below remain provisional. Accessible software documentation does not validate a clinical simulation.

**3. Procedure scope and selection**

| Candidate | Proposed role | Main concern |
| --- | --- | --- |
| Chronic subdural haematoma evacuation, selected prepared-access segment | Leading introductory-case candidate | Limited opening can make depth and action hard to see; risk of a thin suction/progress task. The collection is outside brain tissue and must be represented accordingly. |
| Dural repair/closure | Possible later precision exercise | A phase of surgery rather than a whole operation; convincing needle/thread mechanics add scope. |
| External ventricular drain placement | Possible later procedure | Hidden target, imaging/navigation, catheter behavior, and pressure/fluid logic need new systems. |
| Selected superficial lesion removal | Future case candidate | Specific pathology, tissue planes, vessels, and functional anatomy matter; superficial does not imply simple. |
| Aneurysm clipping | Future hard procedure | Clip mechanics, vascular detail, perfusion, rupture, visibility, and bimanual demands. |

The first case is not locked until its task prototype passes both playability and plausibility checks. First demonstrate several minutes of useful observation, tool placement, action, and response. If the subdural candidate reduces to holding a button while a bar fills, reject or rescope it before detailed art production.

Seek a neurosurgeon or appropriately supervised neurosurgical trainee's review of layers, structures, tool roles, interactions, complications, and omissions. Record references and deliberate simplifications. Until qualified feedback is available, clinical plausibility remains an open validation item; public patient information alone does not validate the interaction model.

**4. Direct controls and fair difficulty**

Prototype two depth schemes using the same short task:

- Mouse lateral movement, continuous depth adjustment while a dedicated modifier is held, separate fine-motion modifier, held instrument action.
- Mouse lateral movement, wheel depth with carefully controlled increments, fine-motion modifier, held instrument action.

Choose using observed depth errors, learning time, intentional placement, and player preference. Provide remapping. Define approach orientation and explicit angle adjustment; a two-axis mouse cannot reproduce unrestricted six-degree hand motion. Keep camera movement/zoom distinct from operating the tool, and preserve the tip anchor across zoom changes.

Start with one active instrument. Where a second instrument is required, define an explicit passive support/parked state with visible position and bounded behavior. Its force/action behavior cannot remain hidden while the player reads guidance. Complex bimanual manipulation is a later scope decision.

Damage depends on the anatomical structure, tool geometry, contact, activation, movement, and duration according to reviewed game rules. Distinguish contact, developing injury, serious damage, and case-ending damage. Do not make every incidental touch fatal. Significant injury persists through the current attempt; recoverable complications require a meaningful response.

Both tip and shaft matter. Swept contact checks prevent rapid movement passing through structures between ticks. Rendering and injury geometry must agree, including during tissue movement. Every severe event records its structure, location, tool state, and cause for inspection and debrief.

Guided mode offers optional labels, depth/contact cues, movement stabilization, contextual explanations, pausing, and stage checkpoints. It does not silently change injury thresholds. Tutorial explanations pause the simulation. A checkpoint begins a new attempt and restores the whole relevant surgical state. Results distinguish guided, checkpoint-assisted, and unassisted completion.

Tool activation disengages on pointer-capture loss, focus loss, UI interaction, tool switching, and camera adjustment. Hidden tabs pause. Returning requires safe re-anchoring and fresh activation. There must be no injury caused by a cursor jump or an action continuing after focus is lost.

**5. Presentation and production quality**

Create a visual concept for the actual selected case, surgical view, instrument presentation, restrained interface, guidance, and results before production UI work. Establish lighting, materials, scale, typography, and sound direction. Review a finished instrument and a small anatomy sample early to expose asset-quality problems.

Use actual 3D anatomy and instrument geometry for interactive objects. Concepts establish art direction; they do not replace working surgical geometry or screenshots of the real build. Generated material must pass the same anatomical, stylistic, and readability review as other assets.

Author a coherent surgical field with identifiable layers, vessels, and pathology at appropriate scale. A generic whole-brain mesh is insufficient. Preserve stable structure IDs, orientation, and laterality through asset export. Track source, author, license, attribution, and modifications for production assets.

The operative field dominates the screen. Show instruments, objective, and meaningful monitoring compactly. Blood and fluid visibility effects must correspond to simulated state and available actions. Monitoring reflects supported physiology abstractions; some consequences belong in the outcome assessment rather than an instant change in heart rate.

Graphic detail includes localized bleeding sources, bounded pooling, wet tissue materials, blood on instruments, and partial obscuration of the operative field where appropriate. Clearing fluid must visibly improve the field through the same underlying state. Blood color, amount, flow, and tissue response need case-specific reference and review. The initial implementation uses a bounded visibility/pooling model, not a promise of full fluid dynamics. Review graphic detail in motion and at maximum zoom, including whether a complication remains readable and recoverable when intended.

Review actual frames at contact, maximum zoom, complications, low graphics, pause, and results. Reject plastic-looking tissue, repeated tube-like vessels, clipped instruments, unreadable depth, and an interface that overwhelms the operating field. Audio communicates instrument state and the case's condition. Fine work should not be rushed by a speed-based score.

**6. Technical foundation and expansion**

Use TypeScript + Vite, React for the application shell, and Three.js through React Three Fiber for the 3D scene. Store progression locally. Accounts, multiplayer, a backend, and an expansive hospital environment are outside the initial release.

Keep these responsibilities separate:

- Input: mapped commands, deliberate depth/orientation control, activation and focus state.
- Simulation: authoritative tool/tissue/contact/damage/complication state, fixed ticks, pause, snapshots.
- Rendering: interpolation, lighting/materials, tissue presentation, effects, camera.
- Procedure content: anatomy/assets, tools, initial state, objective graph, guidance, completion/failure conditions, outcome assessment.
- UI: case selection, brief, guidance, settings, debrief, progression.

Compare 60 Hz and 120 Hz fixed simulation updates using contact tests and profiling. Rendering speed must not change injury accumulation or mission outcome. Use small locally deformable patches, synchronized collision geometry, and bounded authored geometry changes. General-purpose cutting, full-brain finite-element simulation, and full fluid simulation are separate future projects.

A typed procedure definition needs stable IDs, version, references, assets/anatomy, reusable instrument behaviors, case initialization, objectives, guidance, and outcome rules. Build a small registry, not a general editor or plugin framework. A mission observes real surgical state; ticking off objectives must not manufacture a successful procedure.

Record input/tick IDs, build and content versions, assistance settings, case seed, significant events, and periodic snapshots. Reproduce bugs within a pinned build with appropriate tolerances; do not promise bit-identical physics across all browsers.

**7. Build milestones and exit gates**

| Milestone | Deliverable | Required evidence before expansion |
| --- | --- | --- |
| A. Case and interaction brief | Selected candidate, anatomy/tool inventory, declared omissions, damage rules, visual direction | Procedure offers credible interaction depth; unsupported medical assumptions are identified. |
| B. Instrument laboratory | One direct-control tool, practice material, vulnerable structure, visible contact, repeat/retry | Depth scheme selected from testing; tip/shaft contact and focus behavior are dependable. |
| C. Small complete gameplay sample | Prepared field, persistent action effect, recoverable complication, severe failure, guidance, debrief | Players can see risk before contact and explain consequences; controls feel worth practicing. |
| D. One complete patient case | Brief -> practice/guidance -> operation segment -> outcome -> retry | Guided and unassisted completion, failure, pause, checkpoint, restart, and saved progress all work. |
| E. Art, sound, and reliability pass | Finished anatomy/tools, sound, optimized assets, settings | Independent visual and technical reviews clear blockers; browser tests and named-hardware performance checks pass. |
| F. Medium case | Same procedure, meaningful increase in anatomical/visibility/complication demands | Reuses the simulation cleanly; guided mode remains available; increased difficulty is clear and fair. |
| G. New procedures | Additional researched mission families | Each receives its own content, interaction, medical, visual, and QA gates. |

At any gate, rejecting a control scheme, task, or candidate procedure is an acceptable outcome. Gates must permit redesign, not merely request more polish.

**8. Harsh review, visual inspection, and playtesting loop**

After every meaningful playable milestone:

1. Freeze a reproducible build and identify the flow being tested.
2. Run automated regression scenarios and collect real rendered screenshots, a short interaction recording, console findings, and relevant contact/state logs.
3. Give independent sub-agents distinct review roles: adversarial player, visual critic, and technical reviewer. A medical-content agent may identify inconsistencies but cannot provide qualified clinical validation.
4. The player critic receives ordinary game instructions and uses visible controls. Keep implementation-assisted coordinate targeting separate from user-experience testing. The visual critic examines actual frames before implementation explanations. The technical reviewer examines contact, replay, state, and performance evidence.
5. Require every finding to state severity, reproduction steps, evidence, player impact, and a proposed repair. Explicitly identify boring stretches, unreadable depth, unfair damage, weak anatomy, and missing feedback.
6. Prioritize crashes, corrupted state, unfair severe damage, unusable controls, and missing central feedback. Repair those before expanding content.
7. Rerun the exact failing scenario and regression tests, then request a fresh review. A vague approval without evidence does not close a defect.
8. Update a concise iteration log with what changed, what improved, and what remains unverified.

Use the Browser plugin if it becomes available. It is currently absent; regular Playwright is the planned fallback. Run browser automation in the hosted environment. Do not take over or automate the user's local desktop.

Test Chromium/Chrome first, then Firefox and WebKit where WebGL works reliably. WebKit automation does not establish real Safari/macOS compatibility. Inspect desktop layouts around 1280x800, 1440x900, and 1920x1080; preserve interaction usability at the declared minimum. Touch gameplay is outside v1; menus can adapt to smaller screens.

Meaningful regression tests include tip and shaft contact, fast sweeps, deforming contact geometry, active/passive tool distinctions, camera and tool changes, input loss, pause/resume, severe and recoverable injuries, completion, checkpoint restore, restart, and save/load. Compare a recorded action sequence under 30/60/144 Hz render schedules. Outcomes must agree within declared tolerances.

Compare the design reference with the latest actual browser screenshots using image inspection. Audit composition, anatomy/readability, copy, typography, palette/materials, asset framing, spacing, and tool/contact presentation. Inspect moving play as well as static frames.

For human tests, start with 5–8 newcomers and later use fresh players for the full case. Proposed product targets: most learn intentional positioning/depth/action within five minutes; at least 80% can identify the cause of a tested failure before the explanation; most show improvement across three attempts. These are initial design targets, not validated scientific thresholds. If human testers are unavailable, mark learnability, fairness, and enjoyment as unverified instead of substituting agent approval.

Target smooth 60 FPS at 1080p on a named representative laptop, then profile simulation time, frame-time spikes, loading, and repeated-restart memory. Hardware details remain unspecified. Hosted software-rendered tests establish functionality and provide visual evidence; they do not establish the user's GPU performance. A short optional test on the user's machine can check this without running development or automation locally.

**9. Sources actually read**

Primary technical sources below were retrieved successfully during this research, including sources read by the specialist sub-agents. Rolling repository branches should be version-pinned when implementation starts.

- [Three.js Raycaster documentation](https://raw.githubusercontent.com/mrdoob/three.js/dev/docs/pages/Raycaster.html): mouse picking/intersections.
- [Three.js WebGLRenderer documentation](https://raw.githubusercontent.com/mrdoob/three.js/dev/docs/pages/WebGLRenderer.html): WebGL 2 support, renderer statistics, pixel ratio, shader compilation.
- [React Three Fiber performance guidance](https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/docs/advanced/scaling-performance.mdx) and [pitfalls](https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/docs/advanced/pitfalls.mdx): resource reuse, performance adaptation, high-frequency state handling.
- [iMSTK README](https://raw.githubusercontent.com/Kitware/iMSTK/master/README.md), [collision](https://raw.githubusercontent.com/Kitware/iMSTK/master/Docs/Collision.md), [cutting](https://raw.githubusercontent.com/Kitware/iMSTK/master/Docs/Cutting.md), and [position-based dynamics](https://raw.githubusercontent.com/Kitware/iMSTK/master/Docs/Dynamical_Models/PbdModel.md): simulation components and costs; discontinued-project status.
- [three-mesh-bvh documentation](https://raw.githubusercontent.com/gkjohnson/three-mesh-bvh/master/README.md): geometry changes and spatial hierarchy maintenance.
- [Khronos glTF specification](https://raw.githubusercontent.com/KhronosGroup/glTF/main/specification/2.0/Specification.adoc) and [KTX2 extension](https://raw.githubusercontent.com/KhronosGroup/glTF/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md): runtime 3D assets, PBR materials, compressed textures.
- [VentriculostomyPlanning](https://github.com/tokjun/VentriculostomyPlanning) and [its implementation](https://github.com/tokjun/VentriculostomyPlanning/blob/master/VentriculostomyPlanning/VentriculostomyPlanning.py): original imaging/trajectory software. Engineering context, not clinical validation.
- [3D Slicer](https://github.com/Slicer/Slicer): imaging-analysis context.
- [Playwright browser documentation](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/browsers.md): browser automation coverage and browser projects.

NHS, NINDS, Johns Hopkins, and PMC clinical pages remain pending verification because their requests were blocked. No clinical endorsement, human-playtest result, rendered-game QA result, or educational-effectiveness claim is implied by this plan.
