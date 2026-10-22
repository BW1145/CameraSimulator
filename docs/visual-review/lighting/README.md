# Lighting and reflections

The large viewfinder, four primary sliders and collapsed tools are retained. These production screenshots were captured with `node tools/capture-lighting-review.mjs docs/visual-review/lighting` using installed Chrome at 1440×1000 and 390×844.

- [Tabletop subject](table-lit.png): source HDR and area lights illuminate painted steel and brass. The fan casts a source-key shadow and a softened, view-dependent reflection onto the marble. Both receiver meshes reject pixels whose source depth differs from the tabletop, preserving the furniture edges and neighboring room surfaces.
- [Default page](default.png) and [mobile page](mobile.png): the effects require no additional controls.
- [Full-geometry camera](free-camera.png): room-derived reflection lighting, restored legacy metal finishes, directional shadows and a planar barbershop mirror remain available alongside continuous camera movement.

The tabletop reflection uses a 384px HalfFloat target and a nine-tap filter. Its Fresnel response is a marble approximation. The 512px shadow map represents the counter area light with one directional shadow key. The existing close contact gradient remains under the base. Temporal integration covers the receiver region, so reflected rotor motion follows the shutter. Reflection radiance shares the existing flash pre-exposure and final lens/display processing.

The full-geometry renderer captures diffuse room surfaces at 128px per cube face, then filters the probe for the material roughness. Imported physical materials are restored after capture. The room probe is static between scene loads; the planar mirror follows the actual camera on each visible render. Reflection render targets and shadow maps are released on scene changes. Source photographic scenes retain their Cycles illumination, glass and mirrors; their seven real camera positions and single-depth optical limits remain as documented in the main README.

New browser regressions compare the actual tabletop pixels with the receiver disabled and enabled, and use a geometric fixture whose red subject is behind the camera: it becomes visible in the mirror and shifts with a 0.5m camera translation. Existing regressions exercise all four environments, shutter integration, focus, exposure, flash energy, export and responsive layout.

Validation for this baseline: 12 calculation tests and all 33 production-browser tests passed on Chrome. Four scene asset budgets and all 28 source camera positions passed their audits. The production build passed. `review.json` records the captured renderer state and an empty browser-error list. The screenshots show desktop and simulated mobile viewports. See the [subsequent source lighting and optics review](OPTICS.md) for current rendering work.
