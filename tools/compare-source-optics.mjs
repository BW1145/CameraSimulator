#!/usr/bin/env node
/** Same defined display comparison: actual Cycles DOF against browser DOF.
 * This reports physical/model residuals; it never uses original JPEG ground truth.
 */
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {readLinearSource} from '../diagnostics/stage-audit/read-linear-source.mjs';
import {displayImage,decodeHalfBuffer,metrics,TRANSFORM_ID} from '../diagnostics/stage-audit/display-oracle.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),a=process.argv.slice(2),field=(n,f)=>a.includes(n)?a[a.indexOf(n)+1]:f;
const source=resolve(field('--source',join(root,'../stage-diagnostics/source-optics'))),browser=field('--browser',null),out=resolve(field('--out',join(root,'../stage-diagnostics/optics-comparison')));await mkdir(out,{recursive:true});
const regions=JSON.parse(await readFile(join(root,'diagnostics/stage-audit/regions.json')));regions.push({id:'far-blind-interior',rect:[1440,225,325,125],kind:'ordinary'},{id:'far-wall-portraits',rect:[1430,105,325,55],kind:'ordinary'},{id:'near-cabinet-interior',rect:[10,360,180,265],kind:'ordinary'});
const report={transform:TRANSFORM_ID,scope:'Known matched pose, full-frame sensor36/focal24.9136037681, axial focus1.4m. Source actual Cycles finite-aperture64spp OIDN; browser source-pinhole64spp OIDN post-blur. Different Monte Carlo/denoising, occlusion visibility and mirror light paths are recorded residuals, not pixel equality expectation.',cases:[]};
for(const [f,folder,id]of [[1.4,'f1p4','dof-f14-neutral'],[5.6,'f5p6','dof-f56-neutral']]){
 const file=join(source,folder,`source-dof-f${f}-focus1.4m-64spp-oidn.exr`);try{await access(file)}catch{continue;}
 const src=await readLinearSource(file),{width,height,data}=src,display=displayImage(data);await sharp(display,{raw:{width,height,channels:4}}).png().toFile(join(out,`cycles-f${f}-same-defined-display.png`));
 const row={aperture:f,source:file,dimensions:[width,height],sourceDisplay:`cycles-f${f}-same-defined-display.png`};
 if(browser){const gpu=decodeHalfBuffer(await readFile(join(browser,id,'linear.rgba16f'))),bdisplay=await readFile(join(browser,id,'display.rgba8'));row.displayDelta8bit=Object.fromEntries(regions.map(r=>[r.id,{kind:r.kind,...metrics(display,bdisplay,width,height,r.rect)}]));row.linearDelta=Object.fromEntries(regions.map(r=>[r.id,{kind:r.kind,...metrics(data,gpu,width,height,r.rect)}]));}
 report.cases.push(row);
}
await writeFile(join(out,'optics-comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
