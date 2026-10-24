// Import only the two complete approved revisions, keeping teacher bytes intact.
// Default is read-only. --copy replaces directories transactionally, never files
// in place, so prior worktrees/production packs and shared hardlinks stay frozen.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,rm,access,mkdtemp,statfs} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {auditClassroomPack} from './classroom-viewpoint-audit.mjs';
import {validateApprovedPreviewReport} from './classroom-composition-audit.mjs';
import {linkAssetTree} from './static-assets.mjs';
import {validateClassroomDelivery,validateClassroomHistory,validateApprovedInputs,moveTransaction} from './classroom-receipt.mjs';
const hash=data=>createHash('sha256').update(data).digest('hex');
const [input,...options]=process.argv.slice(2);
assert.ok(input&&options.length<=1&&options.every(x=>['--copy','--link'].includes(x)),'Use DELIVERY_JSON [--copy | --link]');
const writeMode=options[0];
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidenceFile=path.join(root,'docs/visual-review/classroom-viewpoints-delivery.json');
const historyPath='docs/visual-review/classroom-viewpoints-v1-delivery.json',historyFile=path.join(root,historyPath);
const oldBytes=await readFile(evidenceFile),prior=validateClassroomDelivery(JSON.parse(oldBytes));
assert.equal(prior.version,1,'this migration only upgrades the frozen v1 receipt once');
for(const record of prior.packs)await auditClassroomPack(path.join(root,'public/scenes',record.id+'-plates'),record.files,record.rig);
const deliveryFile=path.resolve(input),deliveryBytes=await readFile(deliveryFile),delivery=JSON.parse(deliveryBytes);
assert.equal(delivery.version,2);assert.equal(delivery.status,'packaged-and-audited');
assert.ok(!Object.hasOwn(delivery,'sourceSha256'),'v2 has per-rig sources, not one global source');
assert.deepEqual(delivery.rigs?.map(r=>r.rig).sort(),['desk','window']);
const spec=JSON.parse(await readFile(path.resolve(path.dirname(deliveryFile),'..','rig-config.json'),'utf8'));
assert.deepEqual(spec.rigs?.map(r=>r.id).sort(),['desk','window']);
const approvedInputs=JSON.parse(await readFile(path.join(root,'docs/visual-review/classroom-v2-approved-inputs.json'),'utf8'));
const revised=[];
for(const receipt of delivery.rigs){
  const rig=spec.rigs.find(r=>r.id===receipt.rig),id=`classroom-${rig.id}`;
  validateApprovedInputs(rig,approvedInputs);
  assert.equal(receipt.sourceSha256,rig.sourceSha256,'delivery binds this independently reviewed source');
  assert.equal(hash(await readFile(rig.sourcePath)),rig.sourceSha256,'actual frozen source bytes');
  const preview=rig.approvedComposition.preview,image=await readFile(preview.path),reportBytes=await readFile(preview.sourceReportPath);
  assert.equal(hash(image),preview.sha256,'approved complete preview bytes');
  const dimensions=await sharp(image).metadata();assert.deepEqual([dimensions.width,dimensions.height],[preview.width,preview.height]);
  assert.equal(hash(reportBytes),preview.sourceReportSha256,'approved preview report bytes');
  validateApprovedPreviewReport(JSON.parse(reportBytes),rig);
  const source=path.resolve(path.dirname(deliveryFile),'packs',id);
  assert.equal(path.resolve(receipt.pack),source,'pack must belong to this completed delivery');
  const result=await auditClassroomPack(source,receipt.files,rig);
  revised.push({id,source,rig,receipt,result});
}
const evidence={version:2,previousReceipt:{path:historyPath,sha256:hash(oldBytes)},deliverySha256:hash(deliveryBytes),packs:prior.packs.map(record=>{
  const next=revised.find(r=>r.id===record.id);
  return next?{id:record.id,revision:2,sourceSha256:next.rig.sourceSha256,files:next.receipt.files,rig:next.rig}:{...record,revision:1,sourceSha256:prior.sourceSha256};
})};
validateClassroomDelivery(evidence);validateClassroomHistory(evidence,oldBytes);
console.log(JSON.stringify({status:'verified',updates:revised.map(r=>r.result),unchanged:'classroom-teacher',priorReceiptSha256:hash(oldBytes)},null,2));
if(writeMode){
  try{await access(historyFile);throw Error(`History already exists: ${historyFile}`);}catch(error){if(error.code!=='ENOENT')throw error;}
  const size=revised.reduce((sum,r)=>sum+r.result.totalBytes,0),disk=await statfs(root);
  assert.ok(size<250*1024*1024,'new runtime asset copy budget');
  const allocation=writeMode==='--link'?revised.reduce((n,r)=>n+r.receipt.files['manifest.json'].bytes,0)+2*1024*1024:size;
  assert.ok(disk.bavail*disk.bsize>allocation+128*1024*1024,'enough room for staging plus safety margin');
  await mkdir(path.join(root,'.assets-cache'),{recursive:true});
  const staging=await mkdtemp(path.join(root,'.assets-cache','classroom-v2-import-'));let cleanup=true;
  try{
    await mkdir(path.join(staging,'backup'));
    for(const r of revised){
      const target=path.join(staging,r.id);
      if(writeMode==='--link'){
        await mkdir(target);
        for(const file of Object.keys(r.receipt.files)){
          const source=path.join(r.source,file),destination=path.join(target,file);
          if(file==='manifest.json')await cp(source,destination,{errorOnExist:true,force:false});
          else await linkAssetTree(source,destination);
        }
      }else await cp(r.source,target,{recursive:true,errorOnExist:true});
      await auditClassroomPack(target,r.receipt.files,r.rig);
    }
    await writeFile(path.join(staging,'receipt.json'),JSON.stringify(evidence,null,2)+'\n');
    await writeFile(path.join(staging,'history.json'),oldBytes);
    const moves=[];
    for(const r of revised){const destination=path.join(root,'public/scenes',r.id+'-plates');moves.push([destination,path.join(staging,'backup',r.id)],[path.join(staging,r.id),destination]);}
    moves.push([evidenceFile,path.join(staging,'backup','receipt.json')],[path.join(staging,'receipt.json'),evidenceFile],[path.join(staging,'history.json'),historyFile]);
    assert.deepEqual(await readFile(evidenceFile),oldBytes,'live receipt did not change during staging');
    await moveTransaction(moves);
  }catch(error){cleanup=error.rollbackComplete!==false;throw error;}
  finally{if(cleanup)await rm(staging,{recursive:true,force:true});else console.error(`Recovery retained at ${staging}`);}
}
