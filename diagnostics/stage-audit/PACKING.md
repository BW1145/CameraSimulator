# Stage 1 — EXR → transport image → scene-linear half-float

## Result

**No material whole-image brightness/color loss was found in this transport stage.** The 2048×858 matched source contains 1,757,184 pixels and 5,271,552 RGB channels. This is a test of the same generated source, not of the original JPEG or a guessed original camera setting.

- Blender 4.5.14's independent image loader and the JavaScript EXRLoader produce **bit-identical full Float32 RGBA values** after the documented vertical flip.
- NumPy independently quantizes Blender's values; all **5,271,552 decoded WebP channel codes match exactly**. Thus the WebP container introduced no additional codec loss or channel conversion. The file has no ICC profile.
- Actual encoding is log2 **[-16, 8]**, not [-16, 6]. Maximum source radiance is 172.5229, below the 256 ceiling: **zero upper-clipped channels**. No negative or nonfinite source values.
- Mean decoded RGB shifts are **−0.0120%, +0.0738%, −0.0178%**. Cabinet/cans/chair mean channel shifts remain below 0.05%; bright-window shifts remain below 0.27%.
- This is **not lossless radiance**: 8-bit log codes have a 0.09412 EV step and an ideal half-step error ≤0.04706 EV (about 3.32%). Actual per-channel p99 absolute error is 0.04669 EV. Worst error is 0.04960 EV in a near-black subnormal, within the rigorously computed combined 0.05042 EV bound.
- Three's half-float conversion truncates rather than rounds. Its additional worst-case error across this encoding's 256-entry LUT is 0.00336 EV (near black), with a mean image error −0.000486 EV. This is too small to explain a broadly degraded image; no production code change is justified by this result.
- 1,044 channels (0.0198%) lie below the encoding floor 2^-16; 158 are exactly zero. They become at most 0.00001526 scene-linear. Near-black *relative* error can therefore be large even though absolute/display error is tiny; the non-clamped error bound excludes them.

## Controlled limits

These checks do **not** verify browser Canvas behavior, GPU filtering, projection, tone mapping, DOF, or subject compositing. Browser extraction and same-defined production AgX display are separate stages. The source has 64-spp OIDN noise/denoising and known source-asset limitations; transport integrity does not erase those limitations.

The generated `expected-*-neutral-aces.png` and `packing-display-error-x40.png` are **non-production sensitivity illustrations only**. They apply the explicitly defined ACES approximation + sRGB at exposure0/WB5000, without noise or DOF. Production restored-lighting uses AgX, so these images are not production screenshots, not Blender AgX matches, and should not be used to judge that stage. Under that auxiliary transform, transport error is ≤2.41/255 per channel, p99 2.21/255.

## Range counterfactual, not a finding about canonical assets

Encoding **this same matched-camera source** at max6 (=64) would clip 125 pixels / 355 channels, just 0.00711% of pixels. Because these include very bright light sources, it would remove 1.62% / 3.59% / 6.04% of integrated R/G/B radiance and could matter to light-spreading operations. **The actual diagnostic pack uses max8 and does not do this.** The canonical pack comes from a different camera/source render, so these counts are not evidence that its actual assets are clipped.

## Tests and acceptance

`packing-audit.json` retains the numeric evidence, hashes, explicitly bounded regions, and machine-readable checks:

1. Exact transport-code equality: **PASS**, zero mismatches.
2. No unexpected upper clipping: **PASS**, zero channels above range.
3. Source finite and nonnegative: **PASS**.
4. Non-clamped log quantization + actual half-float LUT mathematical bound: **PASS**.
5. Floor affects less than 0.1% of channels: **PASS**, observed 0.0198%; this is a scope/impact check, not a universal visibility guarantee.

`cross-decoder-verification.json` independently passes full-source and full-quantized-code hash equality. Source EXR SHA256 is `5c8e64275f94169a24a002796d7ee31e7b3dedb385b6ed4919b0f0fc870801aa`; packed WebP SHA256 is `0278500506210f26cd015e86774e7f7a5297ddb90df89dd0941992649429072e`.

## Reproduction

Run from the prototype repository root. The EXR remains in the separately preserved source-capture directory, not duplicated into the repository:

```sh
node diagnostics/stage-audit/audit-packing.mjs \
  ../matched-reference/capture/matched-64spp-oidn.exr \
  diagnostics/matched-reference/center.webp

# Independent decoder, no source scene loaded and no new render:
/path/to/blender-4.5.14-linux-x64/blender --background --factory-startup \
  --python diagnostics/stage-audit/check-raw-with-blender.py -- \
  "$PWD/../matched-reference/capture/matched-64spp-oidn.exr" \
  "$PWD/diagnostics/stage-audit/blender-raw-check.json"
node diagnostics/stage-audit/verify-independent-exr.mjs
```

`read-linear-source.mjs` exports `await readLinearSource(path) → {width,height,data: Float32Array RGBA}` in **top-left row order**, for the later same-source display/optics comparison. ROIs use shared `regions.json`; the packing report additionally records a dark-shelf region.
