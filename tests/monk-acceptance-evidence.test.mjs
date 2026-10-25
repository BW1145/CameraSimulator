// Entirely SYNTHETIC evidence envelopes. No Monk formal result, pixel verification,
// owner review, image file or final receipt is created/claimed by these fixtures.
// Importers must first hash REAL evidence bytes against independent profile pins;
// these pure shape/consistency tests do not and cannot supply that authorization.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalJSON} from '../tools/classroom-processing-audit.mjs';
import {MONK_SOURCE_SHA256} from '../tools/monk-viewpoint-audit.mjs';
import {VIEW_IDS} from '../tools/viewpoint-capture-audit.mjs';
import {validateMonkOwnerReview,validateMonkPixelAudit,validateMonkAcceptanceEvidence} from '../tools/monk-acceptance-evidence.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const LAYERS=['base','base-depth','detail','detail-depth','flash'];
const SUFFIX={base:'.webp','base-depth':'-depth.png',detail:'-detail.webp','detail-depth':'-detail-depth.png',flash:'-flash.webp'};
function fixture(){
  const rig={id:'monk-colonnade',sourceSha256:MONK_SOURCE_SHA256,near:.03,defaults:{focus:2,baseEV:8},defaultsEvidence:{syntheticUnitTestOnly:true}};
  const names=['manifest.json',...VIEW_IDS.flatMap(view=>LAYERS.map(layer=>view+SUFFIX[layer]))];
  const files=Object.fromEntries(names.map((name,i)=>[name,{bytes:100+i,sha256:hash('synthetic runtime '+name)}]));
  const profile={id:rig.id,sourceSha256:MONK_SOURCE_SHA256,specSha256:hash('synthetic spec'),manifestSha256:files['manifest.json'].sha256,
    filesSha256:hash(canonicalJSON(files)),ownerReviewSha256:hash('NOT A REAL OWNER REVIEW'),pixelAuditSha256:hash('NOT A REAL PIXEL AUDIT'),deliverySha256:hash('NOT A REAL DELIVERY')};
  const jobs=LAYERS.flatMap(layer=>VIEW_IDS.map(view=>{
    const id=`${rig.id}/${layer}/${view}`;
    return {id,attemptPath:`/synthetic-only/jobs/${id}/attempt-001`,jobSha256:hash(id+'/synthetic-job'),validationSha256:hash(id+'/synthetic-validation'),completeSha256:hash(id+'/synthetic-complete')};
  }));
  const owner={version:1,status:'complete',rigId:rig.id,sourceSha256:MONK_SOURCE_SHA256,spec:{sha256:profile.specSha256},formal:{expectedJobs:35,verifiedJobs:35,jobs},
    pack:{files:structuredClone(files),manifestSha256:profile.manifestSha256,fileCount:36,bytes:Object.values(files).reduce((sum,f)=>sum+f.bytes,0)},
    defaults:structuredClone(rig.defaults),defaultsEvidence:structuredClone(rig.defaultsEvidence),
    visualReview:{status:'passed',reviewedAt:'2026-10-24T20:00:00.000Z',contactSheets:Object.fromEntries(['detail','flash','baseDepth','detailDepth'].map(name=>[name,{path:'/synthetic-only/'+name+'.jpg',sha256:hash('synthetic sheet '+name)}]))},
    numericAudits:[{path:'/synthetic-only/audit.json',sha256:hash('synthetic numeric audit'),status:'pass'}],knownLimitations:['Synthetic envelopes only; no real source pixels or visual review.']};
  const results=LAYERS.flatMap(layer=>VIEW_IDS.map(view=>{
    const centerArea=view==='center'&&['base','detail'].includes(layer),isDepth=layer.endsWith('depth');
    const runtimeDimensions=layer==='base'?[2560,1440]:layer==='detail'?(view==='center'?[5120,2880]:[4096,2304]):layer==='detail-depth'?[2048,1152]:[1280,720];
    const pixels=runtimeDimensions[0]*runtimeDimensions[1],sourceDimensions=centerArea?[6144,3456]:runtimeDimensions;
    const sourceJob=`${rig.id}/${centerArea?'detail':layer}/${view}`,job=jobs.find(j=>j.id===sourceJob),runtimeFile=view+SUFFIX[layer];
    const sourceFormat=layer==='base'&&view!=='center'?'hdr':'exr';
    const common={rig:rig.id,view,layer,status:'pass',sourceJob,sourceSha256:hash('synthetic source '+sourceJob),sourceBytes:sourceDimensions[0]*sourceDimensions[1]*3,
      sourceFormat,sourceDimensions:[...sourceDimensions],sourceSamples:isDepth?1:centerArea?256:32,runtimeFile,runtimeSha256:files[runtimeFile].sha256,runtimeBytes:files[runtimeFile].bytes,runtimeDimensions,pixels,mismatchedPixels:0,firstMismatches:[],
      evidence:{attempt:`jobs/${sourceJob}/attempt-001`,jobSha256:job.jobSha256,validationSha256:job.validationSha256,completeSha256:job.completeSha256,reportSha256:hash(sourceJob+'/synthetic-report'),rendererSha256:hash('synthetic renderer')}};
    return isDepth?{...common,geometryPixels:pixels-1,skyPixels:1,positiveInfiniteSkyPixels:0,minimumGeometryZ:1,maximumGeometryZ:10,finiteGeometryOverRange:0,geometryBelowNear:0,geometryBelowNearBeyondTolerance:0,near:.03,nearTolerance:.03*1e-4,range:64}:
      {...common,channels:pixels*3,mismatchedChannels:0,maximumCodeDelta:0,sourceMaximumRadiance:1,maximumRadiance:.8,clampedChannels:0,bottomUp:sourceFormat==='exr',fullFrameLinearAreaAverage:centerArea,encoding:{type:'log2-rgb',min:-16,max:12}};
  }));
  const audit={version:1,schema:'monk-independent-full-pixel-audit-v1',status:'pass',startedAt:'2026-10-24T19:00:00.000Z',finishedAt:'2026-10-24T19:10:00.000Z',deliverySha256:profile.deliverySha256,deliveryBytes:1234,deliveryReceiptBeforeAndAfter:'unchanged exact bytes/SHA256',approvedSourceSha256:MONK_SOURCE_SHA256,
    auditImplementation:{scriptSha256:hash('synthetic audit script'),pixelCoreSha256:hash('synthetic core')},
    coverage:{runtimeImages:35,perRig:35,sourceCaptureJobsActuallyUsed:34,layers:['base RGB','base axial Z','detail RGB','detail axial Z','isolated flash RGB'],allRuntimePixelsCompared:true,completedPixelComparisons:35,exclusions:['Synthetic metadata only, not an executed pixel audit.']},
    packs:[{id:rig.id,manifestSha256:profile.manifestSha256}],runtimeInventoryBeforeAndAfter:'unchanged exact receipt bytes/SHA256',failedLayers:0,results};
  return {rig,files,profile,owner,audit};
}
const ownerCheck=f=>validateMonkOwnerReview(f.owner,f.rig,f.files,f.profile);
const pixelCheck=f=>validateMonkPixelAudit(f.audit,f.rig,f.files,f.profile);
const pairCheck=f=>validateMonkAcceptanceEvidence(f.owner,f.audit,f.rig,f.files,f.profile);
const row=(f,layer='base',view='left')=>f.audit.results.find(r=>r.layer===layer&&r.view===view);

