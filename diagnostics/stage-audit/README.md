# Same-source processing audit — isolated prototype

## Purpose and boundaries

Hold the **same 2048×858 scene-linear source** and camera fixed. Exclude the fan,
original JPEGs, motion and flash. Test transport, display and optics separately.
This is not a production deployment or an assertion that the inferred camera
matches the unknown original JPEG exactly.

## Inputs / camera

`../matched-reference/manifest.json` retains source/pack hashes and exact camera.
Raw EXR lives outside this repository at `../matched-reference/capture/` relative
to the prototype parent. The browser loads only the committed isolated pack.
Source64spp OIDN, pinhole; full-frame-equivalent24.9136037681mm,36mm sensor,
2048×858, focus1.4m. Controlled source optical references use that same field of
view with36mm/24.9136mm and f/1.4 or f/5.6 (not17.225mm on24.89mm at the same f).
The diagnostic has **no mirror optical-distance map**; mirror errors must remain
separate from normal surfaces and cannot establish a canonical-pack regression.

## Reproduction

- `node diagnostics/stage-audit/audit-packing.mjs` (see script CLI) independently
  recomputes log codes and measures source quantization/half precision.
- `read-linear-source.mjs` reads EXR through Three; `check-raw-with-blender.py`
  plus `verify-independent-exr.mjs` cross-check all pixels with Blender's reader.
- `node tools/analyze-display-stages.mjs` compares raw source/packed data under
  the **same independently implemented Three AgX+sRGB definition**, then measures
  exposure and the separately defined Blender OCIO view difference.
- CI only: `node tools/capture-processing-stages.mjs --serve --out PATH` invokes
  unchanged production `PlateRenderer`/decode/post shaders. Local browser launch
  is restricted and was not retried. It captures raw transport codes, decoded
  linear texture, projected linear framebuffer/depth, and individual stages.
- `node tools/analyze-processing-stages.mjs --evidence PATH` checks real-browser
  artifacts against the scalar oracle and reports mirrored synthetic lens edges.

## Acceptance defined before browser capture

1. Lossless WebP vs browser Image/canvas transport codes: exact byte identity.
2. Browser decoded texture vs tested offline decode: exact half-float identity.
3. Display shader vs independent scalar transform of actual preceding GPU linear
   framebuffer: MAE≤0.05/255, max≤2/255, fraction>1code≤0.00001. Lens buffer is
   an additional half-float readback; record that rounding separately.
4. Report scene projection/filtering errors, ordinary-surface DOF differences,
   and mirror/occlusion boundaries separately. Do not fail display tests for
   differences between **different** view transforms or inferred JPEG settings.
5. Two constant black/white near/far step fixtures are mirrored through the
   unchanged lens shader to reveal directional coverage. Physical coverage is
   an analytic disk-edge profile; this stage is a model diagnosis, not a display
   oracle check.

## Offline facts established

- All5,271,552 RGB codes exactly match independent EXR quantization. No upper
  clipping in this matched log[-16,8] pack; no codec changes. Independent Blender
  reader matches every Float32 RGBA value from EXRLoader.
- With production-defined Three AgX+sRGB, packing changes mean0.54/255 and at
  most2/255 per channel. It does not account for broad brightening.
- Prior controls f/1.4,1/125,ISO200 (or f/5.6,1/125,ISO3200) produce
  `8 - EV100 = +1.06336206099743 EV`, a2.089795918× radiance multiplier. Under
  the defined transform this alone changes mean28.10/255. `baseEV:8` is the
  app's reference-exposure convention, shared by all4scenes; current shallow
  history/docs provide no independently measured absolute camera calibration.
  This is **not a justified bug fix** and is not reset to match a JPEG.
- Blender preview versus Three scalar display differs too, but exhaustive
  effective Blender output/curve/WB settings must be checked before attributing
  the whole difference to the AgX implementation.

Browser results and controlled-source optical results are pending; offline
facts do not claim those later stages passed. Production source is unchanged.
