# Optional Monk display-profile acceptance

Baseline: published ten-scene commit `00ae1b172d6c2874abfef7a62881e48dfb43c307`.
The new three Monk capture packs are not added to the selector until their
complete formal deliveries pass import and runtime acceptance.

## Color contract

The approved previews use sRGB / AgX / AgX - Medium High Contrast, display
exposure −1.5 EV, gamma 1, without Blender white-balance or curve mapping.
The runtime keeps scene-linear radiance, dynamic HDR encoding, real depth and
isolated flash. `baseEV` remains 8. The optional display exposure is applied
after physical/temporal/lens integration, photographic exposure and white
balance, before the pinned OCIO transform and exactly one sRGB transfer.
Raw-light metering is not affected by the creative display look or offset.

The original ten scenes have no top-level display-profile request. They retain
the original fragment shader byte-for-byte and reuse their compiled post
material across legacy-to-legacy switches. No extra LUTs are requested for them.
Unsupported profiles, changed hashes or failed loads fail explicitly rather
than silently replacing the approved look with Three's default approximation.
Delayed loads cannot replace a newer scene selection.

The small runtime profile is exported by OpenColorIO 2.4.1 from the exact
Blender 4.5.14 configuration. It uses two original-size 37³/57³ float32 LUTs
and generated tetrahedral interpolation, not a rebaked low-resolution fit.
See [complete notices and upstream history](../../public/licenses/color-profiles/NOTICE.md).

## Reproduction

With Node dependencies installed and Blender 4.5.14's Python / PyOpenColorIO
2.4.1 available (no Blender scene or rendering process is needed):

```sh
node tools/capture-transport-reference.mjs --app-root . --out .assets-cache/transport-decoder-reference.json
python tools/generate-display-profile.py --config /path/to/Blender-4.5.14/colormanagement/config.ocio --transport-reference .assets-cache/transport-decoder-reference.json --out .assets-cache/monk-profile
```

The generator rejects mismatched configuration/resource hashes. Transport
references use the actual pinned app decoder and Three DataUtils conversion,
including its float32-to-half mantissa truncation, not a substitute IEEE
round-to-nearest conversion. Neither original source scenes nor large render
intermediates are required or published with the app.

## Acceptance checkpoints

- Source exporter CPU tests verify exact GLSL/LUT bytes and CPU reference output.
- Node tests verify optional/strict metadata, byte/hash validation, texture
  layout, unchanged legacy shader, material reuse, cache/retry, exposure
  separation and frozen capture metadata.
- Browser tests compare 723 raw HDR/color GPU vectors with the independent
  OCIO CPU processor; 32 transported color patches × five exposure/WB variants
  go through the actual photographic pipeline.
- Additional browser tests cover flash pulse invariance and preview/magnifier/
  PNG color agreement, exported profile metadata, delayed profile navigation
  and explicit invalid-profile errors.

