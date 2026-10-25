import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {sceneDefaults} from '../src/scenes.js';
import {canonicalJSON} from './classroom-processing-audit.mjs';
import {validateApprovedComposition} from './classroom-composition-audit.mjs';

const KITCHEN_SOURCE={
  originalAuthor:'Nicole Morena',
  originalSourceSha256:'5f27c41cf828ca15ffd06fc3ad3d971343f6af4a29828c834252229a26dce395',
  previewSourceSha256:'5f27c41cf828ca15ffd06fc3ad3d971343f6af4a29828c834252229a26dce395',
  sourceLicense:'CC BY-SA; adaptation CC BY-SA4.0',
  attribution:'Nicole Morena / CC BY-SA; adaptation CC BY-SA 4.0',
  previewSourceField:'originalSha256',focusPixelRounding:'floor',
};
// This allowlist is intentionally explicit. A new profile cannot grant itself
// another scene's author, license, preview parent or source lineage.
const SOURCE_IDENTITIES={
  'kitchen-pastry':{...KITCHEN_SOURCE,previewViewId:'kitchen-pastry-r2'},
  'kitchen-tea':{...KITCHEN_SOURCE,previewViewId:'kitchen-tea-r2'},
  'apartment-armchair':{
    originalAuthor:'Flavio Della Tommasa',
    originalSourceSha256:'0027fcbd73411cce7f49b3d86c22c03d18980e22641083da9d8ba82d9fc94e25',
    previewSourceSha256:'8013231a152b944229960a679163a8ac5f44110b5cb7121bebae6f15f19cfaf2',
    sourceLicense:'CC BY; adaptation CC BY4.0',
    attribution:'Flavio Della Tommasa / CC BY; adaptation CC BY 4.0',
    previewViewId:'apartment-chair-r3-preview',previewSourceField:'previewSourceSha256',focusPixelRounding:'nearest',
  },
};
export const DERIVED_VIEWPOINT_IDS=Object.keys(SOURCE_IDENTITIES);
import {VIEW_IDS,validateCaptureReceipt,validateCaptureGeometry,validateCaptureManifest,readCaptureAsset,auditCaptureFiles} from './viewpoint-capture-audit.mjs';
export {VIEW_IDS,safeAssetName,validateCaptureReceipt as validateDerivedReceipt} from './viewpoint-capture-audit.mjs';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const finite=(value,label)=>assert.ok(Number.isFinite(value),`${label}: expected finite number`);
function close(actual,expected,label,tolerance=2e-5){finite(actual,label);finite(expected,label);assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} != ${expected}`);}
function vector(actual,expected,label){assert.equal(actual?.length,expected.length,label);actual.forEach((n,i)=>close(n,expected[i],`${label}[${i}]`));}
function hash(value,label){assert.match(value,/^[a-f0-9]{64}$/,label);}
export function validateDerivedProfile(profile){
  assert.ok(profile&&DERIVED_VIEWPOINT_IDS.includes(profile.id),'explicitly reviewed derived viewpoint');
  assert.equal(profile.deliverySchema,`${profile.id}-delivery-v1`);
  const identity=SOURCE_IDENTITIES[profile.id];
  for(const key of ['originalAuthor','originalSourceSha256','previewSourceSha256','sourceLicense','attribution','previewViewId'])assert.equal(profile[key],identity[key],`independently reviewed ${key}`);
  for(const key of ['sourceSha256','originalSourceSha256','previewSha256','previewSourceSha256','previewReportSha256','deliverySha256','specSha256','manifestSha256','rigSha256','approvedCompositionSha256','sourceProvenanceSha256','defaultsEvidenceSha256','formalFocusDepthSha256'])hash(profile[key],`approved ${key}`);
  assert.ok(Number.isFinite(profile.referenceFocal)&&profile.referenceFocal>0);
  sceneDefaults({}, {referenceFocal:profile.referenceFocal,defaults:profile.defaults});assert.equal(profile.defaults.baseEV,8);
}
export function validateDerivedInputs(rig,profile){
  validateDerivedProfile(profile);
  assert.equal(rig.id,profile.id);assert.equal(rig.packId,profile.id);assert.equal(rig.sourceSha256,profile.sourceSha256);
  assert.equal(sha256(canonicalJSON(rig)),profile.rigSha256,'frozen reviewed rig, not a self-consistent replacement');
  assert.equal(rig.approvedComposition.preview.sha256,profile.previewSha256);
  assert.equal(rig.approvedComposition.preview.sourceSha256,profile.previewSourceSha256);
  assert.equal(rig.approvedComposition.preview.sourceReportSha256,profile.previewReportSha256);
  assert.equal(sha256(canonicalJSON(rig.approvedComposition)),profile.approvedCompositionSha256);
  assert.equal(sha256(canonicalJSON(rig.sourceProvenance)),profile.sourceProvenanceSha256);
  assert.equal(sha256(canonicalJSON(rig.defaultsEvidence)),profile.defaultsEvidenceSha256);
  assert.deepEqual(rig.defaults,profile.defaults);close(rig.referenceFocal,profile.referenceFocal,'approved reference focal');
  return profile;
}
// Portable receipt: no production filesystem access is needed in CI.
export function validateDerivedDelivery(delivery,profiles){
  assert.equal(delivery?.version,1);assert.equal(delivery.schema,'derived-viewpoint-runtime-delivery-v1');
  assert.equal(profiles?.version,1);assert.ok(Array.isArray(delivery.packs)&&delivery.packs.length>0);
  assert.equal(new Set(delivery.packs.map(p=>p.id)).size,delivery.packs.length,'one complete receipt per scene');
  for(const record of delivery.packs){
    const profile=profiles.rigs.find(p=>p.id===record.id);assert.ok(profile,'approved scene profile');
    validateDerivedInputs(record.rig,profile);validateCaptureReceipt(record.files);
    assert.equal(record.sourceSha256,profile.sourceSha256);assert.equal(record.deliverySha256,profile.deliverySha256);assert.equal(record.specSha256,profile.specSha256);
    assert.equal(record.files['manifest.json'].sha256,profile.manifestSha256);
  }
  return delivery;
}
// On import, also bind the delivered camera to the frozen, reviewed renderer
// specification. This is separate from validating a self-consistent manifest.
export function validateDerivedRig(pack,rig,profile){
  validateDerivedInputs(rig,profile);
  assert.equal(pack.sourceSha256,rig.sourceSha256);
  assert.deepEqual(pack.defaults,rig.defaults,'reviewed per-rig focus/exposure defaults');
  assert.deepEqual(pack.defaultsEvidence,rig.defaultsEvidence,'formal default-focus source evidence');
  assert.deepEqual(pack.sourceProvenance,rig.sourceProvenance,'source-only camera derivation belongs to the reviewed rig');
  validateApprovedComposition(pack,rig,{previewSourceField:SOURCE_IDENTITIES[profile.id].previewSourceField});
  validateCaptureGeometry(pack,rig);
}

// The delivered PNG contract is axial camera-Z in metres, not ray distance.
// Its 64m far saturation includes sky; it must never be interpreted as a wall.
export function validateDerivedManifest(pack,profile){
  validateDerivedProfile(profile);const reviewedSourceSha256=profile.sourceSha256;
  assert.equal(pack.id,profile.id,'explicit known viewpoint');assert.equal(pack.version,1);assert.equal(pack.sourceSha256,reviewedSourceSha256);
  assert.equal(pack.sourceProvenance?.originalSha256,profile.originalSourceSha256);
  assert.equal(pack.sourceProvenance?.originalAuthor,profile.originalAuthor);assert.equal(pack.sourceProvenance?.license,profile.sourceLicense);
  assert.equal(pack.attribution,profile.attribution);
  assert.equal(sha256(canonicalJSON(pack.sourceProvenance)),profile.sourceProvenanceSha256,'independent source provenance binding');
  assert.equal(sha256(canonicalJSON(pack.approvedComposition)),profile.approvedCompositionSha256,'independently approved native framing');
  assert.equal(sha256(canonicalJSON(pack.defaultsEvidence)),profile.defaultsEvidenceSha256,'independent formal-Z focus evidence');
  const freeze=pack.sourceProvenance.sourceFreeze;
  assert.equal(freeze.originalSha256,profile.previewSourceSha256,'native camera derives from the actual approved preview parent');assert.equal(freeze.derivedSourceSha256,profile.sourceSha256);
  if(pack.id==='apartment-armchair'){
    assert.equal(pack.sourceProvenance.previewSourceSha256,profile.previewSourceSha256);
    assert.equal(freeze.immediateParentSha256,profile.previewSourceSha256);
    assert.equal(freeze.ultimateOriginalSha256,profile.originalSourceSha256);
    assert.equal(freeze.sourceObjectCount,525);assert.equal(freeze.frozenObjectCount,526);
    const sharing=pack.sourceProvenance.derivations?.find(d=>d.type==='exact-evaluated-tree-geometry-sharing');
    assert.ok(sharing,'exact evaluated geometry sharing must be disclosed separately from the camera-only change');
    assert.equal(sharing.source.originalSourceSha256,profile.originalSourceSha256);
    assert.equal(sharing.source.derivedSourceSha256,profile.previewSourceSha256);
    assert.equal(sharing.source.noSimplificationBeyondOriginalSource,true);
    assert.equal(Object.keys(pack.sourceProvenance.exactGeometrySharingProof??{}).length,5,'reviewed original-to-preview proof chain');
    const evidence=pack.sourceRenderEvidence;
    assert.equal(evidence?.sourceScene,'Scene');assert.equal(evidence.sourceFrame,3);
    assert.equal(evidence.sourceViewLayer,'View Layer');assert.equal(evidence.isolatedRenderContext,true);
    const settings=evidence.originalSettings;
    for(const [key,value]of [['texture_limit','2048'],['texture_limit_render','2048'],['sample_clamp_direct',5],['sample_clamp_indirect',10]])assert.equal(settings?.cycles?.[key],value,`retained original apartment ${key}`);
    assert.equal(settings.render.use_simplify,true);assert.equal(settings.render.simplify_subdivision_render,2);
  }
  assert.equal(freeze.originalSourceUnchanged,true);assert.deepEqual(freeze.assetsMissing,[]);assert.equal(freeze.cameraMatrixMaxDelta,0);
  assert.equal(freeze.frozenObjectCount,freeze.sourceObjectCount+1,'only native camera object added');
  assert.ok(pack.sourceProvenance?.derivations?.length>0,'derived source must be attributed');
  assert.deepEqual(pack.defaults,profile.defaults);close(pack.referenceFocal,profile.referenceFocal,'independent native focal');
  const focus=pack.defaultsEvidence.focus;assert.equal(focus.sourceLayer,'detail-depth/center');
  assert.equal(focus.sourceSha256,profile.formalFocusDepthSha256);close(focus.valueMetres,pack.defaults.focus,'formal default focus');
  assert.ok(Object.keys(focus.samples).length>0,'measured formal subject samples');
  for(const sample of Object.values(focus.samples)){
    assert.equal(sample.nativeNormalized?.length,2);sample.nativeNormalized.forEach(v=>assert.ok(Number.isFinite(v)&&v>=0&&v<=1));
    assert.equal(sample.capturePixel?.length,2);sample.capturePixel.forEach((v,i)=>assert.ok(Number.isInteger(v)&&v>=0&&v<[2048,1152][i]));
    // These are independently measured source probes, not the runtime picker:
    // kitchen probes used floor; the approved apartment probe used nearest.
    const pixel=SOURCE_IDENTITIES[profile.id].focusPixelRounding==='nearest'?Math.round:Math.floor;
    sample.capturePixel.forEach((v,i)=>assert.equal(v,pixel((.5+(sample.nativeNormalized[i]-.5)/1.2)*[2048,1152][i]),'formal ROI follows its reviewed native-to-capture sampling convention'));
    assert.ok(Number.isFinite(sample.z)&&sample.z>0&&sample.z<64);
    const roi=sample.roi7x7;for(const key of ['min','median','max'])finite(roi[key],'formal subject ROI');
    assert.ok(roi.min<=sample.z&&sample.z<=roi.max&&roi.min<=roi.median&&roi.median<=roi.max);
  }
  return validateCaptureManifest(pack,reviewedSourceSha256);
}

// Check actual encoded bytes/dimensions and independent view content, not just
// a manifest's claim. Required delivery receipts bind every file to packaging QA.
export async function auditDerivedPack(directory,receipt,reviewedRig,profile){
  validateCaptureReceipt(receipt);
  const bytes=await readCaptureAsset(path.join(directory,'manifest.json')),pack=JSON.parse(bytes);validateDerivedManifest(pack,profile);
  assert.equal(sha256(bytes),profile.manifestSha256,'independently pinned final manifest');
  validateDerivedRig(pack,reviewedRig,profile);
  return auditCaptureFiles(directory,receipt,{expectedManifestSha256:profile.manifestSha256});
}
