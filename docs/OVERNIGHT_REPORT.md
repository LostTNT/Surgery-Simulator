# Overnight report: Suture showcase upgrade

Branch: `claude/suture-showcase`. Previous `main` was `d4cd7d4` and the previous published site is `gh-pages` at `165db0b`. Either can be restored in one command if you dislike the result (see Rollback).

## What was wrong

Every case was the same loop: carve bone, hold the mouse over four blobs, rinse until a bar filled, click Examine. The HR and SpO₂ monitor was decorative, the patient never reacted, there was no story, nothing unexpected happened, and there was no debrief. The tech was fine; the game design was thin.

## What changed

| Area | Before | Now |
| --- | --- | --- |
| Procedures | 3 near-identical washouts plus a lab | **6 procedures that play differently** (see below) |
| Patient | Decorative numbers | Live HR, BP, SpO₂ and blood loss driven by bleeding, injury and pressure. Anaesthetist callouts. A real collapse fail state. Alarm tone and red edge vignette when critical. |
| Context | One-line brief | A **briefing** per case: fictional patient, history, plan, stakes and a generated CT/MRI/CTA slice |
| Difficulty | One guided toggle | **Resident, Attending, Chief** (hazard speed, time to collapse, guides, complications) |
| Result screen | 3 numbers | **Graded debrief** S to F with five scored parts, a timeline from the event log, and surgeon's notes explaining mistakes |
| Old cases | Straight through | Seeded **complications** at Attending and Chief: re-bleed, hidden second source, a pocket that refills |
| Chooser | Plain list | Patient names, difficulty, best-grade badges |
| Feel | Clean and calm | **Visceral pass** (see below) |

### The six procedures (plus a practice lab)

- **Lab**: practice field.
- **01 Chronic subdural**: washout; membrane re-bleed at Attending.
- **02 Acute bleed**: find the source first; a second hidden vessel appears.
- **03 Loculated washout**: six pockets; one refills when a wall gives way.
- **04 Aneurysm clipping** (new mechanics): release two tethers with bipolar, free the neck with gentle suction, align a clip with `A`/`D` and hold to close. Fast hands near the dome raise wall tension; at 100% it ruptures. After a rupture, bipolar will not seal it; you must suction to see the neck (a blind clip misses) and clip quickly while the patient crashes. Clipping the parent artery injures it.
- **05 Tumour resection** (new): seal three feeding vessels, then debulk to at least 85% with suction while staying out of a green motor-cortex zone. Cutting past an unsealed feeder makes it bleed.
- **06 Ventricular drain** (new, a different kind of play): aim a catheter on a CT slice, advance, and secure it when fluid returns while intracranial pressure climbs. The obvious straight line clips a vessel; you have to angle around it. Crossing the midline or passing through the far wall injures tissue; missed passes cost tissue.

## The visceral pass (you asked for painful and uneasy)

- **Blood**: bleeding spurts in time with the heartbeat, and a pool grows with the blood actually lost and stays after you control the bleed. A red haze creeps over the view as bleeding and loss mount.
- **Lasting damage**: every injury leaves a dark bruise on the cortex where it happened.
- **The patient fading**: as blood pressure falls, colour drains and the view blurs and tunnels. A red alarm vignette pulses when the patient is critical, the aneurysm has burst or pressure is dangerous.
- **Jolts**: the screen jolts when you injure tissue or the aneurysm ruptures, and the anaesthetist says the patient flinched.
- **Sound** (untested by ear): a ventilator breath every few seconds, wet suction, hissing irrigation, crackling bipolar, a drill grind, heart-rate-synced beeps that sharpen when critical, and a flatline tone when the patient dies.
- **Consequences**: death is blunt. The screen goes dark red and says "The patient did not survive." Bleeding and pressure are real fail states, not just score penalties. Resident softens all of it; Chief is faster and unforgiving.
- Bloody and realistic by design, in line with the project brief. It is stylised 3D, not photographic.

## Round 2 (after an Opus design review)

An independent Opus review read the code and screenshots and found real problems. Fixed:

