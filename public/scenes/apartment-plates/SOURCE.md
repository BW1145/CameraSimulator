# Italian Flat: photographic scene pack

Source: [Italian Flat](https://download.blender.org/demo/cycles/flat-archiviz.blend), Flavio Della Tommasa. License: **CC BY; this adaptation CC BY 4.0**. See [asset attribution](../../ASSETS.md); the source file SHA-256 is recorded in manifest.json. Original Blender files are not modified or redistributed here.

Camera: Cam Living. The saved active camera was a pouf detail view. This pack explicitly uses Cam Living to show the furnished living room and room beyond. The source lighting is intentionally dim; exposure remains adjustable in the simulator. This source camera uses a 4 m architectural near cutaway plane. Each captured view preserves that fixed world plane: near = 4 m + camera-local backward offset (front 3.7 m, back 4.3 m). The delivered view metadata records its actual near plane.

## Captures

Seven independently rendered camera positions preserve source materials, light sources, indirect light, glass and reflections. Left/right and forward/backward 30 cm; up/down 20 cm. Camera translations are physical source-camera changes, not image crops. Pan and focal-length composition operate within each capture's overscan. This is a bounded photographic area.

Ambient radiance: Cycles, 32 samples, denoised, 2560 px wide with 20% lens overscan. Scene-linear RGB uses log2 encoding in a lossless WebP container, retaining exposure and white-balance adjustment. The manifest records the actual range and maximum channel quantization error; high source radiance expands the range instead of clipping. The PNG depth is axial camera Z at 1280 px wide, stored in RG uint16 over 0–64 m (~0.98 mm quantization). Every camera has its own depth map.

[Source-camera reference](reference.webp) is a 768 px native-lens AgX preview for visual comparison. The app renders the linear radiance pack; this reference is not used as its photo layer.

Flash and high-resolution detail availability are declared by the manifest. Missing optional layers are not implied by this source description. Transparent/reflected hidden-surface depth and fully optical depth-of-field are not supplied by a single source Z pass.

Composition preserves source lens shift Y = 0.03. Runtime minimum focal length is 53 mm, with a 0.095 valid-image inset to keep exposed source cutaway edges outside the permitted frame. This does not change the physical source-camera positions or capture lens.

Flash: seven 1280 px isolated Cycles light-group renders, 32 samples, 0.08 m area lamp, reference 1000 W for 0.01 s. The camera origin is behind the source cutaway wall and a flash there is almost entirely blocked. This derivative places the lamp 4.4 m forward from each actual capture position, beyond that wall. This is scene-local fill, not a strict camera-origin flash. Packaging verifies source SHA, actual camera pose, near plane and recorded lamp position against the ambient rig. Flash encoding is independent of ambient encoding. Optional detail uses 4096 px radiance and matching 2048 px axial Z; the manifest lists the completed views.


