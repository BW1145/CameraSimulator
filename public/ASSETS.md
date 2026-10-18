# Scene assets and attribution

The four environment packs are derived from complete scenes listed in the [Blender official demo catalog](https://www.blender.org/download/demo-files/), checked on 18 October 2026. The browser loads one complete glTF environment at a time. Geometry, layout and supported material maps come from the cited Blender files.

| Pack | Source and creator | Source format | Catalog license |
| --- | --- | --- | --- |
| `scenes/barbershop/scene.glb` | [Agent 327 Barbershop](https://svn.blender.org/svnroot/bf-blender/trunk/lib/benchmarks/cycles/barbershop_interior/barbershop_interior.blend), Blender Foundation / Blender Studio | `.blend`, packed environment textures | CC BY |
| `scenes/classroom/scene.glb` | [Classroom](https://download.blender.org/demo/test/classroom.zip), Christophe Seux | ZIP containing `classroom.blend`, linked `.blend` asset libraries and image textures | CC0 |
| `scenes/kitchen/scene.glb` | [Cozy Kitchen](https://download.blender.org/demo/splash/blender-3.5-splash.blend), Nicole Morena ([artist](https://www.artstation.com/nickyblender)); the file's Credits text calls the work “Bakery” | `.blend`, packed textures; stylized kitchen/bakery diorama | CC BY-SA |
| `scenes/apartment/scene.glb` | [Italian Flat](https://download.blender.org/demo/cycles/flat-archiviz.blend), Flavio Della Tommasa ([artist](http://malapixel.com)) | `.blend`, packed textures, multiple interior cameras | CC BY |

The catalog uses the short labels above without specifying license versions beside these entries. Preserve those upstream declarations and creator attributions. This project's adaptations to the kitchen pack are offered under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), with the original CC BY-SA condition retained. Its geometry and textures retain the share-alike condition when redistributed. The barbershop and apartment adaptations are offered under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), retaining the original CC BY notices. Classroom is [CC0](https://creativecommons.org/publicdomain/zero/1.0/). These scene assets have their own licenses, separate from the application's MIT code license.

Changes: export to glTF, limit subdivision, simplify large meshes, retain diffuse image maps from legacy Cycles shaders, resize textures to at most 1024 pixels, compress geometry with Meshopt and textures with WebP. Source collection instances and scene layout are retained. Cycles volume boundaries are omitted from surface rendering. Runtime ambient fill and punctual lighting approximate indirect lighting; glass uses lightweight transparency. Each pack's `model.json` records its source SHA-256, Blender version, mesh count, triangle count, texture count, size and conversion details.

Original `Images/` renders and fan animation: Leonardo C. Bottaro (leocb), 2023, derived from the Blender barbershop scene. Original application: [leocb/CameraSimulator](https://github.com/leocb/CameraSimulator), MIT, copyright Leo Bottaro. Existing source and notices are retained.

The camera practice ball is a procedural sphere created by this application's code. Three.js and its bundled Meshopt decoder are MIT licensed; see `licenses/`. Vite and glTF Transform are development tools. The [Stillframe source](https://github.com/Lian0123/camera-simulator/tree/897c62af63f792c237f0973d5009a03b80f0ac2b) informed selected control interactions: focus placement, exposure compensation and crop controls. The new camera and renderer modules are implemented independently for this project.
