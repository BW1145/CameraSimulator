// Pure, read-only Monk contracts. No filesystem/decoder/Blender/network access.
// This is NOT a complete pack/file/pixel/delivery auditor or a publication gate.
// Static approval pins copied from monk-production-20261024/package_approved_inputs.json
// (byte SHA-256: 0b68006cc72eeca12ef1c17ed19f95951416664ed3e55c5aa002720d99343acd). The original preview report byte hashes below
// independently bind actualCamera. cameraRecordSha256 was produced by Python:
// json.dumps(record, sort_keys=True, separators=(',', ':'), ensure_ascii=False).
// Python float spellings (28.0, 0.0) differ from JS JSON. NEVER recompute that
// historical digest with canonicalJSON; compare the independently pinned record
// and verify the original report bytes instead. JS canonical digests, where used
// for future final-default review evidence, are separately labelled below.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalJSON} from './classroom-processing-audit.mjs';
import {validateNativeComposition} from './classroom-composition-audit.mjs';
import {validateMonkStagedCenter} from './monk-processing-audit.mjs';

function deepFreeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}
export const MONK_SOURCE_SHA256='eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b';
export const MONK_PIN_PROVENANCE=deepFreeze({file:'monk-production-20261024/package_approved_inputs.json',sha256:'0b68006cc72eeca12ef1c17ed19f95951416664ed3e55c5aa002720d99343acd',cameraDigestEncoding:'Python json.dumps(sort_keys=True, separators=(",",":"), ensure_ascii=False); original numeric types retained'});
export const MONK_APPROVED_INPUTS=deepFreeze({
  "monk-colonnade": {
    "previewSha256": "d9b02fd599fc2f6ce942e599bb82b4e4f85578213dfe4dfaec585ed9d3a1755f",
    "sourceReportSha256": "bd6ba7f7ea9bfa1a299ed0bc88b6156e236f9e8e86c0fbe23cbcf8a0905a8793",
    "sourceSha256": "eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b",
    "nativeLens": 28.0,
    "camera": {
      "matrix": [
        [
          0.9987159967422485,
          -0.0007331844535656273,
          -0.05065418779850006,
          10.100000381469727
        ],
        [
          -0.05065949633717537,
          -0.01445415522903204,
          -0.9986113905906677,
          13.199999809265137
        ],
        [
          2.820984112972269e-09,
          0.9998952746391296,
          -0.014472737908363342,
          1.5
        ],
        [
          0.0,
          0.0,
          0.0,
          1.0
        ]
      ],
      "position": [
        10.100000381469727,
        13.199999809265137,
        1.5
      ],
      "target": [
        10.8,
        27,
        1.7
      ],
      "lens": 28.0,
      "sensorWidth": 36.0,
      "sensorFit": "HORIZONTAL",
      "shiftX": 0.0,
      "shiftY": 0.0,
      "near": 0.029999999329447746,
      "far": 200.0,
      "bakedDOF": false
    },
    "cameraRecordSha256": "549ea671009805f2fa49eed0d7575522a8e3ebc94c3bd3b17838ba4bd270d838",
    "previewViewId": "colonnade-diagonal",
    "title": "Monastery — Colonnade",
    "titleZh": "修道院—侧廊"
  },
  "monk-reading-table": {
    "previewSha256": "61926c7f3ad31f9fdc5890e37fd016f0e6af41c3ad00d653feb904da9f603576",
    "sourceReportSha256": "1ac4130f0b47d0ae48c420b2874ca938d2cef7bbe8fb11d110bbd0c1c3351b52",
    "sourceSha256": "eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b",
    "nativeLens": 32.0,
    "camera": {
      "matrix": [
        [
          0.942990243434906,
          0.05018877238035202,
          -0.329014390707016,
          19.299999237060547
        ],
        [
          -0.3328203558921814,
          0.1422012895345688,
          -0.9322067499160767,
          9.100000381469727
        ],
        [
          -4.146492216250408e-08,
          0.9885645508766174,
          0.1507982760667801,
          1.0499999523162842
        ],
        [
          0.0,
          0.0,
          0.0,
          1.0
        ]
      ],
      "position": [
        19.299999237060547,
        9.100000381469727,
        1.0499999523162842
      ],
      "target": [
        20.5,
        12.5,
        0.5
      ],
      "lens": 32.0,
      "sensorWidth": 36.0,
      "sensorFit": "HORIZONTAL",
      "shiftX": 0.0,
      "shiftY": 0.0,
      "near": 0.029999999329447746,
      "far": 200.0,
      "bakedDOF": false
    },
    "cameraRecordSha256": "5be62f31df2cb444a226aa92fdda1585f6b6cc32efcf8d2514a10ff8cba12798",
    "previewViewId": "books-reading-corner",
    "title": "Monastery — Reading Table",
    "titleZh": "修道院—阅读桌"
  },
  "monk-courtyard": {
    "previewSha256": "b901bfc18c73cc976c563b3ab5130d0ff8241de2ddbd295464b5665ed749c438",
    "sourceReportSha256": "922b4be676f490aba5d88b1707bc79193a9e665bb489c767b38e0d6c392dc0a6",
    "sourceSha256": "eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b",
    "nativeLens": 26.0,
    "camera": {
      "matrix": [
        [
          0.7249993681907654,
          -0.06709069013595581,
          -0.685474157333374,
          14.5
        ],
        [
          -0.6887495517730713,
          -0.0706217959523201,
          -0.7215515375137329,
          15.5
        ],
        [
          -2.6246194551049484e-08,
          0.9952443838119507,
          -0.0974094346165657,
          1.25
        ],
        [
          0.0,
          0.0,
          0.0,
          1.0
        ]
      ],
      "position": [
        14.5,
        15.5,
        1.25
      ],
      "target": [
        24,
        25.5,
        2.6
      ],
      "lens": 26.0,
      "sensorWidth": 36.0,
      "sensorFit": "HORIZONTAL",
      "shiftX": 0.0,
      "shiftY": 0.0,
      "near": 0.029999999329447746,
      "far": 200.0,
      "bakedDOF": false
    },
    "cameraRecordSha256": "efeb9c395eab2cafb1f9ff7c6da3d1d19955f6d1e30713a2fe7170ad4e1db98d",
    "previewViewId": "courtyard-oblique",
    "title": "Monastery — Courtyard Pavilion",
    "titleZh": "修道院—庭院石亭"
  }
});
export const MONK_VIEWPOINT_IDS=Object.freeze(Object.keys(MONK_APPROVED_INPUTS));
export const MONK_DISPLAY_TRANSFORM=deepFreeze({version:1,profile:'blender-4.5.14-agx-medium-high-v1',view:'AgX',look:'AgX - Medium High Contrast',exposure:-1.5,gamma:1});
// Source: spec top-level displayTransformProfile; hashes also bind actual app assets.
export const MONK_DISPLAY_PROFILE=deepFreeze({
  "version": 1,
  "id": "blender-4.5.14-agx-medium-high-v1",
  "blenderVersion": "4.5.14 LTS",
  "ocioVersion": "2.4.1",
  "configSha256": "aa4142b29b5a472aa5cb895020aa8cb673c95a31660eeee451f8a820694d3b16",
  "profileSha256": "a5bd43a1d7e261fc9d90a6a986af9bdf4e3e074922c62a9803948d8f65f2076e",
  "profileBytes": 4906,
  "shader": {
    "file": "shader.glsl",
    "bytes": 13470,
    "sha256": "708a0230c1817e84d3a906449ca4acb584c916585bc6fe60d79bff5ca4984e57",
    "language": "GLSL ES 3.0",
    "generator": "OCIO generic GPU processor, not an approximate baked 3D fit"
  },
  "luts": [
    {
      "file": "lut-0.bin",
      "bytes": 607836,
      "sha256": "9174984646340cb89db8af731b1fb17e1d04ab05ad38d9a10b2ebbfba1fce8ed",
      "edge": 37,
      "sampler": "monkAgx_lut3d_0Sampler"
    },
    {
      "file": "lut-1.bin",
      "bytes": 2222316,
      "sha256": "cb92475f7c9feb46b589847f26c9ce068c89f1d0a2f7a88aecd0857b42c7fe5f",
      "edge": 57,
      "sampler": "monkAgx_lut3d_1Sampler"
    }
  ],
  "inputSpace": "scene-linear Rec.709",
  "outputSpace": "display-linear Rec.709",
  "displayExposureBaked": false,
  "hostDisplayExposureEV": -1.5,
  "runtimePath": "color-profiles/blender-4.5.14-agx-medium-high-v1"
});
const SOURCE_IDENTITY=Object.freeze({originalAuthor:'Carlo Bergonzini / Monorender',license:'CC-BY (current official file internalREADME; version unspecified)',originalUrl:'https://download.blender.org/demo/cycles/lone-monk_cycles_and_exposure-node_demo.blend'});
const ATTRIBUTION='Carlo Bergonzini / Monorender / CC-BY (current Blender demo README)';
const FREEZE_SCRIPT_SHA256='6af2b3a4a7f89e1b1545f4b0d20c536bc1ba1cdade0b176859c95f894c06e61e';
const DISPLAY_INSPECTION_SHA256='dce328d114c48e3288f1c314a195c54210f490f4aa8b396aed8249b9ed7ff1c0';
const OFFSETS=deepFreeze({center:[0,0,0],left:[-.08,0,0],right:[.08,0,0],up:[0,.08,0],down:[0,-.08,0],front:[0,0,-.05],back:[0,0,.05]});
const BOUNDS=deepFreeze({x:[-.08,.08],y:[-.08,.08],z:[-.05,.05],yaw:[-35,35],pitch:[-20,20],roll:[-5,5]});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashString=(v,label)=>assert.match(v,/^[a-f0-9]{64}$/,label);
const nonempty=(v,label)=>assert.ok(typeof v==='string'&&v.trim().length>0,label);
const close=(a,b,label,tolerance=1e-7)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
const pinFor=id=>{assert.ok(Object.hasOwn(MONK_APPROVED_INPUTS,id),'explicitly approved Monk id');return MONK_APPROVED_INPUTS[id];};
function verifiedJSON(bytes,expected,label){assert.equal(hash(bytes),expected,`${label}: actual byte SHA-256`);return JSON.parse(Buffer.from(bytes).toString('utf8'));}

