import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rename,link,stat,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {SCENES,CLASSROOM_VIEWPOINTS,scenesForRenderer,sceneDefaults} from '../src/scenes.js';
import {validateClassroomManifest,validateClassroomRig,validateClassroomReceipt,safeAssetName,CLASSROOM_SOURCE,ORIGINAL_CLASSROOM_SOURCE} from '../tools/classroom-viewpoint-audit.mjs';
import {photoSnapshot} from '../src/photo-snapshot.js';
import {PlateRenderer} from '../src/plate-renderer.js';
import {Matrix4,PerspectiveCamera} from 'three';
import {validateApprovedComposition,validateApprovedPreviewReport} from '../tools/classroom-composition-audit.mjs';
import {STAGED_CENTER_COMPONENTS,stagedRendererHash,validateStagedCenter} from '../tools/classroom-processing-audit.mjs';
import {LEGACY_ASSETS,listAssetFiles,linkAssetTree} from '../tools/static-assets.mjs';
import {validateClassroomDelivery,validateClassroomHistory,validateApprovedInputs,moveTransaction} from '../tools/classroom-receipt.mjs';

// Synthetic metadata only, never runtime image placeholders. Real delivered
// bytes/dimensions/SHA-256 must pass the separate file audit before integration.
const original=JSON.parse(await readFile(new URL('../public/scenes/classroom-plates/manifest.json',import.meta.url)));
function manifest(){
  const pack=structuredClone(original);
  Object.assign(pack,{id:'classroom-desk',sourceSha256:CLASSROOM_SOURCE,defaults:{focus:.9,baseEV:8},defaultsEvidence:{focus:'unit-test fixture'},sourceProvenance:{originalSha256:ORIGINAL_CLASSROOM_SOURCE,originalAuthor:'Christophe Seux',license:'CC0',derivations:[{type:'test'}]},captureQuality:{center:{width:5120,height:2880,samples:256},neighbors:{width:4096,height:2304,samples:32},base:{width:2560,height:1440,centerSourceSamples:256,neighborSamples:32},baseDepth:{width:1280,height:720,samples:1},detailDepth:{width:2048,height:1152,samples:1},flash:{width:1280,height:720,samples:32}}});
  pack.detail={sourceSha256:CLASSROOM_SOURCE,encoding:pack.encoding,views:[]};
  pack.detailDepth={sourceSha256:CLASSROOM_SOURCE,space:'capture-camera-z',range:64,views:[]};
  pack.flash={sourceSha256:CLASSROOM_SOURCE,encoding:pack.encoding,method:'Cycles isolated CameraFlash light group',referenceEnergy:1000,referenceDuration:.01,areaDiameter:.08,originOffsetForward:0,samples:32,views:[]};
  for(const v of pack.views){
    const samples=v.id==='center'?256:32;
    Object.assign(v,{near:pack.camera.near,samples,width:2560,height:1440,depthWidth:1280,depthHeight:720,detailWidth:v.id==='center'?5120:4096,detailHeight:v.id==='center'?2880:2304,detailDepthWidth:2048,detailDepthHeight:1152,flashWidth:1280,flashHeight:720});
    for(const [layer,key,bytesKey]of [['detail','detailFile','detailBytes'],['detailDepth','detailDepth','detailDepthBytes'],['flash','flash','flashBytes']]){
      v[key]=`${v.id}-${layer}.${layer==='detailDepth'?'png':'webp'}`;v[bytesKey]=100;
      pack[layer].views.push({id:v.id,file:v[key],bytes:100,cameraMatrix:v.cameraMatrix,near:v.near,samples,clampedChannels:0,flashPosition:v.position});
    }
    if(v.id==='center'){
      v.radianceCapture={samples:256,sourceExrSha256:'a'.repeat(64),sourceFile:'center.exr',captureSeconds:60,jobEvidence:'jobs/desk/detail/center/attempt-001'};v.baseRadianceMethod='scene-linear area downsample';
      v.independentBaseCapture={samples:32,sourceSha256:'b'.repeat(64),delivered:false};
      for(const obsolete of ['jobEvidence','sha256','seconds'])delete v[obsolete];
      pack.detail.views.at(-1).sourceExrSha256=v.radianceCapture.sourceExrSha256;
    }
  }
  return pack;
}

