# Optional inferred-camera background diagnostic — staged separately

**Does not alter app source, canonical scene packs, UI controls, or production.** This isolated diagnostic is integrated into the authorized second prototype-only CI pass after the standard parity captures. No local browser launch has been attempted.

## What it establishes

Two real-app photographs of the independently rendered single-view pack, at f/1.4 / 1/125 / ISO200 and f/5.6 / 1/125 / ISO3200. WB5000 K and MF1.4 m are explicit assumptions because original focus and color pipeline are unknown. The comparison originals use 1/120; 1/125 is 0.058894 EV darker.

The application opens with `?renderer=plates&subject=none`; motion remains false, so **no fan and no practice ball appear**. Originals retain their fan. This is a **background alignment / optical-pipeline diagnostic**, not a fan match, a baseline/candidate improvement claim, or a fake before/after. The app still performs its real lens blur, noise, exposure/tone mapping, and fresh 2048-long-edge export. It never renders an original JPEG as a texture.

The camera's inferred pose is baked into the new pack. Its source-derived startup focal is **24.913603768064135 mm** and camera near clip is **0.05 m**. The runner never dispatches focal/yaw/pitch/roll/XYZ input events; **do not apply the earlier 31.2 mm / 31.1° constrained-reframe preset**. Exact pack camera/view matrices and original inference metadata are recorded. DOM ranges can sanitize fractional values, so raw DOM controls and labels are not misrepresented as an exact private app-state observation.

## Source and quality limitations

- One 2048×858 **64-spp** denoised source view, not the 256-spp canonical center or a complete seven-view rig.
- Its own radiance encoding is **log2 [−16, 8]**, matching source maximum 172.5228729. The generated manifest is routed unchanged; canonical [−16, 6] encoding is not forced onto it.
- The camera was inferred from manual landmarks, not exactly recovered; recorded coordinate RMS is approximately 5.96 pixels.
- Near clipping intentionally differs from source 1.1 m to retain the nearby cabinet.
- **No flash, no optical mirror-distance map, no live subject/probe, no high-resolution detail layer.** Reflected blur distance therefore retains the physical-depth approximation.
- The source asset warnings and unknown original color pipeline remain in the manifest; successful routing does not certify those away.
- Single-view bounds may produce invalid `Infinity` XYZ step attributes in the existing UI. No position controls or range bounds are changed/touched.

## Ready commands (run only where browser execution is authorized)

From `/workspace/scratch/33cf95385f89`:

```sh
node camera-parity-work/prototype/tools/capture-matched-background.mjs \
  --candidate-root "$PWD/camera-parity-work/prototype" \
  --pack-dir "$PWD/camera-parity-work/prototype/diagnostics/matched-reference" \
  --out "$PWD/camera-parity-work/matched-diagnostic-evidence" \
  --focus 1.4 --build --serve
```

The optional owned server is candidate preview **8013**, never baseline8012 or public production. Use `--url` with no `--serve` for an already running production preview. Browser selection follows `PW_EXECUTABLE_PATH` / `CHROMIUM_EXECUTABLE_PATH`, then optional `PW_CHANNEL`, otherwise installed Playwright Chromium. SwiftShader and sRGB flags are fixed. Each exposure uses a fresh context/page at1440×1000 DPR1.

The runner lives under `tools/` and the isolated pack under `diagnostics/matched-reference/`, with explicit `--candidate-root`, `--pack-dir`, and `--out` in the branch-only workflow. Do not replace anything under `public/scenes/barbershop-plates`. The runner fulfills all scene-pack requests directly from the supplied isolated directory and rejects unexpected canonical-pack requests. The first parity run remains historical evidence; this is a separate bounded second pass, not a production deployment.

## Evidence

`run.json` records source/build/script and complete pack SHA-256 manifests, camera, inference/quality limitations, copied-original hashes, browser/GPU flags, actual DOM controls, readiness revisions, errors, and immutable-before/after checks. Each case produces:

- `background-only-page.png`
- `background-only-canvas.png`
- `background-only-export-2048.png` (asserted2048×858)
- `capture.json`

The app's disabled flash control at0 is intentionally skipped without dispatching an event. The original pack manifest and images are not modified; only Playwright responses for that page's pack requests are routed.

## Offline checks already performed

```sh
node --check camera-parity-work/prototype/tools/capture-matched-background.mjs
node --test camera-parity-work/runner/matched-diagnostic.test.mjs
node camera-parity-work/prototype/tools/capture-matched-background.mjs --plan
node camera-parity-work/prototype/tools/capture-matched-background.mjs --validate
```
