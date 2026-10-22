# Photographic parity capture

Runner only: no application code, shaders, controls, image pixels, or production deployment are altered. The deployable copy is `prototype/tools/capture-photographic-parity.mjs`. The isolated branch workflow is `prototype/.github/workflows/photographic-parity.yml`.

## Authorized CI run

The branch workflow runs on pushes to **`prototype/photographic-parity` only**, or manual dispatch. It has `contents: read`, checks out deployed baseline `9fd67cfcf0730c3946f32510d008c5b09f384687` separately, records both resolved commits and SHA-256 source/build manifests, uses Node 24 / Playwright Chromium, and uploads evidence even on capture failure. It contains no Pages/deploy/merge/push step. `baseline_ref` can explicitly select a different comparison commit on manual dispatch; the default/fallback stays pinned to that deployed commit. Leave `include_aligned` false for the first, four-pair pass.

The equivalent command after `npm ci` in both checkouts and `npx playwright install --with-deps chromium` in the candidate is:

```sh
node camera-parity-work/prototype/tools/capture-photographic-parity.mjs \
  --baseline-root "$PWD/repos/camera-simulator" \
  --candidate-root "$PWD/camera-parity-work/prototype" \
  --out "$PWD/camera-parity-work/evidence" \
  --build --serve
```

This starts owned production preview servers on baseline **8012** and candidate **8013**, then stops them. Without `--serve`, it uses already running servers at those addresses. Do not point roots at one version but URLs at another. `--build` is explicit so existing-server runs can preserve an already verified artifact.

By default Playwright's installed Chromium is used. Optional `PW_EXECUTABLE_PATH` (or `CHROMIUM_EXECUTABLE_PATH`) selects an executable; `PW_CHANNEL` selects an installed browser channel only when no executable is supplied. SwiftShader flags are always enabled. No local browser launch was used to validate this script because that environment is restricted.

## Capture matrix

Each row has a **fresh context and page for baseline and candidate**, viewport 1440×1000, DPR 1, motion disabled (renderer calls `setTime(0)`), manual exposure, WB 5000 K, native crop, full-frame sensor. Default run: 8 captures / 4 pairs.

| Case | Aperture | Shutter | ISO | Focus | Framing |
| --- | --- | --- | --- | --- | --- |
| `current-default/default` | f/8 | 1/4 | 100 | 3 m | Untouched source-derived startup composition; no focal/yaw/pitch/roll input dispatched |
| `baseline-transform-default/default` | f/8 | 1/4 | 100 | 3 m | Same; candidate uses baseline placement/head transform only |
| `reference-wide/f14-iso200` | f/1.4 | 1/125 | 200 | 3 m | Same wide frame |
| `reference-wide/f56-iso3200` | f/5.6 | 1/125 | 3200 | 3 m | Same wide frame |

The ablation overrides **only** `position`, `yawOffset`, `headTilt`, `headHeight`, and `headScale` in the candidate `subjects.json` response. Baseline legacy defaults are yaw offset 0, tilt −0.09 rad, height 0.435 m, scale 1; the position is read from the actual baseline manifest. All geometry/material/source changes stay candidate-side. Consequently it is **not a pure material-only ablation**. Both original and served JSON are recorded.

`--include-aligned` adds the two reference exposures at requested focal 31.2 mm / yaw 31.1° / pitch −1.5° / roll 1.5° / focus 1.4 m. This is **approximate constrained reframing, not a solved match to the original camera**. App range/coverage constraints stay active; `actual` and `compositionDifferences` report settled DOM control values. The UI range can sanitize fractional internal values, so raw labels and `statePrecision` explicitly record this limitation; these are not claimed as an injected exact internal-state observation. Any before/after DOM control or source-derived startup-composition mismatch fails the run.

Original JPEGs are copied unchanged into `originals/` **for comparison only**, never substituted into renderer inputs or captures. Filenames specify shutter 1/120; the app supports 1/125 instead, a 0.058894 EV reduction. Original focus is unverified; WB 5000 is an explicit comparison assumption. Wide reference shots are matched exposures, not matched framing.

## Evidence contract

Every capture writes:

- `page.png` — full UI; all details collapsed consistently.
- `canvas.png` — actual canvas appearance via browser screenshot.
- `export-2048.png` — actual fresh PNG download, asserted 2048-pixel long edge.
- `capture.json` — requested and settled DOM controls (range values, bounds, labels), plus the fractional-range precision caveat and source-derived startup focal length, canvas dataset / frame revisions / pending layer readiness, GPU, initial and pre/post capture states, route ablation, export SHA-256/dimensions, image statistics, page/console/request/HTTP errors.

`run.json` summarizes source commits, full source/build SHA-256 manifests, originals, browser version/flags, actual before/after control equality, and pass/fail. `source-hashes.json` preserves full per-file hashes. Source changes during capture, browser errors, missing assets, flat frames, wrong export dimensions, or before/after control drift fail the run. No `view=source` diagnostic is used, so lens blur and ISO noise remain live.

## Offline validation (no browser or server)

```sh
node --check camera-parity-work/prototype/tools/capture-photographic-parity.mjs
node --test camera-parity-work/runner/capture-parity.test.mjs
node camera-parity-work/prototype/tools/capture-photographic-parity.mjs --plan
```
