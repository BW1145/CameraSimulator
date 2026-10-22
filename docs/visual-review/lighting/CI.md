# Browser verification

The 2× density check uses a real 800×700 viewport, retains the complete room, checks the same physical/CSS pixel ratio and MSAA, and exports the same 2048×1365 portrait PNG. First-frame readiness allows 90 seconds for cold software shader compilation. Independent photographic and full-geometry checks retain the 1440px desktop viewport.

The AF-S/AF-C functional check loads a small glTF backdrop and the renderer's actual moving 3D ball. It uses genuine ray hits, frame advancement and focus distance. The 0.025 projected movement and 0.03m focus-change thresholds are retained. Full architectural geometry, camera translation, focus blur, four photographic rooms and moving subjects remain covered by their separate checks.

Both targeted checks passed together using Chrome with SwiftShader in 21.2 seconds. Product rendering and camera logic are unchanged by this verification update.

Whole-page photographic captures check readiness again after layout frames: a viewport resize can invalidate the earlier frame during ResizeObserver delivery. The content/variance thresholds still apply to the actual page screenshot after its replacement frame is ready.

GitHub Actions divides the complete suite into three Playwright shards on independent runners. Each runner installs the lockfile, audits assets and builds the same commit. The deploy job needs the entire verification matrix; only shard 1 uploads the production artifact and release metadata. Pull requests run verification, while merged main commits run verification and deployment. Each shard uploads a distinct browser-results artifact.
