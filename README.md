# Suture

A browser surgical game with a walkable operating room and four playable fields: pick up tools from a physical tray, carve a bone window, lift the flap, complete the case objectives, rinse, and explicitly examine the field.

Play online: **https://losttnt.github.io/Surgery-Simulator/**. See [deployment](DEPLOYMENT.md) for publishing updates and verification details.

```sh
npm ci
npm run dev
```

Requires Node 24 and a WebGL 2 browser. There is no backend or API key.

## Procedures

| Field | Objective |
| --- | --- |
| Instrument lab | Practice opening the window, clearing four pockets and rinsing to 88% clarity. |
| Case 01 · Extra-axial collection | Clear four pockets with slower aspiration and rinse to 88% clarity. |
| Case 02 · Focal bleeding control | Stop the marked source with bipolar before suction or rinsing; clear four pockets and rinse to 90% clarity. |
| Case 03 · Loculated collection washout | Clear six separated pockets and complete a longer rinse to 96% clarity. |

In the room, walk to the lit case workstation and click its monitor or press **E** nearby. Choose a case, then **Prepare & start surgery** to open its field directly. The case workstation is also available from the SUTURE menu. The room uses dim ambient lighting with focused surgical lamps over the patient.

## Controls

- **Aim and hold:** point directly at the field; hold the left mouse button or touch and hold to operate. The burr removes actual bone geometry. Follow the dotted cutting path, then click **Lift bone flap** or press **E**.
- **Assisted depth:** follows the current 3D surface and lifts on release. Scroll down/up to trim depth. Click Reset depth trim to restore it.
- **Manual depth:** press **Q** or use Settings. Scroll or **F/R** lower/raise the tool. **Shift** slows the hand. Full shaft and tissue collisions apply in manual mode.
- **Tools and tray:** **T** pans between the patient and a nearby sterile tray. You hold one tool at a time. Place the current tool on the tray (click **Place**, press **E**, or click the tray surface), then click a physical instrument or its label to pick it up. At the tray, **1/2/3/4** pick up burr/suction/irrigation/bipolar when your hand is free. The camera returns to the field after pickup. Bipolar on healthy tissue causes injury.
- **Examine field:** clear every numbered pocket, reach the case's rinse target, and control bleeding. The final examination checklist shows what remains. Click **Examine field** or press **E** at the field to start a 2.5-second check with the instrument safely lifted. Releasing a tool does not start the check. Operating or returning to the tray cancels it; pause freezes it.
- **Room:** **WASD** walks. Click the case monitor or press **E** nearby to select a procedure. Clicking elsewhere captures the mouse for looking; **E** also collects an instrument or enters the microscope. Drag-look and arrow keys are available when pointer capture is unavailable. **Enter operating room** begins exploration; **Start surgery** opens the field directly.
- **Escape/P:** pause. Focus loss also pauses and releases the instrument. **+/−** adjust the microscope zoom.

The game includes local best scores, stage retries, help, optional target guides, sound, fullscreen and graphics settings. High adds ambient occlusion and soft shadows; slow devices automatically switch to Balanced. Graphics can also be selected explicitly.

## Development and verification

```sh
npm test
npm run build
npm run qa
npm run qa -- --case=case02
npm run qa -- --case=case03
```

For production subpath testing:

```sh
VITE_BASE_PATH=/Surgery-Simulator/ npm run build
VITE_BASE_PATH=/Surgery-Simulator/ npm run preview -- --port 4174
node tools/qa-hosting.cjs http://localhost:4174/Surgery-Simulator/
node tools/qa-hosting.cjs http://localhost:4174/Surgery-Simulator/ --case=case02
```

The browser checks use local Chromium and real visible controls, including case preparation, cutting, lifting, tool returns/handoffs, bipolar in Case 02, suction, rinsing, the explicit examination and the result screen. `--case=lab|case01|case02|case03` selects a field; `SUTURE_CASE` and `SUTURE_URL` are environment alternatives. See [QA](QA.md) for recorded results and limits and [design](DESIGN.md) for references and deliberate 3D adaptations.

## Implementation

- `src/game/tool-tray.ts`: physical tray, instrument slots and 3D picking.
- `src/game/bone-cut.ts`, `access.ts`: local material removal, flap, burr and debris.
- `src/game/soft-tissue.ts`: localized damped tissue deformation.
- `src/game/materials.ts`: physical tissue material and wrap-light shader.
- `src/game/engine.ts`: scene, input, rendering, camera, state publication.
- `src/game/simulation.ts`, `collision.ts`: objectives, injury, bleeding, swept collisions and checkpoints.
- `src/game/room.ts`, `scene.ts`: room and operating field.
- `src/App.tsx`, `src/ui/GameHud.tsx`: menus and live game controls.

The procedure, anatomy, patient monitoring and material response are simplified game mechanics. This is not a medical training product. Skin access, anaesthesia, dura dissection, closure and full tissue resection are omitted.

The modified atlas mesh derives from FreeSurfer fsaverage5 through Nilearn. Required notices and modification details remain in [asset provenance](public/ASSETS.md) and [FreeSurfer terms](public/licenses/FREESURFER.txt).
