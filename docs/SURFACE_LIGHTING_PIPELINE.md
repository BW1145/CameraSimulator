# Source surface lighting

This offline pipeline prepares one albedo/roughness atlas and one static HDR diffuse-light atlas for continuous camera movement in an existing optimized glTF room. Browser rendering keeps camera optics, mirror views, environment specular and direct flash dynamic. The original complete Blender scene supplies source materials and illumination and is read without saving.

Tools require Node dependencies from `npm ci`, Blender 4.5 LTS and a separate Python process with NumPy and `xatlas==0.0.11`. Run xatlas outside Blender to keep its native libraries in their own process. The browser uses the generated files directly and needs no Python or Blender installation.

## Barbershop recipe

Start with the optimized geometry before surface baking. `SOURCE.blend` below is the authorized barbershop source file matching the SHA-256 in `model.json`. All work paths are relative and may be moved to another computer.

```sh
node tools/prepare-surface-bake.mjs public/scenes/barbershop .assets-cache/barbershop-bake
python tools/unwrap-surface-bake.py .assets-cache/barbershop-bake --size 2048
blender -b SOURCE.blend --disable-autoexec --python-exit-code 1 --python tools/bake-scene-surfaces.py -- --work .assets-cache/barbershop-bake --size 4096 --samples 32 --passes albedo,roughness
blender -b SOURCE.blend --disable-autoexec --python-exit-code 1 --python tools/bake-scene-irradiance.py -- --work .assets-cache/barbershop-bake --size 4096 --samples 256 --offset .01
blender -b SOURCE.blend --disable-autoexec --python-exit-code 1 --python tools/capture-surface-opacity.py -- --work .assets-cache/barbershop-bake
blender -b --factory-startup --python-exit-code 1 --python tools/denoise-surface-bake.py -- .assets-cache/barbershop-bake
node tools/apply-surface-bake.mjs public/scenes/barbershop .assets-cache/barbershop-bake
npm run audit:assets
```

The atlas packer may choose a larger working layout than its requested resolution; normalized UVs are preserved. The delivered barbershop uses 4096px albedo, 2048px roughness and 2048px irradiance. Irradiance is baked/denoised at 4096px and averaged in linear space during packaging, before log transport encoding. GPU baking selects CUDA where available and otherwise uses CPU. The material pass batches original geometry while preserving source object/generated/UV coordinates. Diffuse lighting samples a white receiving surface slightly above the delivered geometry, with original source geometry, lights, material shaders and ray visibility retained. The target contributes no secondary illumination or shadow.

OpenImageDenoise runs through a factory-startup compositor after the fresh irradiance bake. It preserves a raw HDR copy in the work directory and records the processing in `bake.json`. Run it once per fresh bake. Packaging log-encodes HDR into lossless WebP; the runtime decodes linear half-float values before filtering. Per-material texture views preserve independent atlas channels and matrices. Source diffuse-only shaders use a matte PBR surface. For a constant-diffuse/transparent mix, the source diffuse-colour bake carries opacity coverage. Packaging places this coverage in the shared albedo atlas's alpha channel, using the existing atlas UVs. Click focus checks the sampled alpha cutoff before accepting a surface hit.

`model.json.surfaceBake` records the source hash, maps, samples, source material classes, opacity coverage method, encoding and bytes. Its atlas and embedded albedo retain the source license. New source scenes require their own camera/material and visual checks, with source and raster images compared at the same pose. Static irradiance, local environment probes and raster glass remain approximations to the complete Cycles source.

## Photographic mirror distance

```sh
blender -b SOURCE.blend --disable-autoexec --python-exit-code 1 --python tools/capture-mirror-depth.py -- --pack public/scenes/barbershop-plates --output .assets-cache/barbershop-optics
node tools/package-mirror-depth.mjs .assets-cache/barbershop-optics public/scenes/barbershop-plates
npm run audit:assets
```

The source BVH traces one reflected ray for pixels on actual mirror triangles. Geometric path length unfolds into axial camera-Z with a 64m encoding range in red/green; blue marks pixels whose optical path is longer than the physical path. Only marked mirror pixels override lens/focus distance, preserving upgraded detail depth elsewhere. The physical Z images remain available for foreground occlusion. Manifests retain their existing ambient/detail/flash layers and record the new optical sidecars separately. The seven sidecars use the source scene's attribution and adaptation license.
