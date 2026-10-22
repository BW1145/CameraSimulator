#!/usr/bin/env node
/** Offline acceptance analysis of the real-browser harness artifacts. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {decodeRadiancePixels} from '../src/linear-radiance.js';
import {displayImage,decodeHalfBuffer,metrics,TRANSFORM_ID} from '../diagnostics/stage-audit/display-oracle.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),argv=process.argv.slice(2),field=(n,f)=>argv.includes(n)?argv[argv.indexOf(n)+1]:f;
const dir=resolve(field('--evidence',join(root,'processing-stage-evidence'))),out=resolve(field('--out',dir));await mkdir(out,{recursive:true});
const run=JSON.parse(await readFile(join(dir,'run.json')));assert.equal(run.status,'passed');const [width,height]=[run.initial.width,run.initial.height],regions=JSON.parse(await readFile(join(root,'diagnostics/stage-audit/regions.json'))),report={transform:TRANSFORM_ID,evidenceCommit:run.source.commit,sourceHash:run.source.sha256,dimensions:[width,height],acceptance:{transport:'Exact equality offline lossless WebP vs browser Image/canvas codes; exact production half-float decode bytes.',display:'Against independent scalar transform of actual preceding GPU linear framebuffer: mean absolute error <=0.05 code, max<=2 codes, fraction >1code<=0.00001. Float16 lens intermediate allows one extra rounding code.',scope:'Pass means shared implementation is behaving as defined, NOT exact Blender OCIO/physical DOF parity.'}};
const bytes=async name=>readFile(join(dir,name));
const sourcePixels=await sharp(join(root,'diagnostics/matched-reference/center.webp')).ensureAlpha().raw().toBuffer(),browserCodes=await bytes('transport-canvas.rgba8'),half=decodeRadiancePixels(sourcePixels,run.initial.pack.encoding.min,run.initial.pack.encoding.max),browserHalf=await bytes('decoded-texture.rgba16f');
let encodedMismatch=0,halfMismatch=0;for(let i=0;i<sourcePixels.length;i++)encodedMismatch+=sourcePixels[i]!==browserCodes[i];const expectedHalf=Buffer.from(half.buffer,half.byteOffset,half.byteLength);for(let i=0;i<expectedHalf.length;i++)halfMismatch+=expectedHalf[i]!==browserHalf[i];report.transport={encodedMismatchedBytes:encodedMismatch,decodedHalfMismatchedBytes:halfMismatch,passed:encodedMismatch===0&&halfMismatch===0};
const decoded=decodeHalfBuffer(browserHalf),pre=decodeHalfBuffer(await bytes('pre-display-framebuffer.rgba16f'));report.plateProjection={note:'Float texture filtering plus matrix projection and half-float framebuffer; no new exposure/display here. Errors on material edges can reflect subpixel projection.',deltaLinear:metrics(decoded,pre,width,height)};
report.cases=[];
for(const entry of run.cases){
 if(entry.synthetic)continue;
 const base=entry.lens?`dof-f${entry.aperture===1.4?'14':'56'}-neutral/linear.rgba16f`:'pre-display-framebuffer.rgba16f';
 const linear=entry.lens?decodeHalfBuffer(await bytes(base)):pre,expected=displayImage(linear,{ev:entry.exposureEV,wb:entry.wb}),actual=await bytes(`${entry.id}/display.rgba8`),delta=metrics(expected,actual,width,height),passed=delta.mae<=.05&&delta.max<=2&&delta.fractionOver1<=.00001;
 report.cases.push({id:entry.id,precedingLinearArtifact:base,delta8bit:delta,passed,regions:Object.fromEntries(regions.filter(r=>r.id!=='whole').map(r=>[r.id,metrics(expected,actual,width,height,r.rect)]))});
}
if(run.syntheticCaptures?.length){
 const left=decodeHalfBuffer(await bytes('synthetic-white-left/linear.rgba16f')),right=decodeHalfBuffer(await bytes('synthetic-white-right/linear.rgba16f')),mirror=new Float32Array(right.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<4;c++)mirror[(y*width+x)*4+c]=right[(y*width+width-1-x)*4+c];
 const f=run.initial.pack.referenceFocal/1000,focus=1.4,z=.9,aperture=1.4,radius=Math.abs(f*f*(z-focus)/(aperture*z*(focus-f)))*1000/36*width/2;
 const coverage=x=>{const t=Math.max(-1,Math.min(1,x/radius));return .5-(t*Math.sqrt(Math.max(0,1-t*t))+Math.asin(t))/Math.PI;};
 const center=width/2,mid=Math.floor(height/2),profile=[];
 for(let x=center-20;x<center+20;x++){const i=(mid*width+x)*4;profile.push({x,relativeCenter:x+.5-center,idealCircularCoverage:coverage(x+.5-center),left:left[i],rightMirrored:mirror[i]});}
 report.synthetic={description:'Mirror-paired opaque white foreground against constant black background through production lensOnly shader. Ideal circular footprint and reflection symmetry do not require hidden background colors.',physicalForegroundRadiusPixels:radius,gatherFirstTapRadiusPixels:width*.08*.5/24,gatherSecondTapRadiusPixels:width*.08*1.5/24,mirrorSymmetryEdgeLinear:metrics(left,mirror,width,height,[center-20,Math.floor(height/4),40,Math.floor(height/2)]),profile,note:'Diagnostic only; physical-model residual is reported separately from transport/display implementation gates.'};
}
report.passed=report.transport.passed&&report.cases.every(c=>c.passed);
await writeFile(join(out,'processing-analysis.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,transport:report.transport,plateProjection:report.plateProjection,cases:report.cases.map(({id,delta8bit,passed})=>({id,delta8bit,passed}))},null,2));
if(!report.passed)process.exitCode=1;
