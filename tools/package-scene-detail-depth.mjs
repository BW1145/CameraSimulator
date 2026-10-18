// Add matching high-resolution axial depth to the existing lazy detail layer.
// node tools/package-scene-detail-depth.mjs <capture-dir> <public-scene-pack>
import fs from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';import {FloatType} from 'three';import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
const [source,out]=process.argv.slice(2);if(!source||!out)throw Error('Provide source and scene pack');
const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8')),metadata=JSON.parse(await fs.readFile(path.join(source,'detail-depth.json'),'utf8'));
if(metadata.sourceSha256!==manifest.sourceSha256)throw Error('Depth source differs from base scene');
const stats=[];
for(const view of metadata.views){
 const target=manifest.views.find(v=>v.id===view.id);if(!target)throw Error('Missing base camera '+view.id);
 if(view.cameraMatrix.some((n,i)=>Math.abs(n-target.cameraMatrix[i])>2e-5))throw Error('Depth camera differs from base '+view.id);
 if(Math.abs(view.near-(target.near??manifest.camera.near))>1e-4)throw Error('Depth clip plane differs from base '+view.id);
 const bytes=await fs.readFile(path.join(source,view.file)),image=new EXRLoader().setDataType(FloatType).parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const packed=Buffer.alloc(image.width*image.height*3);let minimum=Infinity,maximum=0,clampedPixels=0;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
  let z=image.data[((image.height-1-y)*image.width+x)*4];
  if(Number.isFinite(z)&&z<1e9){minimum=Math.min(minimum,z);maximum=Math.max(maximum,z);}
  else z=64;
  if(z>64)clampedPixels++;
  const n=Math.round(Math.max(0,Math.min(1,z/64))*65535),i=(y*image.width+x)*3;packed[i]=n>>8;packed[i+1]=n&255;
 }
 const file=view.id+'-detail-depth.png';await sharp(packed,{raw:{width:image.width,height:image.height,channels:3}}).png({compressionLevel:9}).toFile(path.join(out,file));
 target.detailDepth=file;target.detailDepthWidth=image.width;target.detailDepthHeight=image.height;target.detailDepthBytes=(await fs.stat(path.join(out,file))).size;
 stats.push({...view,file,width:image.width,height:image.height,bytes:target.detailDepthBytes,minimumZ:minimum,maximumZ:maximum,clampedPixels});
}
manifest.detailDepth={...metadata,views:stats,totalBytes:stats.reduce((sum,v)=>sum+v.bytes,0)};
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest.detailDepth,null,2));
