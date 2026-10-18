# Camera Simulator

A photography teaching simulator with a large viewfinder, four primary sliders and immediate visual feedback. The interface is in Simplified Chinese. Based on [leocb’s Camera Simulator](https://github.com/leocb/CameraSimulator); the original fan demonstration remains available from the header.

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

Select the barbershop, classroom, kitchen or apartment. Each photographic scene pack preserves the complete source Blender environment’s lighting, materials, glass and mirrors in source-rendered radiance images. Seven adjacent, actual perspective cameras provide the bounded shooting area. Direction buttons choose an actual captured position; dragging, focal length, sensor and aspect ratio reframe its image. This is a small camera rig, with scene-specific bounds, rather than room navigation or continuous synthetic parallax. The classroom’s backward position is 10cm to stay in front of its rear wall; other offsets are shown on the controls.

Aperture, shutter, ISO and white balance stay visible. Separate collapsible panels contain focus, composition, and exposure aids. Click the image to focus. AF-S locks distance; AF-C follows the actual selected world/object point. Composition includes focal length, native/3:2/16:9/2:3/square crops, full frame/APS-C, roll, thirds and view reset. Exposure aids include matrix/center/selected-point metering, compensation, flash, histogram, clipping stripes, level and local magnifier. M/A/S/P and Auto ISO display their actual resolved values in the sliders. Aperture f/1.4–22, shutter 1/8000–30s, ISO50–25600 and white balance 2000–10000K affect the photograph. The minimum focal length follows each scene’s photographed coverage; the maximum is 200mm.

The barbershop has a live, locally modeled tabletop fan. Its curved blades and chassis use the source room’s HDR probe and bounded direct lights. Turning and pausing the rotor lets the same phase demonstrate shutter changes. Other scenes retain a three-dimensional practice ball. The maximum temporal budget is 24 samples; short exposures also account for projected screen motion. Seconds-long shutters integrate complete cycles plus their weighted residual interval. Every temporal subject sample uses its own depth blur before radiance averaging. A flash adds one instantaneous pulse instead of blurring its contribution across the shutter interval.

PNG export renders a fresh 2048-pixel long-edge photograph, waits for requested high-resolution/flash layers, and omits guidance overlays. Preview follows display density up to 2× within a 3.5MP budget. Static frames render on change; animation runs up to 30FPS and pauses in hidden tabs.

## Image and optical model

Scene packs contain source-linear radiance and axial camera-Z. Log2 WebP is a transport encoding only: each texel is decoded into linear half-float HDR before bilinear filtering or mipmap generation. Metering reads unexposed HDR through a separate floating-point target; AgX follows photographic exposure and relative white balance. ISO adds fine display noise. Only the selected initial view downloads; other positions, flash and higher-resolution radiance layers are requested as needed. Late scene/position loads cannot replace the currently selected view, and failed assets offer retry.

Focus uses source depth and actual live-object ray hits. Depth blur uses the thin-lens circle of confusion, depth-aware gathering and near-silhouette coverage. The radius limit scales with image resolution, so preview/export retain the same blur scale for the same composition. Single-layer depth cannot reconstruct hidden background or reflected virtual depths; extreme blur and thin edges remain approximations. Native source clipping is retained; the apartment’s per-position near plane maintains its source world clipping plane. Source camera bounds have no collision simulation.

Flash layers are isolated Cycles light groups with source-scene shadows/reflections and 1000W × 0.01s reference energy. Their radiance is added before lens, exposure and display processing, with inverse shutter-duration scaling. The barbershop and apartment source cameras sit behind cutaway walls: their flash emitters are moved 1.5m and 4.4m forward, explicitly recorded as scene-local fill positions. The local fan uses a matching point-light approximation. Local fan contact shadow and direct lighting remain bounded approximations. High-resolution layers improve telephoto detail but finite source resolution still limits extreme crops.

`/?subject=none&view=source` is a background-only diagnostic that disables depth blur and noise. `/?renderer=gltf` selects the retained full-geometry renderer and its wider translation controls. It is useful for comparisons and retains the original optimized conversions; it does not replace the photographic quality path.

## Sources and regeneration

See [sources and attribution](public/ASSETS.md), source hashes and per-pack manifests. Source code retains leocb’s MIT license. The environments retain CC BY, CC0 and CC BY-SA conditions; kitchen adaptations retain CC BY-SA 4.0. Blender sources remain at their official download locations and are never saved by the capture tools.

`tools/capture-scene-pack.py` captures seven independent camera transforms, source radiance and axial Z. It removes source-camera scale/animation from the derived capture camera. Orthographic source cameras require an explicit perspective conversion. The kitchen reuses and extends its original studio-ground mesh in memory to cover the perspective frame; source furniture/materials remain intact. `capture-scene-flash.py` exports a separate Cycles flash light group. `package-scene-pack.mjs` and `package-scene-layer.mjs` select HDR transport ranges without clipping highlights. `audit-scene-plates.mjs` checks real transforms, independent image/depth pairs and physical offsets. See [quality evidence](docs/visual-review/FINAL.md) and subsequent visual review records for actual production screenshots and the scope of acceptance.

Original application and original fan images: Leonardo C. Bottaro (leocb), 2023. Selected control interactions were informed by [Stillframe](https://github.com/Lian0123/camera-simulator); the new renderer and camera modules are independently implemented. Three.js and Meshopt licenses are in `public/licenses/`.
