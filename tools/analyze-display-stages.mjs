#!/usr/bin/env node
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {decodeRadiancePixels} from '../src/linear-radiance.js';
import {readLinearSource} from '../diagnostics/stage-audit/read-linear-source.mjs';
import {displayImage,decodeHalfBuffer,metrics,TRANSFORM_ID} from '../diagnostics/stage-audit/display-oracle.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const a=process.argv.slice(2),field=(name,fallback)=>a.includes(name)?a[a.indexOf(name)+1]:fallback;
const source=resolve(field('--source',join(root,'../matched-reference/capture/matched-64spp-oidn.exr'))),pack=resolve(field('--pack',join(root,'diagnostics/matched-reference'))),out=resolve(field('--out',join(root,'../stage-diagnostics/offline-display')));
await mkdir(out,{recursive:true});
const src=await readLinearSource(source),{width,height,data}=src,manifest=JSON.parse(await readFile(join(pack,'manifest.json'))),encoded=await sharp(join(pack,'center.webp')).ensureAlpha().raw().toBuffer();
const decodedHalf=decodeRadiancePixels(encoded,manifest.encoding.min,manifest.encoding.max),decoded=decodeHalfBuffer(Buffer.from(decodedHalf.buffer));
const regions=JSON.parse(await readFile(join(root,'diagnostics/stage-audit/regions.json')));
const exactEV=8-Math.log2(1.4**2*125*100/200),oracleRaw=displayImage(data),oraclePacked=displayImage(decoded),oracleExposed=displayImage(decoded,{ev:exactEV});
const save=async(name,pixels)=>sharp(pixels,{raw:{width,height,channels:4}}).png().toFile(join(out,name));
await save('01-source-defined-display-neutral.png',oracleRaw);await save('02-packed-defined-display-neutral.png',oraclePacked);await save('03-packed-defined-display-exact-controls.png',oracleExposed);
const measure=(ref,test)=>Object.fromEntries(regions.map(r=>[r.id,metrics(ref,test,width,height,r.rect)]));
const report={transform:TRANSFORM_ID,dimensions:[width,height],source,sourceSha256:createHash('sha256').update(await readFile(source)).digest('hex'),packSha256:createHash('sha256').update(await readFile(join(pack,'center.webp'))).digest('hex'),scope:'Offline scalar reference. Does not establish browser/GPU correctness; original JPEG not used.',packingDisplayDelta8bit:measure(oracleRaw,oraclePacked),exactControlExposure:{baseEV:8,aperture:1.4,shutter:1/125,iso:200,cameraEV:8-exactEV,deltaEV:exactEV,linearMultiplier:2**exactEV,equivalentControls:{aperture:5.6,shutter:1/125,iso:3200},displayDelta8bit:measure(oraclePacked,oracleExposed)}};
const blender=field('--blender-png',join(root,'../matched-reference/capture/matched-64spp-oidn.png'));
if(blender){const png=await sharp(blender).ensureAlpha().raw().toBuffer();report.blenderViewVersusDefinedOracle={sourcePNG:blender,note:'Both AgX/None at exposure0 gamma1 but Blender OCIO versus Three polynomial implementation are NOT defined identical. 16bit PNG reduced to8bit for comparison.',delta8bit:measure(png,oracleRaw)};}
await writeFile(join(out,'display-audit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
