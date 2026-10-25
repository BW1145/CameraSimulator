// Synthetic parsed-value mutations; real byte-pinned evidence is tested privately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {canonicalJSON,validateStagedCenter} from '../tools/classroom-processing-audit.mjs';
import {createSyntheticMonkProcessingValidators} from '../tools/monk-processing-audit.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/monk-recovery.synthetic.json',import.meta.url)));
const {pin:PIN,validateMonkRecoveredReport,validateMonkStagedCenter}=createSyntheticMonkProcessingValidators(fixture);
const clone=structuredClone,sha=value=>createHash('sha256').update(value).digest('hex');
const processing=()=>Object.fromEntries(['rendererEvidence','denoisingEvidence','recoveryEvidence'].map(key=>[key,clone(PIN.report[key])]));
function recovered(){
  const sourceExrSha256=PIN.report.denoisingEvidence.outputSha256;
  const common={sourceExrSha256,samples:256,sourceWidth:6144,sourceHeight:3456,runtimeDetailWidth:5120,runtimeDetailHeight:2880};
  return {id:PIN.rigId,sourceSha256:PIN.sourceSha256,
    views:[{id:'center',radianceCapture:{...common,sourceFile:'center.exr',jobEvidence:'jobs/monk-colonnade/detail/center/attempt-002',captureSeconds:PIN.report.views[0].seconds,...processing()}}],
    captureQuality:{sourceCenter:{width:6144,height:3456,samples:256,overscan:1.2,...processing()}},
    detail:{sourceSha256:PIN.sourceSha256,views:[{id:'center',...common,...processing()}]}};
}
const mirrors=p=>[p.views[0].radianceCapture,p.captureQuality.sourceCenter,p.detail.views[0]];
const mutateAll=(p,fn)=>mirrors(p).forEach(fn);
function ordinary(id='apartment-armchair'){
  return JSON.parse(readFileSync(new URL(`../public/scenes/${id}-plates/manifest.json`,import.meta.url)));
}
test('synthetic parsed fixture exercises pin invariants without claiming original bytes',()=>{
  assert.equal(fixture.fixtureScope,'synthetic-test-only');
  assert.equal(PIN.files['report.json'].sha256,'1293bdbc71eef759173c8935f43df38086a4e2e17150f44463c3ce8306509abf');
  assert.equal(PIN.files['complete.json'].sha256,'6f29f0d725d9378f57390ab366ff5daeeb11934aff85f31f43f29370a69e1dfc');
  assert.equal(PIN.files['validation.json'].sha256,'67b74cfd9a4ad6b63367b9b320ea3cb3988eeba8d70b2a6eaa41c4bd98e6b5fe');
  assert.equal(PIN.files['state.json'].sha256,'7dc8d899fa9b2c4a604c11bf9ad62a6e4b3bc535ac315247cb6a85fcb797f2a7');
  assert.equal(PIN.files['job.json'].sha256,'7671e0c743cdab4ef912034493488e47c0bde28bc06643726c1eed11e0473ce2');
  assert.equal(sha(canonicalJSON(PIN.report)),PIN.files['report.json'].canonicalSha256);assert.notEqual(PIN.files['report.json'].sha256,PIN.files['report.json'].canonicalSha256);
  assert.equal(PIN.originalState.status,'failed');assert.equal(PIN.originalState.renderProcess.exit,-15);
  assert.equal(PIN.state.completionMode,'verified-internal-buffer-recovery');assert.equal(PIN.state.renderInvocationExecutedInThisAttempt,false);
  assert.deepEqual(PIN.state.stages.map(s=>s.stage),['denoise','display']);assert.equal(PIN.state.originalCaptureExit,-15);
  assert.ok(Object.isFrozen(PIN.report.recoveryEvidence.postRenderChecks));
});
test('actual recovered report and three pack mirrors are accepted without erasing original limitations',()=>{
  const report=clone(PIN.report),pack=recovered(),before=clone(pack);const r=validateMonkRecoveredReport(report),p=validateMonkStagedCenter(pack);
  assert.equal(r.originalCaptureExit,-15);assert.equal(r.postRenderChecksExecuted,false);assert.deepEqual(p,r);assert.deepEqual(pack,before);
  assert.equal(Object.keys(pack.views[0].radianceCapture.recoveryEvidence.postRenderChecks).length,8);
  for(const record of mirrors(pack))assert.ok(!Object.hasOwn(record.denoisingEvidence,'rawCaptureEvidence'));
});
for(const id of ['classroom-desk','kitchen-pastry','apartment-armchair'])test(`${id}: ordinary completed raw route keeps the original validator and result`,()=>{
  const pack=ordinary(id),before=clone(pack);assert.equal(validateMonkStagedCenter(pack),validateStagedCenter(pack));assert.deepEqual(pack,before);
});
for(const [label,mutate]of [
  ['other Monk rig',p=>{p.id='monk-reading-table';}],['old scene borrowing exception',p=>{p.id='apartment-armchair';}],
  ['different source',p=>{p.sourceSha256='a'.repeat(64);}],['different detail source',p=>{p.detail.sourceSha256='a'.repeat(64);}],
  ['wrong attempt',p=>{p.views[0].radianceCapture.jobEvidence='jobs/monk-colonnade/detail/center/attempt-001';}],
  ['wrong source file',p=>{p.views[0].radianceCapture.sourceFile='center.hdr';}],['wrong capture timing',p=>{p.views[0].radianceCapture.captureSeconds=1;}],
  ['different output',p=>{mutateAll(p,r=>{r.denoisingEvidence.outputSha256='a'.repeat(64);});}],
  ['different sample job',p=>{mutateAll(p,r=>{r.recoveryEvidence.originJobSha256='a'.repeat(64);});}],
  ['different buffer SHA',p=>{mutateAll(p,r=>{r.recoveryEvidence.buffer.sha256='a'.repeat(64);});}],
  ['different buffer size',p=>{mutateAll(p,r=>{r.recoveryEvidence.buffer.bytes--;});}],
  ['unknown recovery mode',p=>{mutateAll(p,r=>{r.recoveryEvidence.mode='generic-retry';});}],
  ['origin render falsely successful',p=>{mutateAll(p,r=>{r.recoveryEvidence.originalCapture.renderExit=0;});}],
  ['origin runner falsely successful',p=>{mutateAll(p,r=>{r.recoveryEvidence.originalCapture.runnerExit=0;});}],
  ['origin process falsely successful',p=>{mutateAll(p,r=>{r.recoveryEvidence.originalCapture.renderProcess.exit=0;});}],
  ['erased memory guard',p=>{mutateAll(p,r=>{delete r.recoveryEvidence.originalCapture.reason;});}],
  ['wrong original state proof',p=>{mutateAll(p,r=>{r.recoveryEvidence.originalCapture.stateSha256='a'.repeat(64);});}],
  ['wrong recovery process proof',p=>{mutateAll(p,r=>{r.recoveryEvidence.processes.denoise.stateSha256='a'.repeat(64);});}],
  ['fake raw evidence, even null',p=>{mutateAll(p,r=>{r.denoisingEvidence.rawCaptureEvidence=null;});}],
  ['fake completed raw process',p=>{mutateAll(p,r=>{r.denoisingEvidence.rawCaptureEvidence={renderProcess:{exit:0}};});}],
  ['wrong denoise normalization',p=>{mutateAll(p,r=>{r.denoisingEvidence.normalization='already normalized';});}],
  ['wrong denoise row order',p=>{mutateAll(p,r=>{r.denoisingEvidence.filterRowOrder='top-down';});}],
  ['wrong denoise channel offsets',p=>{mutateAll(p,r=>{r.denoisingEvidence.channelOffsets.normal=7;});}],
  ['wrong guide channel',p=>{mutateAll(p,r=>{r.denoisingEvidence.inputChannels[4]='fake';});}],
  ['incomplete pixel samples',p=>{mutateAll(p,r=>{r.denoisingEvidence.sampleCountStatistics.minimum=255;});}],
  ['manual denoise tiles',p=>{mutateAll(p,r=>{r.denoisingEvidence.manualTiling=true;});}],
  ['unbounded denoise memory',p=>{mutateAll(p,r=>{r.denoisingEvidence.maxMemoryMBPerFilter=2048;});}],
  ['wrong OIDN library',p=>{mutateAll(p,r=>{r.denoisingEvidence.librarySha256='a'.repeat(64);});}],
  ['wrong renderer identity',p=>{mutateAll(p,r=>{r.rendererEvidence.components['render-job.py']='a'.repeat(64);});}],
  ['fake post-render observation in mirror',p=>{p.captureQuality.sourceCenter.cameraMatrixMaxDelta=0;}],
  ['fake post-render observation on pack',p=>{p.contextSceneAfterRender='daylight';}],
  ['fake post-render observation on view',p=>{p.views[0].effectiveSeedAfterRender=17;}],
  ['wrong full source dimensions',p=>{p.views[0].radianceCapture.sourceWidth=5120;}],
  ['wrong runtime detail dimensions',p=>{p.detail.views[0].runtimeDetailWidth=6144;}],
  ['overscan relabel',p=>{p.captureQuality.sourceCenter.overscan=1;}],
  ['duplicate detail center',p=>{p.detail.views.push(clone(p.detail.views[0]));}],
])test(`exact recovery route rejects ${label}`,()=>{const p=recovered();mutate(p);assert.throws(()=>validateMonkStagedCenter(p));});
for(const key of Object.keys(PIN.report.recoveryEvidence.postRenderChecks))test(`recovery never upgrades unexecuted ${key} into a passed post-check`,()=>{
  const p=recovered();mutateAll(p,r=>{r.recoveryEvidence.postRenderChecks[key]='passed';});assert.throws(()=>validateMonkStagedCenter(p));
});
for(const index of [0,1,2])test(`missing or divergent processing mirror ${index} fails closed`,()=>{
  let p=recovered();delete mirrors(p)[index].recoveryEvidence;assert.throws(()=>validateMonkStagedCenter(p));
  p=recovered();mirrors(p)[index].denoisingEvidence.hdr=false;assert.throws(()=>validateMonkStagedCenter(p));
  p=recovered();mirrors(p)[index].rendererEvidence.sha256='a'.repeat(64);assert.throws(()=>validateMonkStagedCenter(p));
});
test('all recovery markers cannot be removed to borrow the ordinary path',()=>{
  const p=recovered();mutateAll(p,r=>{delete r.recoveryEvidence;});assert.throws(()=>validateMonkStagedCenter(p),/known recovered attempt/);
  p.views[0].radianceCapture.jobEvidence='jobs/monk-colonnade/detail/center/attempt-003';assert.throws(()=>validateMonkStagedCenter(p),/internal buffer/);
  mutateAll(p,r=>{delete r.denoisingEvidence.inputFormat;});assert.throws(()=>validateMonkStagedCenter(p),/buffer cannot masquerade/);
});
for(const [label,mutate]of [
  ['null recovery mirror',p=>{p.captureQuality.sourceCenter.recoveryEvidence=null;}],
  ['late detail-only recovery',p=>{p.detail.views.find(v=>v.id==='center').recoveryEvidence=clone(PIN.report.recoveryEvidence);}],
  ['stray view recovery',p=>{p.views[1].recoveryEvidence=clone(PIN.report.recoveryEvidence);}],
  ['unbound recovery locator',p=>{p.captureQuality.sourceCenter.recoveryAttempt='somewhere';}],
  ['recovery alias',p=>{p.recoveries={accepted:true};}],
  ['hidden known output',p=>{p.views[0].radianceCapture.sourceExrSha256=PIN.report.denoisingEvidence.outputSha256;}],
  ['ordinary raw exit failure',p=>{for(const r of [p.views[0].radianceCapture,p.captureQuality.sourceCenter,p.detail.views.find(v=>v.id==='center')])r.denoisingEvidence.rawCaptureEvidence.renderProcess.exit=-15;}],
  ['ordinary denoise mirror mismatch',p=>{p.captureQuality.sourceCenter.denoisingEvidence.hdr=false;}],
])test(`ordinary route rejects ${label} rather than overlooking recovery/mirror anomalies`,()=>{const p=ordinary();mutate(p);assert.throws(()=>validateMonkStagedCenter(p));});
for(const [label,mutate]of [
  ['different rig',r=>{r.rigId='monk-courtyard';}],['different job',r=>{r.jobSha256='a'.repeat(64);}],
  ['invented completed camera check',r=>{r.cameraMatrixMaxDelta=0;}],['invented null postcheck',r=>{r.effectiveSeedAfterRender=null;}],
  ['wrong actual view',r=>{r.views[0].matrix[0]+=.01;}],['changed numeric validation',r=>{r.validation.nonfiniteChannels=1;}],
  ['successful original-exit claim',r=>{r.recoveryEvidence.originalCapture.renderExit=0;}],['wrong output PNG',r=>{r.recoveryEvidence.finalFiles['center.png'].sha256='a'.repeat(64);}],
])test(`whole actual recovered report pin rejects ${label}`,()=>{const r=clone(PIN.report);mutate(r);assert.throws(()=>validateMonkRecoveredReport(r));});

