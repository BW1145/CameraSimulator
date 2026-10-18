Barbershop pre-rendered photographic sample — stage 1

Source: Agent 327 Barbershop, Blender Foundation / Blender Studio, CC BY.
Source and download attribution: ../../ASSETS.md. The source SHA-256 is in
manifest.json. The original .blend is not modified or distributed here.

Open the production application with ?renderer=plates. Add &view=source for
the matching-camera diagnostic: fixed manual EV8, no depth blur or noise.
The source camera is 13 mm / 24.89 mm sensor, 2048:858, near 1.1 m / far 100 m.

Seven real source cameras: center, left/right 30 cm, up/down 20 cm,
forward/back 30 cm. XYZ selects these discrete positions, one axis at a time;
choosing a different axis returns the others to zero. This is not continuous
translation and is not a crop pretending to be a camera movement.
Pan/tilt/roll and focal length reframe the chosen photograph. Rotation is
bounded by the photographed overscan. Aspect ratios crop that photograph.

Each 2560x1072 radiance image uses log2 RGB [-16,+6] in lossless WebP.
Maximum per-channel rounding error is 0.0432 EV. No source radiance exceeds
the stored range in this pack. This permits live exposure, white balance,
metering and highlight handling, without baking an image per camera setting.
The 1280x536 matching source Z pass uses two lossless PNG channels, with
0–64 m quantized to 16 bits. Distance precision is approximately 0.98 mm.

Initial radiance + depth: 2,213,745 bytes. All seven: 15,439,316 bytes.
Only the selected position downloads; at most three decoded views are kept.
Application JavaScript/CSS and the legacy fan demonstration are separate.

LIMITS OF THIS STAGE
The desktop fan layer is unfinished; the existing live practice ball remains.
Static-scene flash is disabled until a matching flash-radiance layer exists.
Source Z has a single first-surface depth: it cannot describe hidden edges,
transparent layers or reflected virtual depths. The current depth blur retains
its 24-sample / 28-pixel limit and must not be treated as full optical bokeh.
Strong telephoto crops have less source detail. This stage establishes the
image/camera/resource route, not final acceptance of every lens setting.

REGENERATE (from repository root, with a local authorized original .blend)
blender -b barber.blend --disable-autoexec --python tools/capture-scene-viewfield.py -- --output <temporary capture directory>
blender -b barber.blend --disable-autoexec --python tools/capture-scene-depth.py -- --output <same directory>
node tools/package-plates.mjs <same directory> public/scenes/barbershop-plates

The capture tools use the source camera, aspect, clipping and original Cycles
materials/lights. Their defaults prepare seven small adjacent camera positions.
package-plates.mjs additionally accepts id, title and attribution arguments.
Add platePack to the scene registry to use another independently licensed pack.
