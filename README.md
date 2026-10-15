# Suture

A first-person surgical game prototype: prepare in a compact operating room, collect an instrument, and enter a stable close surgical view. The initial prepared-field exercise supports suction, irrigation, localized bleeding control, injury, guided assistance, checkpoints, and a session debrief.

**Run locally**

```sh
npm install
npm run dev
```

The development server listens on `0.0.0.0:5173`. In a restricted hosted workspace, use `npm install --cache /tmp/suture-npm-cache` if the default home cache is unavailable.

```sh
npm test
npm run build
npm run preview
```

Hosted browser regressions (with the development server running): `npm run qa` and `npm run qa:completion`. See [verification and remaining work](QA.md).

For free GitHub Pages hosting, see [deployment setup](DEPLOYMENT.md).

**Controls**

- Room: WASD to walk, mouse to look, E to collect a tool or enter the microscope. Click the field to capture the pointer; drag-look and arrow keys are available when pointer capture is unavailable.
- At the tray: 1 / 2 / 3 select suction, irrigation, or bipolar; E picks up the selected instrument.
- Surgical view: move the mouse to position the tool; scroll down to lower and up to withdraw. R raises and F lowers. Shift reduces movement/depth increments. Hold the left mouse button to operate.
- H toggles guided anatomy hints; + / − adjust zoom; Escape / P pause. Switching tools represents an assisted handoff in the surgical view.
- Pause, focus loss, tool changes, and camera changes release activation and discard pending instrument movement.

**Current scope**

This is an interaction prototype, not a validated medical training product. The case is fictional and begins in a prepared exposure; access, anaesthesia, full fluid/tissue mechanics, and closure are omitted. The instrument lab and introductory case share the core interaction system. Intermediate and additional procedures remain future work.

The room, anatomy, lighting, materials, and instrument handling need further production art and player iteration. Hosted software-rendered Chromium can test flow and capture evidence, but cannot establish GPU performance or novice enjoyment. Clinical review and human playtesting remain outstanding.

The atlas-derived surface is a modified FreeSurfer fsaverage5 average reference obtained through Nilearn. Its distribution follows FreeSurfer's software/data license, with the required notice, modification statement, and Nilearn attribution included. See [asset provenance and the documented upstream distribution](public/ASSETS.md) and the [applicable FreeSurfer terms](public/licenses/FREESURFER.txt). The surrounding anatomy, vessels, fluid representation, and instrument shapes are simplified game assets.

**Project layout**

- `src/game/simulation.ts`: case state, objective progression, injury/bleeding, results, checkpoints.
- `src/game/collision.ts`: tool-specific capsule chains and swept contact helpers.
- `src/game/engine.ts`: scene lifecycle, rendering, input, snapshots, preparation/surgery transitions.
- `src/game/room.ts`: operating room, navigation, proximity/looking interactions, held instruments.
- `src/game/scene.ts`: prepared exposure, vessels, fluid layers, guidance markers.
- `src/App.tsx` and `src/style.css`: sparse game HUD and in-game menus.
- `tests/`: meaningful simulation/collision regressions.
- `tools/`: reproducible atlas preparation and original Blender instrument authoring.
- [Build plan](GAME_PLAN.md) and [active visual direction](DESIGN.md).

Source assets for rebuilding the anatomy are described in `public/ASSETS.md`. The preprocessing scripts expect the reference GIFTI files in `/tmp`, then run `python tools/prepare_surface.py` followed by `blender --background --python tools/build_assets.py`. Included runtime GLBs do not require Blender to play.
