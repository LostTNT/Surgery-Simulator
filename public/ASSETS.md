# Asset provenance

- `models/cortex.glb`: **modified FreeSurfer fsaverage5 left pial reference surface**, obtained from [Nilearn's `pial_left.gii.gz`](https://github.com/nilearn/nilearn/blob/cf91993d617bf5bb052bd3017cfa05246f7d8213/nilearn/datasets/data/fsaverage5/pial_left.gii.gz). Source-file SHA-256: `1e76fe43ac194c15fd272643f7ae7995621e2a496b3102b2d6175f0f8e6d7fc8`. Its GIFTI metadata identifies the original surface as `freesurfer/subjects/fsaverage5/surf/lh.pial`. The project crops and resamples a superior patch, changes scale and placement, fills gaps and smooths the resampled surface, and adds game coloring and material. It is a modified average reference rather than a patient-specific reconstruction or an unmodified FreeSurfer asset.
- `models/suction.glb`, `irrigation.glb`, `bipolar.glb`: original simplified instrument models authored for this project in Blender by `tools/build_assets.py`. Not manufacturer CAD or validated clinical geometry.
- `textures/drape.png` and `textures/instruments.png`: generated production artwork; no medical accuracy claim. See DESIGN.md for concept provenance.
- Vessel networks, fluid surfaces, bone/exposure, and drape geometry are authored prototype additions; they are illustrative rather than derived from the reference atlas.

## Reference surface license and upstream lineage

[Nilearn's fsaverage description](https://github.com/nilearn/nilearn/blob/cf91993d617bf5bb052bd3017cfa05246f7d8213/nilearn/datasets/description/fsaverage.rst) identifies the template as the standard surface distributed with FreeSurfer. Its license metadata says `unknown`; that field does not provide a dataset license. The upstream FreeSurfer distribution provides the following concrete source and terms:

- [FreeSurfer's distribution build file](https://github.com/freesurfer/freesurfer/blob/087e2f6477546f54bef71f29cc4e667d6cd93c6c/distribution/average/CMakeLists.txt#L155) explicitly installs `fsaverage5.tar.gz` into `subjects`.
- [The official archive entry](https://github.com/freesurfer/freesurfer/blob/087e2f6477546f54bef71f29cc4e667d6cd93c6c/distribution/average/fsaverage5.tar.gz) is a git-annex pointer recording an archive size of 72,198,617 bytes and SHA-256 `d36756e40c53e920749ee19314c35f90b37a32e74e96d1aedb46ed273a7c7020`. A byte-for-byte comparison of the Nilearn surface against that archive has not been performed.
- [FreeSurfer's license](https://github.com/freesurfer/freesurfer/blob/087e2f6477546f54bef71f29cc4e667d6cd93c6c/LICENSE.txt) expressly covers software **and data** from FreeSurfer. Part B permits reproduction, modification, display, and distribution subject to its conditions, including preservation of notices and identification of modifications. This upstream software/data license is the basis for distributing the modified reference surface. The [FreeSurfer terms](licenses/FREESURFER.txt) and [Nilearn notice](licenses/NILEARN.txt) accompany the game.

All or portions of this licensed product (such portions are the "Software") have been obtained under license from The General Hospital Corporation "MGH" and are subject to the following terms and conditions: [FreeSurfer Software License Agreement](licenses/FREESURFER.txt).

The reference surface and this game are not approved clinical tools. No endorsement by MGH, FreeSurfer, Nilearn, their contributors, or their funding agencies is claimed.

## October 2026 interactive redesign

- `textures/cortex-detail.webp`: generated cerebral tissue albedo/bump artwork, mapped onto the modified atlas geometry. It adds illustrative fine detail and is not patient data.
- `textures/bone.webp`: generated ivory bone material. The bone mesh, cut damage field, removed triangles, liftable flap, burr and debris are original interactive game geometry in `src/game/access.ts`.
- Tissue deformation uses original local spring code in `src/game/soft-tissue.ts`; it is not a measured biomechanical material model.
- Existing instrument artwork is used as a horizontal sprite strip, with native UI labels. All new task/target/path indicators are native UI.
