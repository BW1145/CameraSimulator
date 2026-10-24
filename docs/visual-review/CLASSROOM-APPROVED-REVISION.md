# Approved classroom composition revision (v2)

## Status

**Complete local working-tree integration and verification (2026-10-24); not published.**
All 70 revised captures are complete. The two frozen packs (72 files,
130,134,471 bytes) passed the read-only source/hash/format/registration gate and
were imported on `feature/classroom-approved-views`. The teacher's 36 runtime
files and all four original scene directories remain byte-identical to v1.
The selector now calls the revised `classroom-desk` view **学生座位 / Student Seat**;
no new controls were added.

The user cancelled the character experiment. No character files, derived source
hashes or metadata are admitted. Independent source/preview bindings are recorded
in `classroom-v2-approved-inputs.json`; import and CI check these rather than merely
trusting a self-consistent packaging receipt. Both approved preview images and
actual capture projections were independently checked.

Preparatory code is committed through `a9bcecfa722f35ab23b521d9c5a464d7ebb02559`,
based on the complete v1 integration `817e28d`. **Final revised assets and integration
changes are intentionally not committed yet**: additional Git binary objects are
paused to reserve disk space for the next authorized render. Original v1 source,
runtime packs, worktree and archived receipt remain available. No push, merge,
deployment or local browser execution has occurred.

## Approved framing, not the previous overscan crop

The approved unoccupied seated composition uses the v7 camera on the v6 styled source (13.8°
downward pitch, three books and two pens); the window composition uses the approved
10 cm left shift. The teacher view retains its original 36 runtime files exactly.
The new runtime manifests must identify their own exact derived source hashes;
they must not inherit the old global hash just because they depict the same room.

| View | Native source lens, 32 mm sensor | Default full-frame focal | Extra overscan source lens |
| --- | ---: | ---: | ---: |
| Seated desk | 17.7777778 mm | 20 mm | 14.8148148 mm |
| Window | 20.8333333 mm | 23.4375 mm | 17.3611111 mm |

The complete approved preview becomes the native composition. Every layer and
position is actually rendered 1.2× wider; the unchanged renderer's default native
frame then samples the central 5/6 of that wider capture. Merely lowering the
focal length to display an old capture edge-to-edge would exhaust rotation margin
and can expose black borders. No such relabelling or zero-padding is accepted.

In the accepted delivery, the approved preview SHA, capture-report SHA, prior source SHA
and exact pose are bound independently to the new rig. New sources may add native camera objects;
the preview source hash remains the camera-only derivation's recorded parent.
Full-sensor/native crop/zero rotation are the approved default state. Intentional
user crop, sensor or focal changes are not claimed to preserve that composition.
The fractional window focal is retained by load/reset, renderer math and EXIF;
only its UI text rounds to one decimal place.

## Three different resolution products

- Formal center source: **6144×3456, 256 samples**, actual extra overscan.
- Runtime center detail: **5120×2880**, linear area-downsample of that whole EXR;
  runtime base is derived from the same source. Neither runtime map is the native
  JPEG crop, because the renderer needs the photographed peripheral rays.
- User native photograph: center rectangle `(512, 288, 5120, 2880)` of the 6144
  capture, without scaling. It is not a substitute for a runtime overscan map.

The 6144 centers use a checkpointed raw render followed by independent bounded-
memory OpenImageDenoise HIGH/ACCURATE, retaining the full frame and sample count.
The audit binds all five renderer components, the raw capture source/sample/hash,
the denoiser input/output and actual runtime EXR, and matching metadata copies.
It rejects manual tiling, incomplete raw capture or reduced-quality processing.

The desk default focus is **0.45 m**, verified against formal 2048-wide Z at
the approved blue-cover center: native preview (770,480), capture UV
(0.5846354167,0.6388888889), depth pixel (1197,736), axial Z 0.4538199 m
(5×5 range 0.4517327–0.4559268 m). The previous 0.39 m sample was the nearer
book/table foreground, not the cover center; it is not used as the default target.
Final runtime auditing checks both actual base/detail depth PNGs with the real
renderer hit-test and requires default focus within 0.025 m of the cover center. Depth units, flash energy, registered capture matrices,
seven real positions and existing loading budgets remain mandatory.

## Import and history gate