- Flatline tone played after every failure and never stopped. It now plays only on death, then fades.
- A blind clip at the correct spot was wrongly treated as pinching the artery.
- Injury reaching 100% only ended the operation in one code path. It now fails everywhere.
- Grading could be gamed: a fast death got full pace points, and complications you caused were free. A failed run now scores nothing for pace or complications, caused complications cost points, and Resident cannot earn the top grades.
- Warnings were hidden behind "Ready when you are" whenever the mouse button was up. Danger and warnings now show immediately.
- Sound was off by default. It now starts when you scrub in (unless you turned it off before).
- New players started on the practice lab. The chooser now opens on the aneurysm.
- The drain was solved by looking (a full ruler to the target) and pressure was slow. The ruler is Resident-only and pressure rises over twice as fast.
- Nothing threatened careful players. A long operation now wears the patient down at Attending and Chief, and untreated bleeding is deadlier.
- Added a hand tremor that grows with fatigue and a racing pulse, voiced anaesthetist callouts, a falling pulse-oximeter pitch, and blood for the aneurysm rupture.
- Added the personal outcome line to the debrief (for example "Time of death 03:12. Her mother is in the waiting room.").
- Added the arrival scene and a flickering ward light.

Not done from the review: blood hiding the whole field until suctioned, a brain that swells through the bone window, checkpoint edge cases, and number-key tool picking.

## Round 3: first person, cinematic, real assets

- **You are in the room.** The surgical field is now seen through a free first-person camera inside the full operating-room world (mouse look with pointer lock, `W A S D` to step and lean in, a crosshair where the instrument works). Your gloved hand and gowned forearm hold the instrument. `Z` looks through the microscope.
- **No more tray trips.** Press 1, 2, 3 and the scrub nurse hands you the instrument and says its name.
- **A real patient's head, not a plate.** Drape wraps the head and runs to the table; layered scalp edge (galea, dermis, fat, betadine-stained skin), layered bone (outer table, bloody diploe, inner table, dura edge), a dark depth, a skull clamp, one hard warm operating lamp with shadows in a dim teal room.
- **Real assets:** a Poly Haven (CC0) operating-room HDRI for reflections and a Poly Haven (CC0) poplin fabric for the drape.
- **Realism:** wetter, darker, salmon cortex with fine sparkle (not cling film), darker veins and brighter arteries, depth of field, bloom, chromatic aberration, film grain, a mood grade that drains colour but keeps the reds as the patient crashes, blood on the lens that suction or irrigation wipes, blood-stained instrument tips and glove.
- **Graphics presets:** Low / Balanced / High / Ultra with automatic step-down.
- **UI rebuilt:** one objective line, a slim vitals strip with a live ECG, an instrument belt, subtitles, no panels. Menu, briefing, grade and death screens restyled; fonts are IBM Plex Sans Condensed, Inter and JetBrains Mono.
- **Cinematic arrival:** the camera glides through the room to your place at the table while the lamp stutters on and the story lines appear as subtitles.
- **Two Opus reviews** found real bugs (permanent pointer-lock failure, entering the microscope pausing the game, the gaze dragging the tool, noclip camera, the blood pool blowing out white); all fixed.

**Tried and not shipped:** a scanned human head (Lee Perry-Smith, CC BY 3.0) as the patient. It looks excellent on its own, but our surgical field is a flat plate and a real skull is a curved dome, so wrapping scalp, bone and brain around it means rebuilding that geometry. It is the biggest remaining step toward photorealism and needs its own round.

**Honest ceiling:** the brain is a low-resolution public atlas surface and most of the room is procedural, so this is a convincing stylised game, not photographic. I could not measure GPU frame rate (the sandbox renders at about 1 fps), so the presets and auto step-down are untested on real hardware.

## Round 4: a real head under the window

- **The patient is a real scanned head.** The surgical window now sits on a curved skull, not a flat plate. The Lee Perry-Smith head scan (CC BY 3.0, Infinite Realities) lies face-up on the table; the skull height is sampled from it by ray casts (`src/game/skull.ts`) and smoothed.
- Bone, the layered scalp cut face (skin, fat, galea), the bone layers, the cut-edge strip and the cortex patch (bent to the dome) all follow that curved surface.
- The scan's skin is cut away inside the incision by a shader, so the scalp layers sit exactly in the opening. A green drape tents smoothly from the head down to the table; the room's own drape was sunk beneath it to stop z-fighting.
- Credit for the scan is in `public/ASSETS.md` and the README.

