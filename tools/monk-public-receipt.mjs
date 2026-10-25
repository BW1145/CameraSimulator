// Public runtime integrity only. Original source/pixel approval is performed locally.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readCaptureAsset,auditCaptureFiles} from './viewpoint-capture-audit.mjs';
import {validateMonkPublicManifest,monkPublicManifestSha256} from './monk-public-manifest.mjs';
const ids=['monk-colonnade','monk-reading-table','monk-courtyard'];
const sourceSHA='eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b';
const assetNames=['manifest.json',...['center','left','right','up','down','front','back'].flatMap(id=>['.webp','-depth.png','-detail.webp','-detail-depth.png','-flash.webp'].map(suffix=>id+suffix))].sort();
const hashFields=['sourceSha256','internalManifestSha256','publicManifestSha256','publicManifestCanonicalSha256','sourcePixelAuditSha256'];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function keys(value,expected,label) {
  assert.ok(value && typeof value==='object'&&!Array.isArray(value),`${label}: object`);
  assert.deepEqual(Object.keys(value).sort(),[...expected].sort(),`${label}: exact public fields`);
}
function validateRecord(record) {
  keys(record,['id',...hashFields,'files'],'record');
  assert.ok(ids.includes(record.id),'approved scene id');
  for(const field of hashFields) {
    assert.equal(typeof record[field],'string',`${field}: string`);
    assert.match(record[field],/^[a-f0-9]{64}$/,`${field}: SHA256`);
  }
  assert.equal(record.sourceSha256,sourceSHA,'approved original source');
  keys(record.files,assetNames,'exact 36 asset inventory');
  for(const [name,file] of Object.entries(record.files)) {
    keys(file,['bytes','sha256'],`${name} receipt`);
    assert.ok(Number.isSafeInteger(file.bytes)&&file.bytes>0,`${name}: positive byte count`);
    assert.equal(typeof file.sha256,'string');assert.match(file.sha256,/^[a-f0-9]{64}$/,`${name}: SHA256`);
  }
  assert.equal(record.files['manifest.json'].sha256,record.publicManifestSha256,'public manifest byte commitment');
  return true;
}
export function validateMonkPublicReceipt(receipt,{complete=true}={}) {
  keys(receipt,['version','schema','packs'],'receipt');
  assert.equal(receipt.version,1);assert.equal(receipt.schema,'monk-public-runtime-delivery-v1');
  assert.equal(typeof complete,'boolean','explicit completeness mode');
  assert.ok(Array.isArray(receipt.packs),'packs array');
  assert.ok(receipt.packs.length>0&&receipt.packs.length<=3,'one to three packs');
  receipt.packs.forEach(validateRecord);
  const actual=receipt.packs.map(p=>p.id);
  assert.equal(new Set(actual).size,actual.length,'unique scene ids');
  if(complete) assert.deepEqual(actual.slice().sort(),ids.slice().sort(),'all three public scenes');
  return true;
}
export async function auditMonkPublicPack(directory,record) {
  validateRecord(record);
  const bytes=await readCaptureAsset(path.join(directory,'manifest.json'));
  assert.equal(bytes.length,record.files['manifest.json'].bytes,'public manifest bytes');
  assert.equal(sha256(bytes),record.publicManifestSha256,'public manifest byte SHA');
  const manifest=JSON.parse(bytes);
  validateMonkPublicManifest(manifest);
  assert.equal(monkPublicManifestSha256(manifest),record.publicManifestCanonicalSha256,'public manifest canonical SHA');
  assert.equal(manifest.id,record.id);assert.equal(manifest.sourceSha256,record.sourceSha256);
  return auditCaptureFiles(directory,record.files,{expectedManifestSha256:record.publicManifestSha256});
}
