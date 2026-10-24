// Complete reviewed single-rig deliveries only. Default read-only. --link stages
// immutable images, independently copies manifests, then renames transactionally.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,rm,access,mkdtemp,statfs} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {auditDerivedPack,validateDerivedInputs} from './derived-viewpoint-audit.mjs';
import {validateApprovedPreviewReport} from './classroom-composition-audit.mjs';
import {validateDerivedDelivery} from './derived-receipt.mjs';
import {moveTransaction} from './classroom-receipt.mjs';
import {linkAssetTree} from './static-assets.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function hashFile(file){const h=createHash('sha256');for await(const bytes of createReadStream(file))h.update(bytes);return h.digest('hex');}
async function exists(file){try{await access(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
const args=process.argv.slice(2),mode=args.find(a=>a.startsWith('--')),inputs=args.filter(a=>!a.startsWith('--'));
assert.ok(inputs.length>0&&[undefined,'--link','--copy'].includes(mode)&&args.length===inputs.length+(mode?1:0),'Use DELIVERY_JSON... [--link | --copy]');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profiles=JSON.parse(await readFile(path.join(root,'docs/visual-review/derived-viewpoints-approved-inputs.json'),'utf8')).rigs;
const receiptFile=path.join(root,'docs/visual-review/derived-viewpoints-delivery.json');
const oldBytes=await exists(receiptFile)?await readFile(receiptFile):null;
const prior=oldBytes?validateDerivedDelivery(JSON.parse(oldBytes),profiles,{complete:false}):{version:1,schema:'derived-viewpoint-runtime-delivery-v1',packs:[]};
for(const record of prior.packs)await auditDerivedPack(path.join(root,'public/scenes',record.id+'-plates'),record.files,record.rig,profiles.find(p=>p.id===record.id));
const additions=[];
for(const input of inputs){
  const deliveryFile=path.resolve(input),deliveryBytes=await readFile(deliveryFile),delivery=JSON.parse(deliveryBytes);
  assert.equal(delivery.version,1);assert.equal(delivery.status,'packaged-and-audited');assert.equal(delivery.rigs?.length,1);
  const item=delivery.rigs[0],profile=profiles.find(p=>p.id===item.rig);assert.ok(profile,'independently approved single-rig delivery');
  assert.equal(delivery.schema,profile.deliverySchema);assert.equal(hash(deliveryBytes),profile.deliverySha256,'frozen delivery bytes');
  assert.ok(![...prior.packs,...additions].some(p=>p.id===item.rig),'no duplicate or implicit replacement');
  const specFile=path.resolve(path.dirname(deliveryFile),'..','rig-config.json'),specBytes=await readFile(specFile),spec=JSON.parse(specBytes);
  assert.equal(hash(specBytes),profile.specSha256,'frozen spec bytes');assert.equal(spec.rigs?.length,1);
  const rig=spec.rigs[0];validateDerivedInputs(rig,profile);
  assert.equal(item.sourceSha256,rig.sourceSha256);assert.deepEqual(item.approvedComposition,rig.approvedComposition);
  assert.equal(await hashFile(rig.sourcePath),profile.sourceSha256,'actual frozen source bytes');
  const preview=rig.approvedComposition.preview,image=await readFile(preview.path),reportBytes=await readFile(preview.sourceReportPath);
  assert.equal(hash(image),profile.previewSha256);assert.equal(hash(reportBytes),profile.previewReportSha256);
  const dimensions=await sharp(image).metadata();assert.deepEqual([dimensions.width,dimensions.height],[preview.width,preview.height]);
  validateApprovedPreviewReport(JSON.parse(reportBytes),rig,{viewId:profile.previewViewId});
  const focus=rig.defaultsEvidence.focus;assert.equal(await hashFile(focus.sourcePath),focus.sourceSha256,'formal focus source Z bytes');
  const source=path.resolve(path.dirname(deliveryFile),'packs',item.rig);assert.equal(path.resolve(item.pack),source);
  const result=await auditDerivedPack(source,item.files,rig,profile);
  const finalFile=path.resolve(path.dirname(deliveryFile),'final-verification.json'),finalBytes=await readFile(finalFile),final=JSON.parse(finalBytes);
  assert.equal(final.status,'complete');assert.equal(final.deliverySha256,profile.deliverySha256);assert.equal(final.formalJobs,35);assert.equal(final.files,36);assert.equal(final.bytes,result.totalBytes);assert.equal(final.sourceSha256,rig.sourceSha256);
  additions.push({id:item.rig,source,profile,result,record:{id:item.rig,sourceSha256:rig.sourceSha256,deliverySha256:profile.deliverySha256,specSha256:profile.specSha256,files:item.files,rig,renderAcceptance:{sha256:hash(finalBytes),evidence:final}}});
}
const next={version:1,schema:'derived-viewpoint-runtime-delivery-v1',packs:[...prior.packs,...additions.map(a=>a.record)]};validateDerivedDelivery(next,profiles);
console.log(JSON.stringify({status:'verified',updates:additions.map(a=>a.result),priorUnchanged:prior.packs.map(p=>p.id),mode:mode??'read-only'},null,2));
if(mode){
  const size=additions.reduce((n,a)=>n+a.result.totalBytes,0),disk=await statfs(root),allocation=mode==='--link'?2*1024*1024:size;
  assert.ok(disk.bavail*disk.bsize>allocation+128*1024*1024,'staging space plus safety reserve');
  await mkdir(path.join(root,'.assets-cache'),{recursive:true});const staging=await mkdtemp(path.join(root,'.assets-cache','derived-import-'));let cleanup=true;
  try{
    const moves=[];
    for(const a of additions){
      const target=path.join(staging,a.id),destination=path.join(root,'public/scenes',a.id+'-plates');assert.ok(!await exists(destination),'new destination must not already exist');await mkdir(target);
      for(const file of Object.keys(a.record.files)){
        const from=path.join(a.source,file),to=path.join(target,file);
        if(mode==='--copy'||file==='manifest.json')await cp(from,to,{force:false,errorOnExist:true});else await linkAssetTree(from,to);
      }
      await auditDerivedPack(target,a.record.files,a.record.rig,a.profile);moves.push([target,destination]);
    }
    const stagedReceipt=path.join(staging,'receipt.json');await writeFile(stagedReceipt,JSON.stringify(next,null,2)+'\n');
    if(oldBytes){assert.deepEqual(await readFile(receiptFile),oldBytes,'prior receipt unchanged while staging');moves.push([receiptFile,path.join(staging,'prior-receipt.json')]);}
    else assert.ok(!await exists(receiptFile),'receipt not created by another import');
    moves.push([stagedReceipt,receiptFile]);await moveTransaction(moves);
  }catch(error){cleanup=error.rollbackComplete!==false;throw error;}
  finally{if(cleanup)await rm(staging,{recursive:true,force:true});else console.error(`Recovery retained at ${staging}`);}
}
