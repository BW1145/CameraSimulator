# Isolated inferred-camera background diagnostic

Not under `public/`; not a canonical view, shipped scene, or user-facing control. Consumed only by `tools/capture-matched-background.mjs` through Playwright response routing.

One source-rendered 2048×858 background, 64 samples, with its own log2[-16,8] radiance encoding and axial-Z depth. Camera pose is manually landmark-inferred, not exactly recovered; full-frame-equivalent focal24.913603768064135 mm, near clip0.05m. Canonical center uses256 samples and source near1.1m. This pack has no fan, flash, mirror optical-distance map, high-resolution detail, or seven-position navigation. Source scene retains known missing-image warnings, with contribution audit in provenance; original JPEG color processing remains unknown.

`manifest.json` and asset bytes are copied unchanged from the independent render workspace. Original manifest provenance paths refer to that workspace; portable copies are under `provenance/`: render report, inferred camera, source-image shader reachability audit, and reference comparison. Raw source EXRs and scripts remain in the independent render workspace and are not bundled here. Source attribution: Agent327 Barbershop, Blender Foundation / Blender Studio, CC BY; source SHA-256 is retained in the manifest/report.

Original JPEGs are comparison-only and include an original fan absent from this diagnostic. Do not interpret background alignment as fan fidelity or as a baseline/candidate before/after proof. The app's real optical/exposure/noise pipeline remains active. MF1.4m and WB5000K are declared comparison assumptions; actual shutter1/125 differs from original1/120 by0.058894EV. No extra focal/angle/position inputs should be applied because the inferred pose is baked into the pack.
