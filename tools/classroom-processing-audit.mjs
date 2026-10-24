import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const STAGED_CENTER_COMPONENTS=['center-stage-runner.py','render-center-raw.py','denoise-bounded.py','center-display.py','render-job.py'].sort();
const hash=(value,label)=>assert.match(value,/^[a-f0-9]{64}$/,label);
export function canonicalJSON(value){
  if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJSON(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
export function stagedRendererHash(renderer){return createHash('sha256').update(canonicalJSON({version:renderer.version,mode:renderer.mode,components:renderer.components})).digest('hex');}
export function validateStagedCenter(pack){
  const proof=pack.views[0].radianceCapture,renderer=proof.rendererEvidence,denoise=proof.denoisingEvidence;
  assert.equal(renderer?.version,1);assert.equal(renderer.mode,'staged-center');
  assert.deepEqual(Object.keys(renderer.components).sort(),STAGED_CENTER_COMPONENTS);
  Object.values(renderer.components).forEach(value=>hash(value,'renderer component SHA'));
  assert.equal(renderer.sha256,stagedRendererHash(renderer),'canonical composite renderer identity');
  assert.equal(denoise?.status,'complete');
  for(const record of [pack.captureQuality.sourceCenter,pack.detail.views.find(v=>v.id==='center')]){
    assert.deepEqual(record.rendererEvidence,renderer,'consistent source-center processing identity');
    assert.deepEqual(record.denoisingEvidence,denoise,'consistent source-center denoising evidence');
  }
  assert.deepEqual(denoise.dimensions,[6144,3456]);assert.equal(denoise.samples,256);
  for(const [key,value]of Object.entries({quality:'HIGH',prefilter:'ACCURATE',hdr:true,srgb:false,cleanAux:true,fullFrameAutomaticInputScale:true,manualTiling:false,sceneProcessExitedBeforeDenoising:true}))assert.equal(denoise[key],value,`center denoise ${key}`);
  assert.ok(Number.isFinite(denoise.maxMemoryMBPerFilter)&&denoise.maxMemoryMBPerFilter>0&&denoise.maxMemoryMBPerFilter<=1024);
  hash(denoise.librarySha256,'actual OIDN library');assert.equal(denoise.scriptSha256,renderer.components['denoise-bounded.py']);
  const raw=denoise.rawCaptureEvidence;
  assert.equal(raw?.sourceSha256,pack.sourceSha256,'raw capture uses reviewed rig source');hash(raw.jobSha256,'raw capture job');
  assert.deepEqual(raw.dimensions,[6144,3456]);assert.equal(raw.samples,256);
  assert.deepEqual(Object.keys(raw.rawRendererComponents).sort(),['render-center-raw.py','render-job.py']);
  for(const [name,value]of Object.entries(raw.rawRendererComponents))assert.equal(value,renderer.components[name],'captured raw renderer identity');
  for(const file of ['center.exr','report.json','render.log'])hash(raw.files[file],`preserved raw ${file}`);
  assert.equal(raw.renderProcess.exit,0);assert.ok(!raw.renderProcess.memorySafetyReason,'complete raw render, not memory-safety interruption');
  assert.equal(denoise.inputSha256,raw.files['center.exr'],'OIDN consumes the proven raw capture');
  assert.equal(denoise.outputSha256,proof.sourceExrSha256,'runtime maps derive from the actual denoised EXR');
  if(denoise.sampleCountStatistics){
    assert.equal(denoise.sampleCountStatistics.minimum,256);assert.equal(denoise.sampleCountStatistics.maximum,256);
    assert.equal(denoise.sampleCountStatistics.pixels,6144*3456);
  }
}