export function validateMonkDisplayTransform(value){assert.deepEqual(value,MONK_DISPLAY_TRANSFORM,'approved display look/exposure is independent of camera EV');return value;}
export function validateMonkDisplayProfile(value){assert.deepEqual(value,MONK_DISPLAY_PROFILE,'independently pinned OCIO profile/shader/LUT evidence');return value;}

export function validateMonkSourceProvenance(rig){
  const pin=pinFor(rig.id),p=rig.sourceProvenance,f=p?.sourceFreeze;
  assert.equal(rig.sourceSha256,MONK_SOURCE_SHA256);nonempty(rig.sourcePath,'actual unchanged source path');
  for(const [key,value]of Object.entries(SOURCE_IDENTITY))assert.equal(p?.[key],value,`Monk ${key}`);
  for(const key of ['originalSha256','previewSourceSha256'])assert.equal(p[key],MONK_SOURCE_SHA256);
  assert.equal(p.originalPath,rig.sourcePath);assert.equal(rig.attribution,ATTRIBUTION);
  assert.equal(f?.mode,'external-reviewed-camera-rig');assert.equal(f.sourceSha256,MONK_SOURCE_SHA256);assert.equal(f.sourcePath,rig.sourcePath);
  assert.equal(f.cameraInBlend,false,'native camera is NOT saved in the original blend');assert.equal(f.cameraCreatedAtRender,true);
  assert.equal(f.approvedCameraSha256,pin.cameraRecordSha256);assert.equal(f.freezeScriptSha256,FREEZE_SCRIPT_SHA256);
  assert.equal(f.previewReportSha256,pin.sourceReportSha256);assert.equal(f.previewReportPath,rig.approvedComposition?.preview?.sourceReportPath);
  for(const key of ['derivedSourceSha256','frozenObjectCount'])assert.ok(!Object.hasOwn(f,key),'do not fabricate a saved-camera source: '+key);
  assert.ok(p.derivations?.some(d=>d.type==='external-reviewed-camera-and-display-settings'),'external camera/display derivation is disclosed');
  nonempty(p.compatibility,'4.5/5.2 compatibility disclosure');
  assert.equal(p.sourceDisplayInspection?.sha256,DISPLAY_INSPECTION_SHA256);nonempty(p.sourceDisplayInspection.path,'source display inspection path');
  return {sourceSha256:MONK_SOURCE_SHA256,cameraInBlend:false};
}