test('existing selector retains the classroom trio alongside reviewed kitchen and apartment viewpoints',()=>{
  assert.deepEqual(SCENES.map(s=>s.id),['barbershop','classroom','classroom-desk','classroom-window','classroom-teacher','kitchen','kitchen-pastry','kitchen-tea','apartment','apartment-armchair']);
  assert.equal(SCENES.find(s=>s.id==='classroom').name,'教室全景');
  assert.deepEqual(CLASSROOM_VIEWPOINTS.map(s=>s.name),['学生座位','窗边逆光','讲台视角']);
  assert.equal(scenesForRenderer().length,10);
  assert.deepEqual(scenesForRenderer(false).map(s=>s.id),['barbershop','classroom','kitchen','apartment']);
  assert.ok(CLASSROOM_VIEWPOINTS.every(s=>s.plateOnly&&!s.camera&&!s.focal&&!s.focus),'no invented GLB cameras or duplicated capture optics');
});

test('source pack metadata owns focus, exposure and initial focal length',()=>{
  const scene=CLASSROOM_VIEWPOINTS[0],pack=manifest();
  assert.deepEqual(sceneDefaults(scene,pack),{focus:.9,baseEV:8,focal:pack.referenceFocal});
  assert.deepEqual(sceneDefaults(scene,{...pack,referenceFocal:23.625,minimumFocal:25,defaults:{focus:4,baseEV:9}}),{focus:4,baseEV:9,focal:25});
  assert.throws(()=>sceneDefaults(scene,{referenceFocal:24}),/默认对焦/);
  assert.throws(()=>sceneDefaults(scene,{...pack,referenceFocal:NaN}),/原始焦距/);
  const panorama=SCENES.find(s=>s.id==='classroom');assert.deepEqual(sceneDefaults(panorama,original),{focus:4,baseEV:8,focal:28.125});
  assert.deepEqual(sceneDefaults(panorama),{focus:4,baseEV:8,focal:28});
});

test('formal quality, registered layers, metres and fixed flash energy satisfy the contract',()=>{
  assert.equal(validateClassroomManifest(manifest()).id,'classroom-desk');
});

test('import requires the exact reviewed Blender camera, not only consistent layer metadata',()=>{
  const pack=manifest();pack.camera.sensorHeight=18;
  const blender=new Matrix4().makeRotationX(Math.PI/2).multiply(new Matrix4().fromArray(pack.views[0].cameraMatrix));
  const rig={...pack.camera,id:'desk',camera:pack.camera.name,bounds:pack.bounds,offsets:Object.fromEntries(pack.views.map(v=>[v.id,v.offset])),matrix:Array.from({length:4},(_,row)=>Array.from({length:4},(_,column)=>blender.elements[column*4+row]))};
  validateClassroomRig(pack,rig);
  assert.throws(()=>validateClassroomRig(pack,{...rig,lens:rig.lens+1}));
  const moved=structuredClone(rig);moved.matrix[0][3]+=.5;assert.throws(()=>validateClassroomRig(pack,moved));
});

test('bounded movement selects one real capture, never an unrendered diagonal or free translation',()=>{
  for(const [x,y,z]of [[.1,.08,.1],[.2,.15,.2]]){
    const pack=manifest();
    const offsets={center:[0,0,0],left:[-x,0,0],right:[x,0,0],up:[0,y,0],down:[0,-y,0],front:[0,0,-z],back:[0,0,z]};
    for(const view of pack.views)view.offset=offsets[view.id];
    const owner={plateMode:true,ready:true,pack,entry:pack.views[0],canvas:{width:1600,height:900}};
    for(const [axis,value,expected]of [['x',.001,[x,0,0]],['y',-.001,[0,-y,0]],['z',.001,[0,0,z]],['z',-.001,[0,0,-z]]]){
      const settings={focal:pack.referenceFocal,sensor:'full',x:.4,y:.4,z:.4,yaw:0,pitch:0,roll:0,[axis]:value};
      PlateRenderer.prototype.constrain.call(owner,settings,axis);
      assert.deepEqual([settings.x,settings.y,settings.z].map(v=>v||0),expected);
    }
  }
});

