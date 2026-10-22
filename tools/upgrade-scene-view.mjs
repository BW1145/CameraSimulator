// Replace one existing view's base/detail radiance from a higher-quality EXR.
// Other views, depth/flash layers and shared encodings stay unchanged.
// A brighter replacement receives a view-local range instead of clipping.
// node tools/upgrade-scene-view.mjs RAW_DIRECTORY SCENE_PACK [VIEW_ID]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {FloatType} from 'three';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {subjectAssetBytes} from './subject-assets.mjs';

const [source, directory, id = 'center'] = process.argv.slice(2);
if (!source || !directory) throw Error('Provide raw capture and existing scene pack directories');
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const manifestPath = path.join(directory, 'manifest.json');
const manifest = await readJson(manifestPath);
const capture = await readJson(path.join(source, 'viewfield.json'));
const view = manifest.views.find(item => item.id === id);
const raw = capture.views.find(item => item.id === id);
if (!view || !raw || !view.detailFile) throw Error('Missing existing view or capture: ' + id);
if (capture.sourceSha256 !== manifest.sourceSha256) throw Error('Source scene differs');
for (const key of ['lens', 'sensorWidth']) {
  if (Math.abs(capture.camera[key] - manifest.camera[key]) > 1e-5) throw Error('Camera ' + key + ' differs');
}
if (!raw.cameraMatrix || raw.cameraMatrix.length !== 16 || raw.cameraMatrix.some((n, i) => !Number.isFinite(n) || Math.abs(n - view.cameraMatrix[i]) > 2e-5)) throw Error('Camera pose differs');
if (Math.abs(raw.near - (view.near ?? manifest.camera.near)) > 1e-4 || Math.abs(capture.captureLens - manifest.captureLens) > 1e-4) throw Error('Capture optics differ');
// Rounded image dimensions can differ slightly, but not the photographed field.
for (const [scale, shift, pixels] of [[0, 8, view.width], [5, 9, view.height]]) {
  for (const edge of [-1, 0, 1]) {
    const projected = view.projectionMatrix[scale] * (edge + raw.projectionMatrix[shift]) / raw.projectionMatrix[scale] - view.projectionMatrix[shift];
    if (!Number.isFinite(projected) || Math.abs(projected - edge) * pixels / 2 > 1) throw Error('Capture projection differs');
  }
}
const input = await fs.readFile(path.join(source, raw.file));
const image = new EXRLoader().setDataType(FloatType).parse(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
if (image.width < view.width || image.height < view.height) throw Error('Replacement is smaller than base');
let maximum = 0;
for (let i = 0; i < image.data.length; i += 4) {
  for (let c = 0; c < 3; c++) {
    const value = image.data[i + c];
    if (!Number.isFinite(value) || value < 0) throw Error('Invalid source radiance');
    maximum = Math.max(maximum, value);
  }
}
for (const encoding of [manifest.encoding, manifest.detail.encoding]) {
  if (encoding.type !== 'log2-rgb') throw Error('Unsupported radiance encoding');
}

function encode(value, encoding) {
  const normalized = (Math.log2(Math.max(value, 2 ** encoding.min)) - encoding.min) / (encoding.max - encoding.min);
  return Math.round(Math.max(0, Math.min(255, normalized * 255)));
}

function packRadiance(width, height, encoding) {
  const bytes = Buffer.alloc(width * height * 3);
  let maximumRadiance = 0;
  const sx = image.width / width, sy = image.height / height;
  // Area-average in scene-linear space, before logarithmic encoding. EXR rows
  // from Three's loader are bottom-up; output files must be top-down.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const left = x * sx, right = (x + 1) * sx, top = y * sy, bottom = (y + 1) * sy;
    const sum = [0, 0, 0];
    for (let iy = Math.floor(top); iy < Math.ceil(bottom); iy++) {
      const wy = Math.min(bottom, iy + 1) - Math.max(top, iy);
      for (let ix = Math.floor(left); ix < Math.ceil(right); ix++) {
        const weight = wy * (Math.min(right, ix + 1) - Math.max(left, ix));
        const index = ((image.height - 1 - iy) * image.width + ix) * 4;
        for (let c = 0; c < 3; c++) sum[c] += image.data[index + c] * weight;
      }
    }
    for (let c = 0; c < 3; c++) {
      const value = sum[c] / (sx * sy);
      maximumRadiance = Math.max(maximumRadiance, value);
      bytes[(y * width + x) * 3 + c] = encode(value, encoding);
    }
  }
  return {bytes, maximumRadiance};
}

