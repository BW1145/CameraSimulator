# CI autofocus diagnosis

Target: `35b9566`, GitHub Actions run `39118757648`. Reproduction uses the existing production preview at `http://127.0.0.1:8002`, `CI=1`, `PW_CHANNEL=chrome`, and the repository's actual SwiftShader launch flags. No source or production build changes were made for this investigation.

## Photographic AF-C

The unchanged test reproduces the failure: a focus difference of 0.001 m against the original >0.05 m threshold. The local trace records initial focus 2.695 m, then 2.700, 2.699, and 2.694 m, with the ball's rendered x position changing from approximately 0.662 to 0.594. This is a real moving target around the maximum-depth turning point, so comparing two arbitrarily timed readings can cancel the observed distance change. The nominal 900 ms wait took 2.761 seconds, and the following attribute read took 3.814 seconds under software rendering.

`app.js` advances its simulation clock by at most 0.1 seconds per RAF and publishes focus during analysed frames. Wall-clock sleeps cannot establish a specific simulated phase or actual movement. The replacement starts the ball paused, uses the real 1/125 s shutter (AF behavior is independent of 24-sample long-exposure integration), confirms actual rendered ball-coordinate movement, and polls the unchanged >0.05 m focus assertion. It uses an atomic focus/position snapshot rather than several protocol reads across moving frames.

## Legacy GLTF AF-S / AF-C

The unchanged test passed locally under SwiftShader but took approximately two minutes. Its actual trace shows `motion.check` 3.868 s, `pause.check` 28.861 s, `#focus-tools > summary.click` 27.297 s, and AF selection 11.785 s. The scene is continuously rasterizing roughly 759,957 triangles at a 1392 x 597 framebuffer; trace snapshots indicate about 2.2 seconds per software frame. There is no evidence of a closed-panel state reverting or an overlay intercepting the summary. Real pointer/actionability operations queue behind the continuous software redraws, which accounts for the same click stage exhausting the 180-second CI test budget.

The revised test first pauses before enabling motion, confirms actual ball-coordinate progress before checking AF-S's unchanged two-decimal lock precision, then pauses before opening the AF panel. AF-C uses real select/checkbox actions, waits for actual motion, and retains its original >0.03 m threshold. `openControl` now verifies the native details `open` property and the requested control's actual visibility after a genuine summary click. No force click, DOM toggling, source bypass, or relaxed focus thresholds is used.

The legacy focus-only test uses a real 800 x 700 viewport, identical in all environments. This reduces its raster load to approximately 752 x 322 pixels. Other independent tests retain default desktop and narrow-screen visual coverage. This choice is a bounded functional-test fixture, not a claim that legacy software rendering meets an interactive performance target.

Evidence directories: `ci-af-swiftshader` (unchanged reproduction and traces), `ci-af-swiftshader-fixed` (intermediate default-size test, interrupted once software event costs were confirmed), `ci-af-swiftshader-final` (final functional verification and numeric attachments).

Final command: `CI=1 PW_CHANNEL=chrome PW_BASE_URL=http://127.0.0.1:8002 npx playwright test tests/browser/photographic-scenes.spec.js tests/browser/simulator.spec.js --grep 'AF-C tracks|AF-S locks' --reporter=line --trace=on --output=../qa-evidence/ci-af-swiftshader-final` (environment variables set with PowerShell syntax locally). Result: **2 passed in 1.8 minutes**. The production preview remained running and was not rebuilt or changed. Test files are frozen for the parent's complete hardware-suite run and the next real GitHub CI run; this local result is not substituted for that CI result.

Final numeric attachments: classroom AF-C 2.100 → 2.455 m, kitchen 2.100 → 2.363 m, apartment 7.000 → 8.454 m. Legacy AF-S remains 1.937 → 1.937 m after an observed >0.025 viewport-coordinate movement; after pausing and selecting AF-C, its next movement changes focus 2.626 → 1.783 m. The JSON `movedLocked` entry is sampled after the real pause click completes, so its displayed x need not retain the maximum earlier displacement on the oscillating path; the separate motion-progress assertion is recorded in the trace.

The complete final production-build browser suite subsequently passed all 30 tests on hardware rendering in 1.4 minutes. This is not a claim that the final remote CI or software performance has passed; that commit's own Actions run remains a separate gate.
