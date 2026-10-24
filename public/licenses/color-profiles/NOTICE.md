# Optional Blender AgX display profile

`color-profiles/blender-4.5.14-agx-medium-high-v1/` contains an exact
OpenColorIO generic-GPU export of Blender 4.5.14's sRGB / AgX / AgX - Medium
High Contrast operations, not a hand-fitted contrast curve. The two LUTs retain
the source values and tetrahedral interpolation. The only shader annotation is
explicit high precision on sampler3D declarations. Scene/camera exposure and
white balance are not baked into these resources.

Original AgX: Troy Sobotka. The pinned Blender configuration credits further
development to Zijun Eary Zhou, Mark Faderbauer, and Sakari Kapanen. Configuration
and LUT source: [Blender v4.5.14, commit 62c1db4208e](https://github.com/blender/blender/tree/62c1db4208e862312bc36db5bc15d4a6dbcfa3e3/release/datafiles/colormanagement).

Retained complete notices:

- [Blender OCIO configuration BSD-3-Clause notice](Blender-OCIO-BSD-3-Clause.txt),
  Copyright (c) 2003–2010 Sony Pictures Imageworks Inc., et al.
- [OpenColorIO 2.4.1 BSD-3-Clause notice](OpenColorIO-2.4.1-BSD-3-Clause.txt),
  Copyright Contributors to the OpenColorIO Project.

The configuration's `ocio-license.txt` reference follows the directory-wide
configuration notice; the old copyright year is not a limit on later files.
The [license relocation](https://github.com/blender/blender/commit/0434efa09ddc451675ce8f8e8e7df61f5cc34e89)
renamed that notice without content changes. The
[AgX addition](https://github.com/blender/blender/commit/a9053f7efbe8b25429b11bccd679dbe81ea60e3f)
retained the notice reference. The later
[license consolidation](https://github.com/blender/blender/commit/0a4dbc57b80fec06b740e66f3846951e886aa735)
moved notices into Blender's
[current release license list](https://github.com/blender/blender/blob/62c1db4208e862312bc36db5bc15d4a6dbcfa3e3/release/license/license.md).
OpenColorIO's [GPU LUT exporter](https://github.com/AcademySoftwareFoundation/OpenColorIO/blob/v2.4.1/src/OpenColorIO/ops/lut3d/Lut3DOpGPU.cpp)
and [shader utilities](https://github.com/AcademySoftwareFoundation/OpenColorIO/blob/v2.4.1/src/OpenColorIO/GpuShaderUtils.cpp)
explicitly carry BSD-3-Clause identifiers.

`profile.json` pins the source configuration, consumed source resources,
generator, GLSL, LUTs and CPU fixtures. Reproduction tooling and fixtures are
in `tools/generate-display-profile.py`, `tools/capture-transport-reference.mjs`
and `tests/fixtures/display-profile/` in the repository. These notices do not
change CameraSimulator's own license or imply endorsement by the contributors.
