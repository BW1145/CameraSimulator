# Approved photographic viewpoints — 24 October 2026

## Current local integration

Fresh branch `feature/photography-final-20261024` starts directly from the remotely
rechecked main commit `c21f497f930978ab84417f936283eb1586e1b56e`. It imports the final
approved classroom files without inheriting the retired intermediate image commits.
The complete old classroom branches/worktrees remain available locally.

The three classroom views and two kitchen views are in the original selector;
there are no new panels. All four original GLB and plate directories are unchanged.
The optional `?renderer=gltf` diagnostic retains exactly its four original scenes.
The approved apartment-armchair render is not yet delivered or included; no preview
or low-resolution substitute is installed in its place.

| Added view | Native full-frame focal | Default focus | Runtime files |
| --- | ---: | ---: | ---: |
| Student Seat / 学生座位 | 20 mm | 0.45 m | 36 |
| Window Backlight / 窗边逆光 | 23.4375 mm | 1.6 m | 36 |
| Teacher View / 讲台视角 | 23.625 mm | 4 m | 36 |
| Pastry Counter / 糕点台面 | 35 mm | 1.45 m | 36 |
| Tea Table / 厨房茶桌 | 43 mm | 1 m | 36 |

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

- Node tests: **169 passed, 1 skipped, 0 failed** (170 total). Skip: existing
  independent ExifTool executable unavailable; metadata parser tests run.
- Kitchen read-only gate and link import: passed; no image re-encoding.
- Both approved native kitchen previews and formal center review images were
  visually compared; approved composition retained with improved source detail.
- Nine-scene aggregate real-depth math, all nine position audits and normal Vite
  compilation pass. The linked build verifies six compiler outputs and 713 static
  files (639,395,742 bytes); no static-image duplication. Browser acceptance is
  pending in authorized CI and must be repeated for the complete final scene set.
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
