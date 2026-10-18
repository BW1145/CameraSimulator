// Add an independently rendered flash or high-resolution radiance layer.
// node tools/package-scene-layer.mjs flash|detail <source-dir> <scene-pack>
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {FloatType,Matrix4,Vector3} from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
const [mode,source,out]=process.argv.slice(2);
if(!['flash','detail'].includes(mode)||!source||!out)throw Error('Use flash|detail source-dir scene-pack');
const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
const metadata=JSON.parse(await fs.readFile(path.join(source,mode==='flash'?'flash.json':'viewfield.json'),'utf8'));
if(metadata.sourceSha256&&metadata.sourceSha256!==manifest.sourceSha256)throw Error('Layer source blend does not match base scene');
if(mode==='detail'&&(Math.abs(metadata.camera.lens-manifest.camera.lens)>.001||Math.abs(metadata.camera.sensorWidth-manifest.camera.sensorWidth)>.001))throw Error('Detail lens/sensor differs from base camera');
const stats=[];
let layerMaximum=0;
for(const view of metadata.views){
 const input=await fs.readFile(path.join(source,view.file));const loader=path.extname(view.file)==='.exr'?new EXRLoader():new HDRLoader();
 const image=loader.setDataType(FloatType).parse(input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength));
 for(let i=0;i<image.data.length;i+=4)for(let c=0;c<3;c++)layerMaximum=Math.max(layerMaximum,image.data[i+c]);
}
const encoding={...manifest.encoding,min:-16,max:Math.max(mode==='flash'?12:6,Math.ceil(Math.log2(Math.max(layerMaximum,1))))};
encoding.maximumChannelQuantizationEV=(encoding.max-encoding.min)/510;encoding.sourceMaximumRadiance=layerMaximum;
for(const view of metadata.views){
 const filename=view.file;
 const input=await fs.readFile(path.join(source,filename));
 const isExr=path.extname(filename)==='.exr';
 const image=(isExr?new EXRLoader():new HDRLoader()).setDataType(FloatType).parse(input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength));
 const rgb=Buffer.alloc(image.width*image.height*3);let clamped=0,maximum=0,negative=0;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)for(let c=0;c<3;c++){
  const i=(y*image.width+x)*3+c,sourceIndex=((isExr?image.height-1-y:y)*image.width+x)*4+c;
  const value=image.data[sourceIndex];if(!Number.isFinite(value))throw Error('Nonfinite radiance '+filename);
  maximum=Math.max(maximum,value);if(value>2**encoding.max)clamped++;if(value<0)negative++;
  rgb[i]=Math.round(Math.max(0,Math.min(255,(Math.log2(Math.max(value,2**encoding.min))-encoding.min)/(encoding.max-encoding.min)*255)));
 }
 const file=view.id+'-'+mode+'.webp';await sharp(rgb,{raw:{width:image.width,height:image.height,channels:3}}).webp({lossless:true}).toFile(path.join(out,file));
 const target=manifest.views.find(v=>v.id===view.id);if(!target)throw Error('Missing base capture '+view.id);
 let cameraMatrixVerification='Actual captured camera matrix';
 if(mode==='flash'){
  if(!metadata.sourceSha256||!view.flashPosition||!view.offset)throw Error('Flash lacks source/pose evidence '+view.id);
  if(view.offset.some((n,i)=>Math.abs(n-target.offset[i])>1e-6)||Math.abs(view.near-(target.near??manifest.camera.near))>1e-4)throw Error('Flash rig offset/clip differs '+view.id);
  const baseMatrix=new Matrix4().fromArray(target.cameraMatrix),forward=metadata.originOffsetForward??0;
  const expectedFlash=new Vector3(0,0,-forward).applyMatrix4(baseMatrix),actualFlash=new Vector3(...view.flashPosition);
  if(expectedFlash.distanceTo(actualFlash)>2e-5)throw Error('Flash origin differs from source camera rig '+view.id);
  if(!view.cameraMatrix){
   const direction=new Vector3(0,0,-1).transformDirection(baseMatrix),cameraPosition=actualFlash.clone().addScaledVector(direction,-forward);
   view.cameraMatrix=baseMatrix.clone().setPosition(cameraPosition).toArray();
   cameraMatrixVerification='Recorded lamp position minus declared forward offset; unchanged orientation fixed by the source rig.';
  }
 }
 if(view.cameraMatrix?.some((n,i)=>Math.abs(n-target.cameraMatrix[i])>2e-5))throw Error('Layer camera differs from base capture '+view.id);
 target[mode==='flash'?'flash':'detailFile']=file;target[mode+'Bytes']=(await fs.stat(path.join(out,file))).size;
 target[mode+'Width']=image.width;target[mode+'Height']=image.height;
 stats.push({id:view.id,file,bytes:target[mode+'Bytes'],offset:view.offset,cameraMatrix:view.cameraMatrix,cameraMatrixVerification,near:view.near,flashPosition:view.flashPosition,maximumRadiance:maximum,clampedChannels:clamped,negativeChannels:negative});
}
manifest[mode]={...metadata,views:stats,encoding,totalBytes:stats.reduce((s,v)=>s+v.bytes,0)};
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest[mode],null,2));