test('synthetic owner/pixel envelopes join all 35 jobs to 35 runtime images from 34 sources without mutation',()=>{
  const f=fixture(),before=structuredClone(f);ownerCheck(f);pixelCheck(f);
  assert.deepEqual(pairCheck(f),{id:f.rig.id,formalJobs:35,runtimeImages:35,sourceJobsUsed:34,status:'pinned-evidence-consistent'});
  assert.deepEqual(f,before);assert.equal(f.owner.formal.jobs.length,35);
  assert.equal(f.audit.results.filter(r=>r.sourceJob.endsWith('/detail/center')).length,2);
  assert.ok(!f.audit.results.some(r=>r.sourceJob.endsWith('/base/center')),'retired independent center base is never delivered');
});
for(const [label,mutate]of [
  ['missing completed job',f=>{f.owner.formal.jobs.pop();}],
  ['duplicate completed job',f=>{f.owner.formal.jobs[1]=structuredClone(f.owner.formal.jobs[0]);}],
  ['QC substituted for formal',f=>{f.owner.formal.jobs[0].id=f.rig.id+'/smoke-flash/center';}],
  ['wrong source',f=>{f.owner.sourceSha256=hash('wrong');}],['wrong spec SHA',f=>{f.owner.spec.sha256=hash('wrong');}],
  ['wrong reported job count',f=>{f.owner.formal.verifiedJobs=34;}],['missing complete SHA',f=>{delete f.owner.formal.jobs[0].completeSha256;}],
  ['malformed job SHA',f=>{f.owner.formal.jobs[0].jobSha256='unverified';}],
  ['attempt for another job',f=>{f.owner.formal.jobs[0].attemptPath=f.owner.formal.jobs[1].attemptPath;}],
  ['traversing attempt path',f=>{f.owner.formal.jobs[0].attemptPath='/tmp/../jobs/'+f.owner.formal.jobs[0].id+'/attempt-001';}],
  ['missing runtime file',f=>{delete f.owner.pack.files['back-flash.webp'];}],['wrong manifest SHA',f=>{f.owner.pack.manifestSha256=hash('wrong');}],
  ['changed file SHA',f=>{f.owner.pack.files['center.webp'].sha256=hash('wrong');}],['wrong total bytes',f=>{f.owner.pack.bytes++;}],
  ['provisional owner status',f=>{f.owner.status='partial';}],['different defaults',f=>{f.owner.defaults.focus=3;}],
  ['visual review not passed',f=>{f.owner.visualReview.status='pending';}],['invalid review time',f=>{f.owner.visualReview.reviewedAt='not a time';}],
  ['missing depth sheet',f=>{delete f.owner.visualReview.contactSheets.detailDepth;}],['empty sheet path',f=>{f.owner.visualReview.contactSheets.detail.path=' ';}],
  ['malformed sheet SHA',f=>{f.owner.visualReview.contactSheets.flash.sha256='bad';}],['no numeric audit',f=>{f.owner.numericAudits=[];}],
  ['numeric audit pending',f=>{f.owner.numericAudits[0].status='pending';}],['missing limitations disclosure',f=>{delete f.owner.knownLimitations;}],
])test(`owner acceptance rejects ${label}`,()=>{const f=fixture();mutate(f);assert.throws(()=>ownerCheck(f));});
for(const [label,mutate]of [
  ['plan-only result',f=>{f.audit.status='plan-only-not-pixel-verified';}],['wrong delivery SHA',f=>{f.audit.deliverySha256=hash('wrong');}],
  ['wrong manifest pin',f=>{f.audit.packs[0].manifestSha256=hash('wrong');}],['wrong rig scope',f=>{f.audit.packs[0].id='monk-courtyard';}],
  ['missing layer',f=>{f.audit.results.pop();}],['duplicate layer',f=>{f.audit.results[1]=structuredClone(f.audit.results[0]);}],
  ['extra layer',f=>{f.audit.results.push(structuredClone(f.audit.results[0]));}],['result from other rig',f=>{row(f).rig='monk-courtyard';}],
  ['duplicate runtime file',f=>{row(f).runtimeFile='center.webp';}],['wrong layer/file mapping',f=>{row(f).runtimeFile='left-flash.webp';}],
  ['wrong runtime SHA',f=>{row(f).runtimeSha256=hash('wrong');}],['wrong runtime bytes',f=>{row(f).runtimeBytes++;}],
  ['fake 1x1 full-pixel count',f=>{for(const r of f.audit.results){r.runtimeDimensions=[1,1];r.pixels=1;r.channels=3;}}],
  ['incomplete pixels',f=>{row(f).pixels--;}],['NaN pixel count',f=>{row(f).pixels=NaN;}],['false completion claim',f=>{f.audit.coverage.completedPixelComparisons=34;}],
  ['false all-pixels flag',f=>{f.audit.coverage.allRuntimePixelsCompared=false;}],['35 sources despite shared center',f=>{f.audit.coverage.sourceCaptureJobsActuallyUsed=35;}],
  ['wrong coverage layers',f=>{f.audit.coverage.layers.pop();}],['hidden failed layer',f=>{f.audit.failedLayers=1;}],
  ['retired center base reused',f=>{row(f,'base','center').sourceJob=f.rig.id+'/base/center';}],['QC source used',f=>{row(f).sourceJob=f.rig.id+'/qc-color/left';}],
  ['native crop instead of full source',f=>{row(f,'detail','center').sourceDimensions=[5120,2880];}],
  ['wrong source dimensions',f=>{row(f,'flash').sourceDimensions=[640,360];}],['wrong source samples',f=>{row(f).sourceSamples=256;}],
  ['center only 32 samples',f=>{row(f,'base','center').sourceSamples=32;}],['wrong source format',f=>{row(f).sourceFormat='exr';}],
  ['malformed source SHA',f=>{row(f).sourceSha256='bad';}],['missing raw byte count',f=>{delete row(f).sourceBytes;}],
  ['wrong source attempt',f=>{row(f).evidence.attempt='jobs/'+f.rig.id+'/base/right/attempt-001';}],
  ['missing validation SHA',f=>{delete row(f).evidence.validationSha256;}],['invalid renderer SHA',f=>{row(f).evidence.rendererSha256='bad';}],
  ['changed shared center source',f=>{row(f,'base','center').sourceSha256=hash('different raw source');}],
  ['changed shared center evidence',f=>{row(f,'base','center').evidence.completeSha256=hash('different completion');}],
  ['wrong RGB channel count',f=>{row(f).channels--;}],['actual mismatch',f=>{row(f).mismatchedPixels=1;}],
  ['hidden mismatch sample',f=>{row(f).firstMismatches=[{x:0,y:0}];}],['channel mismatch',f=>{row(f).mismatchedChannels=1;}],
  ['clamped radiance',f=>{row(f).clampedChannels=1;}],['code error',f=>{row(f).maximumCodeDelta=1;}],
  ['unreported center area average',f=>{row(f,'base','center').fullFrameLinearAreaAverage=false;}],
  ['flipped HDR scanlines',f=>{row(f).bottomUp=true;}],['invalid encoding',f=>{row(f).encoding.max=-20;}],
  ['radiance outside encoding',f=>{row(f).encoding.max=-1;}],['negative source radiance',f=>{row(f).sourceMaximumRadiance=-1;}],
  ['average brighter than source',f=>{row(f).maximumRadiance=2;}],
  ['false depth partition',f=>{row(f,'base-depth').skyPixels++;}],['fractional geometry count',f=>{row(f,'base-depth').geometryPixels-=.5;}],
  ['infinite sky over sky count',f=>{row(f,'base-depth').positiveInfiniteSkyPixels=2;}],['all-sky depth accepted as geometry',f=>{row(f,'base-depth').geometryPixels=0;}],
  ['finite depth saturation',f=>{row(f,'base-depth').finiteGeometryOverRange=1;}],['out-of-range geometry',f=>{row(f,'base-depth').maximumGeometryZ=65;}],
  ['sub-near geometry',f=>{row(f,'base-depth').geometryBelowNearBeyondTolerance=1;}],['wrong depth range',f=>{row(f,'base-depth').range=200;}],
  ['wrong near',f=>{row(f,'base-depth').near=.05;}],['inflated near tolerance',f=>{row(f,'base-depth').nearTolerance=.1;}],
  ['lying near-boundary count',f=>{row(f,'base-depth').minimumGeometryZ=.03-1e-6;}],['NaN minimum Z',f=>{row(f,'base-depth').minimumGeometryZ=NaN;}],
  ['audit finished before start',f=>{f.audit.finishedAt='2026-10-24T18:00:00.000Z';}],
  ['changed delivery during audit',f=>{f.audit.deliveryReceiptBeforeAndAfter='changed';}],['changed runtime during audit',f=>{f.audit.runtimeInventoryBeforeAndAfter='changed';}],
])test(`full-pixel envelope rejects ${label}`,()=>{const f=fixture();mutate(f);assert.throws(()=>pixelCheck(f));});
test('depth boundary within the exact floating point tolerance remains valid with truthful counts',()=>{
  const f=fixture(),z=row(f,'base-depth');z.minimumGeometryZ=z.near-1e-6;z.geometryBelowNear=1;pixelCheck(f);
  z.minimumGeometryZ=z.near-1e-4;assert.throws(()=>pixelCheck(f),/physical transport range/);
});
test('individually valid owner/pixel envelopes must join the same real job/validation/completion evidence',()=>{
  for(const field of ['jobSha256','validationSha256','completeSha256']){
    const f=fixture();row(f).evidence[field]=hash('different but well formed '+field);ownerCheck(f);pixelCheck(f);
    assert.throws(()=>pairCheck(f),/pixel\/owner/);
  }
});
test('valid attempt naming alone does not authorize a different completed attempt in the evidence join',()=>{
  const f=fixture();row(f).evidence.attempt=row(f).evidence.attempt.replace('attempt-001','attempt-002');ownerCheck(f);pixelCheck(f);
  assert.throws(()=>pairCheck(f),/same completed attempt/);
});
test('coherent file-table replacements cannot override the independently reviewed final inventory',()=>{
  const f=fixture();f.files['center.webp'].sha256=hash('replacement');f.owner.pack.files=structuredClone(f.files);row(f,'base','center').runtimeSha256=f.files['center.webp'].sha256;
  assert.throws(()=>ownerCheck(f),/inventory independently pinned/);assert.throws(()=>pixelCheck(f),/inventory independently pinned/);
});
