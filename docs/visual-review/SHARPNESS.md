# Photographic sharpness work

## Detail magnifier

The previous magnifier enlarged an 80×60 crop of the display-resolution canvas. It could not recover source-image or live-subject detail lost in the preview.

The magnifier now renders a padded region directly at its display density. It uses the same photographic exposure, white balance, lens blur, flash and temporal integration as the main image. The selected frame's settings and timestamp are captured together. The detail pass uses independent targets; it does not resize the visible canvas or rerun metering.

- Source plates request their high-resolution layer for the effective magnified frame size.
- Cropped camera projection and source-image rays use the same transformation, including the source camera shift.
- Lens blur uses the full-frame pixel scale and includes a complete surrounding blur halo.
- Live fan detail and shutter sampling use the uncropped camera's effective pixel density.
- Noise and overexposure stripes retain full-frame pixel coordinates.
- Render targets, optical depth, uniforms, clear state, flash state and fan detail are restored after the pass, including a failed draw.
- A cached crop avoids repeated rendering while paused. Detail refresh is limited to the preview's 30 Hz budget.
- Scene, position and size changes discard the old frame snapshot.

Run `npm test` for the projection, crop, state-restoration and existing camera checks. These checks do not establish GPU appearance or runtime performance.

## Source-render comparison

A same-camera crop of the original Blender barbershop was rendered with official Blender 4.5.14 LTS at 32 and 256 samples, with OpenImageDenoise and unchanged geometry, materials, lighting and exposure. At the existing 5120×2145 source pixel density, the higher-sample result retains finer lettering, wood and wall texture. The complete default-center image is now replaced at 5120×2145 and 256 samples. The ordinary 2560×1072 plate is area-downsampled from that same scene-linear render before logarithmic encoding. The other six viewpoints, all depth/flash layers and the shared encoding range remain unchanged. Samples are recorded per view.

The initial unchanged-lighting reference took 5,559 seconds on CPU. It was superseded by a refined center render with a normalized 15 W, 2×2 m warm rectangular fill and increased indirect-light bounces. The refined result retains the original camera, geometry and materials. Its matching fan HDR and additional direct fill apply only at center; all six legacy positions retain their original HDR and lights. Probe loading and plate selection commit together, and stale scene/position loads cannot replace a newer rig.

Current center assets:

| Scene | Detail dimensions | Samples | Lighting |
| --- | --- | --- | --- |
| Barbershop | 5120×2145 | 256 | Refined warm fill and matching fan probe |
| Classroom | 5120×2880 | 256 | Original source lighting retained |
| Kitchen | 4096×3857 | 256 | Original source lighting retained |
| Apartment | 5120×3129 | 256 | Original source lighting retained |

`captures/*-center.json` records source identity, camera, settings and output hashes for the completed replacements. Sampling and render duration are offline costs, not page-runtime work. Ordinary plates are area-downsampled in scene-linear space before logarithmic encoding. All six non-center viewpoints and all depth, optical-depth and isolated flash layers remain unchanged.

`tools/upgrade-scene-view.mjs RAW_DIRECTORY SCENE_PACK [VIEW_ID]` validates source identity, pose, clipping and projected framing; it checks finite radiance, lossless pixel roundtrip and unrelated layers. Encoding stays unchanged where possible. Kitchen has two source highlight channels above its shared detail ceiling of 128; its new center detail receives a view-local −16…8 range (ceiling 256), without changing any legacy view or the independent flash range. Runtime base/detail selection honors these view overrides. Focused tests exercise the real renderer selection and HalfFloat decoding, legacy fallback and independent flash decoding.

## Remaining visual acceptance

The cloud browser reports WebGL unavailable. Before delivery, verify the actual application on a WebGL2-capable browser:

1. Compare a paused, focused fan and fine background detail with the previous magnifier.
2. Check moving fan phase, short and long shutters, flash, foreground blur and mirror focus.
3. Move the magnifier to every image edge, including portrait crop and APS-C.
4. Switch scene/position, resize and change focus while hovering; confirm the main image and exposure stay stable.
5. Check frame responsiveness and resource release on scene changes.
