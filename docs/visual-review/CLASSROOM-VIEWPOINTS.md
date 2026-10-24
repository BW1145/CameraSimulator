# Classroom viewpoints: version 1 integration and acceptance

> Historical v1 evidence (commit `817e28d`). The approved student-seat/window
> revision is documented in [CLASSROOM-APPROVED-REVISION.md](CLASSROOM-APPROVED-REVISION.md).
> Its archived receipt is `classroom-viewpoints-v1-delivery.json`; the active
> `classroom-viewpoints-delivery.json` is now version 2.

## Version 1 status

**Complete local integration; not published.** All 105 formal captures are finished;
the three frozen runtime packs and their SHA-256 delivery receipt are imported.
All local asset, math, unit and build checks pass. Browser acceptance remains
pending in authorized CI; it is not implied by these checks. The existing four
scenes (both GLB and plate directories) have no changes relative to `c21f497`.

Implementation is isolated on `feature/classroom-viewpoints`, based on main
`c21f497f930978ab84417f936283eb1586e1b56e`. No main edit, push or deployment is part
of this integration.

## Runtime changes

- The same selector contains `教室全景`, `课桌近景`, `窗边逆光`, `讲台视角`;
  no new panel or change to the large viewfinder.
- Original classroom panorama and GLB remain intact. The new source contains
  explicit book/pen copies and a camera-only sky, so assigning their camera pose
  to the old GLB would not reproduce the same shot. The optional `?renderer=gltf`
  diagnostic therefore lists only the four original geometry scenes.
- New focal length, clipping, physical offsets and rotation bounds come from
  the delivered manifest. The original bounded seven-position renderer, autofocus,
  magnifier, flash, photo collection and PNG/JPEG EXIF paths are reused.
- `defaults.focus` and `defaults.baseEV` are recorded by the packager, not invented
  in UI code. The delivered defaults are 0.9 m / 1.6 m / 4 m and EV calibration 8.
  The initial f/8, 1/4 s, ISO 100 setting is EV100 8. Scene changes continue to
  preserve the user's exposure choices; Reset restores the existing initial preset.

## Frozen source contract

Original Classroom, Christophe Seux, CC0:
`5c526ea3f280566e80253673c9955640527cd0f247ea41b1742620b5bc39f7a4`.

Derived source used for every new layer:
`3fdf721977489b19ea9ec975854ea25ff3304fcf9a7742938e9233afce59389d`.

| Pack | Source lens / full-frame reference | XYZ capture bounds (m) |
| --- | --- | --- |
| desk | 21.5 / 24.1875 mm | ±0.10 / ±0.08 / ±0.10 |
| window | 25 / 28.125 mm | ±0.20 / ±0.15 / ±0.20 |
| teacher | 21 / 23.625 mm | ±0.20 / ±0.15 / ±0.20 |

These are evidence summaries, not runtime overrides. Source sensor is 32×18 mm,
near/far 0.05/100 m. Capture lens is source lens / 1.2 (20% overscan). Axial depth
is in metres; RG PNG transport saturates at 64 m, while the original EXR preserves
the source sky sentinel. Flash is the isolated CameraFlash group, 1000 W × 0.01 s,
0.08 m emitter, exactly at each capture origin with no forward offset.

Each pack must contain 35 runtime images plus one manifest. Retired 32-sample
center-base provenance is marked `independentBaseCapture.delivered: false`; only
the 256-sample detail EXR is named by the delivered center `radianceCapture`. Center detail is
5120×2880 / 256 samples; center base is its scene-linear area-downsample to
2560×1440. Six neighbor detail/base captures are 4096×2304 / 2560×1440 at 32 samples.
Base/detail depth are 1280×720 / 2048×1152 at one sample. Flash is 1280×720 at
32 samples. Per-view quality is recorded, not falsely generalized to 256 samples.

## Import gate

The render worker alone packages and upgrades the images. The importer never
renders, upgrades or recompresses them. Use the worker's `outputs/delivery.json`
with the frozen `rig-config.json` in its parent directory:

```sh
node tools/import-classroom-viewpoints.mjs /path/to/production/outputs/delivery.json
node tools/import-classroom-viewpoints.mjs /path/to/production/outputs/delivery.json --copy
```

The first command is read-only. Both require all three complete receipts, exact
source hashes, reviewed Blender-to-Three poses, per-layer registration, depth/flash
contracts, formal quality, actual image formats/dimensions, all 108 file SHA-256s,
seven independent RGB/depth pairs, and existing byte budgets. Copy stages and
checks all packs before installation; it refuses existing destinations and rolls
back its own newly installed directories on failure. It saves a portable delivery receipt
with all file hashes and reviewed rig metadata for repeated CI audits. It does not
edit Git refs.