// Planning-only: succeeds for the frozen optical/source approval even while
// formal focus is pending. Never use this result to authorize a runtime import.
export function validateMonkStaticRig(rig){
  const pin=pinFor(rig?.id);assert.equal(rig.packId,rig.id);assert.equal(rig.camera,'ApprovedNative_'+rig.id);
  assert.equal(rig.title,pin.title);assert.equal(rig.titleZh,pin.titleZh);
  assert.equal(rig.cameraConstructionMode,'external-reviewed-camera-rig');
  assert.deepEqual(rig.approvedCameraRecord,pin.camera,'independently approved full camera record, not a JS rehash');
  assert.equal(rig.cameraSha256,pin.cameraRecordSha256,'historical Python camera digest');
  for(const key of ['matrix','position','target'])assert.deepEqual(rig[key],pin.camera[key],`approved camera ${key}`);
  for(const [key,value]of Object.entries({lens:pin.nativeLens,captureLens:pin.nativeLens/1.2,referenceFocal:pin.nativeLens,sensorWidth:36,sensorHeight:24,near:.03,far:200,shiftX:0,shiftY:0,aspect:16/9}))close(rig[key],value,`approved ${key}`);
  assert.equal(rig.sensorFit,'HORIZONTAL');assert.deepEqual(rig.nativeResolution,[5120,2880]);
  assert.deepEqual(rig.offsets,OFFSETS);assert.deepEqual(rig.bounds,BOUNDS);
  assert.equal(rig.sourceScene,'daylight');assert.equal(rig.sourceFrame,4);assert.equal(rig.flashForward,0);
  const c=rig.approvedComposition,p=c?.preview;assert.equal(c?.version,1);
  close(c.referenceFocal,pin.nativeLens,'native focal');close(c.aspect,16/9,'native aspect');close(c.overscan,1.2,'true overscan');
  assert.deepEqual(c.captureFrame,{width:6144,height:3456});assert.deepEqual(c.nativeFrame,{width:5120,height:2880});
  assert.deepEqual(c.nativeCrop,{left:512,top:288,width:5120,height:2880});
  for(const [key,value]of Object.entries({sha256:pin.previewSha256,sourceReportSha256:pin.sourceReportSha256,sourceSha256:MONK_SOURCE_SHA256,width:1280,height:720,captureLens:pin.nativeLens,sensorWidth:36,viewId:pin.previewViewId}))assert.equal(p?.[key],value,`approved preview ${key}`);
  for(const key of ['path','sourceReportPath','sourcePath'])nonempty(p[key],`preview ${key}`);
  assert.equal(p.sourcePath,rig.sourcePath);validateMonkSourceProvenance(rig);validateMonkDisplayTransform(rig.displayTransform);
  return {id:rig.id,referenceFocal:pin.nativeLens,status:'static-approval-only',formalDefaultsVerified:false};
}

