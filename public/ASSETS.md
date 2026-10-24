# Scene assets and attribution

The four environment packs are derived from complete scenes listed in the [Blender official demo catalog](https://www.blender.org/download/demo-files/), checked on 18 October 2026. The current photographic renderer loads `scenes/{barbershop,classroom,kitchen,apartment}-plates/manifest.json` on demand. Each pack contains seven independently rendered source-camera positions, scene-linear radiance, axial depth and optional lazy detail/depth and isolated flash layers. The legacy glTF conversions listed below remain attributed here. Geometry, layout, materials and source lighting come from the cited Blender files.

| Pack | Source and creator | Source format | Catalog license |
| --- | --- | --- | --- |
| `scenes/barbershop/scene.glb` | [Agent 327 Barbershop](https://svn.blender.org/svnroot/bf-blender/trunk/lib/benchmarks/cycles/barbershop_interior/barbershop_interior.blend), Blender Foundation / Blender Studio | `.blend`, packed environment textures | CC BY |
| `scenes/classroom/scene.glb` | [Classroom](https://download.blender.org/demo/test/classroom.zip), Christophe Seux | ZIP containing `classroom.blend`, linked `.blend` asset libraries and image textures | CC0 |
| `scenes/kitchen/scene.glb` | [Cozy Kitchen](https://download.blender.org/demo/splash/blender-3.5-splash.blend), Nicole Morena ([artist](https://www.artstation.com/nickyblender)); the file's Credits text calls the work “Bakery” | `.blend`, packed textures; stylized kitchen/bakery diorama | CC BY-SA |
| `scenes/apartment/scene.glb` | [Italian Flat](https://download.blender.org/demo/cycles/flat-archiviz.blend), Flavio Della Tommasa ([artist](http://malapixel.com)) | `.blend`, packed textures, multiple interior cameras | CC BY |

The catalog uses the short labels above without specifying license versions beside these entries. Preserve those upstream declarations and creator attributions. This project's adaptations to the kitchen pack are offered under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), with the original CC BY-SA condition retained. Its geometry and textures retain the share-alike condition when redistributed. The barbershop and apartment adaptations are offered under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), retaining the original CC BY notices. Classroom is [CC0](https://creativecommons.org/publicdomain/zero/1.0/). These scene assets have their own licenses, separate from the application's MIT code license.

Photographic adaptations: render the original complete scenes with Cycles and denoising at seven physical camera positions; normalize source-camera world scale and remove capture-camera animation; retain original materials, indirect lighting, glass and reflections in the radiance images. Encode linear radiance logarithmically in lossless WebP and camera-axis Z in PNG. Detail radiance and matching higher-resolution Z load together on demand. Flash layers use an isolated Cycles light group with a 0.08 m area lamp and a recorded reference energy/duration; independent encoding ranges avoid silently clipping bright flash radiance. Every photographic manifest records the source SHA-256, actual camera matrices, per-view near planes, layer encoding and delivered file sizes. Layer packaging checks source identity and matching camera poses.

Barbershop center-lighting refinement: the high-resolution default-center render adds a normalized 15 W, 2×2 m rectangular warm fill and uses up to eight light bounces (six diffuse/glossy). The matching `fan-room-refined.hdr` records the same room illumination at the procedural fan. This center-only rig retains the original HDR and area lights for the other six positions. The new radiance images and HDR retain the barbershop attribution and CC BY adaptation license. Camera pose, geometry, materials, depth and isolated flash layers are unchanged. Exact settings and hashes are in `docs/visual-review/captures/barbershop-center.json`.

Barbershop optical adaptations: seven additional optical-depth PNGs unfold one reflection ray through the original scene geometry. The full-geometry barbershop adds source-shader albedo/roughness and static diffuse illumination baked onto its optimized geometry with Cycles. OpenImageDenoise filters irradiance before linear-space reduction to a 2048px atlas; source shader coverage retains cobweb transparency in the shared albedo atlas. `model.json.surfaceBake` records source identity, sampling, material selection and encoding. These derivatives retain the barbershop source's CC BY attribution and license. The original Blender file is read without saving.

Scene-specific derivatives: classroom uses an unanimated, unit-scale copy of `renderCam`, with only a 10 cm backward position to stay in front of the rear wall. Kitchen converts the source orthographic `CAM-wide` to a real 90 mm perspective camera and extends the existing studio ground in local XY using its original material. Apartment selects `Cam Living`, retains its off-axis shift and architectural cutaway plane, and constrains composition to exclude exposed source cutaway edges. Original Blender files are never saved. Barbershop and apartment flash emission starts 1.5 m and 4.4 m forward respectively, beyond source cutaway walls; these are scene-local fill positions rather than strict camera-origin flashes. Each pack's `SOURCE.md` and manifest describe the derivative. All rendered ambient/detail/flash/depth assets retain the corresponding source/adaptation license above.

Legacy glTF changes: limit subdivision, simplify large meshes, retain diffuse image maps from legacy Cycles shaders, resize textures to at most 1024 pixels, compress geometry with Meshopt and textures with WebP. Source collection instances and scene layout are retained. Cycles volume boundaries are omitted from surface rendering. Legacy runtime ambient fill and punctual lighting approximate indirect lighting; glass uses lightweight transparency. Each legacy pack's `model.json` records its source SHA-256, Blender version, mesh count, triangle count, texture count, size and conversion details.

Original `Images/` renders and fan animation: Leonardo C. Bottaro (leocb), 2023, derived from the Blender barbershop scene. Original application: [leocb/CameraSimulator](https://github.com/leocb/CameraSimulator), MIT, copyright Leo Bottaro. Existing source and notices are retained.

The camera practice ball is a procedural sphere created by this application's code. Three.js and its bundled Meshopt decoder are MIT licensed; see `licenses/`. Vite and glTF Transform are development tools. The [Stillframe source](https://github.com/Lian0123/camera-simulator/tree/897c62af63f792c237f0973d5009a03b80f0ac2b) informed selected control interactions: focus placement, exposure compensation and crop controls. The new camera and renderer modules are implemented independently for this project.


Additional classroom photographic viewpoints: `classroom-desk-plates`,
`classroom-window-plates` and `classroom-teacher-plates` are CC0 derivatives of
Christophe Seux's Classroom. They use new unit-scale source cameras, source book
and pen copies for the foreground teaching subject, and a camera-ray-only sky
branch that does not change scene illumination or introduce occluding geometry.
The original classroom panorama and GLB remain unchanged. Each new manifest records
both the original source hash and derived source hash, the exact object translations,
source optics, seven real camera poses and layer-specific render quality. The approved student-seat and window centers use independent derived sources
and real additional 1.2× overscan: 6144×3456 / 256-sample centers supply whole-frame
linear-downsampled 5120×2880 detail and 2560×1440 base images. The teacher retains
its original 5120×2880 / 256-sample center. The six neighboring views use 32 samples. Base/depth/detail/flash assets preserve
the source CC0 attribution. No new GLB conversion is claimed or required.


Additional kitchen photographic viewpoints: `kitchen-pastry-plates` and
`kitchen-tea-plates` are camera-only adaptations of Nicole Morena's Cozy Kitchen /
Bakery source, retaining CC BY-SA, with these adaptations under CC BY-SA 4.0.
Original geometry, materials, lights and world are unchanged; the new native
perspective camera is added without replacing the original orthographic camera.
The source hashes and approved capture poses are recorded independently for each
rig. Each center is captured at 6144×3456 / 256 samples with actual extra 1.2×
overscan, then linearly downsampled as a whole to runtime detail/base. Neighbor
captures, axial Z and isolated flash are real matched source captures. No new
GLB conversion or equivalence to the original GLB's cameras is claimed.


Additional apartment photographic viewpoint: `apartment-armchair-plates` is an
adaptation of Flavio Della Tommasa's Italian Flat, retaining CC BY; this
adaptation is CC BY 4.0. Four original tree objects share exactly their original
evaluated geometry, UVs, corner normals, material indices and other attributes,
with original transforms/material slots retained. This is not geometry reduction
beyond the source modifiers. A native 40 mm perspective camera is then added to
that exact-shared preview source. The manifest distinguishes the ultimate original,
intermediate preview parent and final native-camera source SHA-256. Source frame 3,
View Layer, original texture limits of 2048, direct/indirect clamps of 5/10 and
source simplify/subdivision 2 are explicitly recorded, not presented as a new
quality setting. No original apartment assets are replaced. The new seven-view
plate pack uses real additional 1.2× overscan and the same 6144×3456 / 256-sample
center-to-whole-frame runtime detail contract. No matching GLB camera is invented.


Optional display resources: `color-profiles/blender-4.5.14-agx-medium-high-v1`
is an exact OCIO 2.4.1 GPU export of the pinned Blender 4.5.14 AgX Medium High
Contrast configuration, with scene/display exposure kept separate. The original
ten scenes retain their existing display shader. AgX authors, complete BSD3
notices, upstream notice migration and generator/resource provenance are listed
in [the color-profile notice](licenses/color-profiles/NOTICE.md). These separate
third-party notices do not change the project license.
