Barbershop pre-rendered photographic sample — local subject stage

Source: Agent 327 Barbershop, Blender Foundation / Blender Studio, CC BY.
Source and download attribution: ../../ASSETS.md. The source SHA-256 is in
manifest.json. The original .blend is not modified or distributed here.

Open the production application at /. Use ?subject=none&view=source for
the background-only matching-camera diagnostic: manual EV8, no blur or noise.
The source camera is 13 mm / 24.89 mm sensor, 2048:858, near 1.1 m / far 100 m.

Seven real source cameras: center, left/right 30 cm, up/down 20 cm,
forward/back 30 cm. Direction/center buttons select these discrete positions.
This is not continuous
translation and is not a crop pretending to be a camera movement.
Pan/tilt/roll and focal length reframe the chosen photograph. Rotation is
bounded by the photographed overscan. Aspect ratios crop that photograph.

Each 2560x1072 radiance image uses log2 RGB [-16,+6] in lossless WebP.
Maximum per-channel rounding error is 0.0432 EV. No source radiance exceeds
the stored range in this pack. This permits live exposure, white balance,
metering and highlight handling, without baking an image per camera setting.
The 1280x536 matching source Z pass uses two lossless PNG channels, with
0–64 m axial camera-space depth quantized to 16 bits (not radial distance).
Axial precision is approximately 0.98 mm. Reframing transforms that source
depth to the current view before focus, occlusion and depth blur use it.

Initial radiance + depth: 2,213,745 bytes. All seven: 15,439,316 bytes.
Only the selected position downloads; at most three decoded views are kept.
Application JavaScript/CSS and the legacy fan demonstration are separate.
The default live fan adds 112,169 bytes of subject configuration and source HDR
probe. Its approximately 10k triangles are generated locally, without a sprite
sequence. The matching source-position area lights illuminate only this subject.
Temporal integration averages opaque instantaneous renders in the rotor region,
using complete-cycle and residual weights. Both 1/8 s and 30 s stay within
24 temporal samples. The surrounding pre-rendered room is never re-built.

LIMITS OF THIS STAGE
The procedural fan is a new local model, not leocb's unavailable source mesh.
It uses a source-room reflection probe, bounded area-light approximation and
a simple contact shadow. Visual acceptance of this subject is still pending.
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
blender -b barber.blend --disable-autoexec --python tools/capture-subject-probe.py -- --output public/scenes/barbershop-plates/fan-room.hdr --position 3.8 1.2515531 -6.95

The capture tools use the source camera, aspect, clipping and original Cycles
materials/lights. Their defaults prepare seven small adjacent camera positions.
package-plates.mjs additionally accepts id, title and attribution arguments.
Add platePack to the scene registry to use another independently licensed pack.
