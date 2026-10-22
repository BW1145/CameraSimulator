# Reuse responsiveness benchmark

Run only where browser launch is authorized. No local-browser retry or permission bypass is required. `--plan`, syntax checks and the calculation tests do not launch a browser.

```sh
node tools/benchmark-reuse-performance.mjs --plan
node --test tools/performance/metrics.test.mjs
node tools/benchmark-reuse-performance.mjs \
  --baseline-root /path/to/clean/baseline --candidate-root /path/to/clean/candidate \
  --out /path/outside/checkouts/evidence --repeats 2 --build --serve
```

The workflow is isolated to `prototype/reuse-performance`, has read-only repository permissions, and does not deploy. Its default baseline is deployed `9fd67cfcf0730c3946f32510d008c5b09f384687` (the same tree as local canonical `92ea92e208c815fc220bac2eb95f988be10faae9`, `2ad102c345e7cb8c1cdef719c77fc1768dad3634`). Both actual commits and trees, clean checkout gate, all production build hashes, harness hashes and browser/GPU identity are preserved.

## Interpretation

- Both sides receive **identical external instrumentation before startup**, the same real control events and fixed 1280×900 viewport / DPR1. No exposure, optical quality, sample budget or output-resolution reduction is allowed. Record actual canvas dimensions and controls; decoded photographs are compared byte-by-byte at initial, after-detail and final/flash-restored states. Image error is reported, not concealed behind an arbitrary acceptance threshold.
- **Rendered RAF CPU** encloses the entire callback which submitted image-context draw calls: all temporal/reflection/lens/display passes, controller metering and synchronous overlay work in that callback. It is **CPU submission/block time, not GPU completion**. Idle callbacks are excluded. Native `readPixels` and `getBufferSubData` calls are recorded separately; PBO submission is not mislabeled as synchronous GPU wait. Async copies retain the submitting scenario label.
- **Whole-RAF GPU elapsed** uses real `EXT_disjoint_timer_query_webgl2` when available, one nonblocking query in flight around the callback, and discards disjoint/lost results. Unsupported/missing samples remain `null` with a reason; there is no fabricated GPU number and no `gl.finish` completion claim.
- Browser long tasks and real input→matching-ready-revision / actual overlay pixel-write latency complement CPU timings. Readiness polling is 50ms, so latency is coarse and **not a display presentation timestamp**. The first-scene metric is host wall-clock navigation→first-ready, with selected-layer settling stored separately.
- Two rounds reverse before/after ordering to reduce warm-host/order effects. New contexts are used per side/round; OS/browser caches may still differ. Percentiles with few samples are descriptive, not statistically reliable claims. Report every round and do not cherry-pick a fast one.
- CI uses **SwiftShader software rendering only**. These numbers can locate synchronization and regressions, not establish real-device FPS, smoothness or hardware GPU throughput. Hardware acceptance remains a separate measurement.

Scenarios cover first selected scene, first edit, isolated and timed-burst parameter drag, histogram, padded high-resolution magnifier (center/edges), focus change, hide/show while a crop may be pending, rapid actual positions/scenes, flash layer loading/restore, and a bounded 500ms idle observation after all selected layers/readbacks settle. The last check rejects a completion-triggered whole-photo redraw loop. Hide/show covers actual overlay controls and pointer leave/re-entry; it does not fake document visibility.

Every run saves Playwright's trace plus JSON/raw frame/read events and PNGs. A failed run still writes its partial evidence and workflow artifacts. Candidate-only `?diagnostics=performance` stage snapshots are supplemental and never used as the comparable baseline metric.
