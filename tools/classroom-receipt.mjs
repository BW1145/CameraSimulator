import assert from 'node:assert/strict';
import {rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CLASSROOM_SOURCE,validateClassroomReceipt} from './classroom-viewpoint-audit.mjs';
export function validateClassroomDelivery(receipt){
  assert.ok([1,2].includes(receipt.version),'known classroom receipt version');
  assert.deepEqual(receipt.packs?.map(p=>p.id).sort(),['classroom-desk','classroom-teacher','classroom-window']);
  if(receipt.version===1)assert.equal(receipt.sourceSha256,CLASSROOM_SOURCE);
  else{
    assert.ok(!Object.hasOwn(receipt,'sourceSha256'),'mixed sources must not claim a shared source');
    assert.equal(receipt.previousReceipt.path,'docs/visual-review/classroom-viewpoints-v1-delivery.json');
    assert.match(receipt.previousReceipt.sha256,/^[a-f0-9]{64}$/);
  }
  for(const record of receipt.packs){
    validateClassroomReceipt(record.files);assert.equal(record.id,`classroom-${record.rig.id}`);
    if(receipt.version===2){
      assert.equal(record.sourceSha256,record.rig.sourceSha256??CLASSROOM_SOURCE);
      assert.equal(record.revision,record.id==='classroom-teacher'?1:2);
      if(record.revision===2){assert.match(record.rig.sourceSha256,/^[a-f0-9]{64}$/,'mandatory independent per-rig source');assert.ok(record.rig.approvedComposition,'reviewed native composition for revised packs');}
    }
  }
  return receipt;
}
export function validateApprovedInputs(rig,inputs){
  assert.equal(inputs.version,1);assert.deepEqual(inputs.rigs.map(r=>r.id).sort(),['desk','window']);
  const approved=inputs.rigs.find(record=>record.id===rig.id);assert.ok(approved,'independently approved rig input');
  assert.equal(rig.sourceSha256,approved.sourceSha256,'only the approved unoccupied source is admitted');
  const preview=rig.approvedComposition.preview;
  assert.equal(preview.sha256,approved.previewSha256,'approved complete image, not a character experiment');
  assert.equal(preview.sourceSha256,approved.previewSourceSha256,'approved source lineage');
  assert.equal(preview.sourceReportSha256,approved.previewReportSha256,'approved capture evidence');
  assert.equal(rig.approvedComposition.referenceFocal,approved.referenceFocal,'approved native framing');
}
export function validateClassroomHistory(receipt,previousBytes){
  assert.equal(receipt.version,2);
  assert.equal(createHash('sha256').update(previousBytes).digest('hex'),receipt.previousReceipt.sha256,'unchanged archived v1 receipt');
  const previous=validateClassroomDelivery(JSON.parse(previousBytes));assert.equal(previous.version,1);
  const before=previous.packs.find(record=>record.id==='classroom-teacher'),after=receipt.packs.find(record=>record.id===before.id);
  assert.deepEqual(after.files,before.files,'teacher file hashes must remain byte-identical');
  assert.deepEqual(after.rig,before.rig,'teacher frozen rig must remain unchanged');
}
// Only directory/file renames: never write into old/shared runtime files.
// If rollback itself fails, retain staging/backup paths for explicit recovery.
export async function moveTransaction(moves,renameOperation=rename){
  const completed=[];
  try{for(const [from,to]of moves){await renameOperation(from,to);completed.push([from,to]);}}
  catch(error){
    const failures=[];
    for(const [from,to]of completed.reverse())try{await rename(to,from);}catch(rollback){failures.push(rollback);}
    if(failures.length){const failure=new AggregateError([error,...failures],'Import rollback incomplete; retain staging and backup directories');failure.rollbackComplete=false;throw failure;}
    error.rollbackComplete=true;throw error;
  }
}
