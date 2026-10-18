# CameraSimulator cloud handoff

Repository: https://github.com/BW1145/CameraSimulator — branch `fix/photography-quality`. Use the commit SHA reported with this checkpoint, then verify `git rev-parse HEAD`. The original developer branch/worktree has not been used for these repairs. Do not merge or publish automatically.

## Continue without this PC

All runtime scene packs, original demonstration images, the locally authored fan, its room HDR probe, build scripts, tests and dependency lock are included in Git. A clean checkout needs no file copied from the local PC to build, test or continue browser-side work. Large original Blender inputs and intermediate HDR/EXR captures are excluded; they are only needed to regenerate scene assets and can be fetched from the official URLs below. No private configuration, credentials, game assemblies or other project files are dependencies of this camera repository.

```sh
git clone --branch fix/photography-quality https://github.com/BW1145/CameraSimulator.git
cd CameraSimulator
npm ci
npm test
npm run audit:assets
node tools/audit-scene-plates.mjs public/scenes/barbershop-plates public/scenes/classroom-plates public/scenes/kitchen-plates public/scenes/apartment-plates
npm run build
npm run preview -- --port 8002 --strictPort
# In a second shell, after preview is ready:
PW_BASE_URL=http://127.0.0.1:8002 npm run test:browser
```

The browser-test prehook rebuilds production output. Without `PW_BASE_URL`, Playwright starts `npm run preview` on port8000; it does not use Vite dev or silently reuse an unrelated server. Set `PW_CHANNEL=chrome` only if Chrome is installed; otherwise run `npx playwright install --with-deps chromium`. CI uses the software WebGL flags already in `playwright.config.js`. A cloud environment must actually provide WebGL2/half-float support; passing calculations alone is not graphical acceptance. The local preview URL stops working after PC shutdown; restart it in the cloud checkout.

## Versions

Local verified runtime: Node25.2.1, npm11.6.2, Chrome155, Blender4.5.14 LTS (`62c1db4208e8`, 2026-09-14). Node24 is used by CI. Locked direct packages: Three0.186.1, Vite8.3.4, Playwright1.64.1, sharp0.35.5, glTF Transform4.5.1, meshoptimizer1.3.0. The lock, rather than the caret ranges, is authoritative. Package-lock SHA-256: `3072f44f709dc2882b25c3b08da1970eb0d2f782a1c31876d3d79845f939bffe`.