## Verification

- **Unit tests: 79 passing** (`npm test`). New rules covered: vitals and collapse, grading, rupture, tether release, neck dissection, clip success/miss/pinch/blind, tumour feeders and motor zone, drain geometry and pressure, difficulty-gated twists.
- **Type check and production build** pass.
- **Real-browser checks** (Playwright, real mouse and keyboard, software rendering): briefing, chooser, monitor, callout, debrief, aneurysm field, tumour field, drain aim and insertion, phone-width briefing and drain. Screenshots in `docs/screenshots/`.
- **Lab, full procedure on the production build under the real `/Surgery-Simulator/` subpath** (`tools/qa-hosting.cjs`): bone carved with the real mouse, flap lifted, tools handed off at the tray, pockets cleared, rinse, explicit examination, result screen. **0 browser errors.** The script's last line (reading the old result element) then failed because the result screen was redesigned; I fixed that assertion afterwards but did not spend another 20 minutes re-running it.
- **Case 04 aneurysm, in pieces with real input**: tethers released and neck freed by real mouse holds (full run), then in a separate run clip alignment with `A`/`D`, clip closing, tray handoff, examination and result screen (graded S, 0 errors). A single uninterrupted run did not finish because software rendering (1 fps) leaves tissue dented from the suction step, which shifts the aim point; that is a test-environment artefact, not what you will see on a real GPU. Cases 01 to 03 at Attending/Chief, Case 05 and Case 06 are covered by unit tests plus screenshots and partial browser runs, **not** by full browser playthroughs.
- **Bugs the browser testing caught and I fixed**: the aneurysm originally sat in a groove hidden behind a cortical ridge, so the clip spot could not be aimed at (moved to a visible area); guide rings floating above the surface made you aim about 0.16 units off target; the drain screen was dimmed by an inherited text shade; the briefing's Scrub in button was hidden under the page footer at 1280×800; the drain's key listeners were being torn down on every re-render, releasing the catheter; the clip's QA hold kept decaying under slow rendering.

## What I could not verify

- **Whether it is fun.** I can show the rules work, not that people enjoy them. This needs humans.
- **GPU performance.** Everything ran on software rendering at 1 to 2 frames per second. Expect far better on a real machine, but I measured nothing.
- **Audio.** The monitor beep follows heart rate and sounds an alarm when critical, but I cannot hear it.
- **Touch input** on a real phone. Layouts were checked at phone width only.
- **Medical plausibility.** Nothing was reviewed by a clinician. Everything is labelled as a simplified game.

## What I cut or simplified

- No separate interactive tutorial overlay. Instead: each briefing shows the controls for that case, and the in-game objective panel walks through the steps.
- No demo video. Software rendering is too slow to record something that looks like the real game. Record one on your own machine (it takes two minutes).
- The operating-room walk-around is unchanged.

## 10-minute playtest (do this with 2 or 3 friends)

1. Without explaining anything, have each person start from the main menu and choose **Case 04**. Watch silently. Where do they hesitate?
2. Ask after: "What was the most tense moment?" and "Did you understand why you lost points?"
3. Have them try **Case 06**. Do they find the safe angle, or only the obvious one?
4. Have one person try **Chief** on Case 01.
5. Note anything that felt unfair, confusing or slow. Those are the next fixes.

## Deployment status: published

- `main` is at `0330097` (previous `d4cd7d4`).
- `gh-pages` was updated to `80842e0` (previous `165db0b`), built from `main` with `VITE_BASE_PATH=/Surgery-Simulator/`. GitHub Pages takes a few minutes to pick up a push; hard-refresh https://losttnt.github.io/Surgery-Simulator/ if you still see the old game.
- I could not confirm the live page from this sandbox: it returned HTTP 200 immediately after the push but still served the previous build.

## Rollback

```sh
git checkout main
git reset --hard d4cd7d4          # only if main was fast-forwarded to the showcase
git push --force-with-lease origin main
```

For the website: `git push --force-with-lease origin 165db0b:gh-pages` restores the previous build.