test('synthetic validator requires an explicit test-only marker and never accepts an invalid proof after a failed first use',()=>{
  const unmarked=clone(fixture);delete unmarked.fixtureScope;
  assert.throws(()=>createSyntheticMonkProcessingValidators(unmarked));
  const invalid=clone(fixture);invalid.state.originalCaptureExit=0;
  const validators=createSyntheticMonkProcessingValidators(invalid);
  assert.throws(()=>validators.validateMonkRecoveredReport(invalid.report));
  assert.throws(()=>validators.validateMonkRecoveredReport(invalid.report));
});
test('static module import and ordinary processing need no private production evidence',async()=>{
  const {spawnSync}=await import('node:child_process');
  const script=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
    const read=fs.readFileSync;fs.readFileSync=function(file,...args){if(String(file).includes('private-production'))throw Error('PRIVATE_READ');return read.call(this,file,...args);};syncBuiltinESMExports();
    const m=await import('./tools/monk-processing-audit.mjs');await import('./tools/monk-viewpoint-audit.mjs');
    const pack=JSON.parse(fs.readFileSync('./public/scenes/apartment-armchair-plates/manifest.json'));m.validateMonkStagedCenter(pack);
    try{m.getMonkRecoveryPin();process.exit(2);}catch(e){if(e.message!=='PRIVATE_READ')throw e;}`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
