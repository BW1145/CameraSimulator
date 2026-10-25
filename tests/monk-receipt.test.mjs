// Envelope fixtures are intentionally synthetic metadata: never runtime images,
// formal render evidence, or fixtures accepted by the final publication gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {canonicalJSON} from '../tools/classroom-processing-audit.mjs';
import {MONK_APPROVED_INPUTS,MONK_VIEWPOINT_IDS,MONK_SOURCE_SHA256,MONK_DISPLAY_PROFILE,MONK_DISPLAY_TRANSFORM} from '../tools/monk-viewpoint-audit.mjs';
import {VIEW_IDS,auditCaptureFiles} from '../tools/viewpoint-capture-audit.mjs';
import {validateMonkProductionReceipt,validateMonkFinalProfile,validateMonkRuntimeReceipt,auditMonkPack} from '../tools/monk-receipt.mjs';
const files=()=>Object.fromEntries(['manifest.json',...VIEW_IDS.flatMap(id=>['.webp','-depth.png','-detail.webp','-detail-depth.png','-flash.webp'].map(s=>id+s))].map(name=>[name,{bytes:1,sha256:'a'.repeat(64)}]));
function fixture(ids=MONK_VIEWPOINT_IDS){return {version:2,schema:'monk-delivery-v2',status:'packaged-and-audited',complete:true,expectedRigs:[...ids],repositoryChanged:false,published:false,rigs:ids.map(rig=>({rig,sourceSha256:MONK_SOURCE_SHA256,pack:`/synthetic-only/${rig}`,audits:'synthetic metadata only',auditLogs:'/synthetic-only/logs',files:files(),approvedComposition:{version:1,preview:{sourceSha256:MONK_SOURCE_SHA256,sha256:MONK_APPROVED_INPUTS[rig].previewSha256,sourceReportSha256:MONK_APPROVED_INPUTS[rig].sourceReportSha256},nativeCrop:{left:512,top:288,width:5120,height:2880}}}))};}
test('production complete-scope envelope permits one rig but is not a three-rig publication gate',()=>{const f=fixture([MONK_VIEWPOINT_IDS[0]]);assert.equal(validateMonkProductionReceipt(f).rigs.length,1);assert.throws(()=>validateMonkProductionReceipt(f,{completeCollection:true}),/all three/);});
test('production complete collection requires exactly all three approved identities',()=>{assert.equal(validateMonkProductionReceipt(fixture(),{completeCollection:true}).rigs.length,3);});
for(const [name,mutate]of [
 ['partial collection',f=>{f.complete=false;f.status='partial-collection';}],
 ['duplicate rig',f=>{f.rigs[1]=f.rigs[0];}],
 ['missing declared rig',f=>{f.rigs.pop();}],
 ['unreviewed ID',f=>{f.expectedRigs[0]='monk-invented';f.rigs[0].rig='monk-invented';}],
 ['different source',f=>{f.rigs[0].sourceSha256='b'.repeat(64);}],
 ['different preview',f=>{f.rigs[0].approvedComposition.preview.sha256='b'.repeat(64);}],
 ['different report',f=>{f.rigs[0].approvedComposition.preview.sourceReportSha256='b'.repeat(64);}],
 ['native image passed as overscan',f=>{f.rigs[0].approvedComposition.nativeCrop.left=0;}],
 ['missing flash',f=>{delete f.rigs[0].files['back-flash.webp'];}],
 ['extra QA file',f=>{f.rigs[0].files['review.jpg']={bytes:1,sha256:'a'.repeat(64)};}],
 ['already-published claim',f=>{f.published=true;}],
 ['missing actual audit log path',f=>{delete f.rigs[0].auditLogs;}],
])test(`production envelope rejects ${name}`,()=>{const f=fixture();mutate(f);assert.throws(()=>validateMonkProductionReceipt(f));});
test('formal profile fails closed without independently reviewed defaults and pixel/owner pins',()=>{assert.throws(()=>validateMonkFinalProfile({id:MONK_VIEWPOINT_IDS[0],status:'static-approval-only'}));assert.throws(()=>validateMonkFinalProfile({id:MONK_VIEWPOINT_IDS[0],status:'approved-formal',sourceSha256:MONK_SOURCE_SHA256,displayProfileSha256:MONK_DISPLAY_PROFILE.profileSha256}));});
test('production envelope cannot be relabelled as a portable runtime receipt',()=>{assert.throws(()=>validateMonkRuntimeReceipt(fixture(),{version:1,schema:'monk-final-approved-inputs-v1',rigs:[]}));});

