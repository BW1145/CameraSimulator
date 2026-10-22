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
report.foregroundRegression={enabled:run.syntheticCaptures?.some(c=>Number.isFinite(c.uniforms.foregroundSupportRadius)&&c.uniforms.foregroundSupportRadius>=0)??false,cases:[],acceptance:{mirrorMAE:.003,mirrorMax:.015,primaryDiskMAE:.05,multiscaleFarMAE:.12,multiscaleFirstOutsideAlpha:[.02,.85]},note:'Only the certified bounded plate path is gated. Legacy unbounded GLTF remains explicitly outside this correction.'};
if(report.foregroundRegression.enabled){
 for(const stem of ['synthetic-white','synthetic-focus-bg','synthetic-f56','synthetic-sharp-near','synthetic-horizontal','synthetic-diagonal','synthetic-support3','synthetic-support8','synthetic-small-disc','synthetic-f56-support8','synthetic-cap-small']){
  const left=decodeHalfBuffer(await bytes(`${stem}-left/linear.rgba16f`)),right=decodeHalfBuffer(await bytes(`${stem}-right/linear.rgba16f`)),mirror=new Float32Array(right.length);
  const horizontal=stem==='synthetic-horizontal',diagonal=stem==='synthetic-diagonal';
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<4;c++)mirror[(y*width+x)*4+c]=right[((horizontal||diagonal?height-1-y:y)*width+(horizontal?x:width-1-x))*4+c];
  const rect=horizontal?[Math.floor(width/4),height/2-24,Math.floor(width/2),48]:diagonal?[width/2-60,height/2-60,120,120]:[width/2-24,Math.floor(height/4),48,Math.floor(height/2)],delta=metrics(left,mirror,width,height,rect);
  const result={id:stem,mirrorOperation:horizontal?'flip-y':diagonal?'rotate-180':'flip-x',mirrorLinear:delta,passed:delta.mae<=.003&&delta.max<=.015};
  if(horizontal||diagonal){
    const radius=report.synthetic.physicalForegroundRadiusPixels,profile=[];
    for(let k=-20;k<20;k++){const x=width/2+(horizontal?0:k),y=height/2+(horizontal?k:0),distance=horizontal?k+.5:(k+1)/Math.SQRT2-.123,t=Math.max(-1,Math.min(1,distance/radius)),ideal=.5-(t*Math.sqrt(Math.max(0,1-t*t))+Math.asin(t))/Math.PI;profile.push({x,y,normalDistance:distance,idealCircularCoverage:ideal,value:left[(y*width+x)*4]});}
    result.diskProfile=profile;result.diskMAE=profile.reduce((sum,p)=>sum+Math.abs(p.value-p.idealCircularCoverage),0)/profile.length;
  }
  if(/synthetic-(support3|support8|small-disc|f56-support8|cap-small)$/.test(stem)){
    const entry=run.syntheticCaptures.find(c=>c.id===stem+'-left'),u=entry.uniforms,z=entry.synthetic.foreground.z,f=u.focal/1000,radius=Math.min(u.lensRadiusLimit,Math.abs(f*f*(z-u.focus)/(u.aperture*Math.max(.05,z)*Math.max(.01,u.focus-f)))*1000/u.sensorWidth*width*.5),profile=[];
    for(let k=0;k<Math.max(1,Math.ceil(radius));k++){const x=width/2+k,distance=k+.5,t=Math.max(-1,Math.min(1,distance/radius)),ideal=.5-(t*Math.sqrt(Math.max(0,1-t*t))+Math.asin(t))/Math.PI;profile.push({distance,ideal,left:left[(Math.floor(height/2)*width+x)*4],rightMirrored:mirror[(Math.floor(height/2)*width+x)*4]});}
    result.localRadius=radius;result.supportRadius=u.foregroundSupportRadius;result.supportRatio=u.foregroundSupportRadius/radius;result.farProfile=profile;
    result.farMAE=profile.reduce((sum,p)=>sum+(Math.abs(p.left-p.ideal)+Math.abs(p.rightMirrored-p.ideal))*.5,0)/profile.length;
    result.halfPixelAlpha=profile[0].left;result.coveragePassed=result.farMAE<=.12&&result.halfPixelAlpha>.02&&result.halfPixelAlpha<.85;result.passed&&=result.coveragePassed;
    const oldEntry=run.baseline?.syntheticCaptures?.find(c=>c.originalId===stem+'-left');
    if(oldEntry){const oldLeft=decodeHalfBuffer(await bytes(`old-${stem}-left/linear.rgba16f`)),oldRight=decodeHalfBuffer(await bytes(`old-${stem}-right/linear.rgba16f`));result.oldFarProfile=profile.map((p,k)=>({...p,left:oldLeft[(Math.floor(height/2)*width+width/2+k)*4],rightMirrored:oldRight[(Math.floor(height/2)*width+width/2-1-k)*4]}));result.oldFarMAE=result.oldFarProfile.reduce((sum,p)=>sum+(Math.abs(p.left-p.ideal)+Math.abs(p.rightMirrored-p.ideal))*.5,0)/profile.length;result.improvesOld=result.farMAE<=result.oldFarMAE+.005;result.passed&&=result.improvesOld;}
  }
  report.foregroundRegression.cases.push(result);
 }
 const p=report.synthetic.profile;report.foregroundRegression.primaryDiskMAE=p.reduce((a,x)=>a+Math.abs(x.left-x.idealCircularCoverage),0)/p.length;
 const strip=decodeHalfBuffer(await bytes('synthetic-thin-strip/linear.rgba16f')),y=Math.floor(height/2),profile=[];let rowEnergy=0;
 for(let x=width/2-32;x<width/2+32;x++){const value=strip[(y*width+x)*4];rowEnergy+=value;profile.push({x,value});}
 report.foregroundRegression.thinStrip={inputWidthPixels:3,rowEnergy,profile,note:'Energy/shape recorded separately: image-space visibility and bilinear edge filtering are not exact finite-aperture rendering.'};
 report.foregroundRegression.passed=report.foregroundRegression.cases.every(c=>c.passed)&&report.foregroundRegression.primaryDiskMAE<=.05;
}
report.timing=run.timing??{note:'No same-run baseline supplied.'};
report.passed=report.transport.passed&&report.cases.every(c=>c.passed)&&(!report.foregroundRegression.enabled||report.foregroundRegression.passed);
await writeFile(join(out,'processing-analysis.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,transport:report.transport,plateProjection:report.plateProjection,cases:report.cases.map(({id,delta8bit,passed})=>({id,delta8bit,passed}))},null,2));
if(!report.passed)process.exitCode=1;