The general asset audit retains every original-scene GLB check. Only the three
explicit `plateOnly` entries use the new photographic contract instead.

## Checks against the complete delivery (2026-10-23)

- `npm test`: **95 passed, 1 skipped, 0 failed** (96 tests). The skip is the existing
  independent ExifTool test because ExifTool is not installed locally. The 23 new
  pure-Node checks pass, including rejection of preview dimensions/samples, wrong
  depth units/range, mismatched flash, incorrect reviewed camera and wrong source.
- `npm run audit:assets`: passed for all four original scenes and three new packs.
  The receipt gate checks every file's SHA-256, byte count, dimensions and contract
  against frozen camera rigs; existing GLB/asset requirements remain unchanged.
- `node tools/audit-scene-plates.mjs` with all seven pack directories: passed.
- `tools/verify-classroom-runtime.mjs` passes 126 focus checks using all 42 actual
  base/detail depth images, 63 fixed-energy flash/normalization checks, and six
  JPEG/PNG EXIF serialization checks using the actual renderer math and manifests.
  This is a Node-only numerical check, not WebGL, UI or photo-download acceptance.
- `npm run build`: passed; all 108 built runtime files match their delivery receipt.
  The existing large-JS-chunk advisory remains.
- Node syntax checks for new importer and browser specs; `git diff --check`: passed.
- Browser acceptance: **not run**. Earlier local browser execution was denied;
  no retry or workaround was attempted. The existing independent ExifTool test
  is the one local skip; ExifTool was not installed to conceal that limitation.
- The feature branch is added to the existing verification workflow's push trigger.
  Existing Pages artifact and deploy guards are still restricted to main pushes.
  No remote push, CI run, merge or deployment has been performed by this task.

## Formal center source review (2026-10-23)

All three actual 5120×2880 / 256-sample centers were independently inspected using
overviews and native-resolution detail crops. Desk books/pens, backlit window-side
chairs, and the downward teacher composition have resolved source detail with no
visible missing geometry or black capture borders. Source-image validation records
zero nonfinite or negative radiance channels. The review and original EXR/PNG hashes
are in `classroom-viewpoints-center-review.json`.

Default focus is supported by source depth: desk books are at 0.8798–0.9083 m
(default 0.9 m), the window-side teaching subject is at 1.6111 m (default 1.6 m),
and a middle-row chair is at 4.0826 m (default 4 m). Window/teacher depth samples
come from the exact same frozen pose QC Z, not from final-depth acceptance. All
formal PNGs use AgX with zero exposure; EV8 calibration and the existing EV100 8
initial camera preset give the same zero exposure adjustment. These source checks
do not replace visual acceptance of the simulator lens/flash output.

## Final image and delivery review

All three formal center images and native-resolution crops, all 21 formal detail
views, all 21 isolated flash views, and all 21 delivered depth images were visually
reviewed. No missing geometry, capture borders or camera cut-through was found.
Real foreground-chair occlusion in the desk-down view is retained. Black sky and
unlit objects in the isolated flash layer are expected, not missing base imagery.
The render worker reports zero all-pixel depth encoding mismatches/clamps and
per-layer registration errors no larger than 2.38e-7. Raw job reports and full
contact sheets remain outside the runtime packs in the production output archive.

The portable `classroom-viewpoints-delivery.json` records all 108 runtime file
hashes and frozen rig metadata. Import was performed once with `--copy`, after all
three packs passed; files were not upgraded, resampled or recompressed on import.

| Pack | Runtime image count | Image bytes | Including manifest |
| --- | ---: | ---: | ---: |
| classroom-desk | 35 | 76,140,388 | 76,201,951 |
| classroom-window | 35 | 56,928,500 | 56,990,084 |
| classroom-teacher | 35 | 80,078,911 | 80,140,206 |
| **Total** | **105** | **213,147,799** | **213,332,241** |

The largest individual image is `classroom-desk-plates/center-detail.webp`,
9,416,934 bytes. The new compressed image payload is approximately 203.27 MiB;
Git transfer size depends on object packing and which objects the remote has.

## Remaining authorized CI acceptance before publication

1. The parent may back up the exact local revision to `feature/classroom-viewpoints`
   and let the existing three-shard verification workflow run; pushing this branch
   cannot satisfy the unchanged main-only Pages publishing guards.
2. Run the existing browser suite plus `classroom-viewpoints.spec.js`. New cases
   cover all 21 real positions, metadata defaults, real flash JPEG capture/EXIF,
   delayed scene selection, original panorama return and GLB filtering.
3. Review actual full-frame default-focus/exposure and large-screen/mobile
   screenshots. Preserve actual photo downloads as evidence. These checks are
   pending, not replaced by the numerical EXIF carriers or source contact sheets.
4. No merge or deployment is authorized by this local integration handoff.
