# Isolated photographic-appearance prototype

Status: **second bounded iteration awaiting browser pixels**, not a production release.
The first browser-tested candidate was rejected: its enlarged guard clipped the
left edge, and the bright, highly cambered blades looked spoon-like rather than
photographic. The cleaner sparse black guard was useful even in the placement
ablation; enlargement itself was not accepted as an improvement.
The worktree starts at `92ea92e`; its starting tree equals deployed main
`9fd67cfcf0730c3946f32510d008c5b09f384687`. No original JPEG is used by the renderer.

## What changed

- The live fan uses black dielectric enamel with a restrained clearcoat instead
  of green metal, and broader, thin stamped steel blades with only 4 mm of camber.
  The second iteration moderates anisotropy, increases material roughness, and
  reduces enamel clearcoat rather than changing global exposure or image contrast.
- A sparse swept front/rear guard, rounded badge, and cage clips give the appliance
  a less diagrammatic silhouette. The wires remain actual tubes, not a photograph
  or opaque grille image. They participate in the existing tabletop shadow map.
- The second iteration restores the original certified tabletop position and
  uses a modest 1.15× head, instead of the rejected 1.8× nearer head. Configuration
  parameters are internal; no new controls or feature reductions were introduced.
  The rotor remains threefold periodic and animated. The existing approximate
  contact footprint is tighter and darker; it is not baked into the room image.
- Motion/receiver bounds include the swept cage and scale with the head transform.

The current experiment uses position `[3.8000004, 0.8165531, -6.9500003]`, head
scale `1.15`, head height `0.435 m`, head tilt `-0.09 rad`, and yaw offset `0.12 rad`.
Targeted source-table BVH raycasts against `GEO-Dresser_marble.001` independently
rechecked the original position at 11 and 14 cm radius; all 25 points hit horizontal
tabletop. The unchanged elliptical 11 cm × 9.13 cm base fits inside that support.
This certifies tabletop support, not a complete neighboring-prop collision test.

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
coverage cannot exactly recreate it merely by cropping or yawing. A separate, **background-only** matched-camera diagnostic is stored outside
`public/` and routed only by its evidence runner; it does not replace any canonical
view. It tests the approximate inferred camera, room tone, and depth-based lens
blur. The original fan is absent, so the whole image is not a fan-quality score.
Its 64-sample source render retains original room lighting, unlike the refined
center-view fill; focal 24.9136 mm, MF1.4 m and WB5000 K are stated assumptions.
The original camera fit has about 6 px landmark RMS, not recovered source metadata.

## Remaining approximations

- The fixed HDR probe is again near the restored fan position, but it is still one
  point sample: reflections and indirect lighting do not vary over the appliance.
  Area lights do not reproduce source-room occlusion of the procedural fan.
- The live subject does not contribute new global illumination to the baked room.
  Existing contact shadow, planar reflection, and shadow-map receiver are bounded
  approximations, not one coherent path-traced scene.
- RGB + axial-depth lens blur still cannot reconstruct hidden surfaces, glass
  light paths, repeated mirror bounces, or exact thin-edge bokeh coverage.
- The procedural appliance is newly modeled from appearance cues, not a recovered
  original fan model. Exact surface texture/aging and blade shape remain different.

## Validation and first pixel experiment

- 33 unit tests pass, including finite blade geometry, materials, period, explicit
  placement defaults, and scaled bounds.
- Production build passes; existing asset audit passes.
- Local browser QA has **not run**. Headless Chromium with SwiftShader failed before
  page load: `socket() failed: Operation not permitted (1)`. The single escalated
  retry did not execute because the environment's bwrap setup reported it could
  not create an explicitly denied read-only session path. That path was not read
  or modified. The supported cloud browser independently could not reach the
  isolated local preview server (`ERR_CONNECTION_REFUSED`). These are launch/network
  blockers, not evidence of unsupported WebGL or a visual pass.
- First authorized branch-only GitHub CI (`f62b9cc`) produced all eight captures
  successfully. All four baseline/candidate pairs had identical actual controls,
  clean pinned source hashes, no readiness/settings mismatches and no page errors.
  Visual inspection nevertheless rejected that first candidate, as described above.
- The second branch-only run adds two isolated background diagnostics and focused
  browser regression coverage. Passing automated capture is not aesthetic acceptance.
  The workflow has read-only contents permission and no merge/deployment action.
