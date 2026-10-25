// Ordinary staged captures retain their ORIGINAL validator. The sole exception
// is the byte-pinned, already completed colonnade center recovery below. This
// validates portable metadata only, never raw pixels or a successful old export.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {canonicalJSON,stagedRendererHash,validateStagedCenter} from './classroom-processing-audit.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonicalSha=value=>sha(canonicalJSON(value));
export const MONK_RECOVERY_PROOF_SHA256='58d04e6ccbf3751bb9a67167b90823071a615381e02d868a51247b5efd2e31fe';
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
let productionProof;
export function getMonkRecoveryPin(){
  if(!productionProof){
    const bytes=readFileSync(new URL('../.assets-cache/private-production/monk-colonnade-recovery-proof.json',import.meta.url));
    assert.equal(sha(bytes),MONK_RECOVERY_PROOF_SHA256,'independently frozen ORIGINAL recovery proof bytes');
    productionProof=freeze(JSON.parse(bytes));
  }
  return productionProof;
}
// Test injection has a separate API; production exports always use the fixed
// original-byte pin above. A synthetic fixture never authorizes a real import.
export function createSyntheticMonkProcessingValidators(fixture){
  assert.equal(fixture.fixtureScope,'synthetic-test-only');
  assert.notEqual(sha(JSON.stringify(fixture)),MONK_RECOVERY_PROOF_SHA256);
  return createValidators(()=>freeze(structuredClone(fixture)));
}
function createValidators(loadProof){
let proof;
function ensureProof(){
  if(!proof){
    try{proof=loadProof();validatePinnedProof();validateMonkRecoveredReport(proof.report);}
    catch(error){proof=undefined;throw error;}
  }
}
const RIG='monk-colonnade',JOB='monk-colonnade/detail/center',MODE='recovered-cycles-internal-buffer-v1';
const SOURCE='eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b';
const JOB_SHA='7671e0c743cdab4ef912034493488e47c0bde28bc06643726c1eed11e0473ce2';
const BUFFER='92cf607ac0da0363c3130e6ee3207bb3aca1576933b6c1f22063a7f19903ffd0';
const OUTPUT='4797bc6409464b476c3b330a649c485aeb6fdfd73295871e6fee7d37d55f72bb';
const PNG='d03a11874869be30f59547ddeb6754bfdc39f858d96e571e37cd77958c546ddf';
const EXPECTED_FILES={'report.json':'1293bdbc71eef759173c8935f43df38086a4e2e17150f44463c3ce8306509abf','complete.json':'6f29f0d725d9378f57390ab366ff5daeeb11934aff85f31f43f29370a69e1dfc','validation.json':'67b74cfd9a4ad6b63367b9b320ea3cb3988eeba8d70b2a6eaa41c4bd98e6b5fe','state.json':'7dc8d899fa9b2c4a604c11bf9ad62a6e4b3bc535ac315247cb6a85fcb797f2a7','job.json':JOB_SHA};
const COUNTS={minimum:256,maximum:256,pixels:6144*3456};
const POST_CHECKS=Object.fromEntries(['sourceFrame','cameraPose','samplingSettings','threads','qualitySettings','simplification','contextScene','effectiveSeed'].map(key=>[key,'not-executed']));
const ABSENT_POST_FIELDS=['cameraMatrixMaxDelta','contextSceneAfterRender','effectiveSeedAfterRender'];
const has=(record,key)=>record&&Object.hasOwn(record,key);
function absent(record,keys,label){for(const key of keys)assert.ok(!has(record,key),`${label}: ${key} must remain absent`);}
function positive(value,label){assert.ok(Number.isFinite(value)&&value>0,label);}

// The complete small report is retained in the proof, reserialized as JSON.
// files.sha256 binds ORIGINAL bytes; canonicalSha256 separately binds parsed JS
// values. It never pretends to reproduce Python's numeric spellings or file SHA.
function validatePinnedProof(){
  assert.equal(proof.version,1);assert.equal(proof.schema,'monk-colonnade-recovery-proof-v1');
  assert.equal(proof.rigId,RIG);assert.equal(proof.jobId,JOB);assert.equal(proof.sourceSha256,SOURCE);assert.equal(proof.mode,MODE);
  assert.deepEqual(Object.keys(proof.files).sort(),Object.keys(EXPECTED_FILES).sort());
  for(const [name,pin]of Object.entries(EXPECTED_FILES)){
    const file=proof.files[name];assert.equal(file.sha256,pin);assert.ok(Number.isSafeInteger(file.bytes)&&file.bytes>0);
    assert.match(file.canonicalSha256,/^[a-f0-9]{64}$/);assert.equal(file.path,`outputs/jobs/${JOB}/attempt-002/${name}`);
  }
  const c=proof.completion,v=proof.report.validation,s=proof.state,b=proof.bufferValidation;
  assert.equal(c.status,'complete');assert.equal(c.jobId,JOB);assert.equal(c.jobSha256,JOB_SHA);
  assert.equal(c.reportSha256,EXPECTED_FILES['report.json']);assert.equal(c.validationSha256,EXPECTED_FILES['validation.json']);
  assert.deepEqual(c.files,v.files);assert.equal(c.rendererSha256,proof.report.rendererEvidence.sha256);
  assert.equal(canonicalSha(v),proof.files['validation.json'].canonicalSha256,'embedded actual numeric validation');
  assert.equal(s.status,'complete');assert.equal(s.exit,0);assert.equal(s.completionMode,'verified-internal-buffer-recovery');
  assert.equal(s.renderInvocationExecutedInThisAttempt,false,'this recovery did not rerender');assert.equal(s.originalCaptureExit,-15);
  assert.equal(s.scriptSha256,c.rendererSha256);assert.equal(proof.originalState.status,'failed');assert.equal(proof.originalState.exit,1);
  assert.deepEqual(proof.originalState.renderProcess,proof.report.recoveryEvidence.originalCapture.renderProcess);
  assert.equal(proof.originalState.renderProcess.exit,-15);
  assert.deepEqual(s.stages.map(stage=>stage.stage),['denoise','display'],'only postprocessing ran in recovery');
  for(const stage of s.stages){
    assert.equal(stage.status,'complete');assert.equal(stage.exit,0);assert.equal(stage.stopReason,null);
    assert.equal(stage.policy.maxGroupRSSMiB,4200);assert.equal(stage.policy.minSystemAvailableMiB,2048);assert.equal(stage.policy.diskReserveMiB,1024);
    positive(stage.sampledPeakGroupRSSMiB,'guarded recovery RSS');assert.ok(stage.sampledPeakGroupRSSMiB<=4200);
    assert.ok(stage.startedUnix>proof.originalState.finishedUnix&&stage.finishedUnix>=stage.startedUnix,'original scene exited before recovery processing');
  }
  assert.ok(s.stages[1].startedUnix>=s.stages[0].finishedUnix,'denoise/display serialized');
  assert.equal(b.status,'valid-full-frame-internal-buffer');assert.equal(b.sourceBufferSha256,BUFFER);assert.equal(b.originJobSha256,JOB_SHA);assert.equal(b.sourceSceneSha256,SOURCE);
  assert.deepEqual(b.dimensions,[6144,3456]);assert.deepEqual(b.sampleCountStatistics,COUNTS);
  assert.deepEqual(b.tiles,{expected:336,completeExactSamples:336,samples:256,finishedMarker:true});assert.equal(b.originalCaptureExit,-15);
  for(const channel of ['color','normal','albedo'])assert.equal(b.normalizedChannelStatistics[channel].allFinite,true);
  assert.ok(b.normalizedChannelStatistics.color.minimum>=0);
}
function validateRecoveryProcessing(renderer,denoise,recovery){
  ensureProof();
  for(const [name,value]of [['rendererEvidence',renderer],['denoisingEvidence',denoise],['recoveryEvidence',recovery]])assert.deepEqual(value,proof.report[name],`exact actual ${name}, not a fabricated recovery`);
  assert.equal(renderer.version,1);assert.equal(renderer.mode,'staged-center');assert.equal(renderer.sha256,stagedRendererHash(renderer));
  assert.equal(recovery.version,1);assert.equal(recovery.mode,MODE);assert.equal(recovery.sourceSha256,SOURCE);assert.equal(recovery.originJobSha256,JOB_SHA);
  assert.equal(recovery.buffer.sha256,BUFFER);assert.equal(recovery.buffer.bytes,781114421);
  assert.equal(recovery.bufferValidation.sha256,'3ebbecda70ad0f0987488935122af55374eb0a328648364c1c900b8636edf962');
  assert.equal(recovery.copyReceipt.sha256,'56755776ab10fad98971e3ab9424dce504fc55cf27be3489656ed83dad05aa10');
  assert.equal(recovery.originalCapture.runnerExit,1);assert.equal(recovery.originalCapture.renderExit,-15);assert.equal(recovery.originalCapture.renderProcess.exit,-15);
  assert.equal(recovery.originalCapture.reason,recovery.originalCapture.renderProcess.memorySafetyReason);assert.match(recovery.originalCapture.reason,/Resource safety stop/);
  assert.equal(recovery.setupObservationPhase,'pre-render');assert.deepEqual(recovery.postRenderChecks,POST_CHECKS);
  absent(denoise,['rawCaptureEvidence'],'internal buffer is not an ordinary exported raw capture');
  const expected={status:'complete',inputSha256:BUFFER,inputFormat:'cycles-internal-buffer',outputSha256:OUTPUT,samples:256,normalization:'cycles uint32 sample-count division',device:'CPU',quality:'HIGH',prefilter:'ACCURATE',hdr:true,srgb:false,cleanAux:true,maxMemoryMBPerFilter:1024,threads:8,setAffinity:false,manualTiling:false,fullFrameAutomaticInputScale:true,sceneProcessExitedBeforeDenoising:true};
  for(const [key,value]of Object.entries(expected))assert.equal(denoise[key],value,`recovered denoise ${key}`);
  assert.deepEqual(denoise.dimensions,[6144,3456]);assert.deepEqual(denoise.sampleCountStatistics,COUNTS);assert.deepEqual(denoise.inputChannels,proof.bufferValidation.channels);
  assert.deepEqual(denoise.channelOffsets,{color:0,normal:4,albedo:7});assert.equal(denoise.filterRowOrder,'Cycles bottom-up; normalized EXR rows reversed before filtering, all output rows reversed back to top-down EXR');
  assert.equal(denoise.scriptSha256,renderer.components['denoise-bounded.py']);assert.equal(denoise.librarySha256,'9a220453d6a7ea32a036559e6579768a312653c9da12b819282f91bf8b2acc11');
  assert.deepEqual(denoise.steps.map(s=>s.filter),['albedo','normal','color']);
  assert.deepEqual(Object.keys(recovery.finalFiles).sort(),['center.exr','center.png']);
  assert.equal(recovery.finalFiles['center.exr'].sha256,OUTPUT);assert.equal(recovery.finalFiles['center.exr'].bytes,239907231);
  assert.equal(recovery.finalFiles['center.png'].sha256,PNG);assert.equal(recovery.finalFiles['center.png'].bytes,94504437);
}
function validateMonkRecoveredReport(report){
  ensureProof();
  assert.equal(canonicalSha(report),proof.files['report.json'].canonicalSha256,'exact original recovered report values; original-byte SHA is checked by local importer');
  assert.equal(report.status,'complete');assert.equal(report.jobId,JOB);assert.equal(report.jobSha256,JOB_SHA);assert.equal(report.rigId,RIG);assert.equal(report.sourceSha256,SOURCE);
  assert.equal(report.mode,'ambient');assert.equal(report.layer,'detail');assert.equal(report.samples,256);
  assert.equal(report.sourceScene,'daylight');assert.equal(report.sourceFrame,4);assert.equal(report.renderViewLayer,'View Layer');assert.equal(report.isolatedRenderContext,true);
  assert.equal(report.views.length,1);assert.equal(report.views[0].id,'center');assert.deepEqual([report.views[0].width,report.views[0].height],[6144,3456]);
  assert.equal(report.views[0].samples,256);assert.equal(report.views[0].file,'center.exr');assert.equal(report.views[0].bytes,239907231);
  absent(report,ABSENT_POST_FIELDS,'original post-render observations did not execute');
  validateRecoveryProcessing(report.rendererEvidence,report.denoisingEvidence,report.recoveryEvidence);
  const v=report.validation;assert.equal(v.status,'valid');assert.equal(v.jobId,JOB);assert.equal(v.jobSha256,JOB_SHA);assert.equal(v.samples,256);
  assert.deepEqual(v.dimensions,[6144,3456]);assert.equal(v.nonfiniteChannels,0);assert.equal(v.negativeChannels,0);
  assert.equal(v.samplingLogVerification.expectedTileCount,336);assert.equal(v.samplingLogVerification.allTilesReachedRequestedSamples,true);assert.equal(v.samplingLogVerification.samplesPerPixel,256);
  assert.equal(v.files['center.exr'].sha256,OUTPUT);assert.equal(v.files['center.png'].sha256,PNG);
  return {mode:MODE,rigId:RIG,jobId:JOB,originalCaptureExit:-15,postRenderChecksExecuted:false};
}
function validateMonkStagedCenter(pack){
  const primary=pack.views?.[0]?.radianceCapture,source=pack.captureQuality?.sourceCenter,detail=pack.detail?.views?.find(v=>v.id==='center');
  const records=[primary,source,detail],allowed=new Set(records),marked=[];
  // Do not let a late/misplaced mirror silently select the ordinary branch.
  function scan(value){
    if(!value||typeof value!=='object')return;
    for(const [key,child]of Object.entries(value)){
      if(key==='recoveryEvidence'){assert.ok(allowed.has(value),'recovery evidence only belongs to the three center processing mirrors');marked.push(value);continue;}
      assert.ok(!['recoveryAttempt','recoveries'].includes(key),'unbound recovery locator/alias is not runtime evidence');scan(child);
    }
  }
  scan(pack);
  if(marked.length===0){
    assert.notEqual(primary?.jobEvidence,'jobs/monk-colonnade/detail/center/attempt-002','known recovered attempt cannot become ordinary metadata');
    for(const record of records){
      const d=record?.denoisingEvidence;
      assert.notEqual(d?.inputFormat,'cycles-internal-buffer','internal buffer needs explicit pinned recovery');
      assert.notEqual(d?.inputSha256,BUFFER,'recovered buffer cannot masquerade as ordinary raw export');
      assert.notEqual(d?.outputSha256,OUTPUT,'recovered EXR cannot masquerade as ordinary raw export');
      assert.notEqual(record?.sourceExrSha256,OUTPUT,'recovered output must retain its limitations');
    }
    return validateStagedCenter(pack); // Ordinary acceptance remains unchanged.
  }
  assert.equal(pack.id,RIG,'recovery exception cannot be borrowed by another rig');assert.equal(pack.sourceSha256,SOURCE);assert.equal(pack.detail.sourceSha256,SOURCE);
  assert.equal(pack.views[0].id,'center');assert.equal(pack.detail.views.filter(v=>v.id==='center').length,1);
  assert.equal(marked.length,3,'all three processing mirrors must explicitly carry the same recovery');
  for(const record of records){
    assert.ok(has(record,'recoveryEvidence'),'each recovery mirror is mandatory');
    absent(record,[...ABSENT_POST_FIELDS,'rawCaptureEvidence'],'recovery mirror cannot invent completed raw/post checks');
    validateRecoveryProcessing(record.rendererEvidence,record.denoisingEvidence,record.recoveryEvidence);
  }
  for(const record of [pack,pack.views[0],pack.sourceRenderEvidence])absent(record,ABSENT_POST_FIELDS,'unexecuted recovered source post checks');
  assert.equal(primary.jobEvidence,'jobs/monk-colonnade/detail/center/attempt-002');assert.equal(primary.sourceFile,'center.exr');assert.equal(primary.captureSeconds,proof.report.views[0].seconds);
  for(const record of [primary,detail]){
    assert.equal(record.sourceExrSha256,OUTPUT);assert.equal(record.samples,256);
    assert.equal(record.sourceWidth,6144);assert.equal(record.sourceHeight,3456);assert.equal(record.runtimeDetailWidth,5120);assert.equal(record.runtimeDetailHeight,2880);
  }
  assert.equal(source.width,6144);assert.equal(source.height,3456);assert.equal(source.samples,256);assert.equal(source.overscan,1.2);
  return {mode:MODE,rigId:RIG,jobId:JOB,originalCaptureExit:-15,postRenderChecksExecuted:false};
}

return {get pin(){ensureProof();return proof;},validateMonkRecoveredReport,validateMonkStagedCenter};
}
const productionValidators=createValidators(getMonkRecoveryPin);
export const validateMonkRecoveredReport=report=>productionValidators.validateMonkRecoveredReport(report);
export const validateMonkStagedCenter=pack=>productionValidators.validateMonkStagedCenter(pack);
