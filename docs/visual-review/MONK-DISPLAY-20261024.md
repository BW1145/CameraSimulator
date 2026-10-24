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
node tools/capture-transport-reference.mjs --app-root . --out /tmp/transport-decoder-reference.json
python tools/generate-display-profile.py --config /path/to/Blender-4.5.14/colormanagement/config.ocio --transport-reference /tmp/transport-decoder-reference.json --out /tmp/monk-profile
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

At this documentation checkpoint local Node tests and the normal Vite compile
pass. GPU/browser acceptance remains pending the exact-commit development CI;
this document is not a claim that an unexecuted pixel test has passed. Formal
Monk pack/default-focus/13-scene acceptance and publication follow separately.