export function validateMonkPreviewReport(report,rig){
  validateMonkStaticRig(rig);const pin=pinFor(rig.id);
  assert.equal(report.status,'complete');assert.equal(report.sourceSha256,MONK_SOURCE_SHA256);assert.equal(report.sourcePath,rig.sourcePath);
  assert.equal(report.sceneId,'lone-monk');assert.equal(report.viewId,pin.previewViewId);
  assert.deepEqual(report.actualCamera,pin.camera);assert.deepEqual(report.cameraMatrixBeforeRender,pin.camera.matrix);
  assert.equal(report.pngSha256,pin.previewSha256);assert.deepEqual([report.width,report.height],[1280,720]);assert.deepEqual(report.PNGValidation?.dimensions,[1280,720]);
  assert.equal(report.PNGValidation.nonfinite,0);assert.equal(report.actualSourceFrame,4);assert.equal(report.sourceSettings?.scene,'daylight');
  assert.equal(report.renderLayer,'View Layer');assert.equal(report.isolatedContext,true);assert.equal(report.sourceSavedOrOverwritten,false);
  const {version,profile,...display}=MONK_DISPLAY_TRANSFORM;assert.deepEqual(report.actualDisplayTransform,display);
  assert.equal(report.displayStyle,'clean-agx');assert.match(report.renderMode,/original creative compositor bypassed/);
  return {id:rig.id,previewSha256:pin.previewSha256,cameraDigestEncoding:MONK_PIN_PROVENANCE.cameraDigestEncoding};
}
export function validateMonkPreviewReportBytes(bytes,rig){return validateMonkPreviewReport(verifiedJSON(bytes,pinFor(rig.id).sourceReportSha256,'approved preview report'),rig);}
export function validateMonkPreviewImageBytes(bytes,id){assert.equal(hash(bytes),pinFor(id).previewSha256,'actual approved preview image bytes');return {id,sha256:hash(bytes)};}

