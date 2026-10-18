# High-HDR flash verification

The short-shutter flash previously reached the HalfFloat scene, lens and pulse buffers before photographic exposure reduced it. The real right-position barber flash has a source peak of 4602.956; at strength 2 and 1/8000 s its gain is 160, so an unscaled intermediate can exceed 736,000. HalfFloat ends at 65,504.

The renderer now pre-exposes **all scene output** by `1 / (1 + flash gain)` before its first HalfFloat write. The plate applies it explicitly; standard, physical and basic live-subject materials apply the same uniform after lighting. Lens filtering and temporal/pulse integration retain this scale. The final exposure divides it back out before white balance and display encoding. Metering likewise reports original scene units. The legacy `Scene Color` background bypasses mesh shaders, so its original linear color is saved and multiplied by the same per-frame scale. This preserves HDR and existing pulse timing without changing render-target formats, MSAA or blend requirements.

Production evidence was collected from actual WebGL2 framebuffer readbacks in the built app at `http://127.0.0.1:8002/`, using headless Chrome. The real `right-flash.webp` was retained; only ambient was replaced with black to isolate pulse energy. Settings were f/22, ISO50, flash strength 2, stationary subject.

| Input | 1/125 raw buffer peak | 1/8000 raw buffer peak | 1/8000 before scale | Final exposed peak, 1/125 / 1/8000 |
|---|---:|---:|---:|---:|
| Real barber flash layer | 3200 | 4452 | 716772 | 23.690079 / 23.689154 |
| Constant 4603-target HDR transport fixture | 3368 | 4684 | 754124 | 24.933808 / 24.923629 |
| Isolated real fan PointLight pulse | 108.875 | 151.5 | 24391.5 | 0.806018 / 0.806134 |

All audited intermediate channels were finite. The respective absolute fast/slow exposed-peak differences were approximately 0.000056, 0.000589 and 0.000207 EV. The constant fixture uses the actual log encoding and therefore decodes to about 4715 after transport quantization. All live fan mesh shaders used the same pre-exposure factor, approximately `0.00621118024` at 1/8000.

`tests/browser/flash-hdr.spec.js` checks actual flash content, the strong HDR fixture, finite HalfFloat outputs, fixed-aperture/ISO energy conservation and matching live-mesh scale. Together with the GPU lens and existing layer/retry tests, **7 tests passed** in 21.1 seconds. A subsequent legacy Scene Color production regression also passed in 4.6 seconds: flash off/on mean display codes were 42.690083 and 42.692782 (difference 0.002699), with the same camera settings. Detailed values and method are in [final-flash-hdr.json](final-flash-hdr.json).

HalfFloat quantization remains. Existing single-depth lens and bounded motion-sample approximations remain unchanged.
