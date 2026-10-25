import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalJSON} from '../tools/classroom-processing-audit.mjs';
import {validateDerivedProfile} from '../tools/derived-viewpoint-audit.mjs';
import {MONK_APPROVED_INPUTS,MONK_PIN_PROVENANCE,MONK_VIEWPOINT_IDS,MONK_SOURCE_SHA256,MONK_DISPLAY_TRANSFORM,MONK_DISPLAY_PROFILE,
  roundMonkFocusPixel,validateMonkStaticRig,validateMonkSourceProvenance,validateMonkPreviewReport,validateMonkPreviewReportBytes,validateMonkPreviewImageBytes,
  validateMonkSourceDisplayInspection,validateMonkSourceDisplayInspectionBytes,validateMonkDisplayTransform,validateMonkDisplayProfile,
  validateMonkDisplayMetadata,validateMonkSourceRenderEvidence,validateMonkFormalDefaults,validateMonkCapturedComposition,
} from '../tools/monk-viewpoint-audit.mjs';
const clone=structuredClone;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Synthetic parsed-report fixtures with fictional relative locations.
// Successful ORIGINAL-byte SHA checks live in the private production test.
// These fixtures exercise shape and mutation checks, not historical byte proof.
const PREVIEW_BYTES={
  "monk-colonnade": "{\"status\": \"complete\", \"sourcePath\": \"fixtures/synthetic-machine/camera-render-work/new-scenes-preview-20261024/downloads/lone-monk.blend\", \"sourceSha256\": \"eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b\", \"sceneId\": \"lone-monk\", \"viewId\": \"colonnade-diagonal\", \"width\": 1280, \"height\": 720, \"samples\": 16, \"threads\": 2, \"seconds\": 99.70427942276001, \"png\": \"center.png\", \"pngSha256\": \"d9b02fd599fc2f6ce942e599bb82b4e4f85578213dfe4dfaec585ed9d3a1755f\", \"pngBytes\": 1117521, \"PNGValidation\": {\"dimensions\": [1280, 720], \"nonfinite\": 0, \"min\": 0.0, \"max\": 1.0}, \"linearRenderResultValidation\": {\"available\": false, \"reason\": \"No accessible background Render Result buffer; only decoded final PNG checked\"}, \"sourceSettings\": {\"scene\": \"daylight\", \"frame\": 4, \"world\": \"World - nishita\", \"engine\": \"CYCLES\", \"color\": {\"view\": \"Filmic\", \"look\": \"Medium Contrast\", \"exposure\": -2.0, \"gamma\": 1.0}, \"compositing\": true, \"sequencer\": true, \"objects\": 1368, \"lights\": [], \"maxBounces\": 8, \"diffuseBounces\": 2, \"glossyBounces\": 2, \"transmissionBounces\": 2, \"simplify\": false, \"textureLimit\": \"OFF\"}, \"actualCamera\": {\"matrix\": [[0.9987159967422485, -0.0007331844535656273, -0.05065418779850006, 10.100000381469727], [-0.05065949633717537, -0.01445415522903204, -0.9986113905906677, 13.199999809265137], [2.820984112972269e-09, 0.9998952746391296, -0.014472737908363342, 1.5], [0.0, 0.0, 0.0, 1.0]], \"position\": [10.100000381469727, 13.199999809265137, 1.5], \"target\": [10.8, 27, 1.7], \"lens\": 28.0, \"sensorWidth\": 36.0, \"sensorFit\": \"HORIZONTAL\", \"shiftX\": 0.0, \"shiftY\": 0.0, \"near\": 0.029999999329447746, \"far\": 200.0, \"bakedDOF\": false}, \"renderLayer\": \"View Layer\", \"isolatedContext\": true, \"actualSourceFrame\": 4, \"cameraMatrixBeforeRender\": [[0.9987159967422485, -0.0007331844535656273, -0.05065418779850006, 10.100000381469727], [-0.05065949633717537, -0.01445415522903204, -0.9986113905906677, 13.199999809265137], [2.820984112972269e-09, 0.9998952746391296, -0.014472737908363342, 1.5], [0.0, 0.0, 0.0, 1.0]], \"renderMode\": \"Cycles CPU / full-frame OIDN accurate / clean AgX display; original creative compositor bypassed\", \"displayStyle\": \"clean-agx\", \"displayTreatment\": \"Source creative compositor bypassed; modern AgX, no added sharpening or grading\", \"actualDisplayTransform\": {\"view\": \"AgX\", \"look\": \"AgX - Medium High Contrast\", \"exposure\": -1.5, \"gamma\": 1.0}, \"sourceSavedOrOverwritten\": false, \"persistentEXR\": false, \"sourceObjectsNotEvaluatedForMetadata\": true, \"peakRssMiB\": 1866.375}",
  "monk-reading-table": "{\"status\": \"complete\", \"sourcePath\": \"fixtures/synthetic-machine/camera-render-work/new-scenes-preview-20261024/downloads/lone-monk.blend\", \"sourceSha256\": \"eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b\", \"sceneId\": \"lone-monk\", \"viewId\": \"books-reading-corner\", \"width\": 1280, \"height\": 720, \"samples\": 16, \"threads\": 2, \"seconds\": 97.82066535949707, \"png\": \"center.png\", \"pngSha256\": \"61926c7f3ad31f9fdc5890e37fd016f0e6af41c3ad00d653feb904da9f603576\", \"pngBytes\": 1187392, \"PNGValidation\": {\"dimensions\": [1280, 720], \"nonfinite\": 0, \"min\": 0.0, \"max\": 1.0}, \"linearRenderResultValidation\": {\"available\": false, \"reason\": \"No accessible background Render Result buffer; only decoded final PNG checked\"}, \"sourceSettings\": {\"scene\": \"daylight\", \"frame\": 4, \"world\": \"World - nishita\", \"engine\": \"CYCLES\", \"color\": {\"view\": \"Filmic\", \"look\": \"Medium Contrast\", \"exposure\": -2.0, \"gamma\": 1.0}, \"compositing\": true, \"sequencer\": true, \"objects\": 1368, \"lights\": [], \"maxBounces\": 8, \"diffuseBounces\": 2, \"glossyBounces\": 2, \"transmissionBounces\": 2, \"simplify\": false, \"textureLimit\": \"OFF\"}, \"actualCamera\": {\"matrix\": [[0.942990243434906, 0.05018877238035202, -0.329014390707016, 19.299999237060547], [-0.3328203558921814, 0.1422012895345688, -0.9322067499160767, 9.100000381469727], [-4.146492216250408e-08, 0.9885645508766174, 0.1507982760667801, 1.0499999523162842], [0.0, 0.0, 0.0, 1.0]], \"position\": [19.299999237060547, 9.100000381469727, 1.0499999523162842], \"target\": [20.5, 12.5, 0.5], \"lens\": 32.0, \"sensorWidth\": 36.0, \"sensorFit\": \"HORIZONTAL\", \"shiftX\": 0.0, \"shiftY\": 0.0, \"near\": 0.029999999329447746, \"far\": 200.0, \"bakedDOF\": false}, \"renderLayer\": \"View Layer\", \"isolatedContext\": true, \"actualSourceFrame\": 4, \"cameraMatrixBeforeRender\": [[0.942990243434906, 0.05018877238035202, -0.329014390707016, 19.299999237060547], [-0.3328203558921814, 0.1422012895345688, -0.9322067499160767, 9.100000381469727], [-4.146492216250408e-08, 0.9885645508766174, 0.1507982760667801, 1.0499999523162842], [0.0, 0.0, 0.0, 1.0]], \"renderMode\": \"Cycles CPU / full-frame OIDN accurate / clean AgX display; original creative compositor bypassed\", \"displayStyle\": \"clean-agx\", \"displayTreatment\": \"Source creative compositor bypassed; modern AgX, no added sharpening or grading\", \"actualDisplayTransform\": {\"view\": \"AgX\", \"look\": \"AgX - Medium High Contrast\", \"exposure\": -1.5, \"gamma\": 1.0}, \"sourceSavedOrOverwritten\": false, \"persistentEXR\": false, \"sourceObjectsNotEvaluatedForMetadata\": true, \"peakRssMiB\": 1865.4921875}",
  "monk-courtyard": "{\"status\": \"complete\", \"sourcePath\": \"fixtures/synthetic-machine/camera-render-work/new-scenes-preview-20261024/downloads/lone-monk.blend\", \"sourceSha256\": \"eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b\", \"sceneId\": \"lone-monk\", \"viewId\": \"courtyard-oblique\", \"width\": 1280, \"height\": 720, \"samples\": 16, \"threads\": 2, \"seconds\": 89.8843080997467, \"png\": \"center.png\", \"pngSha256\": \"b901bfc18c73cc976c563b3ab5130d0ff8241de2ddbd295464b5665ed749c438\", \"pngBytes\": 1487009, \"PNGValidation\": {\"dimensions\": [1280, 720], \"nonfinite\": 0, \"min\": 0.0, \"max\": 1.0}, \"linearRenderResultValidation\": {\"available\": false, \"reason\": \"No accessible background Render Result buffer; only decoded final PNG checked\"}, \"sourceSettings\": {\"scene\": \"daylight\", \"frame\": 4, \"world\": \"World - nishita\", \"engine\": \"CYCLES\", \"color\": {\"view\": \"Filmic\", \"look\": \"Medium Contrast\", \"exposure\": -2.0, \"gamma\": 1.0}, \"compositing\": true, \"sequencer\": true, \"objects\": 1368, \"lights\": [], \"maxBounces\": 8, \"diffuseBounces\": 2, \"glossyBounces\": 2, \"transmissionBounces\": 2, \"simplify\": false, \"textureLimit\": \"OFF\"}, \"actualCamera\": {\"matrix\": [[0.7249993681907654, -0.06709069013595581, -0.685474157333374, 14.5], [-0.6887495517730713, -0.0706217959523201, -0.7215515375137329, 15.5], [-2.6246194551049484e-08, 0.9952443838119507, -0.0974094346165657, 1.25], [0.0, 0.0, 0.0, 1.0]], \"position\": [14.5, 15.5, 1.25], \"target\": [24, 25.5, 2.6], \"lens\": 26.0, \"sensorWidth\": 36.0, \"sensorFit\": \"HORIZONTAL\", \"shiftX\": 0.0, \"shiftY\": 0.0, \"near\": 0.029999999329447746, \"far\": 200.0, \"bakedDOF\": false}, \"renderLayer\": \"View Layer\", \"isolatedContext\": true, \"actualSourceFrame\": 4, \"cameraMatrixBeforeRender\": [[0.7249993681907654, -0.06709069013595581, -0.685474157333374, 14.5], [-0.6887495517730713, -0.0706217959523201, -0.7215515375137329, 15.5], [-2.6246194551049484e-08, 0.9952443838119507, -0.0974094346165657, 1.25], [0.0, 0.0, 0.0, 1.0]], \"renderMode\": \"Cycles CPU / full-frame OIDN accurate / clean AgX display; original creative compositor bypassed\", \"displayStyle\": \"clean-agx\", \"displayTreatment\": \"Source creative compositor bypassed; modern AgX, no added sharpening or grading\", \"actualDisplayTransform\": {\"view\": \"AgX\", \"look\": \"AgX - Medium High Contrast\", \"exposure\": -1.5, \"gamma\": 1.0}, \"sourceSavedOrOverwritten\": false, \"persistentEXR\": false, \"sourceObjectsNotEvaluatedForMetadata\": true, \"peakRssMiB\": 1865.64453125}"
};
const DISPLAY_INSPECTION_BYTES="{\"status\": \"pass\", \"sourceDisplay\": {\"path\": \"fixtures/synthetic-machine/camera-render-work/new-scenes-preview-20261024/downloads/lone-monk.blend\", \"sha256\": \"eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b\", \"displayDevice\": \"sRGB\", \"view\": {\"view_transform\": \"Filmic\", \"look\": \"Medium Contrast\", \"exposure\": -2.0, \"gamma\": 1.0, \"use_white_balance\": false, \"use_curve_mapping\": false}}, \"inputEXR\": \"fixtures/synthetic-machine/camera-render-work/monk-formal-planning-20261024/preflight/outputs/monk-reading-table/qc-color/center/attempt-001/center.exr\", \"inputEXRSha256\": \"78565b7a88d0f6f406e97cfb945b359031b26c3f4a5c8ad203f85f4532005034\", \"dimensions\": [640, 360], \"tests\": [{\"name\": \"approved-display\", \"sha256\": \"58945026654932355fb7d4809bcac76b7a742bfe598b9ba5a24f6e2d1faa59c9\", \"bytes\": 804663, \"maxAbsError\": 0.123046875, \"withinRGBE8bitSharedExponentBound\": true, \"medianRatioForNonzero\": 0.9967076778411865}, {\"name\": \"neutral-linear\", \"sha256\": \"58945026654932355fb7d4809bcac76b7a742bfe598b9ba5a24f6e2d1faa59c9\", \"bytes\": 804663, \"maxAbsError\": 0.123046875, \"withinRGBE8bitSharedExponentBound\": true, \"medianRatioForNonzero\": 0.9967076778411865}], \"HDRSaveBypassesDisplayLookAndExposure\": true, \"sourceEvaluated\": false, \"sourceWritten\": false, \"peakMiB\": 356.90625}";
const SOURCE_PROVENANCE={
  "originalPath": "fixtures/synthetic-machine/camera-render-work/new-scenes-preview-20261024/downloads/lone-monk.blend",
  "originalSha256": "eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b",
  "previewSourceSha256": "eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b",
  "originalAuthor": "Carlo Bergonzini / Monorender",
  "license": "CC-BY (current official file internalREADME; version unspecified)",
  "originalUrl": "https://download.blender.org/demo/cycles/lone-monk_cycles_and_exposure-node_demo.blend",
  "derivations": [
    {
      "type": "external-reviewed-camera-and-display-settings",
      "changes": "Native pose from exactapproved preview report; actualcapture uses1.2realoverscan, sourcegeometry/material/light unchanged. Scene-linearEXR notlook-baked."
    }
  ],
  "sourceFreeze": {
    "mode": "external-reviewed-camera-rig",
    "sourcePath": "fixtures/synthetic-machine/camera-render-work/new-scenes-preview-20261024/downloads/lone-monk.blend",
    "sourceSha256": "eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b",
    "approvedCameraSha256": "549ea671009805f2fa49eed0d7575522a8e3ebc94c3bd3b17838ba4bd270d838",
    "freezeScriptSha256": "6af2b3a4a7f89e1b1545f4b0d20c536bc1ba1cdade0b176859c95f894c06e61e",
    "cameraInBlend": false,
    "cameraCreatedAtRender": true,
    "previewReportPath": "fixtures/synthetic-machine/camera-render-work/new-scenes-preview-20261024/attempts/lone-monk-colonnade-diagonal-r1-preview-001/report.json",
    "previewReportSha256": "bd6ba7f7ea9bfa1a299ed0bc88b6156e236f9e8e86c0fbe23cbcf8a0905a8793"
  },
  "sourceDisplayInspection": {
    "path": "fixtures/synthetic-machine/camera-render-work/monk-production-20261024/display-hdr-probe-001/report.json",
    "sha256": "dce328d114c48e3288f1c314a195c54210f490f4aa8b396aed8249b9ed7ff1c0"
  },
  "compatibility": "Approved4.5.14 render appearance from original5.2 source. Originalunwritten; newerfile/partialCol warnings retained, no full5.2semantic-equivalence claim."
};
function rig(id='monk-colonnade'){
  const p=MONK_APPROVED_INPUTS[id],c=clone(p.camera),report=JSON.parse(PREVIEW_BYTES[id]);
  const provenance=clone(SOURCE_PROVENANCE),previewReportPath=`fixtures/approved/${id}/report.json`;
  Object.assign(provenance.sourceFreeze,{approvedCameraSha256:p.cameraRecordSha256,previewReportPath,previewReportSha256:p.sourceReportSha256});
  return {id,packId:id,camera:'ApprovedNative_'+id,title:p.title,titleZh:p.titleZh,
    cameraConstructionMode:'external-reviewed-camera-rig',approvedCameraRecord:c,cameraSha256:p.cameraRecordSha256,
    matrix:clone(c.matrix),position:clone(c.position),target:clone(c.target),lens:p.nativeLens,captureLens:p.nativeLens/1.2,referenceFocal:p.nativeLens,
    sensorWidth:36,sensorHeight:24,sensorFit:'HORIZONTAL',near:.03,far:200,shiftX:0,shiftY:0,aspect:16/9,nativeResolution:[5120,2880],
    offsets:{center:[0,0,0],left:[-.08,0,0],right:[.08,0,0],up:[0,.08,0],down:[0,-.08,0],front:[0,0,-.05],back:[0,0,.05]},
    bounds:{x:[-.08,.08],y:[-.08,.08],z:[-.05,.05],yaw:[-35,35],pitch:[-20,20],roll:[-5,5]},
    sourcePath:report.sourcePath,sourceSha256:MONK_SOURCE_SHA256,sourceScene:'daylight',sourceFrame:4,flashForward:0,
    attribution:'Carlo Bergonzini / Monorender / CC-BY (current Blender demo README)',sourceProvenance:provenance,
    displayTransform:clone(MONK_DISPLAY_TRANSFORM),defaults:{focus:8,baseEV:8},defaultsEvidence:{status:'pending-formal-depth',focus:'Pending actual formal Z, NOT a deliverable'},
    approvedComposition:{version:1,referenceFocal:p.nativeLens,aspect:16/9,overscan:1.2,
      preview:{path:`fixtures/approved/${id}/center.png`,sha256:p.previewSha256,width:1280,height:720,sourcePath:report.sourcePath,sourceSha256:MONK_SOURCE_SHA256,
        sourceReportPath:previewReportPath,sourceReportSha256:p.sourceReportSha256,captureLens:p.nativeLens,sensorWidth:36,viewId:p.previewViewId},
      captureFrame:{width:6144,height:3456},nativeFrame:{width:5120,height:2880},nativeCrop:{left:512,top:288,width:5120,height:2880}},
  };
}
function displayMetadata(){return {displayTransform:clone(MONK_DISPLAY_TRANSFORM),displayTransformProfile:clone(MONK_DISPLAY_PROFILE),radianceSpace:'scene-linear',displayTransformAppliedToRadiance:false,defaults:{baseEV:8}};}
function renderEvidence(){return {sourceScene:'daylight',sourceFrame:4,sourceViewLayer:'View Layer',isolatedRenderContext:true,originalSettings:{cycles:{texture_limit:'OFF',texture_limit_render:'OFF',sample_clamp_direct:0,sample_clamp_indirect:0,max_bounces:8,diffuse_bounces:2,glossy_bounces:2,transmission_bounces:2,transparent_max_bounces:8},render:{use_simplify:false}}};}
// Synthetic unit-test data ONLY: there is no completed Monk focus/receipt here.
function syntheticFocus(){
  const r=rig();r.defaults={focus:2,baseEV:8};
  r.defaultsEvidence={focus:{sourceLayer:'detail-depth/center',sourceSha256:'a'.repeat(64),valueMetres:2,
    samples:{subject:{nativeNormalized:[.552,.6],capturePixel:[1113,672],z:1.998,roi7x7:{min:1.99,median:1.998,max:2.01}}}},baseEV:{value:8}};
  return r;
}
function reviewFor(r){return {defaults:clone(r.defaults),defaultsEvidenceSha256:hash(canonicalJSON(r.defaultsEvidence)),formalFocusDepthSha256:'a'.repeat(64),focusPixelRounding:'nearest'};}