export function validateMonkSourceDisplayInspection(report){
  assert.equal(report.status,'pass');assert.equal(report.sourceDisplay?.sha256,MONK_SOURCE_SHA256);assert.equal(report.sourceDisplay.displayDevice,'sRGB');
  // Do not confuse original Filmic controls with the approved modern AgX display.
  for(const [k,v]of Object.entries({view_transform:'Filmic',look:'Medium Contrast',exposure:-2,gamma:1,use_white_balance:false,use_curve_mapping:false}))assert.equal(report.sourceDisplay.view?.[k],v,`original source ${k}`);
  assert.equal(report.sourceWritten,false);assert.equal(report.sourceEvaluated,false);assert.equal(report.HDRSaveBypassesDisplayLookAndExposure,true);
  assert.deepEqual(report.tests?.map(t=>t.name),['approved-display','neutral-linear']);
  for(const test of report.tests){hashString(test.sha256,'probe HDR hash');assert.equal(test.withinRGBE8bitSharedExponentBound,true);assert.ok(Number.isSafeInteger(test.bytes)&&test.bytes>0);}
  assert.equal(report.tests[0].sha256,report.tests[1].sha256);assert.equal(report.tests[0].bytes,report.tests[1].bytes);
  return {sourceSha256:MONK_SOURCE_SHA256,radianceDisplayBaked:false};
}
export function validateMonkSourceDisplayInspectionBytes(bytes){return validateMonkSourceDisplayInspection(verifiedJSON(bytes,DISPLAY_INSPECTION_SHA256,'actual source display inspection'));}

export function validateMonkDisplayMetadata(pack){
  validateMonkDisplayTransform(pack.displayTransform);validateMonkDisplayProfile(pack.displayTransformProfile);
  assert.equal(pack.radianceSpace,'scene-linear');assert.equal(pack.displayTransformAppliedToRadiance,false);
  assert.equal(pack.defaults?.baseEV,8,'physical exposure calibration must not contain display -1.5 EV');
  return {profile:MONK_DISPLAY_TRANSFORM.profile,displayExposure:-1.5};
}
export function validateMonkSourceRenderEvidence(evidence){
  assert.equal(evidence?.sourceScene,'daylight');assert.equal(evidence.sourceFrame,4);assert.equal(evidence.sourceViewLayer,'View Layer');assert.equal(evidence.isolatedRenderContext,true);
  const settings=evidence.originalSettings;
  for(const [k,v]of Object.entries({texture_limit:'OFF',texture_limit_render:'OFF',sample_clamp_direct:0,sample_clamp_indirect:0,max_bounces:8,diffuse_bounces:2,glossy_bounces:2,transmission_bounces:2,transparent_max_bounces:8}))assert.equal(settings?.cycles?.[k],v,`retained Monk ${k}`);
  assert.equal(settings.render?.use_simplify,false);return true;
}