for(const [name,change]of [
  ['preview-sized center',p=>p.views[0].detailWidth=640],
  ['preview sampling',p=>p.views[0].samples=16],
  ['missing direction',p=>p.views.pop()],
  ['foreign source',p=>p.flash.sourceSha256=ORIGINAL_CLASSROOM_SOURCE],
  ['radial instead of axial depth',p=>p.depth.space='ray-distance'],
  ['changed depth normalization',p=>p.depth.range=100],
  ['wrong source focal',p=>p.referenceFocal=50],
  ['unrendered movement bounds',p=>p.bounds.x[0]=-3],
  ['mismatched flash pose',p=>p.flash.views[1].cameraMatrix=[...p.flash.views[1].cameraMatrix].map((n,i)=>i===12?n+.1:n)],
  ['mismatched flash origin',p=>p.flash.views[1].flashPosition=[100,0,0]],
  ['changed flash pulse',p=>p.flash.referenceDuration=1],
  ['32-sample initial photograph',p=>p.views[0].radianceCapture.samples=32],
  ['retired base marked delivered',p=>p.views[0].independentBaseCapture.delivered=true],
  ['retired base evidence at delivered level',p=>p.views[0].jobEvidence='jobs/desk/base/center/attempt-001'],
  ['unattributed derived scene',p=>delete p.sourceProvenance],
])test(`reject ${name}`,()=>{const p=manifest();change(p);assert.throws(()=>validateClassroomManifest(p));});

test('asset filenames cannot escape the verified pack',()=>{
  for(const bad of ['../center.webp','/tmp/center.webp','a\\b.webp','.','..',''])assert.throws(()=>safeAssetName(bad));
  assert.equal(safeAssetName('center-detail.webp'),'center-detail.webp');
});

test('file evidence cannot silently downgrade to header-only asset checks',()=>{
  const receipt=Object.fromEntries(['manifest.json',...Array.from({length:35},(_,i)=>`${i}.webp`)].map(file=>[file,{bytes:10,sha256:'a'.repeat(64)}]));
  validateClassroomReceipt(receipt);
  for(const invalid of [undefined,{},Object.fromEntries(Object.entries(receipt).slice(1)),{...receipt,'manifest.json':{bytes:10,sha256:'short'}},{...receipt,'manifest.json':{bytes:0,sha256:'a'.repeat(64)}}])assert.throws(()=>validateClassroomReceipt(invalid));
});

test('photo snapshot preserves each new scene identity and actual capture optics',()=>{
  for(const scene of CLASSROOM_VIEWPOINTS){
    const pack=manifest();pack.id=scene.id;
    const result=photoSnapshot({settings:{focus:.9,focal:pack.referenceFocal},resolved:{},scene,renderer:{plateMode:true,pack,entry:pack.views[0],plate:{image:{image:{width:5120,height:2880}},flash:{}}},width:2048,height:1152,simulationTime:0,focusPoint:{x:.5,y:.5}});
    assert.deepEqual(result.scene,{id:scene.id,name:scene.name});assert.equal(result.source.sourceSha256,CLASSROOM_SOURCE);assert.equal(result.source.referenceFocal,pack.referenceFocal);assert.equal(result.source.detailLoaded,true);assert.equal(result.source.flashLayerLoaded,true);assert.equal(result.source.viewId,'center');
  }
});

