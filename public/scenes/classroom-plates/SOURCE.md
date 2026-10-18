# Classroom: photographic scene pack

Source: [Classroom](https://download.blender.org/demo/test/classroom.zip), Christophe Seux. License: **CC0**. See [asset attribution](../../ASSETS.md); the source file SHA-256 is recorded in manifest.json. Original Blender files are not modified or redistributed here.

Camera: renderCam, 25 mm / 32 mm sensor (28.125 mm full-frame equivalent). The source camera has animation and a 0.64051 world scale. Captures use a new unanimated camera with identical position/orientation, lens and sensor, unit world scale, and explicit physical offsets. The complete linked asset folder and all image textures were present.

## Captures

Seven independently rendered camera positions preserve source materials, light sources, indirect light, glass and reflections. Left/right 30 cm; up/down 20 cm; forward 30 cm; backward 10 cm. The source camera is close to the back wall; a 30 cm backward capture would be inside it. Camera translations are physical source-camera changes, not image crops. Pan and focal-length composition operate within each capture's overscan. This is a bounded photographic area.

Ambient radiance: Cycles, 32 samples, denoised, 2560 px wide with 20% lens overscan. Scene-linear RGB uses log2 encoding in a lossless WebP container, retaining exposure and white-balance adjustment. The manifest records the actual range and maximum channel quantization error; high source radiance expands the range instead of clipping. The PNG depth is axial camera Z at 1280 px wide, stored in RG uint16 over 0–64 m (~0.98 mm quantization). Every camera has its own depth map.

[Source-camera reference](reference.webp) is a 768 px native-lens AgX preview for visual comparison. The app renders the linear radiance pack; this reference is not used as its photo layer.

Flash and high-resolution detail availability are declared by the manifest. Missing optional layers are not implied by this source description. Transparent/reflected hidden-surface depth and fully optical depth-of-field are not supplied by a single source Z pass.

Flash: seven 1280 px isolated Cycles light-group renders, 32 samples, camera-origin 0.08 m area lamp, reference 1000 W for 0.01 s. Packaging verifies source SHA, actual camera pose, near plane and lamp position against the ambient rig. Flash encoding is independent of ambient encoding. Optional detail uses 4096 px radiance and matching 2048 px axial Z; the manifest lists the completed views.

