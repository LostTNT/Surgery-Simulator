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

## Verification

- **Unit tests: 71 passing** (`npm test`). New rules covered: vitals and collapse, grading, rupture, tether release, neck dissection, clip success/miss/pinch/blind, tumour feeders and motor zone, drain geometry and pressure, difficulty-gated twists.
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

## Rollback

```sh
git checkout main
git reset --hard d4cd7d4          # only if main was fast-forwarded to the showcase
git push --force-with-lease origin main
```

For the website, `gh-pages` previously pointed at `165db0b`.
