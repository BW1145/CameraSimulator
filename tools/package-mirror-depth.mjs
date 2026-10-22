import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const [work,folder]=process.argv.slice(2);
const report=JSON.parse(await readFile(path.join(work,'optical.json'),'utf8')),manifest=JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8'));
if(report.sourceSha256!==manifest.sourceSha256)throw Error('Optical depth source differs from the photographic pack');
for(const record of report.views){
  const input=await readFile(path.join(work,record.id+'-optical.bin')),depth=new Float32Array(input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength)),packed=Buffer.alloc(depth.length*3);
  for(let i=0;i<depth.length;i++){const value=Math.round(Math.max(0,Math.min(1,depth[i]/64))*65535);packed[i*3]=value>>8;packed[i*3+1]=value&255;}
  const name=record.id+'-optical-depth.png',file=await sharp(packed,{raw:{width:record.width,height:record.height,channels:3}}).png().toBuffer();await writeFile(path.join(folder,name),file);
  const view=manifest.views.find(v=>v.id===record.id);view.opticalDepth=name;view.opticalDepthBytes=file.length;
}
manifest.optics=report;await writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
