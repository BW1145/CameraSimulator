// Monk-only envelopes and final runtime acceptance. An individually completed
// production receipt is not the complete three-viewpoint publication gate.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {canonicalJSON} from './classroom-processing-audit.mjs';
import {MONK_VIEWPOINT_IDS,MONK_SOURCE_SHA256,MONK_APPROVED_INPUTS,MONK_DISPLAY_PROFILE,
  validateMonkStaticRig,validateMonkFormalDefaults,validateMonkCapturedComposition} from './monk-viewpoint-audit.mjs';
import {validateCaptureReceipt,validateCaptureGeometry,validateCaptureMechanics,readCaptureAsset,auditCaptureFiles} from './viewpoint-capture-audit.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashString=(value,label)=>assert.match(value,/^[a-f0-9]{64}$/,label);
const uniqueKnown=(ids,label)=>{
  assert.ok(Array.isArray(ids)&&ids.length>0,`${label}: nonempty scope`);
  assert.equal(new Set(ids).size,ids.length,`${label}: unique IDs`);
  ids.forEach(id=>assert.ok(MONK_VIEWPOINT_IDS.includes(id),`${label}: explicitly approved Monk ID`));
};
export function validateMonkProductionReceipt(delivery,{completeCollection=false}={}){
  assert.equal(delivery?.version,2);assert.equal(delivery.schema,'monk-delivery-v2');
  assert.equal(delivery.complete,true,'only a complete declared scope can be imported');
  assert.equal(delivery.status,'packaged-and-audited');
  uniqueKnown(delivery.expectedRigs,'declared production scope');assert.ok(Array.isArray(delivery.rigs));
  const ids=delivery.rigs.map(r=>r.rig);uniqueKnown(ids,'delivered rigs');
  assert.deepEqual(ids,delivery.expectedRigs,'complete ordered declared scope');
  if(completeCollection)assert.deepEqual([...ids].sort(),[...MONK_VIEWPOINT_IDS].sort(),'all three Monk packs required');
  assert.equal(delivery.repositoryChanged,false);assert.equal(delivery.published,false);
  for(const row of delivery.rigs){
    const pin=MONK_APPROVED_INPUTS[row.rig],a=row.approvedComposition;
    assert.equal(row.sourceSha256,MONK_SOURCE_SHA256);assert.equal(a?.version,1);
    assert.equal(a.preview?.sourceSha256,MONK_SOURCE_SHA256);
    assert.equal(a.preview.sha256,pin.previewSha256);assert.equal(a.preview.sourceReportSha256,pin.sourceReportSha256);
    assert.deepEqual(a.nativeCrop,{left:512,top:288,width:5120,height:2880});
    assert.ok(typeof row.pack==='string'&&row.pack.length>0);assert.ok(typeof row.auditLogs==='string'&&row.auditLogs.length>0);
    assert.ok(typeof row.audits==='string'&&row.audits.length>0);validateCaptureReceipt(row.files);
  }
  return delivery;
}
export function validateMonkFinalProfile(profile){
  assert.ok(MONK_VIEWPOINT_IDS.includes(profile?.id),'explicit Monk final review');
  assert.equal(profile.status,'approved-formal');assert.equal(profile.sourceSha256,MONK_SOURCE_SHA256);
  assert.equal(profile.displayProfileSha256,MONK_DISPLAY_PROFILE.profileSha256);
  for(const key of ['deliverySha256','specSha256','manifestSha256','filesSha256','rigSha256','defaultsEvidenceSha256','formalFocusDepthSha256','pixelAuditSha256','ownerReviewSha256'])hashString(profile[key],`final ${key}`);
  assert.ok(Number.isFinite(profile.defaults?.focus)&&profile.defaults.focus>=.2&&profile.defaults.focus<=50,'final physical focus');
  assert.equal(profile.defaults.baseEV,8);
  assert.ok(['floor','nearest','python-nearest-even'].includes(profile.focusPixelRounding),'reviewed formal focus sampling convention');
  assert.deepEqual(profile.captureCoverage,{views:7,layersPerView:5,runtimeImages:35,sourcePixelsVerified:true});
  return profile;
}
export function validateMonkFinalRig(rig,profile){
  validateMonkFinalProfile(profile);assert.equal(rig.id,profile.id);validateMonkStaticRig(rig);
  assert.equal(hash(canonicalJSON(rig)),profile.rigSha256,'independently frozen effective rig, not self-consistent replacement');
  validateMonkFormalDefaults(rig,profile);return profile;
}
export function validateMonkRuntimeReceipt(receipt,profiles,{complete=true}={}){
  assert.equal(receipt?.version,1);assert.equal(receipt.schema,'monk-runtime-delivery-v1');
  assert.equal(profiles?.version,1);assert.equal(profiles.schema,'monk-final-approved-inputs-v1');
  assert.ok(Array.isArray(profiles.rigs));uniqueKnown(profiles.rigs.map(p=>p.id),'final profiles');
  assert.ok(Array.isArray(receipt.packs));uniqueKnown(receipt.packs.map(p=>p.id),'runtime packs');
  for(const record of receipt.packs){
    const profile=profiles.rigs.find(p=>p.id===record.id);assert.ok(profile,'independent final profile');
    validateMonkFinalRig(record.rig,profile);validateCaptureReceipt(record.files);
    assert.equal(hash(canonicalJSON(record.files)),profile.filesSha256,'independently reviewed complete runtime file inventory');
    for(const field of ['sourceSha256','deliverySha256','specSha256','pixelAuditSha256','ownerReviewSha256'])assert.equal(record[field],profile[field],`portable ${field}`);
    assert.equal(record.files['manifest.json'].sha256,profile.manifestSha256);
  }
  if(complete){
    assert.deepEqual(receipt.packs.map(p=>p.id).sort(),[...MONK_VIEWPOINT_IDS].sort(),'all three complete runtime packs before publication');
    assert.deepEqual(profiles.rigs.map(p=>p.id).sort(),[...MONK_VIEWPOINT_IDS].sort(),'all three final independent reviews');
  }
  return receipt;
}
export function validateMonkManifest(pack,rig,profile){
  validateMonkFinalRig(rig,profile);assert.equal(pack.version,1);
  validateMonkCapturedComposition(pack,rig,profile);
  validateCaptureGeometry(pack,rig);
  // validateMonkCapturedComposition already applied the strict processing gate.
  return validateCaptureMechanics(pack,MONK_SOURCE_SHA256);
}
export async function auditMonkPack(directory,files,rig,profile){
  validateCaptureReceipt(files);
  validateMonkFinalProfile(profile);
  assert.equal(hash(canonicalJSON(files)),profile.filesSha256,'independently pinned complete image inventory');
  const bytes=await readCaptureAsset(path.join(directory,'manifest.json'));
  assert.equal(hash(bytes),profile.manifestSha256,'independently pinned final Monk manifest');
  validateMonkManifest(JSON.parse(bytes),rig,profile);
  return auditCaptureFiles(directory,files,{expectedManifestSha256:profile.manifestSha256});
}
