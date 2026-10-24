# Camera Simulator

A photography teaching simulator with a large viewfinder, four primary sliders and immediate visual feedback. The interface is in Simplified Chinese. Based on [leocb’s Camera Simulator](https://github.com/leocb/CameraSimulator); the original fan demonstration remains available from the header.

Public site: [Photography Lab](https://bw1145.github.io/CameraSimulator/). The `main` workflow publishes the tested production artifact after all verification steps pass. The site's `release.json` records its commit and workflow run.

## Run and verify

Requires Node.js 22.12+ or 24+ and WebGL 2.

```sh
npm ci
npm test
npm run audit:assets
npm run build
npm run preview -- --port 8002 --strictPort
```

Open http://127.0.0.1:8002/. Serve the resulting `dist/` directory from a static host. Assets and decoder code are bundled locally. `npm start` is the development server; acceptance screenshots and browser checks use the production preview:

```sh
PW_BASE_URL=http://127.0.0.1:8002 PW_CHANNEL=chrome npm run test:browser
```

On PowerShell set those two environment variables with `$env:PW_BASE_URL` and `$env:PW_CHANNEL` before running the command. Omit `PW_CHANNEL` to use installed Playwright Chromium.

## Photograph a scene

Select the barbershop, classroom panorama, student seat, window backlight, teacher view, kitchen panorama, pastry counter, tea table or apartment in the existing scene selector. The additional viewpoints reuse their respective complete source rooms; they add no new control panels. Each photographic scene pack preserves the complete source Blender environment’s lighting, materials, glass and mirrors in source-rendered radiance images. Seven adjacent, actual perspective cameras provide the bounded shooting area. Direction buttons choose an actual captured position; dragging, focal length, sensor and aspect ratio reframe its image. This is a small camera rig, with scene-specific bounds, rather than room navigation or continuous synthetic parallax. The classroom’s backward position is 10cm to stay in front of its rear wall; other offsets are shown on the controls.

Aperture, shutter, ISO and white balance stay visible. Separate collapsible panels contain focus, composition, and exposure aids. Click the image to focus. AF-S locks distance; AF-C follows the actual selected world/object point. Composition includes focal length, native/3:2/16:9/2:3/square crops, full frame/APS-C, roll, thirds and view reset. Exposure aids include matrix/center/selected-point metering, compensation, flash, histogram, clipping stripes, level and local magnifier. M/A/S/P and Auto ISO display their actual resolved values in the sliders. Aperture f/1.4–22, shutter 1/8000–30s, ISO50–25600 and white balance 2000–10000K affect the photograph. The minimum focal length follows each scene’s photographed coverage; the maximum is 200mm.

The barbershop has a live, locally modeled tabletop fan. Its curved blades and chassis use the source room’s HDR probe and bounded direct lights. Turning and pausing the rotor lets the same phase demonstrate shutter changes. Other scenes retain a three-dimensional practice ball. The maximum temporal budget is 24 samples; short exposures also account for projected screen motion. Seconds-long shutters integrate complete cycles plus their weighted residual interval. Every temporal subject sample uses its own depth blur before radiance averaging. A flash adds one instantaneous pulse instead of blurring its contribution across the shutter interval.

PNG export renders a fresh 2048-pixel long-edge photograph, waits for requested high-resolution/flash layers, and omits guidance overlays. The local magnifier renders its own padded high-resolution crop rather than enlarging preview pixels; source detail, live subjects, lens blur and shutter integration share the photograph’s settings without changing its metering. Preview follows display density up to 2× within a 3.5MP budget. Static frames render on change; animation runs up to 30FPS and pauses in hidden tabs.

## Image and optical model

Scene packs contain source-linear radiance and axial camera-Z. Log2 WebP is a transport encoding only: each texel is decoded into linear half-float HDR before bilinear filtering or mipmap generation. Metering reads unexposed HDR through a separate floating-point target; AgX follows photographic exposure and relative white balance. ISO adds fine display noise. Only the selected initial view downloads; other positions, flash and higher-resolution radiance layers are requested as needed. All default-center photographs use 256-sample source renders; the six other positions retain their earlier captures. The barbershop center adds a subtle warm fill with a matching live-fan lighting probe. See [sharpness and capture evidence](docs/visual-review/SHARPNESS.md) for the exact scope. Late scene/position loads cannot replace the currently selected view, and failed assets offer retry.

Focus uses source depth and actual live-object ray hits. Barbershop mirrors have an additional source-scene optical-distance map for each of the seven positions: reflected path length determines click focus and lens blur, while physical depth still determines occlusion. The full-geometry renderer reconstructs virtual mirror distance from its live reflection camera and follows reflected object points in AF-C. Depth blur uses the thin-lens circle of confusion, depth-aware gathering and near-silhouette coverage. The radius limit scales with image resolution, so preview/export retain the same blur scale for the same composition. Hidden background, refractive glass paths, repeated mirror bounces and extreme thin-edge blur remain approximations. Native source clipping is retained; the apartment’s per-position near plane maintains its source world clipping plane. Source camera bounds have no collision simulation.

Flash layers are isolated Cycles light groups with source-scene shadows/reflections and 1000W × 0.01s reference energy. Their radiance is added before lens, exposure and display processing, with inverse shutter-duration scaling. Scene output is pre-exposed before HalfFloat intermediates and restored at the final exposure, preserving short-flash energy at 1/8000s. The barbershop and apartment source cameras sit behind cutaway walls: their flash emitters are moved 1.5m and 4.4m forward, explicitly recorded as scene-local fill positions. The local fan uses a matching point-light approximation. Its source HDR probe and area lights illuminate the metal; a live Fresnel-weighted, softened planar reflection and a shadow map connect it to the marble tabletop. A depth match restricts both receivers to the source surface. Reflection and shadow are included in the shutter integration region. The shadow key approximates the source counter area light; the local subject does not alter the room's baked global illumination. High-resolution layers improve telephoto detail but finite source resolution still limits extreme crops.

`/?subject=none&view=source` is a background-only diagnostic that disables depth blur and noise. `/?renderer=gltf` selects the retained full-geometry renderer and its wider translation controls. This diagnostic lists only the four original GLB scenes. The derived viewpoints are photographic-only: equivalent new camera mappings to the retained GLBs have not been validated, and the classroom source additionally contains foreground props and a camera-only sky absent from its old GLB. No duplicate or misleading GLB is supplied. It is useful for comparisons and retains the original optimized conversions; it does not replace the photographic quality path.

The full-geometry barbershop uses source-shader albedo and a denoised HDR atlas of static direct and indirect diffuse lighting. Ordinary camera movement keeps that illumination attached to the room geometry. The 17.83MiB geometry/material pack and 1.83MiB light atlas load only in the full-geometry path. Classroom, kitchen and apartment retain their previous real-time lighting. A 128px room probe supplies roughness-dependent environment reflections. Up to four actual world-space mirror planes render at 512px, including exports whose transforms were baked into vertices. A camera-mounted spot flash adds shadowed inverse-square illumination with fixed pulse energy; its shadow map renders when the flash is enabled. Source light/shadow are baked into the diffuse atlas. These are bounded raster approximations; the room probe and baked indirect light stay static when the practice object moves.

`src/lighting.js` owns room and tabletop lighting, `src/mirror-optics.js` owns live mirror geometry and virtual depth, and `src/plate-optics.js` supplies source-photo mirror distances. Scene changes release their render targets and shadow maps. The ambient meter samples one current instantaneous frame; shutter integration is reserved for the photograph. The moving integration region follows the rotor and its reflected/projected-shadow footprints. All effects share linear photographic exposure and add no interface controls. See the [optics and source-lighting review](docs/visual-review/lighting/OPTICS.md) for rendered examples, validation and remaining work.

## Sources and regeneration

See [sources and attribution](public/ASSETS.md), source hashes and per-pack manifests. Source code retains leocb’s MIT license. The environments retain CC BY, CC0 and CC BY-SA conditions; kitchen adaptations retain CC BY-SA 4.0. Blender sources remain at their official download locations and are never saved by the capture tools.

`tools/capture-scene-pack.py` captures seven independent camera transforms, source radiance and axial Z. It removes source-camera scale/animation from the derived capture camera. Orthographic source cameras require an explicit perspective conversion. The kitchen reuses and extends its original studio-ground mesh in memory to cover the perspective frame; source furniture/materials remain intact. `capture-scene-flash.py` exports a separate Cycles flash light group. `package-scene-pack.mjs` and `package-scene-layer.mjs` select HDR transport ranges without clipping highlights. `audit-scene-plates.mjs` checks real transforms, independent image/depth pairs and physical offsets. See [quality evidence](docs/visual-review/FINAL.md) and subsequent visual review records for actual production screenshots and the scope of acceptance.

Original application and original fan images: Leonardo C. Bottaro (leocb), 2023. Selected control interactions were informed by [Stillframe](https://github.com/Lian0123/camera-simulator); the new renderer and camera modules are independently implemented. Three.js and Meshopt licenses are in `public/licenses/`.


## Additional classroom viewpoints

The original classroom panorama remains unchanged. `classroom-{desk,window,teacher}-plates`
provide seven real source captures each. The manifest owns source optics (including
full-frame-equivalent focal length), near/far clipping, finite movement bounds,
axial-Z depth and default teaching focus. Depth is encoded as unsigned 16-bit RG,
0–64 metres; source sky remains a background sentinel in raw evidence and saturates
at 64 m only in the runtime depth transport. It is not a new wall.

The approved student-seat and window centers are rendered at 6144×3456 / 256
samples, then linearly area-downsampled to 5120×2880 runtime detail and
2560×1440 initial images before log encoding. The unchanged teacher center uses
its original 5120×2880 / 256-sample source. The six neighboring detail
captures are 4096×2304 / 32 samples; their base images are 2560×1440 / 32 samples.
Depth is 1280×720 with 2048×1152 lazy detail depth. The isolated, co-registered
1280×720 flash captures use 32 samples and 1000 W × 0.01 s; rendering restores the
pulse's fixed energy through inverse shutter-duration scaling. This is not a claim
that all 105 layer jobs use 256 samples.

The student-seat and window defaults match the complete approved preview framing:
20 mm and 23.4375 mm full-frame reference focal lengths, with real additional
1.2× capture overscan. Their independent source hashes and approved preview/pose
bindings are audited; the teacher's original files remain unchanged. The student
seat defaults to 0.45 m focus at the measured blue-cover center; window and teacher
default to 1.6 m and 4 m. Source previews are pinhole images; normal simulator
photographs retain teaching depth of field and freely adjustable focus.

Only import a complete formal delivery. The original three-pack importer and the
two-pack approved-revision importer verify all file hashes, real image dimensions,
source/pose/quality contracts and independent views before replacement. A frozen
`rig-config.json` must remain in the parent of `outputs/`. Revision import retains
the v1 receipt byte-for-byte and never replaces the teacher pack:

```sh
node tools/import-classroom-revision.mjs /path/to/v2/outputs/delivery.json
node tools/import-classroom-revision.mjs /path/to/v2/outputs/delivery.json --copy
npm test
npm run audit:assets
npm run build
```

For explicitly budgeted same-filesystem workspaces, `--link` replaces `--copy` and
`node tools/build-linked-assets.mjs` replaces the ordinary build. Image/static
hardlinks must remain immutable; manifests are independently copied on import.
The linked build compiles normally and verifies the exact normal-build static
file list and bytes. It is a disk-saving local option, not a different renderer.
See [approved revision acceptance](docs/visual-review/CLASSROOM-APPROVED-REVISION.md)
for measured results and publication/browser limitations.

`tests/browser/classroom-viewpoints.spec.js` adds real-asset seven-position,
scene-switch, default-focus/exposure and JPEG metadata acceptance. Run it in an
authorized browser/CI environment; a successful build alone is not visual acceptance.

## Approved kitchen viewpoints

The existing selector also includes `kitchen-pastry` (糕点台面) and `kitchen-tea`
(厨房茶桌). Their original kitchen panorama and GLB are unchanged. The manifests
retain native 35/43 mm reference focal lengths, real extra 1.2× capture overscan,
6144×3456 / 256-sample center sources, 5120×2880 whole-capture runtime detail,
and seven independently rendered bounded positions. Pastry bounds are deliberately
asymmetric to stay inside the source cutaway; the UI reads the actual manifest.

Defaults are 1.45 m / 1.0 m at formally measured opaque cake/tea-table subjects,
with EV8 source calibration. Glass depth remains physical camera-Z, not the
refracted optical path. Source review images omit teaching DOF; normal photographs
retain it. Flash encoding is dynamic per layer/view (tea reaches >25,000 linear
radiance), not silently capped at 64 or 128. The 64 m range applies only to the
depth transport. Isolated pulse energy and capture/EXIF behavior are unchanged.

`tools/import-derived-viewpoints.mjs` accepts only independently pinned complete
single-rig receipts; use `--link` for explicitly budgeted immutable local imports.
Portable receipts preserve source/preview/pose/default-focus evidence for CI
without requiring the production filesystem. See [current integration evidence](docs/visual-review/PHOTOGRAPHY-20261024.md).


## Approved apartment armchair

`apartment-armchair` (公寓单椅) adds the approved 40 mm chair/bookshelf composition
to the same selector; the original apartment panorama/GLB are unchanged. Default
focus is 3.9 m, measured at the gray chair pillow (formal camera-Z 3.91369 m), with
EV8 source calibration. Bounds, 0.03/1000 m clipping and all seven camera poses
come from the final manifest. Real 1.2× capture overscan preserves the approved
native framing; normal teaching DOF, isolated flash and capture/EXIF remain active.

Its explicit source contract distinguishes the original Italian Flat, exact-shared
geometry preview and native-camera source; it retains Flavio Della Tommasa / CC BY
(adaptation CC BY 4.0), not the kitchen's license. The importer also checks the
actual five source-equivalence reports and completed formal capture receipts.
The apartment's measured source probes use nearest-pixel rounding, while the
kitchen probes retain their original floor convention. Actual delivered-depth
autofocus is independently checked against both PNG resolutions.
