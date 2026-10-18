# Reproducing photographic assets

All scripts run Blender headlessly with `--disable-autoexec`. Original Blender files are read only; cameras, light groups and source derivatives exist only in the render process. Use one Cycles process at a time. Source identities and actual camera matrices are recorded in the raw reports and checked when packaging optional layers.

## Capture

Run Blender with the original source file, then `--python tools/capture-scene-pack.py --` and these scene-specific arguments. `OUT` is a temporary raw output directory, not a public pack directory.

| Scene | Camera and source-specific arguments | Base width / Z | Detail width / Z |
| --- | --- | --- | --- |
| Classroom | `--camera renderCam --back-distance .1` | 2560 / 1280 | 4096 / 2048 |
| Kitchen | `--camera CAM-wide --perspective-focal 90 --extend-ground Plane --ground-scale 32 --far 1000` | 2560 / 1280 | 3072 / 1536 |
| Apartment | `--camera "Cam Living" --fixed-world-clip` | 2560 / 1280 | 4096 / 2048 |

Base arguments: `--output OUT --width 2560 --samples 32 --depth-width 1280`. Detail arguments: `--output DETAIL_OUT --width DETAIL_WIDTH --samples 32 --depth-width DETAIL_Z_WIDTH --detail-depth`. `--views center` or a comma-separated subset supports incremental capture; reports merge completed view IDs. `--reuse` skips existing raw files and should only be used with an unchanged source and capture recipe.

The source SHA-256 and scene camera are recorded in `viewfield.json`. Each view has its real camera-local offset, world camera matrix, projection, near plane and independently rendered HDR file. The matching axial-Z report is `detail-depth.json` for detail captures. `tools/capture-scene-detail-depth.py --rig RIG --output OUT --camera NAME --width N` can reproduce only Z from an existing rig. This was used for the existing barbershop pack's 2560 px high-resolution Z; its source camera near remains 1.1 m.

## Flash

Use `tools/capture-scene-flash.py` in a raw directory containing the exact base `viewfield.json`, with `--output OUT --camera NAME --width 1280 --samples 32`. This applies the matching kitchen derivative and exact per-view near planes. A Cycles light group isolates added-lamp radiance while all source materials and ambient lights remain enabled. It avoids subtracting two noisy ambient renders.

The 0.08 m area lamp has reference energy 1000 W and reference duration 0.01 s. Classroom and kitchen use `--flash-forward 0`; barbershop uses `1.5`, apartment `4.4`, to emit beyond source cutaway walls. These last two are explicitly recorded scene-local fill offsets. The capture writes actual camera matrices and lamp positions in Three.js Y-up coordinates. Before rendering a view it updates the dependency graph after assigning both transforms; lamp placement must never be read from a stale camera matrix.

## Package and verify

```
node tools/package-scene-pack.mjs RAW_OUT PUBLIC_PACK
node tools/package-scene-layer.mjs flash FLASH_RAW PUBLIC_PACK
node tools/package-scene-layer.mjs detail DETAIL_RAW PUBLIC_PACK
node tools/package-scene-detail-depth.mjs DETAIL_RAW PUBLIC_PACK
node tools/audit-scene-plates.mjs PUBLIC_PACK
node tools/audit-scene-detail.mjs DETAIL_RAW PUBLIC_PACK
```

Check the argument header of each script before running; the base packager also takes its scene description arguments. Do not regenerate an existing base manifest to add optional layers. Optional packagers read and preserve top-level runtime fields such as apartment `minimumFocal: 53` and `reframeInset: 0.095`. Serialize writers to each manifest. Package detail radiance and detail depth together before accepting an optional view.

The layer packager checks source SHA, camera matrix, lens/sensor, near plane and flash position as appropriate. Every layer uses its own measured log range, with recorded source maximum and clamped-channel count. `tools/inspect-radiance-layer.mjs` reports actual raw extrema, mean luminance, nonzero coverage and values above HalfFloat 65504. `tools/audit-scene-plates.mjs` checks seven distinct radiance/depth views and physical offsets, catching a camera placed entirely inside a wall. These checks complement visual inspection of source previews and production browser screenshots.

For continuation, read delivered `manifest.views`: a usable optional view has both `detailFile` and `detailDepth`. Missing optional views retain the base radiance/Z pair. Asset licensing and scene-specific adaptations are documented in `public/ASSETS.md` and each pack's `SOURCE.md`.

## Delivered layer inventory, 18 October 2026

| Scene | Base radiance/Z | Flash | Optional detail radiance/Z | Remaining optional views |
| --- | --- | --- | --- | --- |
| Barbershop | All 7, 2560 / 1280 | All 7, 1280 | All 7, 5120 / 2560 | None |
| Classroom | All 7, 2560 / 1280 | All 7, 1280 | All 7, 4096 / 2048 | None |
| Kitchen | All 7, 2560 / 1280 | All 7, 1280 | All 7, 3072 / 1536 | None |
| Apartment | All 7, 2560 / 1280 | All 7, 1280 | All 7, 4096 / 2048 | None |

Widths are pixels, radiance followed by Z. All four scenes now have complete seven-view detail radiance/Z pairs, with no remaining optional view captures. To reproduce a subset, pass `--views left,right,up,down,front,back` (or the required IDs) to the matching recipe, then serialize the detail and detail-depth packagers. Do not overwrite its base manifest. A `.pause-capture` marker in the raw output directory exits before Cycles starts; remove it only when resuming the queue. The local raw directories for this run are under the task's sibling `qa-evidence` directory and are not included in the application repository.

The optional-detail auditor checks every delivered radiance/depth pixel against its raw source encoding, requires seven distinct pairs, verifies source identity, camera/clip transforms and file dimensions/bytes, and reports subpixel projection differences caused by integer resolution rounding. With the optional preserved-baseline JSON argument it also verifies all original base/flash files and composition metadata remain unchanged.
