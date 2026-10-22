import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const [work,folder]=process.argv.slice(2);
const report=JSON.parse(await readFile(path.join(work,'optical.json'),'utf8')),manifest=JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8'));
if(report.sourceSha256!==manifest.sourceSha256)throw Error('Optical depth source differs from the photographic pack');
for(const record of report.views){
  const input=await readFile(path.join(work,record.id+'-optical.bin')),depth=new Float32Array(input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength)),packed=Buffer.alloc(depth.length*3);
  const view=manifest.views.find(v=>v.id===record.id),physical=await sharp(path.join(folder,view.depth)).raw().toBuffer({resolveWithObject:true});
  if(physical.info.width!==record.width||physical.info.height!==record.height)throw Error('Optical and physical depth dimensions differ');
  for(let i=0;i<depth.length;i++){const value=Math.round(Math.max(0,Math.min(1,depth[i]/64))*65535),surface=physical.data[i*physical.info.channels]*256+physical.data[i*physical.info.channels+1];packed[i*3]=value>>8;packed[i*3+1]=value&255;packed[i*3+2]=value>surface+1?255:0;}
  const name=record.id+'-optical-depth.png',file=await sharp(packed,{raw:{width:record.width,height:record.height,channels:3}}).png().toBuffer();await writeFile(path.join(folder,name),file);
  view.opticalDepth=name;view.opticalDepthBytes=file.length;
}
manifest.optics={...report,maskChannel:'blue'};await writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
