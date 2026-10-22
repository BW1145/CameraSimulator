// Run after check-raw-with-blender.py; validates the independent decoder's hashes.
import {readLinearSource} from './read-linear-source.mjs';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.dirname(new URL(import.meta.url).pathname);
const source=await readLinearSource(process.argv[2]??path.join(root,'../../../matched-reference/capture/matched-64spp-oidn.exr'));
const pixels=await sharp(process.argv[3]??path.join(root,'../matched-reference/center.webp')).removeAlpha().raw().toBuffer();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const actual={rgbaFloat32LETopLeftSHA256:hash(Buffer.from(source.data.buffer)),logMin16Max8RGBUint8SHA256:hash(pixels)};
const independent=JSON.parse(await fs.readFile(path.join(root,'blender-raw-check.json')));
const result={method:'JavaScript EXRLoader vs independent Blender 4.5 image loader; decoded WebP RGB vs independently NumPy-generated log quantization codes.',actual,independent,checks:{exactDecodedEXRValues:actual.rgbaFloat32LETopLeftSHA256===independent.rgbaFloat32LETopLeftSHA256,exactWebPCodesVersusBlenderAndNumPy:actual.logMin16Max8RGBUint8SHA256===independent.logMin16Max8RGBUint8SHA256}};
await fs.writeFile(path.join(root,'cross-decoder-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
assert.ok(Object.values(result.checks).every(Boolean),'Independent EXR/code hash mismatch');