// The following is a wholly SYNTHETIC final-review test double, NOT a completed
// Monk capture, real pixel audit, owner approval, or publishable asset pack.
// Real optical/preview pins exercise the gate; all final focus/hash/bytes here
// are fabricated solely to test independent-review binding. No files are read.
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonicalDigest=value=>digest(canonicalJSON(value));
function syntheticFinalReview(){
  const id=MONK_VIEWPOINT_IDS[0],p=MONK_APPROVED_INPUTS[id],source='/synthetic-only/source.blend',report='/synthetic-only/preview-report.json';
  const rig={id,packId:id,camera:'ApprovedNative_'+id,title:p.title,titleZh:p.titleZh,cameraConstructionMode:'external-reviewed-camera-rig',
    approvedCameraRecord:structuredClone(p.camera),cameraSha256:p.cameraRecordSha256,
    matrix:structuredClone(p.camera.matrix),position:structuredClone(p.camera.position),target:structuredClone(p.camera.target),
    lens:p.nativeLens,captureLens:p.nativeLens/1.2,referenceFocal:p.nativeLens,sensorWidth:36,sensorHeight:24,sensorFit:'HORIZONTAL',near:.03,far:200,shiftX:0,shiftY:0,aspect:16/9,nativeResolution:[5120,2880],
    offsets:{center:[0,0,0],left:[-.08,0,0],right:[.08,0,0],up:[0,.08,0],down:[0,-.08,0],front:[0,0,-.05],back:[0,0,.05]},
    bounds:{x:[-.08,.08],y:[-.08,.08],z:[-.05,.05],yaw:[-35,35],pitch:[-20,20],roll:[-5,5]},
    sourcePath:source,sourceSha256:MONK_SOURCE_SHA256,sourceScene:'daylight',sourceFrame:4,flashForward:0,
    attribution:'Carlo Bergonzini / Monorender / CC-BY (current Blender demo README)',displayTransform:structuredClone(MONK_DISPLAY_TRANSFORM),
    approvedComposition:{version:1,referenceFocal:p.nativeLens,aspect:16/9,overscan:1.2,preview:{path:'/synthetic-only/preview.png',sha256:p.previewSha256,width:1280,height:720,sourcePath:source,sourceSha256:MONK_SOURCE_SHA256,sourceReportPath:report,sourceReportSha256:p.sourceReportSha256,captureLens:p.nativeLens,sensorWidth:36,viewId:p.previewViewId},captureFrame:{width:6144,height:3456},nativeFrame:{width:5120,height:2880},nativeCrop:{left:512,top:288,width:5120,height:2880}},
    sourceProvenance:{originalPath:source,originalSha256:MONK_SOURCE_SHA256,previewSourceSha256:MONK_SOURCE_SHA256,originalAuthor:'Carlo Bergonzini / Monorender',license:'CC-BY (current official file internalREADME; version unspecified)',originalUrl:'https://download.blender.org/demo/cycles/lone-monk_cycles_and_exposure-node_demo.blend',derivations:[{type:'external-reviewed-camera-and-display-settings'}],compatibility:'Synthetic test only: no compatibility or final-render claim.',
      sourceFreeze:{mode:'external-reviewed-camera-rig',sourcePath:source,sourceSha256:MONK_SOURCE_SHA256,approvedCameraSha256:p.cameraRecordSha256,freezeScriptSha256:'6af2b3a4a7f89e1b1545f4b0d20c536bc1ba1cdade0b176859c95f894c06e61e',cameraInBlend:false,cameraCreatedAtRender:true,previewReportPath:report,previewReportSha256:p.sourceReportSha256},
      sourceDisplayInspection:{path:'/synthetic-only/display.json',sha256:'dce328d114c48e3288f1c314a195c54210f490f4aa8b396aed8249b9ed7ff1c0'}},
    defaults:{focus:2,baseEV:8},defaultsEvidence:{focus:{valueMetres:2,sourceLayer:'detail-depth/center',sourceSha256:'d'.repeat(64),samples:{subject:{nativeNormalized:[.5,.5],capturePixel:[1024,576],z:2}}},baseEV:{value:8}},
  };
  const inventory=files(),image=Buffer.from([0,1,2,3]); // Not an encoded image.
  inventory['center.webp']={bytes:image.length,sha256:digest(image)};
  const profile={id,status:'approved-formal',sourceSha256:MONK_SOURCE_SHA256,displayProfileSha256:MONK_DISPLAY_PROFILE.profileSha256,
    deliverySha256:'b'.repeat(64),specSha256:'c'.repeat(64),manifestSha256:inventory['manifest.json'].sha256,filesSha256:canonicalDigest(inventory),
    rigSha256:canonicalDigest(rig),defaults:structuredClone(rig.defaults),defaultsEvidenceSha256:canonicalDigest(rig.defaultsEvidence),formalFocusDepthSha256:'d'.repeat(64),focusPixelRounding:'nearest',
    pixelAuditSha256:'e'.repeat(64),ownerReviewSha256:'f'.repeat(64),captureCoverage:{views:7,layersPerView:5,runtimeImages:35,sourcePixelsVerified:true}};
  const record={id,rig,files:inventory};for(const field of ['sourceSha256','deliverySha256','specSha256','pixelAuditSha256','ownerReviewSha256'])record[field]=profile[field];
  return {rig,profile,record,image,receipt:{version:1,schema:'monk-runtime-delivery-v1',packs:[record]},profiles:{version:1,schema:'monk-final-approved-inputs-v1',rigs:[profile]}};
}
test('synthetic complete per-rig metadata is importable only with explicit incomplete collection mode',()=>{
  const f=syntheticFinalReview();validateMonkRuntimeReceipt(f.receipt,f.profiles,{complete:false});
  assert.throws(()=>validateMonkRuntimeReceipt(f.receipt,f.profiles),/all three complete runtime packs/);
});
test('coherent replacement image bytes plus receipt SHA cannot alter an independently reviewed inventory',async()=>{
  const f=syntheticFinalReview();validateMonkRuntimeReceipt(f.receipt,f.profiles,{complete:false});
  const manifestHash=f.record.files['manifest.json'].sha256,replacement=Buffer.from([3,2,1,0]);
  assert.equal(replacement.length,f.image.length);assert.notEqual(digest(replacement),digest(f.image));
  // Attacker changes the image AND its receipt entry, preserving byte count,
  // manifest/rig and delivery/pixel/owner hash claims. This used to be unbound.
  f.record.files['center.webp']={bytes:replacement.length,sha256:digest(replacement)};
  f.record.filesSha256=canonicalDigest(f.record.files); // A self-asserted new hash is not the independent profile.
  assert.equal(f.record.files['manifest.json'].sha256,manifestHash);
  assert.throws(()=>validateMonkRuntimeReceipt(f.receipt,f.profiles,{complete:false}),/independently reviewed complete runtime file inventory/);
  // Reject BEFORE touching even a nonexistent path; no actual asset decode.
  await assert.rejects(auditMonkPack('/synthetic-only-never-read',f.record.files,f.rig,f.profile),/independently pinned complete image inventory/);
});
test('independent inventory pin covers every image role and the manifest, not just base color',()=>{
  for(const name of ['back-depth.png','left-detail.webp','right-detail-depth.png','front-flash.webp','manifest.json']){
    const f=syntheticFinalReview();f.record.files[name].sha256='9'.repeat(64);
    assert.throws(()=>validateMonkRuntimeReceipt(f.receipt,f.profiles,{complete:false}),/independently reviewed complete runtime file inventory/);
  }
});
test('missing final inventory pin is rejected even when every other synthetic final field exists',()=>{
  const f=syntheticFinalReview();delete f.profile.filesSha256;
  assert.throws(()=>validateMonkRuntimeReceipt(f.receipt,f.profiles,{complete:false}),/final filesSha256/);
});
test('provisional focus cannot enter a runtime receipt even after coherently refreshing synthetic rig/evidence hashes',()=>{
  const f=syntheticFinalReview();f.rig.defaultsEvidence={status:'pending-formal-depth',focus:'not actual formal Z'};
  f.profile.rigSha256=canonicalDigest(f.rig);f.profile.defaultsEvidenceSha256=canonicalDigest(f.rig.defaultsEvidence);
  assert.throws(()=>validateMonkRuntimeReceipt(f.receipt,f.profiles,{complete:false}),/formal focus object required/);
});

test('shared file auditor rejects a changed manifest against the independent first-read pin before JSON/image decode',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'monk-manifest-pin-'));
  try{
    // An intentionally invalid JSON/non-image tiny replacement proves the SHA
    // guard executes before parsing, let alone opening a captured image.
    const replacement=Buffer.from('changed after independent validation; not JSON');
    await writeFile(path.join(directory,'manifest.json'),replacement);
    const inventory=files();inventory['manifest.json']={bytes:replacement.length,sha256:digest(replacement)};
    await assert.rejects(auditCaptureFiles(directory,inventory,{expectedManifestSha256:digest('original independently reviewed manifest')}),/manifest unchanged since independent validation/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
