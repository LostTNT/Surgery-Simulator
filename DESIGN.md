# Suture: interactive surgical field

The October redesign keeps the full-bleed game and the walkable operating room. It adds direct pointer aiming, assisted and manual depth, rigid bone carving, a liftable flap, and yielding tissue.

## Concept references

- Surgical screen: `/workspace/generated_images/exec-fa1dd877-af1c-429d-a897-4bc382b1395d.png`.
- Bone-opening state: `/workspace/generated_images/exec-699f883e-5991-4703-824b-d3789323f834.png`.
- Tray/camera state: `/workspace/generated_images/exec-55d9ab27-3c07-4019-b3ce-0e8df8a7bf2d.png`.
- Tissue material: `/workspace/generated_images/exec-8085aec2-8767-4c9b-9832-d7c6aa88e7d2.png`.
- Bone material: `/workspace/generated_images/exec-617ee47c-77f1-4325-a471-7bf79efbf3a5.png`.

These workspace references are not required runtime assets. The generated production textures are shipped in `public/textures`.

## Design system

Full-screen 3D scene with sparse native overlays. Barlow 400/500 for headings and controls, system monospace for time and depth. Near-black teal `#081817`, warm white `#edf2e7`, sage `#bed4b8`, thin translucent borders, 5–10px radii. Compact brand and sound/time/pause at the top. One task at upper left; four steps: Open, Clear, Rinse, Inspect. A bottom-center hand/tray control, concise action feedback above it, compact patient monitoring at lower right. No website navigation or dashboard.

The close camera and the walking camera use the same room layout and materials, registered to the patient’s head. T gives a limited pan toward a sterile instrument tray beside the field. Instruments remain actual 3D objects on that tray. One tool can be held; it must be placed before another can be picked up. Pickup eases the camera back to the field. Labels and controls appear after the camera settles; operating is disabled during the pan.

All UI, task copy, targets and cutting guides are HTML/SVG. Aim and hold are the primary actions; release lifts the assisted hand. Scroll trims clearance and Q toggles manual depth. Help explains the whole sequence. The opening menu offers Start surgery and Explore operating room. Menus scroll at short heights. Portrait camera framing keeps the cutting path on screen.

## Material response and rendering

- Bone is a rigid height field. The burr permanently removes local material and triangle indices; progress checks coverage around the actual cut path. Drilling elsewhere still removes material, without advancing path completion. The flap becomes a separate rigid mesh for lifting. Debris has velocity, gravity and damped collision with remaining bone.
- Tissue uses localized damped springs, with a deforming mesh and a refitted BVH. Gentle pressure produces a depression that rebounds. Injury is separate persistent simulation state.
- Generated tissue/bone textures, bump detail, physical tissue highlights and a small wrap-light shader augment the atlas-derived mesh. High quality adds shadow maps, screen-space ambient occlusion and tone-mapped output. Balanced keeps physical materials and lighting. Sustained low rendering speed automatically selects Balanced until the user makes an explicit choice.

## Intentional adaptations

Real 3D geometry replaces the concept's photographic anatomy. This preserves actual depth, carving, deformation, collision and lighting, as requested. It is not a pixel-identical recreation of the photograph. Instruments and retractor remain authored 3D objects; the new burr has an animated head. The final tray state supersedes the earlier concept docks: all four physical instruments sit on a nearby tray. Native labels support picking the same 3D objects, and a Place control returns the held tool. Instruments are arranged across the tray to suit their actual 3D geometry. The procedure has four steps after the user's request for bone access. The task overlay has a subtle shade for readable text. The depth panel retains useful clearance information rather than the concept's invented force readout. Vessels use tapered geometry conformed to the cortical surface; the retractor has a thin curved blade, rounded hardware and a knurled adjustment wheel. Material behavior is a game approximation, not validated biomechanics. Skin access, dura dissection, closure and full tissue resection are outside this version.