```sh
node tools/import-classroom-revision.mjs /path/to/v2/outputs/delivery.json
node tools/import-classroom-revision.mjs /path/to/v2/outputs/delivery.json --copy
# Explicit same-filesystem low-disk alternative (used for this local integration):
node tools/import-classroom-revision.mjs /path/to/v2/outputs/delivery.json --link
```

Read-only audit is the default. Version 2 delivery contains exactly desk/window,
with per-rig sources and frozen `approvedComposition` metadata. The importer also
verifies actual approved-preview bytes, actual source/report hashes, native FOV
and unchanged camera pose. The existing v1 receipt and all three live packs must
pass before any replacement is staged.

`--copy` copies fewer than 250 MiB of new runtime assets and validates them again,
then replaces whole directories by reversible renames. It never writes old image
files in place, so hardlinks to the original frozen worktree are safe. Any rename
failure rolls back the successful moves; an incomplete rollback retains backups
and reports their exact path instead of deleting recoverable evidence.

`--link` has the same staging/validation/rename/rollback contract. Only the 70
immutable image files share frozen production inodes; the two manifests are
independent copies. There is no cross-filesystem copying fallback. Do not edit
linked production/public/dist image data in place.

The original receipt is saved byte-for-byte as
`classroom-viewpoints-v1-delivery.json`; its SHA is linked from the new receipt.
CI rechecks that the teacher's file hashes and rig match that archived receipt.
No raw EXR/source copy is needed. No low-resolution placeholder can pass import.

## Completed verification and remaining boundary

- **125 passed, 1 skipped, 0 failed** (`npm test`, 126 tests). The skip is the
  existing unavailable independent ExifTool check; JPEG/PNG metadata parser tests pass.
- Aggregate asset audit passes for all seven scenes and all 108 classroom files.
  All seven scene-position audits pass. Independent source pins, exact approved
  capture pose, real extra overscan, staged raw/OIDN processing chain, and formal
  focus evidence remain mandatory.
- Actual runtime math checks 42 delivered depth maps, 126 general focus cases,
  two additional approved-cover hit tests, 63 fixed-energy flash cases, and six
  JPEG/PNG metadata carriers. Desk base/detail cover hits are 0.4531319 / 0.4541085 m,
  within 0.025 m of the 0.45 m default. Window 1.6 m is supported by formal chair
  back/seat/tabletop Z evidence, not the earlier QC sample.
- Native source overviews, detailed subject crops, all 28 revised detail/flash
  contact images and all 28 delivered base/detail depth contact images were
  visually reviewed. Depth silhouettes and base/detail correspondence are intact;
  the nearby book/table is blue on the 0–8 m depth scale, not missing depth.
- Normal Vite compilation succeeds with `copyPublicDir:false`; static assets are
  hardlinked from the exact shared ordinary-build list. All six compiler outputs
  and 641 static files were verified. After the attribution-only atomic relink,
  554,337,192 static bytes avoid duplication. The existing large-JS-chunk advisory
  remains. This does not change the normal `npm run build` command used by CI.
- All 72 new source-pack/public/dist file hashes and lengths match. Teacher and
  original four scenes are unchanged. All three classroom packs total 210,274,677
  bytes, including 209,993,119 image bytes; the revised two packs contain
  129,914,208 image bytes. Final Git object creation is still deferred.

The approved JPEGs and background-only source previews have no simulated depth
of field. Default simulator photographs intentionally retain the original
teaching DOF and freely adjustable focus. Complete default framing is guaranteed
by the native camera contract; identical everywhere-sharp rendering is not.

Tests cover fractional 20/23.4375 mm native rays, false/cropped overscan rejection,
source dimensions, teacher history, source pins, default focus, hardlink file
lists, collision/symlink rejection, and transactional rollback. These are Node,
asset and source-image checks, **not browser acceptance**: WebGL, actual UI scene
switches, download clicks and network/lazy-load races remain pending in an
explicitly authorized browser/CI environment. The earlier local browser denial
must not be retried or bypassed. GitHub writes are stopped; no remote CI or
publication is implied.

See `classroom-v2-verification.json` for machine-readable results. Local delivery
inventory and exact build records are in `.assets-cache/`; they are not runtime
assets and are not staged for Git.
