// One COMPLETE reviewed Monk rig at a time. Read-only by default. No render,
// recompression, source mutation or network. Final publication separately requires
// the complete three-rig portable receipt. Final-review pins are never generated
// from a self-consistent incoming pack by this importer.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,rm,access,mkdtemp,statfs} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {validateMonkProductionReceipt,validateMonkRuntimeReceipt,validateMonkFinalRig,auditMonkPack} from './monk-receipt.mjs';
import {validateMonkPreviewReportBytes,validateMonkPreviewImageBytes,validateMonkSourceDisplayInspectionBytes,validateMonkDisplayProfile} from './monk-viewpoint-audit.mjs';
import {validateMonkOwnerReview,validateMonkAcceptanceEvidence} from './monk-acceptance-evidence.mjs';
import {auditMonkRuntimeFocus} from './monk-runtime-focus-audit.mjs';
import {auditMonkRecoveryFiles} from './monk-recovery-files-audit.mjs';
import {moveTransaction} from './classroom-receipt.mjs';
import {linkAssetTree} from './static-assets.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function hashFile(file){const h=createHash('sha256');for await(const bytes of createReadStream(file))h.update(bytes);return h.digest('hex');}
async function exists(file){try{await access(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function within(root,file){const full=path.resolve(file),relative=path.relative(root,full);assert.ok(relative!== '..'&&!relative.startsWith('../')&&!path.isAbsolute(relative),'evidence remains inside its explicit production root');return full;}
const args=process.argv.slice(2),mode=args.find(a=>a.startsWith('--')),inputs=args.filter(a=>!a.startsWith('--'));
assert.ok(inputs.length===4&&[undefined,'--link','--copy'].includes(mode)&&args.length===4+(mode?1:0),'Use OUTPUTS_ROOT DELIVERY_JSON OWNER_REVIEW_JSON PIXEL_AUDIT_JSON [--link | --copy]');
const [productionRoot,deliveryInput,ownerInput,pixelInput]=inputs.map(p=>path.resolve(p));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profiles=JSON.parse(await readFile(path.join(root,'.assets-cache/private-production/monk-final-approved-inputs.json'),'utf8'));
const receiptFile=path.join(root,'.assets-cache/private-production/monk-runtime-delivery.json');
const oldBytes=await exists(receiptFile)?await readFile(receiptFile):null;
const prior=oldBytes?validateMonkRuntimeReceipt(JSON.parse(oldBytes),profiles,{complete:false}):{version:1,schema:'monk-runtime-delivery-v1',packs:[]};
for(const old of prior.packs)await auditMonkPack(path.join(productionRoot,'packs',old.id),old.files,old.rig,profiles.rigs.find(p=>p.id===old.id));
const deliveryBytes=await readFile(within(productionRoot,deliveryInput)),delivery=validateMonkProductionReceipt(JSON.parse(deliveryBytes));
assert.equal(delivery.rigs.length,1,'one independently complete rig per import transaction');
const item=delivery.rigs[0],profile=profiles.rigs.find(p=>p.id===item.rig);assert.ok(profile,'independently reviewed final rig pins required');
assert.equal(hash(deliveryBytes),profile.deliverySha256,'actual immutable production receipt');
assert.ok(!prior.packs.some(p=>p.id===item.rig),'no duplicate or implicit replacement');
const ownerBytes=await readFile(within(productionRoot,ownerInput)),owner=JSON.parse(ownerBytes);
assert.equal(hash(ownerBytes),profile.ownerReviewSha256,'actual completed visual/capture review');
const specBytes=await readFile(within(productionRoot,owner.spec.path)),spec=JSON.parse(specBytes);
assert.equal(hash(specBytes),profile.specSha256,'immutable verified spec snapshot, not a later mutable config');
validateMonkDisplayProfile(spec.displayTransformProfile);
const candidates=spec.rigs.filter(r=>r.id===item.rig);assert.equal(candidates.length,1);
const rig={...candidates[0],displayTransformProfile:spec.displayTransformProfile};validateMonkFinalRig(rig,profile);
assert.deepEqual(item.approvedComposition,rig.approvedComposition);assert.equal(item.sourceSha256,rig.sourceSha256);
const previewRoot=path.resolve(productionRoot,'../../new-scenes-preview-20261024');
assert.equal(path.resolve(rig.sourcePath),path.join(previewRoot,'downloads/lone-monk.blend'),'exact unchanged original source');
assert.equal(await hashFile(rig.sourcePath),profile.sourceSha256,'actual original source bytes');
const preview=rig.approvedComposition.preview,image=await readFile(within(previewRoot,preview.path));
validateMonkPreviewImageBytes(image,rig.id);const dimensions=await sharp(image).metadata();assert.deepEqual([dimensions.width,dimensions.height],[preview.width,preview.height]);
validateMonkPreviewReportBytes(await readFile(within(previewRoot,preview.sourceReportPath)),rig);
const displayInspection=rig.sourceProvenance.sourceDisplayInspection;
validateMonkSourceDisplayInspectionBytes(await readFile(within(path.dirname(productionRoot),displayInspection.path)));
const focus=rig.defaultsEvidence.focus;assert.equal(await hashFile(within(productionRoot,focus.sourcePath)),profile.formalFocusDepthSha256,'actual formal center subject Z');
const source=path.join(productionRoot,'packs',rig.id);assert.equal(path.resolve(item.pack),source);assert.equal(path.resolve(owner.pack.path),source);
validateMonkOwnerReview(owner,rig,item.files,profile);
const recoveryChecks=[];
for(const record of owner.formal.jobs){
  const attempt=within(path.join(productionRoot,'jobs',rig.id),record.attemptPath),parts=path.relative(path.join(productionRoot,'jobs',rig.id),attempt).split(path.sep);
  assert.equal(parts.length,3);assert.match(parts[2],/^attempt-\d+$/);assert.equal(record.id,`${rig.id}/${parts[0]}/${parts[1]}`);
  const values={};
  for(const [name,key]of [['complete','completeSha256'],['validation','validationSha256'],['job','jobSha256']]){
    const bytes=await readFile(path.join(attempt,name+'.json'));assert.equal(hash(bytes),record[key],`actual ${name} receipt`);values[name]=JSON.parse(bytes);
  }
  assert.equal(values.complete.status,'complete');assert.equal(values.validation.status,'valid');
  assert.equal(values.complete.jobSha256,record.jobSha256);assert.equal(values.validation.jobSha256,record.jobSha256);
  assert.equal(values.complete.validationSha256,record.validationSha256);
  assert.equal(values.job.id,record.id);assert.equal(values.validation.jobId,record.id);assert.equal(values.job.phase,'production');assert.equal(values.job.sourceSha256,profile.sourceSha256);
  if(values.complete.recoveryEvidence)recoveryChecks.push(await auditMonkRecoveryFiles(productionRoot,attempt));
}
for(const record of [...Object.values(owner.visualReview.contactSheets),...owner.numericAudits])assert.equal(await hashFile(within(productionRoot,record.path)),record.sha256,'actual owner-reviewed QA evidence');
const pixelBytes=await readFile(within(productionRoot,pixelInput)),pixel=JSON.parse(pixelBytes);assert.equal(hash(pixelBytes),profile.pixelAuditSha256,'actual full-five-layer source pixel audit');
validateMonkAcceptanceEvidence(owner,pixel,rig,item.files,profile);
const result=await auditMonkPack(source,item.files,rig,profile);
const focusRuntime=await auditMonkRuntimeFocus(source,JSON.parse(await readFile(path.join(source,'manifest.json'))));
const record={id:rig.id,rig,files:item.files,sourceSha256:rig.sourceSha256,deliverySha256:profile.deliverySha256,specSha256:profile.specSha256,pixelAuditSha256:profile.pixelAuditSha256,ownerReviewSha256:profile.ownerReviewSha256,
  renderAcceptance:{formalJobs:35,allRuntimePixelsVerified:true,actualVisualReview:'passed',sourceRadiance:'scene-linear; display transform not baked'}};
const next={version:1,schema:'monk-runtime-delivery-v1',packs:[...prior.packs,record]};validateMonkRuntimeReceipt(next,profiles,{complete:false});
console.log(JSON.stringify({status:'verified',update:result,focusRuntime,recoveryChecks,priorUnchanged:prior.packs.map(p=>p.id),mode:mode??'read-only',completeCollection:next.packs.length===3},null,2));
if(mode){
  const disk=await statfs(root),allocation=mode==='--link'?2*1024*1024:result.totalBytes;
  assert.ok(disk.bavail*disk.bsize>allocation+128*1024*1024,'staging allocation plus safety reserve');
  await mkdir(path.join(root,'.assets-cache'),{recursive:true});const staging=await mkdtemp(path.join(root,'.assets-cache','monk-import-'));let cleanup=true;
  try{
    const target=path.join(staging,rig.id),destination=path.join(root,'public/scenes',rig.id+'-plates');assert.ok(!await exists(destination),'new destination only');await mkdir(target);
    for(const name of Object.keys(item.files)){
      const from=path.join(source,name),to=path.join(target,name);
      if(mode==='--copy'||name==='manifest.json')await cp(from,to,{force:false,errorOnExist:true});else await linkAssetTree(from,to);
    }
    await auditMonkPack(target,item.files,rig,profile);
    assert.deepEqual(await readFile(deliveryInput),deliveryBytes,'production receipt unchanged during staging');
    assert.deepEqual(await readFile(ownerInput),ownerBytes,'visual review unchanged during staging');
    assert.deepEqual(await readFile(pixelInput),pixelBytes,'source pixel acceptance unchanged during staging');
    const moves=[[target,destination]],stagedReceipt=path.join(staging,'receipt.json');await writeFile(stagedReceipt,JSON.stringify(next,null,2)+'\n');
    if(oldBytes){assert.deepEqual(await readFile(receiptFile),oldBytes,'prior receipt unchanged while staging');moves.push([receiptFile,path.join(staging,'prior-receipt.json')]);}
    else assert.ok(!await exists(receiptFile),'receipt not created by another import');
    moves.push([stagedReceipt,receiptFile]);await moveTransaction(moves);
  }catch(error){cleanup=error.rollbackComplete!==false;throw error;}
  finally{if(cleanup)await rm(staging,{recursive:true,force:true});else console.error(`Recovery retained at ${staging}`);}
}