All 73 browser tests (including the five display-profile tests) and all three
unit/asset-audit shards passed on development commit
`1202608168d931b00b66418cf4eb2c8e708f1898`, in
[CI run 40129171491, shard 1](https://github.com/BW1145/CameraSimulator/actions/runs/40129171491).
Deployment was explicitly skipped for this development branch; the published
ten-scene main was unchanged. The downloaded shard-1 artifact ZIP SHA-256 is
`17f0264e92458ab2f3caa7938d21971f0bcfa4cbc3e20cf5a096a5750340ebbf`.
Actual results:

- 723 GPU/CPU cases: maximum linear error `2.4318695e-5`, maximum sRGB
  error `3.2182118e-5`, no mismatch against the `2e-4` limits.
- 160 real transported exposure/WB samples: maximum RGB8 code error **0**.
- Quarter/eighth-second fixed-pulse flash, independent magnifier and PNG capture:
  all four RGB values exactly `[104, 38, 0]` in the colored test fixture.
- Delayed-profile navigation, invalid-profile failure and JPEG display metadata
  passed in the same browser run.

This establishes the display implementation, not acceptance of unfinished Monk
captures. Formal pack/default-focus/13-scene acceptance and publication follow
separately; only fully verified source-rendered packs may enter the selector.

## Colonnade center: explicit recovery provenance

The first colonnade center completed all 336 tiles at 256 samples per pixel.
Its original Blender process was then terminated by the memory guard during
full-frame buffer readback (exit **−15**, runner exit **1**). It is not recorded
as a successful ordinary raw export. The retained Cycles internal buffer was
independently scanned: all 21,233,664 pixels have exactly 256 samples, and color,
normal and albedo channels are finite. The same bounded OIDN processing and
approved display transform recovered the completed capture without retracing.

This one case is pinned by source, job, internal-buffer and adopted-report
hashes. Normal center validation still requires its original successful raw
capture chain; another scene or job cannot use this exception. The importer
additionally streams the retained source/evidence hashes, while public runtime
checks bind a whitelisted portable manifest and every deployed asset hash.
Full processing mirrors and machine-local evidence remain private.

- Internal buffer: `92cf607ac0da0363c3130e6ee3207bb3aca1576933b6c1f22063a7f19903ffd0`.
- Adopted report: `1293bdbc71eef759173c8935f43df38086a4e2e17150f44463c3ce8306509abf`.
- Final denoised EXR: `4797bc6409464b476c3b330a649c485aeb6fdfd73295871e6fee7d37d55f72bb`.

The original **post-render** source-frame, camera-pose, sampling, thread,
quality, simplification, context-scene and effective-seed checks did not run.
Their absence is explicit; the retained pre-render setup is not presented as
a completed post-render check. Full runtime/source pixel comparisons, all
seven-view layer registration, actual visual review and final focus checks
remain separate mandatory acceptance gates. Large source/intermediate images
are retained privately, not included in the public app.

## Private acceptance and public deployment

`import-monk-viewpoints.mjs` validates the original source, approved camera,
formal jobs, actual source-pixel audit and visual-review evidence locally.
`project-monk-public-runtime.mjs` then checks that accepted inventory against
independent final-review pins and creates a strict portable manifest. Original
production manifests and evidence are preserved unchanged in private storage.

The public receipt records separate original-manifest, public-manifest byte,
public-manifest canonical and source-pixel-audit hashes. Public CI needs only
the public bundle: it checks the exact schema, approved visual parameters and
all 35 image assets, their byte counts, hashes, dimensions and formats. Public
unit tests use explicitly synthetic fixtures for private-proof logic; they do
not represent another execution of the private source-render acceptance.

### Depth-probe raster convention

Formal Monk probes select a texel with Python nearest-even rounding. Runtime
`hitAt` uses floor after the camera matrix transform. An input exactly on a
texel boundary can land one texel to the left due to matrix floating-point
roundoff. The reading-table supplementary far probe exposed this difference
on a sloping arcade surface; the original failing check is retained privately.

Acceptance now inverse-maps the formally selected texel's center to native
coordinates at each depth resolution, verifies that actual `hitAt` selects
that exact texel, and compares with the unchanged formal Z and 0.025 m limit.
The original probe coordinates are retained alongside verification coordinates.
This changes only test sampling: user click-to-focus, source assets and default
focus remain unchanged. Boundary perturbations, resolution changes and
nearest-even half ties have dedicated unit coverage.

## Complete formal delivery

All three approved viewpoints now have seven source-rendered positions and
five matching layers each: 105 runtime images in total. Independent comparisons
checked every delivered pixel against the corresponding formal source data;
all three full-pixel audits passed. The colonnade's explicitly documented center
recovery remains the sole recovery exception. The other captures completed
through the ordinary guarded path.

Native default focus is 5.25 m (colonnade), 1.89 m (reading table) and 5.56 m
(courtyard), with physical EV 8 for all three. Their native focal lengths are
28, 32 and 26 mm. Existing ten-scene entries and their display behavior remain.

The complete local unit run passed 444 tests, with the optional ExifTool check
skipped because that executable was absent. Full asset/runtime audits and the
production build passed. The three new real-browser scene tests then passed
in the desktop's native Chromium environment, retaining 21 seven-position
screenshots and three 2048-pixel PNG exports with capture metadata. An earlier
sandbox process-launch failure is retained as environment evidence, not
represented as a browser pass. Final repository CI and deployment are recorded
by the workflow attached to the publication commit.
