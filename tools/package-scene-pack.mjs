// node tools/package-scene-pack.mjs <Blender capture directory> <public scene pack>
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {FloatType} from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {subjectAssetBytes} from './subject-assets.mjs';
const [source,out,id='barbershop',title='Agent 327 Barbershop',attribution='Blender Foundation / Blender Studio — CC BY']=process.argv.slice(2);if(!source||!out)throw Error('Provide source and output directories, optionally id/title/attribution');
await fs.mkdir(out,{recursive:true});
const raw=JSON.parse(await fs.readFile(path.join(source,'viewfield.json'),'utf8'));
const manifest={version:1,id,title,sourceSha256:raw.sourceSha256,attribution,
  method:'Seven individually rendered positions. XYZ selects an actual source camera; pan and focal length reframe that image. No invented continuous physical camera translation.',
  encoding:{type:'log2-rgb',min:-16,max:6,losslessContainer:'WebP',maximumChannelQuantizationEV:22/510},depth:{type:'uint16-rg',space:'capture-camera-z',range:64},
  camera:raw.camera,derivations:raw.derivations||[],referenceFocal:raw.camera.lens/raw.camera.sensorWidth*36,captureLens:raw.captureLens,bounds:raw.bounds,views:[]};
async function parse(file,loader){const b=await fs.readFile(file);return loader.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
let packMaximum=0;
for(const view of raw.views){const probe=await parse(path.join(source,view.file),new HDRLoader().setDataType(FloatType));for(let i=0;i<probe.data.length;i+=4)for(let c=0;c<3;c++)packMaximum=Math.max(packMaximum,probe.data[i+c]);}
manifest.encoding.max=Math.max(6,Math.ceil(Math.log2(Math.max(packMaximum,1)))+1);
manifest.encoding.maximumChannelQuantizationEV=(manifest.encoding.max-manifest.encoding.min)/510;
manifest.encoding.sourceMaximumRadiance=packMaximum;
for(const view of raw.views){
  const image=await parse(path.join(source,view.file),new HDRLoader().setDataType(FloatType));
  const rgb=Buffer.alloc(image.width*image.height*3);let clamped=0,maximum=0;
  for(let i=0;i<image.width*image.height;i++)for(let c=0;c<3;c++){
    const value=image.data[i*4+c];maximum=Math.max(maximum,value);if(value>2**manifest.encoding.max)clamped++;
    rgb[i*3+c]=Math.round(Math.max(0,Math.min(255,(Math.log2(Math.max(value,2**manifest.encoding.min))-manifest.encoding.min)/(manifest.encoding.max-manifest.encoding.min)*255)));
  }
  const file=view.id+'.webp';await sharp(rgb,{raw:{width:image.width,height:image.height,channels:3}}).webp({lossless:true}).toFile(path.join(out,file));
  const depth=await parse(path.join(source,view.id+'-depth.exr'),new EXRLoader().setDataType(FloatType));
  const packed=Buffer.alloc(depth.width*depth.height*3);let minimumDepth=Infinity,maximumDepth=0;
  // EXRLoader returns bottom-up rows; PNG files use top-down rows.
  for(let y=0;y<depth.height;y++)for(let x=0;x<depth.width;x++){
    const d=depth.data[((depth.height-1-y)*depth.width+x)*4];
    if(Number.isFinite(d)&&d<1e9){minimumDepth=Math.min(minimumDepth,d);maximumDepth=Math.max(maximumDepth,d);}
    const n=Math.round(Math.max(0,Math.min(1,d/64))*65535),i=(y*depth.width+x)*3;packed[i]=n>>8;packed[i+1]=n&255;
  }
  const depthFile=view.id+'-depth.png';await sharp(packed,{raw:{width:depth.width,height:depth.height,channels:3}}).png({compressionLevel:9}).toFile(path.join(out,depthFile));
  manifest.views.push({...view,file,depth:depthFile,width:image.width,height:image.height,depthWidth:depth.width,depthHeight:depth.height,
    bytes:(await fs.stat(path.join(out,file))).size,depthBytes:(await fs.stat(path.join(out,depthFile))).size,maximumRadiance:maximum,clampedChannels:clamped,minimumDepth,maximumDepth});
  console.log(JSON.stringify(manifest.views.at(-1)));
}
manifest.totalBytes=manifest.views.reduce((sum,v)=>sum+v.bytes+v.depthBytes,0);
manifest.initialBytes=manifest.views[0].bytes+manifest.views[0].depthBytes;
let subjectSource;
try{subjectSource=await fs.readFile(path.join(out,'subjects.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(subjectSource){
  manifest.subjects='subjects.json';Object.assign(manifest,await subjectAssetBytes(out,manifest.subjects));
  manifest.initialWithSubjectBytes=manifest.initialBytes+manifest.initialSubjectBytes;
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');


