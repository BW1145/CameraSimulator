// Check the seven actual source transforms and their delivered image/depth pairs.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {Matrix4,Vector3} from 'three';
const packs=process.argv.slice(2);if(!packs.length)throw Error('Provide one or more scene pack directories');
for(const directory of packs){
 const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
 const center=manifest.views.find(v=>v.id==='center');const origin=new Matrix4().fromArray(center.cameraMatrix);
 const imageHashes=new Set(),depthHashes=new Set(),positions=[];
 for(const view of manifest.views){
  if(Math.abs(view.projectionMatrix[11]+1)>1e-5||Math.abs(view.projectionMatrix[15])>1e-5)throw Error(manifest.id+'/'+view.id+': capture is not perspective');
  if(view.maximumDepth<1||view.maximumDepth-view.minimumDepth<1)throw Error(manifest.id+'/'+view.id+': entire room view is blocked or lacks depth range');
  const expected=new Vector3(...view.offset).applyMatrix4(origin),actual=new Vector3(...view.position);
  if(actual.distanceTo(expected)>1e-5)throw Error(`${manifest.id}/${view.id}: incorrect physical offset`);
  const frame=new Matrix4().fromArray(view.cameraMatrix);if(Math.abs(frame.determinant()-1)>1e-4)throw Error(`${manifest.id}/${view.id}: non-unit camera scale`);
  for(const [file,bytes,hashes] of [[view.file,view.bytes,imageHashes],[view.depth,view.depthBytes,depthHashes]]){
   const data=await fs.readFile(path.join(directory,file));if(data.length!==bytes)throw Error(`${file}: byte count mismatch`);
   hashes.add(crypto.createHash('sha256').update(data).digest('hex'));
  }
  positions.push({id:view.id,position:view.position,minimumZ:view.minimumDepth,maximumZ:view.maximumDepth});
 }
 if(manifest.views.length!==7||imageHashes.size!==7||depthHashes.size!==7)throw Error(`${manifest.id}: expected seven independent camera captures`);
 console.log(JSON.stringify({id:manifest.id,sourceSha256:manifest.sourceSha256,referenceFocal:manifest.referenceFocal,camera:manifest.camera.name,nativeScale:manifest.camera.sourceScale,uniqueRadiance:imageHashes.size,uniqueDepth:depthHashes.size,initialBytes:manifest.initialBytes,totalBytes:manifest.totalBytes,positions}));
}



