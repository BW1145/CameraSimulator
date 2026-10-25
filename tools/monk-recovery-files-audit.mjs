// Local import-time evidence check, never run in the browser. The portable
// processing gate pins this ONE recovery; this additional gate re-hashes the
// retained originals without loading a full EXR into memory or executing code.
import assert from 'node:assert/strict';
import {createReadStream} from 'node:fs';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {getMonkRecoveryPin,createSyntheticMonkProcessingValidators,validateMonkRecoveredReport} from './monk-processing-audit.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function within(root,file){
  const relative=path.relative(root,path.resolve(file));
  assert.ok(relative!=='..'&&!relative.startsWith('../')&&!path.isAbsolute(relative),'recovery evidence remains inside production root');
}
function buildReferences(report,attempt,pin,validateReport){
  validateReport(report);
  const e=report.recoveryEvidence,d=report.denoisingEvidence,refs=[];
  const add=(file,sha256,bytes)=>{assert.equal(typeof file,'string');assert.match(sha256,/^[0-9a-f]{64}$/);refs.push({path:file,sha256,...(bytes===undefined?{}:{bytes})});};
  for(const [name,value]of Object.entries(pin.files))add(path.join(attempt,name),value.sha256,value.bytes);
  for(const name of ['buffer','bufferValidation','copyReceipt','recoveryScript','denoiseReport','displayReport']){
    const value=e[name];add(value.path,value.sha256,value.bytes);
  }
  add(e.bufferValidation.inspectorScriptPath,e.bufferValidation.inspectorScriptSha256);
  for(const name of ['state','setup','renderLog','execution'])add(e.originalCapture[name+'Path'],e.originalCapture[name+'Sha256']);
  add(path.join(e.originAttempt,'job.json'),e.originJobSha256);
  for(const [name,sha256]of Object.entries(report.rendererEvidence.components))add(path.join(e.originAttempt,'scripts',name),sha256);
  for(const value of Object.values(e.processes))add(value.statePath,value.stateSha256);
  for(const value of Object.values(e.finalFiles))add(value.path,value.sha256,value.bytes);
  add(d.input,d.inputSha256);add(d.output,d.outputSha256);add(d.library,d.librarySha256);
  add(report.sourcePath,report.sourceSha256);
  return refs;
}
export function recoveryFileReferences(report,attempt){return buildReferences(report,attempt,getMonkRecoveryPin(),validateMonkRecoveredReport);}
export function createSyntheticMonkRecoveryReferences(fixture){
  const validators=createSyntheticMonkProcessingValidators(fixture);
  return (report,attempt)=>buildReferences(report,attempt,validators.pin,validators.validateMonkRecoveredReport);
}
export async function auditMonkRecoveryFiles(outputsRoot,attempt){
  const production=path.resolve(outputsRoot,'..');
  assert.equal(path.resolve(attempt),path.resolve(outputsRoot,'jobs','monk-colonnade','detail','center','attempt-002'),'only the independently reviewed adopted attempt');
  const MONK_RECOVERY_PIN=getMonkRecoveryPin();
  const documents={};
  for(const [name,pin]of Object.entries(MONK_RECOVERY_PIN.files)){
    const file=path.join(attempt,name),info=await lstat(file);assert.ok(info.isFile()&&!info.isSymbolicLink());
    const bytes=await readFile(file);assert.equal(bytes.length,pin.bytes);assert.equal(hash(bytes),pin.sha256,`actual recovered ${name}`);
    documents[name]=JSON.parse(bytes);
  }
  const report=documents['report.json'],complete=documents['complete.json'],state=documents['state.json'];
  validateMonkRecoveredReport(report);
  assert.equal(complete.reportSha256,MONK_RECOVERY_PIN.files['report.json'].sha256);
  assert.equal(complete.validationSha256,MONK_RECOVERY_PIN.files['validation.json'].sha256);
  for(const key of ['rendererEvidence','denoisingEvidence','recoveryEvidence'])assert.deepEqual(complete[key],report[key]);
  assert.equal(state.completionMode,'verified-internal-buffer-recovery');
  assert.equal(state.renderInvocationExecutedInThisAttempt,false);assert.equal(state.originalCaptureExit,-15);
  const exceptions=new Set([path.resolve(report.sourcePath),path.resolve(report.denoisingEvidence.library)]);
  const verified=new Map();let bytesRead=0;
  async function verify(ref){
    const file=path.resolve(ref.path);
    if(!exceptions.has(file))within(production,file);
    const info=await lstat(file);assert.ok(info.isFile()&&!info.isSymbolicLink(),'immutable ordinary evidence file, no symlink');
    assert.equal(await realpath(file),file,'evidence path has no symlink parents');
    if(ref.bytes!==undefined)assert.equal(info.size,ref.bytes);
    const old=verified.get(file);if(old){assert.equal(old.sha256,ref.sha256);return;}
    const h=createHash('sha256');for await(const block of createReadStream(file)){h.update(block);bytesRead+=block.length;}
    assert.equal(h.digest('hex'),ref.sha256,`retained recovery evidence ${file}`);
    const after=await lstat(file);for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[key],info[key],'evidence unchanged during streaming hash');
    verified.set(file,{sha256:ref.sha256,bytes:info.size});
  }
  for(const ref of recoveryFileReferences(report,attempt))await verify(ref);
  // The two successful post-process state files are already byte-pinned above.
  // Verify the actual worker and guard scripts they name as well.
  for(const value of Object.values(report.recoveryEvidence.processes)){
    const bytes=await readFile(value.statePath);
    assert.equal(hash(bytes),value.stateSha256,'guard state unchanged before parsing its script references');
    const process=JSON.parse(bytes);
    assert.equal(process.status,'complete');assert.equal(process.exit,0);assert.equal(process.stopReason,null);
    for(const [file,sha256]of Object.entries(process.scriptEvidence))await verify({path:file,sha256});
  }
  return {status:'verified',mode:'one-pinned-internal-buffer-recovery',jobId:MONK_RECOVERY_PIN.jobId,originalCaptureExit:-15,originalPostRenderChecks:'not-executed',files:verified.size,bytesRead};
}