// Independently reviewed v2 metadata, no generated image fixtures.
function revisedManifest(referenceFocal=20){
  const pack=manifest(),source='c'.repeat(64),previewSource='d'.repeat(64);
  pack.sourceSha256=source;pack.sourceProvenance.previewSourceSha256=previewSource;
  for(const layer of ['detail','detailDepth','flash'])pack[layer].sourceSha256=source;
  Object.assign(pack.camera,{lens:referenceFocal*32/36,sensorWidth:32,sensorHeight:18,aspect:16/9});
  pack.referenceFocal=referenceFocal;pack.captureLens=pack.camera.lens/1.2;
  pack.captureQuality.sourceCenter={width:6144,height:3456,samples:256,overscan:1.2};
  for(const record of [pack.views[0].radianceCapture,pack.detail.views.find(view=>view.id==='center')])Object.assign(record,{sourceWidth:6144,sourceHeight:3456,runtimeDetailWidth:5120,runtimeDetailHeight:2880});
  const renderer={version:1,mode:'staged-center',components:Object.fromEntries(STAGED_CENTER_COMPONENTS.map((name,i)=>[name,String(i+1).repeat(64)]))};renderer.sha256=stagedRendererHash(renderer);
  const raw={sourceSha256:source,jobSha256:'8'.repeat(64),dimensions:[6144,3456],samples:256,rawRendererComponents:Object.fromEntries(['render-center-raw.py','render-job.py'].map(name=>[name,renderer.components[name]])),files:{'center.exr':'9'.repeat(64),'report.json':'8'.repeat(64),'render.log':'7'.repeat(64)},renderProcess:{exit:0,memorySafetyReason:null}};
  const denoise={status:'complete',dimensions:[6144,3456],samples:256,quality:'HIGH',prefilter:'ACCURATE',hdr:true,srgb:false,cleanAux:true,fullFrameAutomaticInputScale:true,manualTiling:false,sceneProcessExitedBeforeDenoising:true,maxMemoryMBPerFilter:1024,librarySha256:'6'.repeat(64),scriptSha256:renderer.components['denoise-bounded.py'],rawCaptureEvidence:raw,inputSha256:raw.files['center.exr'],outputSha256:pack.views[0].radianceCapture.sourceExrSha256,sampleCountStatistics:{minimum:256,maximum:256,pixels:6144*3456}};
  for(const record of [pack.views[0].radianceCapture,pack.captureQuality.sourceCenter,pack.detail.views.find(v=>v.id==='center')])Object.assign(record,{rendererEvidence:structuredClone(renderer),denoisingEvidence:structuredClone(denoise)});
  const projection=new PerspectiveCamera(2*Math.atan(18/(2*pack.captureLens))*180/Math.PI,16/9,pack.camera.near,pack.camera.far).projectionMatrix;
  for(const view of pack.views){view.projectionMatrix=projection.toArray();view.matrix=projection.clone().multiply(new Matrix4().fromArray(view.cameraMatrix).invert()).toArray();}
  const blender=new Matrix4().makeRotationX(Math.PI/2).multiply(new Matrix4().fromArray(pack.views[0].cameraMatrix));
  const rig={...pack.camera,id:'desk',camera:pack.camera.name,sourceSha256:source,defaults:structuredClone(pack.defaults),defaultsEvidence:structuredClone(pack.defaultsEvidence),bounds:pack.bounds,offsets:Object.fromEntries(pack.views.map(v=>[v.id,v.offset])),matrix:Array.from({length:4},(_,r)=>Array.from({length:4},(_,c)=>blender.elements[c*4+r]))};
  rig.approvedComposition={version:1,referenceFocal,aspect:16/9,overscan:1.2,preview:{sha256:'e'.repeat(64),width:1280,height:720,sourceSha256:previewSource,sourceReportSha256:'f'.repeat(64),captureLens:rig.lens,sensorWidth:32},captureFrame:{width:6144,height:3456},nativeFrame:{width:5120,height:2880},nativeCrop:{left:512,top:288,width:5120,height:2880}};
  pack.approvedComposition=structuredClone(rig.approvedComposition);
  return {pack,rig};
}
for(const focal of [20,23.4375])test(`approved complete native framing preserves ${focal} mm with real extra overscan`,()=>{
  const {pack,rig}=revisedManifest(focal);
  validateClassroomManifest(pack,rig.sourceSha256);validateClassroomRig(pack,rig);
  assert.equal(validateApprovedComposition(pack,rig).referenceFocal,focal);
  assert.equal(sceneDefaults({},pack).focal,focal);
});
test('new sources require an independent reviewed per-rig binding, not the old common hash',()=>{
  const {pack,rig}=revisedManifest();assert.throws(()=>validateClassroomManifest(pack));
  assert.throws(()=>validateClassroomManifest(pack,'a'.repeat(64)));
  validateClassroomManifest(pack,rig.sourceSha256);
  pack.flash.sourceSha256=CLASSROOM_SOURCE;assert.throws(()=>validateClassroomManifest(pack,rig.sourceSha256));
});
for(const [label,mutate]of [
  ['rounded fractional native focal',p=>{p.referenceFocal=23.4;}],
  ['whole capture masquerading as approved native rays',p=>{for(const v of p.views){v.projectionMatrix[0]*=1.2;v.projectionMatrix[5]*=1.2;}}],
  ['old 5120 source masquerading as 6144 capture',p=>{p.views[0].radianceCapture.sourceWidth=5120;}],
  ['different approved preview',p=>{p.approvedComposition.preview.sha256='a'.repeat(64);} ],
  ['wrong camera-only parent source',p=>{p.sourceProvenance.previewSourceSha256='a'.repeat(64);} ],
  ['cropping changes native field of view',p=>{p.approvedComposition.nativeCrop.left=0;} ],
  ['minimum focal silently crops the default',p=>{p.minimumFocal=24;} ],
])test(`revised framing rejects ${label}`,()=>{const {pack,rig}=revisedManifest(23.4375);mutate(pack);assert.throws(()=>validateApprovedComposition(pack,rig));});

