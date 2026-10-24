// Verify a complete, formally rendered delivery before copying any runtime asset.
// node tools/import-classroom-viewpoints.mjs DELIVERY_JSON [--copy]
// No copy, render, recompression, Git mutation or publication happens by default.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,rename,rm,access,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditClassroomPack,validateClassroomRig,CLASSROOM_SOURCE} from './classroom-viewpoint-audit.mjs';
import {CLASSROOM_VIEWPOINTS} from '../src/scenes.js';

const [input,...options]=process.argv.slice(2);
assert.ok(input&&options.every(arg=>arg==='--copy'),'Use DELIVERY_JSON [--copy]');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidenceFile=path.join(root,'docs/visual-review/classroom-viewpoints-delivery.json');
const deliveryFile=path.resolve(input),delivery=JSON.parse(await readFile(deliveryFile,'utf8'));
assert.equal(delivery.status,'packaged-and-audited');assert.equal(delivery.sourceSha256,CLASSROOM_SOURCE);
assert.deepEqual(delivery.rigs?.map(r=>r.rig).sort(),['desk','teacher','window']);
const spec=JSON.parse(await readFile(path.resolve(path.dirname(deliveryFile),'..','rig-config.json'),'utf8'));
assert.equal(spec.sourceSha256,CLASSROOM_SOURCE);assert.deepEqual(spec.rigs?.map(r=>r.id).sort(),['desk','teacher','window']);
const audited=[];
for(const scene of CLASSROOM_VIEWPOINTS){
  const receipt=delivery.rigs.find(r=>`classroom-${r.rig}`===scene.id);
  assert.ok(receipt?.files&&Object.keys(receipt.files).length===36,'complete 36-file SHA receipt');
  const source=path.resolve(path.dirname(deliveryFile),'packs',scene.id);
  assert.equal(path.resolve(receipt.pack),source,'pack path must belong to this delivery');
  const rig=spec.rigs.find(r=>`classroom-${r.id}`===scene.id);
  validateClassroomRig(JSON.parse(await readFile(path.join(source,'manifest.json'),'utf8')),rig);
  audited.push({scene,source,receipt,rig,result:await auditClassroomPack(source,receipt.files)});
}
console.log(JSON.stringify({status:'verified',packs:audited.map(item=>item.result)},null,2));
if(options.includes('--copy')){
  // Refuse to overwrite any existing directory; this also protects the original
  // panorama. All three packages are checked and staged before the first rename.
  for(const destination of [evidenceFile,...audited.map(({scene})=>path.join(root,'public',scene.platePack))]){
    try{await access(destination);throw Error(`Destination already exists: ${destination}`);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  await mkdir(path.join(root,'.assets-cache'),{recursive:true});
  const staging=await mkdtemp(path.join(root,'.assets-cache','classroom-import-')),installed=[];
  try{
    for(const {scene,source,receipt}of audited){await cp(source,path.join(staging,scene.id),{recursive:true,errorOnExist:true});await auditClassroomPack(path.join(staging,scene.id),receipt.files);}
    // Portable receipt is committed with the packs so every later CI audit
    // repeats the complete byte/hash and frozen-rig checks, not just headers.
    const evidence={version:1,sourceSha256:CLASSROOM_SOURCE,packs:audited.map(({scene,receipt,rig})=>({id:scene.id,files:receipt.files,rig}))};
    await writeFile(path.join(staging,'delivery.json'),JSON.stringify(evidence,null,2)+'\n');
    for(const {scene}of audited){const destination=path.join(root,'public',scene.platePack);await rename(path.join(staging,scene.id),destination);installed.push(destination);}
    await rename(path.join(staging,'delivery.json'),evidenceFile);installed.push(evidenceFile);
  }catch(error){for(const destination of installed)await rm(destination,{recursive:true,force:true});throw error;}
  finally{await rm(staging,{recursive:true,force:true});}
  console.log('Copied all three verified packs without re-encoding; run npm test, npm run audit:assets, and npm run build. Browser/visual acceptance remains required.');
}
