# Cozy Kitchen / Bakery: photographic scene pack

Source: [Cozy Kitchen / Bakery](https://download.blender.org/demo/splash/blender-3.5-splash.blend), Nicole Morena. License: **CC BY-SA; this adaptation CC BY-SA 4.0**. See [asset attribution](../../ASSETS.md); the source file SHA-256 is recorded in manifest.json. Original Blender files are not modified or redistributed here.

Camera: source CAM-wide is orthographic (its saved 50 mm lens field does not control projection). The photographic derivative uses a real 90 mm perspective camera at the same source position and orientation. This is the complete official stylized bakery/kitchen diorama, photographed from its wide camera. Packed materials and original lighting are retained; the independent close-up camera was not selected. The existing studio ground Plane is extended 32 times in local XY with its original Material.110, and derived camera far clipping is 1000 m, so all seven overscan captures remain on the studio floor. The source blend is never saved.

## Captures

Seven independently rendered camera positions preserve source materials, light sources, indirect light, glass and reflections. Left/right and forward/backward 30 cm; up/down 20 cm. Camera translations are physical source-camera changes, not image crops. Pan and focal-length composition operate within each capture's overscan. This is a bounded photographic area.

Ambient radiance: Cycles, 32 samples, denoised, 2560 px wide with 20% lens overscan. Scene-linear RGB uses log2 encoding in a lossless WebP container, retaining exposure and white-balance adjustment. The manifest records the actual range and maximum channel quantization error; high source radiance expands the range instead of clipping. The PNG depth is axial camera Z at 1280 px wide, stored in RG uint16 over 0–64 m (~0.98 mm quantization). Every camera has its own depth map.

[Source-camera reference](reference.webp) is a 768 px native-lens AgX preview for visual comparison. The app renders the linear radiance pack; this reference is not used as its photo layer.

Flash and high-resolution detail availability are declared by the manifest. Missing optional layers are not implied by this source description. Transparent/reflected hidden-surface depth and fully optical depth-of-field are not supplied by a single source Z pass.

Flash: seven 1280 px isolated Cycles light-group renders, 32 samples, camera-origin 0.08 m area lamp, reference 1000 W for 0.01 s. It uses the same perspective conversion and extended source ground as ambient. Packaging verifies source SHA, actual camera pose, near plane and lamp position against the ambient rig. Flash encoding is independent of ambient encoding. Optional detail uses 3072 px radiance and matching 1536 px axial Z; the manifest lists the completed views.

All seven positions now include the optional detail radiance/Z pair. A full-pixel audit checks each lossless WebP and PNG against the raw HDR/EXR, alongside source SHA, camera transform, per-view clipping and file dimensions/bytes. The completed layer has zero radiance/depth pixel mismatches and zero radiance clamps; original base and flash files remain byte-identical.

The extended studio floor reaches approximately 100 m axial distance at the overscan edge. Depth beyond 64 m saturates at the declared 64 m limit (119,362 pixels, 5.37%, in the center detail Z). This affects the distant studio backdrop; the kitchen subject is approximately 9–20 m away. Radiance retains the complete floor and is not clipped by this depth limit.