// Future final-focus pins must be reviewed independently after actual formal Z.
// These are JS canonicalJSON digests, NOT the historical Python camera digests.
// No final value/hash/rounding is guessed here. Pixel source validation is separate.
export function roundMonkFocusPixel(value,rule){
  assert.ok(Number.isFinite(value));
  if(rule==='floor')return Math.floor(value);
  if(rule==='nearest')return Math.round(value);
  assert.equal(rule,'python-nearest-even','explicit sampling convention');
  const lower=Math.floor(value),fraction=value-lower;
  return fraction===.5?(lower%2===0?lower:lower+1):Math.round(value);
}
export function validateMonkFormalDefaults(rig,review){
  pinFor(rig?.id);assert.ok(review&&typeof review==='object','independent final focus review is required');
  const d=rig.defaults,e=rig.defaultsEvidence,f=e?.focus;
  assert.ok(d&&Number.isFinite(d.focus)&&d.focus>=.2&&d.focus<=50,'finite physical focus');assert.equal(d.baseEV,8);
  assert.ok(f&&typeof f==='object'&&!Array.isArray(f),'formal focus object required, not pending text');
  assert.notEqual(e.status,'pending-formal-depth','pending focus is not a delivered default');
  assert.deepEqual(d,review.defaults,'independently reviewed final defaults');hashString(review.defaultsEvidenceSha256,'final evidence JS canonical SHA');
  assert.equal(hash(canonicalJSON(e)),review.defaultsEvidenceSha256,'final evidence is not a self-consistent substitute');
  hashString(review.formalFocusDepthSha256,'independent formal Z SHA');assert.equal(f.sourceSha256,review.formalFocusDepthSha256);
  assert.equal(f.sourceLayer,'detail-depth/center');close(f.valueMetres,d.focus,'formal focus value');assert.equal(e.baseEV?.value,8);
  assert.ok(['floor','nearest','python-nearest-even'].includes(review.focusPixelRounding),'explicit reviewed sampling convention');
  assert.ok(f.samples&&typeof f.samples==='object'&&!Array.isArray(f.samples)&&Object.keys(f.samples).length>0,'real subject samples');
  const round=value=>roundMonkFocusPixel(value,review.focusPixelRounding);
  for(const sample of Object.values(f.samples)){
    assert.equal(sample.nativeNormalized?.length,2);assert.equal(sample.capturePixel?.length,2);
    sample.nativeNormalized.forEach((n,i)=>{assert.ok(Number.isFinite(n)&&n>=0&&n<=1);assert.equal(sample.capturePixel[i],round((.5+(n-.5)/1.2)*[2048,1152][i]),'native-to-overscan focus coordinate');});
    assert.ok(Number.isFinite(sample.z)&&sample.z>0&&sample.z<64,'formal geometry Z, not sky');
    if(sample.roi7x7){const roi=sample.roi7x7;for(const key of ['min','median','max'])assert.ok(Number.isFinite(roi[key]));assert.ok(roi.min<=sample.z&&sample.z<=roi.max&&roi.min<=roi.median&&roi.median<=roi.max);}
  }
  return {id:rig.id,focus:d.focus,status:'formal-default-metadata-verified',sourcePixelsVerified:false};
}

// Only the known metadata/native-ray/processing contract, not a final receipt.
// Reuses the old native-ray checks. Processing is still the unchanged normal
// staged-center gate except for one independently pinned Monk recovery.
export function validateMonkCapturedComposition(pack,rig,review){
  validateMonkStaticRig(rig);validateMonkFormalDefaults(rig,review);
  assert.equal(pack.id,rig.id);assert.equal(pack.title,rig.title);assert.equal(pack.attribution,rig.attribution);
  assert.deepEqual(pack.defaults,rig.defaults);assert.deepEqual(pack.defaultsEvidence,rig.defaultsEvidence);
  assert.deepEqual(pack.sourceProvenance,rig.sourceProvenance);
  validateMonkDisplayMetadata(pack);validateMonkSourceRenderEvidence(pack.sourceRenderEvidence);
  const result=validateNativeComposition(pack,rig,{previewSourceField:'previewSourceSha256'});
  validateMonkStagedCenter(pack);return result;
}
