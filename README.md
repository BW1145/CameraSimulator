# Camera Simulator

A photography teaching simulator with a large viewfinder, four primary sliders and immediate visual feedback. Based on [leocb's Camera Simulator](https://github.com/leocb/CameraSimulator). The interface is in Simplified Chinese.

The primary renderer loads complete Blender environments as optimized glTF models. Camera translation changes perspective and occlusion; rotation and focal length operate on the perspective camera. Additional controls live in one expandable section. The [original fan demonstration](public/original.html) remains available from the header.

## Run and verify

Requires Node.js 22.12+ or 24+, and a browser with WebGL 2.

```sh
npm ci
npm start
```

Open http://127.0.0.1:8000. For a portable static deployment:

```sh
npm test
npm run audit:assets
npm run build
npm run preview
```

Serve `dist/` from any static host, including a GitHub Pages project subdirectory. Runtime assets and decoder code are bundled locally. The build also includes the original pre-rendered fan images, loaded only when opening that demonstration.

Browser acceptance checks:

```sh
npx playwright install chromium
npm run test:browser
```

On a machine with installed Chrome, set `PW_CHANNEL=chrome` to use it. CI validates the arithmetic, asset budgets, production build and browser interactions.

## Camera controls

| Controls | Behavior |
| --- | --- |
| Aperture f/1.4–f/22 | Exposure and per-pixel thin-lens depth blur |
| Shutter 1/8000–30 seconds | Ambient exposure and a bounded temporal trail for the practice ball |
| ISO 50–25600, Auto ISO | Exposure and luminance noise |
| White balance 2000–10000 K | Relative red/blue compensation about a 5000 K neutral point |
| M / A / S / P | Manual, aperture priority, shutter priority and program exposure; automatic values are displayed in their sliders |
| Compensation ±3 EV | Changes the automatic exposure target in thirds of a stop; available with Auto ISO in M |
| Matrix / center / spot metering | Measures the current unexposed rendered frame; spot metering follows the selected focus point |
| Click focus / 0.2–50 m / AF-S / AF-C | Raycasts actual scene geometry; AF-S locks distance, AF-C follows a selected world point or the moving practice ball |
| 18–200 mm / full frame / APS-C | Perspective camera field of view and sensor-dependent depth of field |
| Position and direction | Translate ±3 m sideways/forward, ±2 m vertically; yaw ±180°, pitch ±80°, roll ±20° |
| Fill flash | Camera-mounted point illumination with inverse-square falloff and exposure-duration compensation |
| Histogram / zebra / grid / level / magnifier | Rendered luminance histogram, highlight clipping stripes, thirds, roll reference and 2.5× local enlargement |
| Crop and capture | 21:9, 16:9, 3:2, 2:3 and square composition; export PNG without guidance overlays |

Drag the picture to turn. Click to focus. With the picture focused, WASD translates and Q/E raises or lowers the camera relative to its starting axes. View reset restores the scene's prepared starting camera. Parameter reset restores the lesson defaults. Start positions are chosen inside the architecture; navigation is bounded and has no collision physics.

## Environments and licensing

Included: Agent 327 Barbershop, Classroom, Cozy Kitchen and Italian Flat. The kitchen is Blender's stylized bakery/kitchen diorama. Each environment is a complete scene conversion, with original layout and supported material maps, available for navigation rather than a photographic backplate.

See [scene sources and attribution](public/ASSETS.md). Source code retains leocb's MIT license. Scene assets retain their independent CC BY, CC0 and CC BY-SA conditions. Kitchen adaptations are distributed under CC BY-SA 4.0. Each scene directory includes a source hash and conversion report in `model.json`.

## Rendering and performance

`src/camera.js` contains exposure and meter mathematics. `src/renderer.js` contains the perspective camera, glTF loading, lighting, depth buffer and GPU post processing. `src/app.js` owns UI state and input. `src/scenes.js` is the scene registry.

Only the selected environment loads. Switching scenes disposes the previous geometry, textures and materials. Preview width is capped at 1200 pixels, independently of display density. Static views render on change; movement renders at up to 30 frames per second and pauses in hidden tabs. Depth blur uses 24 samples per pixel. The practice ball uses at most 24 temporal samples, including at 30 seconds. Exposure, lens and color settings share the same model and textures, so their ranges add no image combinations.

Scene packs use material joining, Meshopt compression, WebP textures and a geometry target of 650k triangles with a 1% simplification error bound. Detailed meshes can remain above that target; the checked budget is 900k triangles and 25 MiB per pack. Exact shipped counts are in each `model.json` and printed by `npm run audit:assets`.

Lighting uses source punctual lights, ambient fill and a directional light. A filmic highlight shoulder follows exposure; the meter samples HDR lighting with four stops of headroom before that display curve. Cycles procedural shaders use supported PBR inputs or their source diffuse colors/maps; volume boundary meshes are omitted. Glass uses transparency. Indirect light, reflections, blur at occlusion boundaries and motion trails are teaching approximations. This version renders the architectural environments in real time; Cycles lightmap baking and path-traced reflections remain future fidelity work. The original fan demonstration preserves leocb's pre-rendered optical and shutter samples.

## Regenerate a scene

Download the original file linked in the asset notes. Extract Classroom's entire ZIP so its linked libraries and textures keep their relative paths. Use Blender 4.5 LTS and run from this repository:

```sh
blender -b source.blend --disable-autoexec --python tools/export_gltf.py -- --id classroom --output public/scenes/classroom
node tools/optimize-scene.mjs public/scenes/classroom
npm run audit:assets
```

For Italian Flat pass `--camera "Cam Living"`. Add new environments by creating a pack, recording its attribution, and adding a registry entry. Material conversion, triangle and texture budgets remain shared across scenes. Scene source hashes identify the inputs used for this release; large Blender source files stay at their official download locations.

## Credits

Original application, images and fan animation: Leonardo C. Bottaro (leocb), 2023. Selected control interactions were informed by [Stillframe](https://github.com/Lian0123/camera-simulator); the new camera and renderer modules are independently implemented. Three.js supplies the renderer and glTF loader; its license and the Meshopt decoder license are included in `public/licenses/`.

[Support leocb](https://www.paypal.com/donate/?hosted_button_id=683D7S6KLX7EA).
