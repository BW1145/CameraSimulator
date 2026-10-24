# Approved photographic viewpoints — 24 October 2026

## Current local integration

Fresh branch `feature/photography-final-20261024` starts directly from the remotely
rechecked main commit `c21f497f930978ab84417f936283eb1586e1b56e`. It imports the final
approved classroom files without inheriting the retired intermediate image commits.
The complete old classroom branches/worktrees remain available locally.

The three classroom views, two kitchen views and apartment armchair are in the original selector;
there are no new panels. All four original GLB and plate directories are unchanged.
The optional `?renderer=gltf` diagnostic retains exactly its four original scenes.
All six additions use complete frozen formal packs; no preview or low-resolution
substitute is installed in the runtime.

| Added view | Native full-frame focal | Default focus | Runtime files |
| --- | ---: | ---: | ---: |
| Student Seat / 学生座位 | 20 mm | 0.45 m | 36 |
| Window Backlight / 窗边逆光 | 23.4375 mm | 1.6 m | 36 |
| Teacher View / 讲台视角 | 23.625 mm | 4 m | 36 |
| Pastry Counter / 糕点台面 | 35 mm | 1.45 m | 36 |
| Tea Table / 厨房茶桌 | 43 mm | 1 m | 36 |
| Apartment — Armchair / 公寓单椅 | 40 mm | 3.9 m | 36 |

Native focal length, bounds, near/far and focus/exposure defaults come from each
frozen manifest. Defaults preserve the entire approved native composition with
real additional capture overscan. Source review JPEGs are pinhole; normal simulator
DOF remains enabled and users remain free to adjust focus. Kitchen focus samples
select opaque teaching subjects, not refracted optical paths through glass.

## Provenance and audit boundary

`classroom-viewpoints-delivery.json` and the byte-identical archived v1 receipt
retain classroom history. Some original intermediate/noisy render pixels were
subsequently retired under a separate user-approved cleanup; their historical
hash/processing evidence is not a claim that every raw file is still online.
Current source files, delivered runtime packs and approved center imagery remain.

Kitchen receipts are in `derived-viewpoints-delivery.json`, with independently
reviewed source/preview/report/spec/manifest pins in
`derived-viewpoints-approved-inputs.json`. They are Nicole Morena's CC BY-SA source,
not CC0. New cameras preserve the original kitchen's geometry/materials/lighting.
The source staged-center chain binds 6144×3456 / 256-sample raw render, bounded
full-frame OIDN HIGH/ACCURATE and final whole-capture runtime maps.

The two kitchen packs contain 72 files / 85,057,766 bytes. All actual file hashes,
formats/dimensions, seven poses, layer registration, source/preview and formal focus
Z were verified before transactional link import. Only the 70 immutable image
files share production inodes; the two manifests are independent. Retained
non-center raw EXRs were not decoded or copied by this integration.

HDR encodings remain dynamic. Tea flash has source radiance above 25,000 and an
encoding maximum of EV15; 64 m is only the axial-depth transport range. Each
actual delivered view peak must fit its effective encoding. A shared base
`sourceMaximumRadiance` may describe the original 32-sample encoding selection;
the subsequently upgraded center has its own measured peak and source evidence.
Neither is allowed to hide clipped delivered channels.

## Verification status

- Node tests: **180 passed, 1 skipped, 0 failed** (181 total). Skip: existing
  independent ExifTool executable unavailable; metadata parser tests run.
- Kitchen read-only gate and link import: passed; no image re-encoding.
- Both approved native kitchen previews and formal center review images were
  visually compared; approved composition retained with improved source detail.
- Nine-scene aggregate real-depth math, all nine position audits and normal Vite
  compilation pass. The linked build verifies six compiler outputs and 713 static
  files (639,395,742 bytes); no static-image duplication.
- Authorized GitHub CI for the nine-scene development commit
  `41f0c896a525052396e3815316c074e11044137e` passed all three shards:
  **67 browser tests (24 + 22 + 21), zero failures**, plus the Node and asset
  checks above. [Run 40089703300](https://github.com/BW1145/CameraSimulator/actions/runs/40089703300).
  All five new views passed actual seven-position navigation, default
  focus/fractional focal/EV, autofocus, flash, JPEG metadata and scene-switch race
  checks. Five real 2048×1152 browser-exported JPEGs were downloaded from artifact
  `12558871096`, ZIP SHA-256
  `69a852b34ce9bc5da2046fb04194b616074e1ea8ffb1de03250a0e67ff898030`,
  and visually reviewed. These captures use flash = 1; they are not no-flash
  baseline page screenshots. Final CI will also retain default-page and seven-view
  screenshots and must be repeated after the apartment is fully integrated.
- The development workflow's deploy job was **skipped** as intended. The live
  site is not this checkpoint.
- No Git objects containing final binary assets have been written locally.
- The user explicitly authorized the runtime images and code in the public
  `BW1145/CameraSimulator` repository. The initial upload gate was resolved by
  that specific confirmation and the first content-addressed asset upload passed.
  This snapshot is development-branch work, not a production release. No raw
  source/intermediate render files are uploaded. Required CI must pass for the
  exact complete final commit before merge/deploy, followed by checking the live
  release identity and scene assets.

Normal CI uses `npm test`, `npm run audit:assets`, the full scene-position audit
and browser tests. The explicit low-disk local build uses
`node tools/build-linked-assets.mjs`: normal compilation plus byte-identical static
hardlinks from the same ordinary-build list. Linked data must never be edited in
place. Local evidence/logs are in `.assets-cache/`, outside runtime and Git.


## Final apartment local gate

The complete 35-capture apartment delivery contains 36 files / 61,012,561 bytes,
receipt SHA-256 `80fba6c46623959274d9c8d725aa2428f14d9553e06a71436e6f0e2cde136187`.
All source/preview/receipt hashes, real runtime dimensions/poses/layer registration,
five actual geometry-sharing proof reports and 35 actual completion/validation
receipts passed the strict gate. The acceptance summary is the renderer's actual
`final-review/owner-final-review.json` (packFiles/packBytes), not an invented
`final-verification.json`. Exactly 35 images were hardlinked and the manifest
independently copied; both prior kitchen receipts remained unchanged.

Formal gray-pillow axial Z is 3.913690567 m. The apartment's source probe used
nearest-pixel rounding; a later explicitly labelled read-only replay reproduced
all four original EXR samples and 7×7 ROIs exactly. Runtime floor/interpolated
`hitAt` was separately checked against both delivered PNG resolutions within
0.025 m; default focus 3.9 m agrees with the intended pillow subject.

All ten scene asset/depth/position audits and the normal linked Vite build passed
locally. Final ten-scene browser CI, page screenshot review and deployment are
still pending at this documentation checkpoint; the earlier nine-scene CI above
is not evidence that the apartment has already run in a browser.