const layers = [
  {file: view.file, width: view.width, height: view.height, encoding: manifest.encoding},
  {file: view.detailFile, width: image.width, height: image.height, encoding: manifest.detail.encoding},
];
// Complete encoding and lossless pixel verification before changing delivered files.
for (const layer of layers) {
  let packed = packRadiance(layer.width, layer.height, layer.encoding);
  if (packed.maximumRadiance > 2 ** layer.encoding.max) {
    const max = Math.ceil(Math.log2(packed.maximumRadiance));
    layer.encoding = {...layer.encoding, max, sourceMaximumRadiance: packed.maximumRadiance, maximumChannelQuantizationEV: (max - layer.encoding.min) / 510};
    packed = packRadiance(layer.width, layer.height, layer.encoding);
  }
  const pixels = packed.bytes;
  layer.maximumRadiance = packed.maximumRadiance;
  layer.buffer = await sharp(pixels, {raw: {width: layer.width, height: layer.height, channels: 3}}).webp({lossless: true}).toBuffer();
  const decoded = await sharp(layer.buffer).removeAlpha().raw().toBuffer();
  if (!decoded.equals(pixels)) throw Error('Lossless radiance roundtrip failed');
}
const provenance = {
  samples: raw.samples ?? capture.samples,
  blender: capture.blender,
  denoising: capture.denoising ?? (capture.renderSettings?.use_denoising ? capture.renderSettings.denoiser : undefined),
  sourceExrSha256: crypto.createHash('sha256').update(input).digest('hex'),
  maximumRadiance: maximum,
};
for (const [index, key, shared] of [[0, 'encoding', manifest.encoding], [1, 'detailEncoding', manifest.detail.encoding]]) {
  if (layers[index].encoding.max !== shared.max) view[key] = layers[index].encoding;
  else delete view[key];
}
view.bytes = layers[0].buffer.length;
view.detailBytes = layers[1].buffer.length;
view.detailWidth = image.width;
view.detailHeight = image.height;
view.maximumRadiance = layers[0].maximumRadiance;
view.clampedChannels = 0;
view.radianceCapture = provenance;
// Samples are per-view after an incremental upgrade, never a claim that all
// seven existing views were rendered at the new quality.
for (const entry of manifest.detail.views) entry.samples ??= manifest.detail.samples;
delete manifest.detail.samples;
const detail = manifest.detail.views.find(item => item.id === id);
Object.assign(detail, provenance, {encoding: view.detailEncoding, bytes: view.detailBytes, cameraMatrix: raw.cameraMatrix, near: raw.near, clampedChannels: 0, negativeChannels: 0});
manifest.detail.totalBytes = manifest.detail.views.reduce((sum, item) => sum + item.bytes, 0);
manifest.detail.encoding.sourceMaximumRadiance = Math.max(0, ...manifest.detail.views.filter(item => !item.encoding).map(item => item.maximumRadiance));
manifest.totalBytes = manifest.views.reduce((sum, item) => sum + item.bytes + item.depthBytes, 0);
manifest.initialBytes = manifest.views[0].bytes + manifest.views[0].depthBytes;
if (manifest.subjects) Object.assign(manifest, await subjectAssetBytes(directory, manifest.subjects));
manifest.initialWithSubjectBytes = manifest.initialBytes + (manifest.initialSubjectBytes ?? manifest.subjectBytes ?? 0);
for (const layer of layers) await fs.writeFile(path.join(directory, layer.file), layer.buffer);
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({id, ...provenance, baseBytes: view.bytes, detailBytes: view.detailBytes, dimensions: [image.width, image.height]}, null, 2));
