# Controls usability prototype

Based on deployed main `59436f74488436019e1c926419d9c62c74064672` (tree `ca871f7023a3adb66ba1498c88b7e0f56eaa91f4`). This branch does not deploy.

- Shooting settings and save/reset are above the large photograph.
- Focus/reset-view and assist toggles are visible directly below it.
- Aperture, shutter, ISO, white balance and focal length form one visible parameter row. Less-used settings keep named disclosure groups.
- Photo-first revision: no 53vh shrink cap. The actual photograph uses available width; portrait height stays bounded. All lower position/advanced/lesson/about sections are inside one default-collapsed “更多设置” without reserved grid height. Narrow screens wrap controls, with no sidebar or horizontal scrolling.
- Existing canvas-focused WASD/QE shortcuts remain the position path; loading, capture, modified keys and non-canvas input focus do not move the camera. Expand settings for touch/button alternatives.
- Vertical wheel over the photograph adjusts focal length, or over a range/number parameter and its label adjusts that parameter. Up moves one slider step right and down left, at most one native step per event. This increases the f-number, exposure duration (not shutter denominator), ISO, or numeric value respectively. Fine pixel deltas accumulate; stale target/direction accumulation resets.
- Disabled/automatic parameters do not change. Ctrl/Meta/Shift, horizontal-dominant gestures, non-cancelable events and outside regions retain their native behavior. Parameter bounds stop adjustment without jumping the page. Keyboard/touch native range behavior remains.
- No renderer, optical model, scene, texture or asset changes. Existing input handlers remain the sole camera-state update path.

Local browser execution remains unavailable by permission; no bypass attempted. The isolated workflow runs all browser regressions plus real-wheel tests and matched desktop 1366×768/mobile 390×844 before/after screenshots, including the default-collapsed lower region and expanded controls. Photo area must be at least the deployed baseline at the matched desktop viewport, with no reserved collapsed-body space. Review CI evidence before accepting the UI. Source/layout changes can change preview dimensions; this is not a photographic-quality claim.
