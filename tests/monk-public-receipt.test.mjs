import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateMonkPublicReceipt,auditMonkPublicPack} from '../tools/monk-public-receipt.mjs';
const hash='a'.repeat(64);
function record(id='monk-colonnade') {
  const names=['manifest.json',...['center','left','right','up','down','front','back'].flatMap(v=>['.webp','-depth.png','-detail.webp','-detail-depth.png','-flash.webp'].map(s=>v+s))];
  return {id,sourceSha256:'eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b',internalManifestSha256:hash,publicManifestSha256:hash,publicManifestCanonicalSha256:hash,sourcePixelAuditSha256:hash,files:Object.fromEntries(names.map(n=>[n,{bytes:1,sha256:hash}]))};
}
const receipt=(packs=[record()])=>({version:1,schema:'monk-public-runtime-delivery-v1',packs});
test('complete requires three unique approved packs; partial is explicit',()=>{
  assert.throws(()=>validateMonkPublicReceipt(receipt()),/all three/);
  assert.equal(validateMonkPublicReceipt(receipt(),{complete:false}),true);
  assert.equal(validateMonkPublicReceipt(receipt(['monk-colonnade','monk-reading-table','monk-courtyard'].map(record))),true);
  assert.throws(()=>validateMonkPublicReceipt(receipt([record(),record()]),{complete:false}),/unique/);
});
test('rejects unknown fields, missing commitments and all non-fixed inventory names',()=>{
  for(const mutate of [r=>r.privatePath='secret',r=>delete r.sourcePixelAuditSha256,r=>r.files['../center.webp']=r.files['center.webp'],r=>delete r.files['center.webp'],r=>r.files['center.webp'].path='secret',r=>r.files['center.webp'].bytes=0,r=>r.sourceSha256='b'.repeat(64),r=>r.publicManifestSha256='b'.repeat(64)]) {
    const r=record();mutate(r);assert.throws(()=>validateMonkPublicReceipt(receipt([r]),{complete:false}));
  }
});
test('internal and public commitments have distinct meaning, without artificial inequality',()=>{
  const r=record();assert.equal(validateMonkPublicReceipt(receipt([r]),{complete:false}),true);
  r.internalManifestSha256='b'.repeat(64);assert.equal(validateMonkPublicReceipt(receipt([r]),{complete:false}),true);
});
test('actual manifest audit rejects byte tampering and tiny non-runtime JSON',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'monk-public-receipt-'));
  try {
    const bytes=Buffer.from('{}');await writeFile(path.join(dir,'manifest.json'),bytes);
    const r=record();await assert.rejects(auditMonkPublicPack(dir,r),/manifest bytes/);
    r.files['manifest.json']={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};r.publicManifestSha256=r.files['manifest.json'].sha256;
    await assert.rejects(auditMonkPublicPack(dir,r),/required/);
    await writeFile(path.join(dir,'manifest.json'),'[]');await assert.rejects(auditMonkPublicPack(dir,r),/byte SHA/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('audit rejects symlinked manifest before parsing',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'monk-public-link-'));
  try {await writeFile(path.join(dir,'target'),'{}');await symlink('target',path.join(dir,'manifest.json'));await assert.rejects(auditMonkPublicPack(dir,record()),/non-symlink/);}
  finally {await rm(dir,{recursive:true,force:true});}
});
