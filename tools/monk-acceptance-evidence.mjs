// Pure validation of actual, separately pinned completion evidence. No decode.
// REQUIRED CALLER PRECONDITION: verify the ORIGINAL owner/pixel JSON bytes against
// independent profile.ownerReviewSha256/profile.pixelAuditSha256 BEFORE calling.
// Also run the independent final rig/profile/manifest gates. Object shape or
// self-asserted status cannot grant approval or prove real pixels.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalJSON} from './classroom-processing-audit.mjs';
import {MONK_SOURCE_SHA256,MONK_VIEWPOINT_IDS} from './monk-viewpoint-audit.mjs';
import {VIEW_IDS,validateCaptureReceipt} from './viewpoint-capture-audit.mjs';
const LAYERS=['base','base-depth','detail','detail-depth','flash'];
const SUFFIX={base:'.webp','base-depth':'-depth.png',detail:'-detail.webp','detail-depth':'-detail-depth.png',flash:'-flash.webp'};
const COVERAGE_LAYERS=['base RGB','base axial Z','detail RGB','detail axial Z','isolated flash RGB'];
const hash=(value,label)=>assert.match(value,/^[a-f0-9]{64}$/,label);
const digest=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
const text=(value,label)=>assert.ok(typeof value==='string'&&value.trim().length>0,label);
const integer=(value,label,min=0)=>assert.ok(Number.isSafeInteger(value)&&value>=min,label);
const finite=(value,label)=>assert.ok(Number.isFinite(value),label);
const close=(a,b,label,tolerance=1e-7)=>{finite(a,label);finite(b,label);assert.ok(Math.abs(a-b)<=tolerance,label);};
function identity(rig,files,profile){
  assert.ok(MONK_VIEWPOINT_IDS.includes(rig?.id),'explicit Monk acceptance identity');
  assert.equal(rig.sourceSha256,MONK_SOURCE_SHA256);assert.equal(profile.id,rig.id);assert.equal(profile.sourceSha256,MONK_SOURCE_SHA256);
  for(const key of ['specSha256','manifestSha256','filesSha256','ownerReviewSha256','pixelAuditSha256','deliverySha256'])hash(profile[key],`independent ${key}`);
  validateCaptureReceipt(files);assert.equal(digest(files),profile.filesSha256,'complete inventory independently pinned');
  assert.equal(files['manifest.json'].sha256,profile.manifestSha256);
}
function attemptPath(value,jobId,{relative=false}={}){
  text(value,'actual completed attempt path');assert.ok(!value.includes('\\')&&!value.split('/').some(p=>p==='..'||p==='.'),'unambiguous attempt path');
  // jobId comes exclusively from the fixed ID/layer/view allowlists below.
  assert.match(value,new RegExp(`${relative?'^':'(?:^|/)'}jobs/${jobId}/attempt-\\d+$`),'attempt belongs to exact production job');
}
function runtimeDimensions(layer,view){
  if(layer==='base')return [2560,1440];
  if(layer==='detail')return view==='center'?[5120,2880]:[4096,2304];
  return layer==='detail-depth'?[2048,1152]:[1280,720];
}
export function validateMonkOwnerReview(owner,rig,files,profile){
  identity(rig,files,profile);
  assert.equal(owner?.version,1);assert.equal(owner.status,'complete');assert.equal(owner.rigId,rig.id);
  assert.equal(owner.sourceSha256,MONK_SOURCE_SHA256);assert.equal(owner.spec?.sha256,profile.specSha256);
  assert.equal(owner.formal?.expectedJobs,35);assert.equal(owner.formal.verifiedJobs,35);assert.ok(Array.isArray(owner.formal.jobs));
  assert.deepEqual(owner.formal.jobs.map(j=>j.id).sort(),LAYERS.flatMap(layer=>VIEW_IDS.map(view=>`${rig.id}/${layer}/${view}`)).sort(),'all 35 actual completed jobs including retired independent center base');
  for(const job of owner.formal.jobs){
    for(const key of ['completeSha256','validationSha256','jobSha256'])hash(job[key],`formal ${key}`);
    attemptPath(job.attemptPath,job.id);
  }
  validateCaptureReceipt(owner.pack?.files);assert.deepEqual(owner.pack.files,files);
  assert.equal(owner.pack.manifestSha256,profile.manifestSha256);assert.equal(owner.pack.fileCount,36);
  assert.equal(owner.pack.bytes,Object.values(files).reduce((sum,f)=>sum+f.bytes,0));
  assert.deepEqual(owner.defaults,rig.defaults);assert.deepEqual(owner.defaultsEvidence,rig.defaultsEvidence);
  assert.equal(owner.visualReview?.status,'passed');text(owner.visualReview.reviewedAt,'actual visual review time');assert.ok(Number.isFinite(Date.parse(owner.visualReview.reviewedAt)));
  assert.deepEqual(Object.keys(owner.visualReview.contactSheets).sort(),['baseDepth','detail','detailDepth','flash']);
  for(const sheet of Object.values(owner.visualReview.contactSheets)){hash(sheet.sha256,'actually viewed contact sheet');text(sheet.path,'actually viewed contact sheet path');}
  assert.ok(Array.isArray(owner.numericAudits)&&owner.numericAudits.length>0);
  for(const audit of owner.numericAudits){hash(audit.sha256,'numeric audit');text(audit.path,'numeric audit path');assert.ok(['pass','passed','complete'].includes(audit.status),'completed numeric audit');}
  assert.ok(Array.isArray(owner.knownLimitations),'truthful limitations retained');return owner;
}
export function validateMonkPixelAudit(audit,rig,files,profile){
  identity(rig,files,profile);
  assert.equal(audit?.version,1);assert.equal(audit.schema,'monk-independent-full-pixel-audit-v1');assert.equal(audit.status,'pass');
  assert.equal(audit.approvedSourceSha256,MONK_SOURCE_SHA256);assert.equal(audit.deliverySha256,profile.deliverySha256);
  integer(audit.deliveryBytes,'actual delivery byte count',1);assert.equal(audit.deliveryReceiptBeforeAndAfter,'unchanged exact bytes/SHA256');
  for(const time of [audit.startedAt,audit.finishedAt]){text(time,'audit timestamp');assert.ok(Number.isFinite(Date.parse(time)));}
  assert.ok(Date.parse(audit.finishedAt)>=Date.parse(audit.startedAt),'audit completion follows start');
  assert.equal(audit.coverage?.runtimeImages,35);assert.equal(audit.coverage.perRig,35);assert.equal(audit.coverage.sourceCaptureJobsActuallyUsed,34);
  assert.deepEqual(audit.coverage.layers,COVERAGE_LAYERS);assert.ok(Array.isArray(audit.coverage.exclusions)&&audit.coverage.exclusions.length>0);audit.coverage.exclusions.forEach(value=>text(value,'explicit audit scope exclusion'));
  assert.equal(audit.coverage.allRuntimePixelsCompared,true);assert.equal(audit.coverage.completedPixelComparisons,35);assert.equal(audit.failedLayers,0);
  assert.deepEqual(audit.packs,[{id:rig.id,manifestSha256:profile.manifestSha256}]);
  assert.equal(audit.runtimeInventoryBeforeAndAfter,'unchanged exact receipt bytes/SHA256');
  hash(audit.auditImplementation?.scriptSha256,'pixel audit implementation');hash(audit.auditImplementation.pixelCoreSha256,'pixel audit quantization implementation');
  const expected=LAYERS.flatMap(layer=>VIEW_IDS.map(view=>`${layer}/${view}`)).sort();assert.ok(Array.isArray(audit.results));
  assert.deepEqual(audit.results.map(r=>`${r.layer}/${r.view}`).sort(),expected,'exactly one result for each of the 35 layers/views');
  const runtimeFiles=new Set(),sourceJobs=new Set();
  for(const row of audit.results){
    assert.equal(row.rig,rig.id);assert.equal(row.status,'pass');
    const dims=runtimeDimensions(row.layer,row.view),centerArea=row.view==='center'&&['base','detail'].includes(row.layer),isDepth=row.layer.endsWith('depth');
    assert.deepEqual(row.runtimeDimensions,dims,'actual fixed runtime layer dimensions');assert.equal(row.pixels,dims[0]*dims[1],'all runtime pixels compared');
    const filename=row.view+SUFFIX[row.layer];assert.equal(row.runtimeFile,filename,'layer/view maps to its actual runtime file');runtimeFiles.add(filename);
    assert.equal(row.runtimeSha256,files[filename].sha256);assert.equal(row.runtimeBytes,files[filename].bytes);
    const captureLayer=centerArea?'detail':row.layer,sourceJob=`${rig.id}/${captureLayer}/${row.view}`;
    assert.equal(row.sourceJob,sourceJob,'runtime layer maps to actual source job');sourceJobs.add(row.sourceJob);
    assert.deepEqual(row.sourceDimensions,centerArea?[6144,3456]:dims,'source must contain real full overscan, not the native crop');
    assert.equal(row.sourceSamples,isDepth?1:centerArea?256:32,'actual source sampling');
    const sourceFormat=row.layer==='base'&&row.view!=='center'?'hdr':'exr';assert.equal(row.sourceFormat,sourceFormat);
    hash(row.sourceSha256,'actual source image SHA');integer(row.sourceBytes,'actual source image bytes',1);
    for(const key of ['jobSha256','validationSha256','reportSha256','completeSha256','rendererSha256'])hash(row.evidence?.[key],`actual source ${key}`);
    attemptPath(row.evidence.attempt,sourceJob,{relative:true});
    assert.equal(row.mismatchedPixels,0);assert.deepEqual(row.firstMismatches,[],'no hidden sample mismatch');
    if(isDepth){
      assert.equal(row.finiteGeometryOverRange,0);assert.equal(row.geometryBelowNearBeyondTolerance,0);assert.equal(row.range,64);
      close(row.near,rig.near,'real capture near');close(row.nearTolerance,Math.max(1e-6,Math.abs(row.near)*1e-4),'exact depth near tolerance',1e-12);
      integer(row.geometryPixels,'finite geometry pixels',1);integer(row.skyPixels,'sky pixels');integer(row.positiveInfiniteSkyPixels,'infinite sky subset');integer(row.geometryBelowNear,'near boundary pixels');
      assert.equal(row.geometryPixels+row.skyPixels,row.pixels,'geometry and sky partition every depth pixel');
      assert.ok(row.positiveInfiniteSkyPixels<=row.skyPixels&&row.geometryBelowNear<=row.geometryPixels,'depth subset counts');
      finite(row.minimumGeometryZ,'minimum finite geometry');finite(row.maximumGeometryZ,'maximum finite geometry');
      assert.ok(row.minimumGeometryZ>=row.near-row.nearTolerance&&row.maximumGeometryZ>=row.minimumGeometryZ&&row.maximumGeometryZ<=64,'finite geometry inside physical transport range');
      assert.equal(row.geometryBelowNear===0,row.minimumGeometryZ>=row.near,'near-boundary count agrees with measured minimum');
    }else{
      assert.equal(row.channels,row.pixels*3);assert.equal(row.mismatchedChannels,0);assert.equal(row.clampedChannels,0);assert.equal(row.maximumCodeDelta,0);
      assert.equal(row.bottomUp,sourceFormat==='exr');assert.equal(row.fullFrameLinearAreaAverage,centerArea,'only real 6144 center sources are area averaged');
      assert.equal(row.encoding?.type,'log2-rgb');finite(row.encoding.min,'encoding min');finite(row.encoding.max,'encoding max');assert.ok(row.encoding.max>row.encoding.min);
      for(const key of ['sourceMaximumRadiance','maximumRadiance']){finite(row[key],key);assert.ok(row[key]>=0,key);}
      assert.ok(row.maximumRadiance<=2**row.encoding.max,'no radiance beyond delivered range');
      assert.ok(row.maximumRadiance<=row.sourceMaximumRadiance+Math.max(1e-9,row.sourceMaximumRadiance*1e-12),'area average cannot invent a brighter maximum');
    }
  }
  assert.equal(runtimeFiles.size,audit.coverage.runtimeImages);assert.equal(sourceJobs.size,audit.coverage.sourceCaptureJobsActuallyUsed);
  assert.equal(audit.results.filter(row=>row.status==='pass'&&row.pixels===runtimeDimensions(row.layer,row.view).reduce((a,b)=>a*b)).length,audit.coverage.completedPixelComparisons);
  const base=audit.results.find(r=>r.layer==='base'&&r.view==='center'),detail=audit.results.find(r=>r.layer==='detail'&&r.view==='center');
  for(const key of ['sourceSha256','sourceBytes','sourceDimensions','sourceSamples','sourceFormat','evidence'])assert.deepEqual(base[key],detail[key],'both center radiance maps derive from the same validated 6144/256 capture: '+key);
  return audit;
}

// Optional stronger join after BOTH evidence files passed independent byte pins.
// The retired 32spp center base is in owner.jobs but deliberately never mapped to
// delivered radiance; center base/detail both join to the formal detail job.
export function validateMonkAcceptanceEvidence(owner,audit,rig,files,profile){
  validateMonkOwnerReview(owner,rig,files,profile);validateMonkPixelAudit(audit,rig,files,profile);
  const jobs=new Map(owner.formal.jobs.map(job=>[job.id,job]));
  for(const row of audit.results){
    const job=jobs.get(row.sourceJob);assert.ok(job,'actual runtime source job is among owner-verified jobs');
    for(const key of ['jobSha256','validationSha256','completeSha256'])assert.equal(row.evidence[key],job[key],`pixel/owner ${key} chain`);
    assert.ok(job.attemptPath===row.evidence.attempt||job.attemptPath.endsWith('/'+row.evidence.attempt),'pixel/owner same completed attempt');
  }
  return {id:rig.id,formalJobs:35,runtimeImages:35,sourceJobsUsed:34,status:'pinned-evidence-consistent'};
}
