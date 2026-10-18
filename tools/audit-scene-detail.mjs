// Verify every delivered detail/Z pixel against its raw source and immutable base rig.
// node tools/audit-scene-detail.mjs RAW_DETAIL_DIR PUBLIC_PACK [PRESERVED_BASELINE_JSON]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {FloatType} from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
const [source,directory,baselineFile]=process.argv.slice(2);
if(!source||!directory)throw Error('Provide raw detail and public pack directories');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const m=await read(path.join(directory,'manifest.json')),raw=await read(path.join(source,'viewfield.json')),zRaw=await read(path.join(source,'detail-depth.json'));
if(raw.sourceSha256!==m.sourceSha256||zRaw.sourceSha256!==m.sourceSha256)throw Error('Raw source SHA differs from base');
if(raw.views.length!==7||zRaw.views.length!==7)throw Error('Expected seven completed raw pairs');
if(Math.abs(raw.camera.lens-m.camera.lens)>1e-5||Math.abs(raw.camera.sensorWidth-m.camera.sensorWidth)>1e-5)throw Error('Source optics differ');
const hashes=new Set(),zHashes=new Set(),stats=[];
const parse=async(file,Loader)=>{const b=await fs.readFile(file);return new Loader().setDataType(FloatType).parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
for(const v of m.views){
 const r=raw.views.find(x=>x.id===v.id),z=zRaw.views.find(x=>x.id===v.id);
 if(!r||!z||!v.detailFile||!v.detailDepth)throw Error(v.id+' missing detail pair');
 for(const entry of [r,z])if(entry.cameraMatrix.some((n,i)=>Math.abs(n-v.cameraMatrix[i])>2e-5)||Math.abs(entry.near-(v.near??m.camera.near))>1e-4)throw Error(v.id+' raw camera/near differs');
 let maximumProjectionPixelDelta=0;
 for(const nx of [-1,0,1])for(const ny of [-1,0,1]){
  const rp=r.projectionMatrix,bp=v.projectionMatrix;
  maximumProjectionPixelDelta=Math.max(maximumProjectionPixelDelta,Math.abs(bp[0]*(nx+rp[8])/rp[0]-bp[8]-nx)*v.width/2,Math.abs(bp[5]*(ny+rp[9])/rp[5]-bp[9]-ny)*v.height/2);
 }
 if(maximumProjectionPixelDelta>1)throw Error(v.id+' detail/base projection differs by more than one base pixel');
 for(const [file,bytes,width,height,set] of [[v.detailFile,v.detailBytes,v.detailWidth,v.detailHeight,hashes],[v.detailDepth,v.detailDepthBytes,v.detailDepthWidth,v.detailDepthHeight,zHashes]]){
  const b=await fs.readFile(path.join(directory,file)),info=await sharp(b).metadata();
  if(b.length!==bytes||info.width!==width||info.height!==height)throw Error(file+' bytes/dimensions differ');
  set.add(crypto.createHash('sha256').update(b).digest('hex'));
 }
 const image=await parse(path.join(source,r.file),HDRLoader),decoded=await sharp(path.join(directory,v.detailFile)).removeAlpha().raw().toBuffer();
 if(image.width!==v.detailWidth||image.height!==v.detailHeight)throw Error(v.id+' raw radiance dimensions differ');
 const e=m.detail.encoding;let mismatches=0,maximum=0,clampedChannels=0;
 for(let i=0;i<image.width*image.height;i++)for(let c=0;c<3;c++){
  const n=image.data[i*4+c];if(!Number.isFinite(n))throw Error(v.id+' nonfinite radiance');maximum=Math.max(maximum,n);if(n>2**e.max)clampedChannels++;
  const expected=Math.round(Math.max(0,Math.min(255,(Math.log2(Math.max(n,2**e.min))-e.min)/(e.max-e.min)*255)));
  if(decoded[i*3+c]!==expected)mismatches++;
 }
 if(mismatches||clampedChannels)throw Error(v.id+' radiance pixel mismatches/clamps '+mismatches+'/'+clampedChannels);
 const zi=await parse(path.join(source,z.file),EXRLoader),zd=await sharp(path.join(directory,v.detailDepth)).removeAlpha().raw().toBuffer();
 if(zi.width!==v.detailDepthWidth||zi.height!==v.detailDepthHeight)throw Error(v.id+' raw Z dimensions differ');
 let zMismatches=0,farSaturated=0;
 for(let y=0;y<zi.height;y++)for(let x=0;x<zi.width;x++){
  let n=zi.data[((zi.height-1-y)*zi.width+x)*4];if(!Number.isFinite(n)||n>=1e9)n=64;if(n>64)farSaturated++;
  const expected=Math.round(Math.max(0,Math.min(1,n/64))*65535),i=(y*zi.width+x)*3;
  if(zd[i]!==(expected>>8)||zd[i+1]!==(expected&255)||zd[i+2]!==0)zMismatches++;
 }
 if(zMismatches)throw Error(v.id+' Z pixel mismatch '+zMismatches);
 stats.push({id:v.id,radiancePixels:image.width*image.height,depthPixels:zi.width*zi.height,radiancePixelMismatches:mismatches,depthPixelMismatches:zMismatches,maximumProjectionPixelDelta,maximumRadiance:maximum,clampedChannels,farSaturated});
}
if(hashes.size!==7||zHashes.size!==7)throw Error('Expected seven distinct detail and depth images');
let baseAndFlashPreserved;
if(baselineFile){
 const b=(await read(baselineFile))[m.id];if(!b)throw Error('Missing baseline scene '+m.id);
 for(const k of ['sourceSha256','camera','bounds','minimumFocal','reframeInset','flash'])if(JSON.stringify(m[k])!==JSON.stringify(b[k]))throw Error('Preserved metadata changed: '+k);
 for(const [file,expected] of Object.entries(b.files)){const actual=crypto.createHash('sha256').update(await fs.readFile(path.join(directory,file))).digest('hex');if(actual!==expected)throw Error('Preserved base/flash changed: '+file);}
 baseAndFlashPreserved=true;
}
console.log(JSON.stringify({id:m.id,sourceSha256:m.sourceSha256,uniqueDetail:hashes.size,uniqueDetailDepth:zHashes.size,baseAndFlashPreserved,views:stats}));
