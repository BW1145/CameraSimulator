// Small metadata/path tests only. The retained 781 MB buffer is NOT read here.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
const PIN=JSON.parse(readFileSync(new URL('./fixtures/monk-recovery.synthetic.json',import.meta.url)));
import {createSyntheticMonkRecoveryReferences,auditMonkRecoveryFiles} from '../tools/monk-recovery-files-audit.mjs';
const recoveryFileReferences=createSyntheticMonkRecoveryReferences(PIN);

test('local recovery hash plan covers original failure, exact adopted files, buffer, processing and outputs',()=>{
  const report=PIN.report,e=report.recoveryEvidence,d=report.denoisingEvidence;
  const refs=recoveryFileReferences(report,e.recoveryAttempt);
  const has=(file,sha)=>assert.ok(refs.some(r=>r.path===file&&r.sha256===sha));
  for(const [name,pin]of Object.entries(PIN.files))has(path.join(e.recoveryAttempt,name),pin.sha256);
  for(const key of ['buffer','bufferValidation','copyReceipt','recoveryScript','denoiseReport','displayReport'])has(e[key].path,e[key].sha256);
  for(const name of ['state','setup','renderLog','execution'])has(e.originalCapture[name+'Path'],e.originalCapture[name+'Sha256']);
  for(const [name,sha]of Object.entries(report.rendererEvidence.components))has(path.join(e.originAttempt,'scripts',name),sha);
  has(e.bufferValidation.inspectorScriptPath,e.bufferValidation.inspectorScriptSha256);
  for(const p of Object.values(e.processes))has(p.statePath,p.stateSha256);
  for(const p of Object.values(e.finalFiles))has(p.path,p.sha256);
  has(d.library,d.librarySha256);has(d.input,d.inputSha256);has(d.output,d.outputSha256);has(report.sourcePath,report.sourceSha256);
  assert.equal(refs.find(r=>r.path===e.buffer.path).bytes,781114421);
});
test('local recovery references cannot be replaced coherently with a different path or digest',()=>{
  for(const mutate of [r=>r.recoveryEvidence.buffer.sha256='0'.repeat(64),r=>r.recoveryEvidence.buffer.path='fixtures/unreviewed/buffer.exr',r=>r.sourcePath='fixtures/unreviewed/source.blend']){
    const r=structuredClone(PIN.report);mutate(r);assert.throws(()=>recoveryFileReferences(r,r.recoveryEvidence.recoveryAttempt));
  }
});
test('local streaming audit rejects another attempt before reading any production file',async()=>{
  await assert.rejects(auditMonkRecoveryFiles('fixtures/not-read/outputs','fixtures/not-read/outputs/jobs/monk-colonnade/detail/center/attempt-001'),/only the independently reviewed adopted attempt/);
  await assert.rejects(auditMonkRecoveryFiles('fixtures/not-read/outputs','fixtures/not-read/outputs/jobs/monk-reading-table/detail/center/attempt-002'),/only the independently reviewed adopted attempt/);
});
