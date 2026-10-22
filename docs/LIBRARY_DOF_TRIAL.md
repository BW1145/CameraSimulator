# Isolated mature-library lens trial

Status: **not accepted, not deployed**. Branch `prototype/reuse-dof` starts from canonical `92ea92e208c815fc220bac2eb95f988be10faae9`, tree-identical to deployed main `9fd67cf`. Phase-one responsiveness work is independent. The default path does not initialize or load the experimental library chunk. `?dof=library` opts in; `view=source` deliberately does not.

## What is reused

`postprocessing` **6.39.5**, Zlib, exact package-lock integrity; its peer range covers the installed Three **0.186.1**. License retained at `public/licenses/postprocessing.txt`. The actual package owns CoC softening, foreground/background blur, mask and composite. No copied blur kernel, private pass manipulation, React migration, or shader-source substring patch is used.

The public `effect.cocMaterial` exposes a Three ShaderMaterial. Only its complete small CoC fragment/uniforms are replaced via public fields. The new producer evaluates the application's existing axial thin-lens equation in metres/mm, uses the canonical live `sceneDepth`/`linearDepth` references (including mirror optical distances), and writes the package's documented near-red/far-green convention. No aesthetic focus band or focal/aperture restriction is added. The version is pinned because the RG protocol and pixel-radius semantics require revalidation on upgrades.

`bokehScale = maximum physical radius in pixels`; encoded CoC is `physical radius / maximum radius`. This preserves **input CoC**, not a claim that the package's final point-spread function equals a physical uniform disc. Base blur plus nonlinear max-fill can extend sampling support to ~1.962 radii. The trial pads temporal patches and detail crops by **2R+16 px** (conservative support, not a claimed effective blur radius). The controlled point/edge captures explicitly record physical radius, flux, radial RMS, f/1.4→f/5.6 scale and output scanlines before accepting any unit-conversion decision.

## Existing photograph contracts

- Linear HalfFloat input/output; no library tone mapping or output encoding. Existing photographic exposure, white balance, AgX, ISO noise and stripes remain downstream exactly once.
- Every temporal sample is lens-processed before weighted accumulation. Flash remains an endpoint-only pulse, with its ambient difference calculated at that endpoint. Integrated radiance skips the original lens pass afterward.
- The meter remains unexposed, instantaneous and unblurred. Source-view diagnostics remain unchanged.
- Detail rendering retains its own crop, canonical optical-depth pass, temporal integration and preserved main-frame state. The trial's wider filter support increases crop/temporal work rather than hiding clipped kernels.
- Library-owned targets/materials are disposed on scene replacement. Render target/viewport/scissor/autoClear restore in `finally`; source textures are not disposed by the adapter.

## Known limitations and acceptance boundary

The package keeps unsigned-byte CoC (~R/255 px quantization), fixed default Kawase near-CoC spread, half-resolution foreground intermediates, and nonlinear channel-wise max-fill. These can change silhouette coverage, highlight energy, effective PSF and magnifier phase alignment. Screen-space methods cannot reveal hidden backgrounds or reproduce Cycles glass/multiple-bounce paths. This is a candidate to measure, not an assumed improvement. No corrective sampler/kernel rewrite is in scope.

`diagnostics/library-dof` is a separately built test-only page; not part of the normal build. It exercises the unchanged canonical shader and actual package on identical synthetic near/far planes, edges, thin wires, ordinary texture, unclipped HDR, axial focus, point PSF and 2× resolution. It records raw linear scanlines/flux/moments, display PNGs and separately labelled completed HDR-readPixels latency. Hardware GPU timings are used only when the extension exists, query is available and GPU-disjoint is false. SwiftShader timings **are not real-GPU FPS**.

The opt-in browser suite also compares real canonical barbershop photos at identical controls, asserts bounded/full-frame temporal equivalence, verifies fresh library-rendered paused magnifier pixels preserve the main photo, checks no second lens/display transform, exports, and changes scenes. Raw Cycles f/1.4/f/5.6 source references in the independent source-optics workspace remain test evidence, not renderer assets; exact matched-source comparison is a later check if the controlled PSF/coverage candidate survives. Existing inferred-camera diagnostics have no mirror map and must not be described as exact original-camera recovery.

## Verification

Local: 40 Node tests, asset/scene audits, normal production build, separate fixture build and browser test enumeration pass. **No browser has been launched locally**; previous denied socket/permission route is not retried. Actual GPU shader compilation, numerical image assertions and performance remain unverified until isolated GitHub Actions completes for the exact published commit.

CI-only comparison (no deploy job):

```sh
npm ci
npm test && npm run audit:assets
npm run build && node tools/build-library-dof-fixture.mjs
DOF_TRIAL_COMPARE=1 npx playwright test tests/browser/library-dof.spec.js
```

The isolated workflow uploads evidence but has read-only repository permissions and no Pages/deployment step. Root owns publication and CI monitoring; no main merge or deployment is implied.

Official sources: [DepthOfFieldEffect API](https://pmndrs.github.io/postprocessing/public/docs/class/src/effects/DepthOfFieldEffect.js~DepthOfFieldEffect.html), [versioned source](https://github.com/pmndrs/postprocessing/blob/v6.39.5/src/effects/DepthOfFieldEffect.js), [versioned package](https://github.com/pmndrs/postprocessing/blob/v6.39.5/package.json).