for(const id of MONK_VIEWPOINT_IDS)test(`${id}: fixed static optics/source and synthetic parsed preview contract`,()=>{
  const r=rig(id),before=clone(r),result=validateMonkStaticRig(r);
  assert.equal(result.status,'static-approval-only');assert.equal(result.formalDefaultsVerified,false);
  assert.equal(validateMonkPreviewReport(JSON.parse(PREVIEW_BYTES[id]),r).id,id);
  assert.deepEqual(r,before,'validation is non-mutating');assert.throws(()=>validateMonkFormalDefaults(r));
});
test('pin source and Python/JS camera digest identities are explicit, never silently conflated',()=>{
  assert.equal(MONK_PIN_PROVENANCE.sha256,'0b68006cc72eeca12ef1c17ed19f95951416664ed3e55c5aa002720d99343acd');
  assert.match(MONK_PIN_PROVENANCE.cameraDigestEncoding,/Python/);
  for(const p of Object.values(MONK_APPROVED_INPUTS))assert.notEqual(hash(canonicalJSON(p.camera)),p.cameraRecordSha256);
  assert.ok(Object.isFrozen(MONK_APPROVED_INPUTS['monk-colonnade'].camera.matrix[0]));
});
for(const [label,mutate]of [
  ['unknown id',r=>{r.id='monk-new';}],['changed approved camera',r=>{r.approvedCameraRecord.matrix[0][3]+=.01;}],
  ['different physical pose',r=>{r.matrix[2][3]+=.01;}],['fake JS camera digest',r=>{r.cameraSha256=hash(canonicalJSON(r.approvedCameraRecord));}],
  ['different original source',r=>{r.sourceSha256='b'.repeat(64);}],['CC0 attribution',r=>{r.sourceProvenance.license='CC0';}],
  ['camera claimed inside blend',r=>{r.sourceProvenance.sourceFreeze.cameraInBlend=true;}],
  ['camera not created at render',r=>{r.sourceProvenance.sourceFreeze.cameraCreatedAtRender=false;}],
  ['fake derived source',r=>{r.sourceProvenance.sourceFreeze.derivedSourceSha256=r.sourceSha256;}],
  ['fake saved object count',r=>{r.sourceProvenance.sourceFreeze.frozenObjectCount=1369;}],
  ['wrong freeze script',r=>{r.sourceProvenance.sourceFreeze.freezeScriptSha256='b'.repeat(64);}],
  ['wrong source display evidence',r=>{r.sourceProvenance.sourceDisplayInspection.sha256='b'.repeat(64);}],
  ['missing compatibility disclosure',r=>{delete r.sourceProvenance.compatibility;}],
  ['wrong source scene',r=>{r.sourceScene='Scene';}],['wrong frame',r=>{r.sourceFrame=1;}],
  ['removed actual overscan',r=>{r.captureLens=r.lens;}],['fake wider motion',r=>{r.bounds.x=[-.2,.2];}],
  ['changed clipping',r=>{r.near=.1;}],['changed preview image',r=>{r.approvedComposition.preview.sha256='b'.repeat(64);}],
  ['runtime crop mislabeled as source',r=>{r.approvedComposition.captureFrame.width=5120;}],
  ['native crop missing',r=>{delete r.approvedComposition.nativeCrop;}],
  ['creative display offset hidden in rig transform',r=>{r.displayTransform.exposure=0;}],
])test(`static Monk contract rejects ${label}`,()=>{const r=rig();mutate(r);assert.throws(()=>validateMonkStaticRig(r));});
for(const [label,mutate]of [
  ['saved original source',p=>{p.sourceSavedOrOverwritten=true;}],['wrong view',p=>{p.viewId='center';}],
  ['different actual camera',p=>{p.actualCamera.lens=30;}],['camera moved before render',p=>{p.cameraMatrixBeforeRender[0][3]+=1;}],
  ['wrong display look',p=>{p.actualDisplayTransform.look='AgX - Medium Low Contrast';}],
  ['original Filmic settings substituted for actual display',p=>{p.actualDisplayTransform=p.sourceSettings.color;}],
  ['wrong source render frame',p=>{p.actualSourceFrame=1;}],['wrong source layer',p=>{p.renderLayer='ID';}],
])test(`Monk preview rejects ${label}`,()=>{const r=rig(),p=JSON.parse(PREVIEW_BYTES[r.id]);mutate(p);assert.throws(()=>validateMonkPreviewReport(p,r));});
test('byte verification rejects even a whitespace change; image verification never accepts a matching metadata claim alone',()=>{
  const r=rig();assert.throws(()=>validateMonkPreviewReportBytes(Buffer.from(PREVIEW_BYTES[r.id]+' '),r),/byte SHA/);
  assert.throws(()=>validateMonkPreviewImageBytes(Buffer.from('not the approved PNG'),r.id),/actual approved preview/);
});
test('parsed source display contract requires WB/curve disabled and look-independent HDR',()=>{
  assert.equal(validateMonkSourceDisplayInspection(JSON.parse(DISPLAY_INSPECTION_BYTES)).radianceDisplayBaked,false);
  const p=JSON.parse(DISPLAY_INSPECTION_BYTES);assert.ok(p.tests[0].maxAbsError>0);
  for(const mutate of [p=>{p.sourceDisplay.view.use_white_balance=true;},p=>{p.sourceDisplay.view.use_curve_mapping=true;},p=>{p.sourceWritten=true;},p=>{p.tests[1].sha256='b'.repeat(64);},p=>{p.HDRSaveBypassesDisplayLookAndExposure=false;}]){
    const f=clone(p);mutate(f);assert.throws(()=>validateMonkSourceDisplayInspection(f));
  }
});
test('exact profile and display contract stay separate from physical EV8',()=>{
  validateMonkDisplayTransform(clone(MONK_DISPLAY_TRANSFORM));validateMonkDisplayProfile(clone(MONK_DISPLAY_PROFILE));validateMonkDisplayMetadata(displayMetadata());
  for(const mutate of [p=>{p.displayTransformProfile.luts[0].sha256='b'.repeat(64);},p=>{p.displayTransformProfile.luts[1].edge=33;},p=>{p.displayTransformAppliedToRadiance=true;},p=>{p.radianceSpace='display-linear';},p=>{p.defaults.baseEV=6.5;},p=>{delete p.displayTransformProfile;}]){
    const f=displayMetadata();mutate(f);assert.throws(()=>validateMonkDisplayMetadata(f));
  }
});
test('original Monk context/unlimited-texture/unclamped quality requirements are distinct from apartment',()=>{
  validateMonkSourceRenderEvidence(renderEvidence());
  for(const mutate of [e=>{e.sourceFrame=3;},e=>{e.sourceScene='Scene';},e=>{e.isolatedRenderContext=false;},e=>{e.originalSettings.cycles.texture_limit='2048';},e=>{e.originalSettings.cycles.sample_clamp_direct=5;},e=>{e.originalSettings.render.use_simplify=true;},e=>{e.originalSettings.cycles.max_bounces=4;}]){
    const f=renderEvidence();mutate(f);assert.throws(()=>validateMonkSourceRenderEvidence(f));
  }
});
test('formal-default helper demands independent review, rejects current placeholders and does not claim pixel verification',()=>{
  const pending=rig();assert.throws(()=>validateMonkFormalDefaults(pending,reviewFor(pending)),/formal focus object/);
  assert.throws(()=>validateMonkCapturedComposition({},pending,reviewFor(pending)),/formal focus object/);
  const r=syntheticFocus();assert.throws(()=>validateMonkFormalDefaults(r),/independent/);
  const result=validateMonkFormalDefaults(r,reviewFor(r));assert.equal(result.sourcePixelsVerified,false);
});
test('formal-default review hash cannot be a self-consistent replacement',()=>{
  const r=syntheticFocus(),review=reviewFor(r);r.defaultsEvidence.focus.samples.subject.z=2;
  assert.throws(()=>validateMonkFormalDefaults(r,review),/substitute/);
});
for(const [label,mutate]of [
  ['display EV injected into physical EV',r=>{r.defaults.baseEV=6.5;}],['nonfinite focus',r=>{r.defaults.focus=NaN;}],
  ['pending status',r=>{r.defaultsEvidence.status='pending-formal-depth';}],['unproven depth SHA',r=>{r.defaultsEvidence.focus.sourceSha256='b'.repeat(64);}],
  ['wrong Z layer',r=>{r.defaultsEvidence.focus.sourceLayer='base-depth/center';}],['wrong claimed focus',r=>{r.defaultsEvidence.focus.valueMetres=3;}],
  ['empty formal samples',r=>{r.defaultsEvidence.focus.samples={};}],['sky as subject',r=>{r.defaultsEvidence.focus.samples.subject.z=64;}],
  ['wrong native-to-capture coordinate',r=>{r.defaultsEvidence.focus.samples.subject.capturePixel[0]=1112;}],
  ['impossible subject ROI',r=>{r.defaultsEvidence.focus.samples.subject.roi7x7.min=3;}],
])test(`formal default gate rejects ${label} even with a freshly constructed test review hash`,()=>{
  const r=syntheticFocus();mutate(r);assert.throws(()=>validateMonkFormalDefaults(r,reviewFor(r)));
});
test('focus sampling convention must be explicitly reviewed, not inferred',()=>{
  const r=syntheticFocus(),review=reviewFor(r);delete review.focusPixelRounding;assert.throws(()=>validateMonkFormalDefaults(r,review),/sampling convention/);
  review.focusPixelRounding='floor';assert.throws(()=>validateMonkFormalDefaults(r,review),/coordinate/);
  r.defaultsEvidence.focus.samples.subject.capturePixel=[1112,671];const floor={...reviewFor(r),focusPixelRounding:'floor'};validateMonkFormalDefaults(r,floor);
});
test('old derived identity allowlist does not accept Monk through this new module',()=>{
  assert.throws(()=>validateDerivedProfile({id:'monk-colonnade'}),/explicitly reviewed derived/);
});

test('formal focus can explicitly reproduce Python ties-to-even rather than silently use Math.round',()=>{
  for(const [input,expected]of [[2.5,2],[3.5,4],[4.499999999,4],[4.500000001,5]])assert.equal(roundMonkFocusPixel(input,'python-nearest-even'),expected);
  assert.equal(roundMonkFocusPixel(2.5,'nearest'),3);assert.equal(roundMonkFocusPixel(2.5,'floor'),2);
  assert.throws(()=>roundMonkFocusPixel(2.5,'unspecified'));
});
