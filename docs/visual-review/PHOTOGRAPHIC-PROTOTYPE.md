# Isolated photographic-appearance prototype

Status: **unaccepted experiment awaiting browser pixels**, not a production release.
The worktree starts at `92ea92e`; its starting tree equals deployed main
`9fd67cfcf0730c3946f32510d008c5b09f384687`. No original JPEG is used by the renderer.

## What changed

- The live fan uses black dielectric enamel with a restrained clearcoat instead
  of green metal, and broader cambered/twisted steel blades.
- A sparse swept front/rear guard, rounded badge, and cage clips give the appliance
  a less diagrammatic silhouette. The wires remain actual tubes, not a photograph
  or opaque grille image. They participate in the existing tabletop shadow map.
- A larger head and nearer tabletop position separate the foreground subject from
  the room. Configuration parameters are internal; no new controls or feature
  reductions were introduced. The rotor remains threefold periodic and animated.
- Motion/receiver bounds include the swept cage and scale with the head transform.

The current experiment uses position `[3.800, 0.8165531, -7.600]`, head scale `1.8`,
head height `0.42 m`, head tilt `-0.12 rad`, and yaw offset `0.26 rad`. Targeted BVH raycasts against source `GEO-Dresser_marble.001` certify the
center plus 24 points at 11 cm radius on horizontal tabletop at
`y = 0.816553 ± 0.000001 m`. The unchanged elliptical base fits inside that circle.
This is table-only geometry proof: neighboring props and visual collision checks
remain pending. A closer-to-edge candidate was rejected after source raycasts
found bevel/missing support, despite the depth map suggesting a plausible fit.

## Honest comparison protocol

`tools/capture-photographic-parity.mjs` captures the real baseline and candidate
with the same viewport, DPR, exposure, white balance, focus, crop, and stationary
rotor phase. It records ready-frame revisions, loaded assets, controls, errors,
source hashes, and a fresh 2048-pixel export. An ablation restores all baseline
placement/head transforms while retaining new geometry/materials: composition
alone must not be presented as improved shading. This is a geometry+material
ablation, not a material-only test.

Original `F14-S120-ISO200-1.jpg` and `F56-S120-ISO3200-1.jpg` are copied as explicitly
labeled references, never substituted into the app. The simulator supports 1/125 s,
not 1/120 s: that is 0.0589 EV less exposure. Original focus, white balance, camera
transform, and rendering settings are not recovered metadata. Landmark-based camera
estimates are estimates, not exact reconstruction.

The original image has a different camera position/perspective. Current seven-view
coverage cannot exactly recreate it merely by cropping or yawing. An optional
separate matched-camera diagnostic may be added; it must not silently replace one
canonical camera while leaving six unrelated neighbor transforms.

## Remaining approximations

- The source HDR probe is still captured at the original small-fan placement.
  Direct lights evaluate the new live geometry position, but local reflections
  and indirect lighting do not move with the fan.
- The live subject does not contribute new global illumination to the baked room.
  Existing contact shadow, planar reflection, and shadow-map receiver are bounded
  approximations, not one coherent path-traced scene.
- RGB + axial-depth lens blur still cannot reconstruct hidden surfaces, glass
  light paths, repeated mirror bounces, or exact thin-edge bokeh coverage.
- The procedural appliance is newly modeled from appearance cues, not a recovered
  original fan model. Exact surface texture/aging and blade shape remain different.

## Validation before the first pixel experiment

- 32 unit tests pass, including finite blade geometry, materials, period, explicit
  placement defaults, and scaled bounds.
- Production build passes; existing asset audit passes.
- Local browser QA has **not run**. Headless Chromium with SwiftShader failed before
  page load: `socket() failed: Operation not permitted (1)`. The single escalated
  retry did not execute because the environment's bwrap setup reported it could
  not create an explicitly denied read-only session path. That path was not read
  or modified. The supported cloud browser independently could not reach the
  isolated local preview server (`ERR_CONNECTION_REFUSED`). These are launch/network
  blockers, not evidence of unsupported WebGL or a visual pass.
- Authorized branch-only GitHub CI will provide first rendered evidence. Its
  workflow has read-only contents permission and no merge or deployment action.