Blender is unnecessary for normal build/browser development. For regeneration, use the official [Blender4.5 release directory](https://download.blender.org/release/Blender4.5/). The checked Linux archive is [blender-4.5.14-linux-x64.tar.xz](https://download.blender.org/release/Blender4.5/blender-4.5.14-linux-x64.tar.xz), SHA-256 `9ba871ff2ecd36526b77432745980b7e6664ecd0c7ca11c48849073dcfe06da3`; verify against the official [checksum file](https://download.blender.org/release/Blender4.5/blender-4.5.14.sha256). Capture scripts use bundled `bpy`/`mathutils`/`bmesh` and Node packages already in the lock. One Cycles process at a time was used on an RTX4060; CPU-only cloud regeneration is possible but slower.

## Recoverable official source inputs

All four URLs returned HTTP200 with matching file lengths during this checkpoint. Preserve licenses and attribution in `public/ASSETS.md`.

| Input | Official URL | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Barbershop (`barber.blend`) | [Agent327 source](https://svn.blender.org/svnroot/bf-blender/trunk/lib/benchmarks/cycles/barbershop_interior/barbershop_interior.blend) | 287574804 | `95972b56180462cac47ec82f3a755bd9111ec18ca37a6196a319c013db994130` |
| Classroom ZIP | [classroom.zip](https://download.blender.org/demo/test/classroom.zip) | 70279690 | `0f0ecc58d45f12b2f4272a53e2d8e69135518e16e956b118f10c20d8dcfdf5e6` |
| Kitchen (`kitchen.blend`) | [Blender3.5 splash source](https://download.blender.org/demo/splash/blender-3.5-splash.blend) | 7685702 | `5f27c41cf828ca15ffd06fc3ad3d971343f6af4a29828c834252229a26dce395` |
| Apartment (`flat.blend`) | [Italian Flat source](https://download.blender.org/demo/cycles/flat-archiviz.blend) | 367972724 | `0027fcbd73411cce7f49b3d86c22c03d18980e22641083da9d8ba82d9fc94e25` |

Extract the entire Classroom ZIP, preserving linked libraries and image paths. Its `classroom/classroom.blend` member is 32045332 bytes, SHA-256 `5c526ea3f280566e80253673c9955640527cd0f247ea41b1742620b5bc39f7a4` (the source hash in the scene manifest).

## Capture contract

Never save source `.blend` files. Run Blender with `--background --disable-autoexec`; outputs belong in a separate build-capture directory. `tools/capture-scene-pack.py` removes source camera animation/constraints/scale from the derived capture camera and records actual matrices, source SHA and explicit derivations.

| Scene | Source camera | Base settings and derivations | Lazy radiance / axial-Z width |
| --- | --- | --- | --- |
| Barbershop | `Camera` | 2560px,32 samples; fixed near1.1m; seven ±30cm X/Z,±20cm Y | 5120 / 2560 |
| Classroom | `renderCam` | 2560px,32 samples; `--back-distance .1`; normalize source camera scale0.64051 | 4096 / 2048 |
| Kitchen | `CAM-wide` | 2560px,32 samples; `--perspective-focal 90 --extend-ground Plane --ground-scale 32 --far 1000`; source camera was orthographic, derived camera is genuinely perspective | 3072 / 1536 |
| Apartment | `Cam Living` | 2560px,32 samples; `--fixed-world-clip`; source near4m becomes front3.7/back4.3; source lens shift retained | 4096 / 2048 |

Example base command (substitute an official source path and output directory):

```sh
blender --background --disable-autoexec source.blend --python tools/capture-scene-pack.py -- --camera Camera --output captures/barbershop --width 2560 --samples 32
node tools/package-scene-pack.mjs captures/barbershop public/scenes/barbershop-plates barbershop "Agent327 Barbershop" "Blender Foundation / Blender Studio — CC BY"
```

Generate detail with the same camera/derivations, a separate output directory and `--radiance-only`; package using `tools/package-scene-layer.mjs detail`. Generate matching higher-resolution Z with `capture-scene-detail-depth.py --rig <base/viewfield.json> --camera <name> --width <Zwidth> --output <detail-depth-directory>`, then `package-scene-detail-depth.mjs`. Both layer packagers reject source/camera mismatches. Use `capture-scene-flash.py` in a directory containing the matching `viewfield.json`, width1280,32 samples, then `package-scene-layer.mjs flash`. Check each layer’s radiance/visual output before accepting it. Flash reference energy and duration are in the manifest; clipped-camera source scenes require a declared scene-local emitter offset.

The authored tabletop fan is `src/desk-fan.js` (MIT). Its placement and bounded lights are in `subjects.json`; `fan-room.hdr` (CC BY source scene) is tracked. Regenerate that probe with `tools/capture-subject-probe.py --output <file> --position 3.8 1.2515531 -6.95`. No unavailable leocb modified Blender/fan mesh is required or claimed.

## Current design and acceptance boundary

The human approved the source-rendered background route and asked to continue the project. Seven actual camera captures replace continuous room navigation in the quality path; zoom/drag reframing is distinct from those real position changes. Core optical/exposure/focus logic is shared by all scenes. `/?renderer=gltf` retains the earlier full-geometry path; `/?subject=none&view=source` isolates background image/depth without lens blur/noise.

Known approximations remain explicit: single source Z cannot reconstruct hidden/reflected virtual depths; extreme crops/blur and thin edges have finite sampling limits; local fan contact/direct light is approximate; source cutaway cameras use declared scene-local flash positions. The apartment uses a valid-domain inset and true53mm minimum to keep source cutaway gaps outside the delivered frame. Lazy color and higher-resolution depth replace each other atomically, with LRU eviction around a160MiB GPU/depth estimate; retained CPU half-float data adds RAM. Actual low-end/physical phone performance has not been measured.

Use [the latest visual review](visual-review/FINAL.md) and actual screenshots when judging delivery. Historical `PLATES.md`, `FAN.md` and the first `QUALITY.md` describe earlier stages and their then-unfinished items. Calculation/browser test counts are coverage evidence, not a substitute for inspecting the photographs. Do not contact the original developer, merge a PR or publish the site without further user authorization.

## Checkpoint status and NEXT

All four base packs have seven real perspective positions and seven valid static flash layers. No original raw source is needed to run them. Barbershop has seven 5120px detail/2560px Z pairs. Classroom has seven 4096px detail/2048px Z pairs. Kitchen and apartment each have their center detail/Z pair (3072/1536 and 4096/2048); their six non-center positions use complete base image/Z pairs, not missing textures. Read the delivered manifest to confirm the per-position inventory.

Next, regenerate the remaining six kitchen and six apartment detail/Z pairs using [the asset pipeline](PHOTOGRAPHIC_ASSET_PIPELINE.md), matching source SHA, camera, clipping, lens shift and kitchen ground derivative. Package color and Z together, serialize each manifest writer, rerun audits, build and review actual telephoto/blur screenshots. Keep apartment minimumFocal53 and reframeInset0.095. Do not overwrite the current valid flash layers while adding detail. The kitchen's far studio ground exceeds the 64m Z encoding ceiling; document this saturation and preserve the roughly9–20m subject depths.

Then check actual low-end/physical phones and the target cloud WebGL implementation, including first-load memory and animated latency. The local machine's headless Chrome results do not establish those performance claims. Inspect extreme blur/thin edges and reflected surfaces within the declared single-depth limitations. Keep the large viewfinder, four primary sliders and collapsed advanced controls while refining the teaching experience.

This checkpoint is a runnable, reviewable continuation stage, with the latest source and licensed runtime assets in Git. It is not an automatic merge, public deployment, or a claim of unrestricted continuous room movement. The final message pins the pushed SHA and records the actual completed checks.