test('new native optics retain the exact approved preview pose and full field',()=>{
  const {rig}=revisedManifest(23.4375),preview=rig.approvedComposition.preview;
  const pose=new Matrix4().makeRotationX(-Math.PI/2).multiply(new Matrix4().set(...rig.matrix.flat())),projection=new PerspectiveCamera(2*Math.atan(18/(2*rig.lens))*180/Math.PI,16/9,rig.near,rig.far).projectionMatrix;
  const report={status:'complete',sourceSha256:preview.sourceSha256,captureLens:rig.lens,camera:{sensorWidth:32,aspect:16/9,matrix:rig.matrix,near:rig.near,far:rig.far},views:[{id:'center',near:rig.near,width:1280,height:720,offset:[0,0,0],position:pose.toArray().slice(12,15),cameraMatrix:pose.toArray(),projectionMatrix:projection.toArray(),matrix:projection.clone().multiply(pose.clone().invert()).toArray()}]};
  validateApprovedPreviewReport(report,rig);
  const shifted=structuredClone(report);shifted.camera.matrix[2][3]+=.1;assert.throws(()=>validateApprovedPreviewReport(shifted,rig));
  const cropped=structuredClone(report);cropped.captureLens*=1.2;assert.throws(()=>validateApprovedPreviewReport(cropped,rig));
  for(const field of ['position','offset','cameraMatrix','projectionMatrix','matrix']){const tampered=structuredClone(report);tampered.views[0][field][field==='cameraMatrix'?12:0]+=10;assert.throws(()=>validateApprovedPreviewReport(tampered,rig));}
});
test('mixed-source receipt preserves teacher and refuses shared-source relabelling',async()=>{
  const prior=JSON.parse(await readFile(new URL('../docs/visual-review/classroom-viewpoints-delivery.json',import.meta.url)));
  // Current delivery may already be migrated when this test runs in final CI.
  const old=prior.version===1?prior:JSON.parse(await readFile(new URL('../docs/visual-review/classroom-viewpoints-v1-delivery.json',import.meta.url)));
  validateClassroomDelivery(old);
  const next={version:2,previousReceipt:{path:'docs/visual-review/classroom-viewpoints-v1-delivery.json',sha256:'a'.repeat(64)},packs:old.packs.map(record=>record.id==='classroom-teacher'?{...record,revision:1,sourceSha256:CLASSROOM_SOURCE}:{...record,revision:2,sourceSha256:'c'.repeat(64),rig:{...record.rig,sourceSha256:'c'.repeat(64),approvedComposition:revisedManifest().rig.approvedComposition}})};
  validateClassroomDelivery(next);
  const priorBytes=Buffer.from(JSON.stringify(old));next.previousReceipt.sha256=createHash('sha256').update(priorBytes).digest('hex');validateClassroomHistory(next,priorBytes);
  const changedTeacher=structuredClone(next);changedTeacher.packs.find(r=>r.id==='classroom-teacher').files['manifest.json'].bytes++;assert.throws(()=>validateClassroomHistory(changedTeacher,priorBytes));
  const missingSource=structuredClone(next);delete missingSource.packs[0].rig.sourceSha256;assert.throws(()=>validateClassroomDelivery(missingSource));
  assert.throws(()=>validateClassroomDelivery({...next,sourceSha256:'c'.repeat(64)}));
  const broken=structuredClone(next);broken.packs[0].sourceSha256=CLASSROOM_SOURCE;assert.throws(()=>validateClassroomDelivery(broken));
});
for(const fail of [false,true])test(`staged directory replacement ${fail?'rolls back':'keeps frozen hardlinked originals intact'}`,async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'classroom-transaction-'));
  try{
    for(const name of ['original','live','staged'])await mkdir(path.join(root,name));
    await writeFile(path.join(root,'original/image'),'OLD');await link(path.join(root,'original/image'),path.join(root,'live/image'));
    await writeFile(path.join(root,'staged/image'),'NEW');const oldInode=(await stat(path.join(root,'original/image'))).ino;
    let count=0;const operation=async(a,b)=>{if(fail&&++count===2)throw Error('simulated rename failure');await rename(a,b);};
    const promise=moveTransaction([[path.join(root,'live'),path.join(root,'backup')],[path.join(root,'staged'),path.join(root,'live')]],operation);
    if(fail)await assert.rejects(promise,/simulated/);else await promise;
    assert.equal(await readFile(path.join(root,'original/image'),'utf8'),'OLD');assert.equal((await stat(path.join(root,'original/image'))).ino,oldInode);
    assert.equal(await readFile(path.join(root,'live/image'),'utf8'),fail?'OLD':'NEW');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('a coherent but unapproved source or character preview cannot enter the revised receipt',()=>{
  const {rig}=revisedManifest(),p=rig.approvedComposition.preview;
  const approved={id:'desk',sourceSha256:rig.sourceSha256,previewSha256:p.sha256,previewSourceSha256:p.sourceSha256,previewReportSha256:p.sourceReportSha256,referenceFocal:20};
  const inputs={version:1,rigs:[approved,{...approved,id:'window'}]};validateApprovedInputs(rig,inputs);
  for(const mutate of [r=>{r.sourceSha256='a'.repeat(64);},r=>{r.approvedComposition.preview.sha256='b'.repeat(64);},r=>{r.approvedComposition.preview.sourceSha256='a'.repeat(64);}]){const changed=structuredClone(rig);mutate(changed);assert.throws(()=>validateApprovedInputs(changed,inputs));}
});

for(const [label,change]of [
  ['raw not used by denoiser',d=>{d.inputSha256='a'.repeat(64);} ],
  ['different denoised output',d=>{d.outputSha256='b'.repeat(64);} ],
  ['incomplete raw capture',d=>{d.rawCaptureEvidence.samples=32;} ],
  ['manual tiling masquerades as full-frame',d=>{d.manualTiling=true;} ],
  ['low-quality denoiser',d=>{d.quality='BALANCED';} ],
  ['changed raw worker',d=>{d.rawCaptureEvidence.rawRendererComponents['render-job.py']='a'.repeat(64);} ],
  ['partial sample-count buffer',d=>{d.sampleCountStatistics.minimum=255;} ],
  ['failed raw process',d=>{d.rawCaptureEvidence.renderProcess.exit=-9;} ],
])test(`staged center evidence rejects ${label}`,()=>{
  const {pack}=revisedManifest();validateStagedCenter(pack);
  const denoise=pack.views[0].radianceCapture.denoisingEvidence;change(denoise);
  // Mirror the same bad claim everywhere: chain checks, not just equality,
  // must still reject self-consistent but incorrect processing metadata.
  pack.captureQuality.sourceCenter.denoisingEvidence=structuredClone(denoise);pack.detail.views[0].denoisingEvidence=structuredClone(denoise);
  assert.throws(()=>validateStagedCenter(pack));
});
test('renderer identity binds all five stages with canonical sorted JSON',()=>{
  const {pack}=revisedManifest();pack.views[0].radianceCapture.rendererEvidence.components['render-center-raw.py']='a'.repeat(64);assert.throws(()=>validateStagedCenter(pack));
});

test('revised focus and formal depth evidence cannot diverge from the frozen rig',()=>{
  for(const change of [p=>{p.defaults.focus=.5;},p=>{p.defaultsEvidence={focus:'unreviewed foreground sample'};}]){
    const {pack,rig}=revisedManifest();validateClassroomRig(pack,rig);change(pack);assert.throws(()=>validateClassroomRig(pack,rig));
  }
});

test('scene-linear provenance wording is case-insensitive but remains mandatory',()=>{
  const pack=manifest();pack.views[0].baseRadianceMethod='Scene-linear area average';validateClassroomManifest(pack);
  pack.views[0].baseRadianceMethod='Display encoded resize';assert.throws(()=>validateClassroomManifest(pack));
});


test('linked static build uses exactly the ordinary legacy asset list',()=>{
  assert.deepEqual(LEGACY_ASSETS,['Images/Background','Images/ISO','Images/Fan/7','libs','loadHelper.js','sketch.js','style.css','favicon.png','LICENSE']);
});
test('static hardlinks preserve bytes and source inodes with an exact file list',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'classroom-static-'));
  try{
    const source=path.join(root,'source'),dest=path.join(root,'dist');
    await mkdir(path.join(source,'nested'),{recursive:true});
    await writeFile(path.join(source,'a.txt'),'a');await writeFile(path.join(source,'nested','b.bin'),Buffer.from([0,127,255]));
    await linkAssetTree(source,dest);
    assert.deepEqual(await listAssetFiles(source),['a.txt',path.join('nested','b.bin')]);
    assert.deepEqual(await listAssetFiles(dest),await listAssetFiles(source));
    for(const file of await listAssetFiles(source)){
      assert.deepEqual(await readFile(path.join(dest,file)),await readFile(path.join(source,file)));
      assert.equal((await stat(path.join(dest,file))).ino,(await stat(path.join(source,file))).ino);
    }
    assert.deepEqual(await listAssetFiles(path.join(source,'a.txt')),['']);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('static link collisions fail closed without modifying either file',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'classroom-collision-'));
  try{
    const source=path.join(root,'source'),dest=path.join(root,'dest');
    await writeFile(source,'source');await writeFile(dest,'existing destination');
    await assert.rejects(linkAssetTree(source,dest),{code:'EEXIST'});
    assert.equal(await readFile(source,'utf8'),'source');assert.equal(await readFile(dest,'utf8'),'existing destination');
  }finally{await rm(root,{recursive:true,force:true});}
});
test('static listing and linking reject symlinks rather than follow external data',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'classroom-symlink-'));
  try{
    const source=path.join(root,'source'),target=path.join(root,'target');await mkdir(source);await writeFile(target,'retained');
    await symlink(target,path.join(source,'link'));
    await assert.rejects(listAssetFiles(source),/symlink/);
    await assert.rejects(linkAssetTree(source,path.join(root,'dest')),/symlink/);
    assert.equal(await readFile(target,'utf8'),'retained');
  }finally{await rm(root,{recursive:true,force:true});}
});
