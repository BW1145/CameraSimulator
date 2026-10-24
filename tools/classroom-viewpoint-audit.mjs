import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Matrix4,Vector3} from 'three';
import {CLASSROOM_VIEWPOINTS,sceneDefaults} from '../src/scenes.js';
import {validateApprovedComposition} from './classroom-composition-audit.mjs';

export const CLASSROOM_SOURCE='3fdf721977489b19ea9ec975854ea25ff3304fcf9a7742938e9233afce59389d';
export const ORIGINAL_CLASSROOM_SOURCE='5c526ea3f280566e80253673c9955640527cd0f247ea41b1742620b5bc39f7a4';
export const VIEW_IDS=['center','left','right','up','down','front','back'];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const finite=(value,label)=>assert.ok(Number.isFinite(value),`${label}: expected finite number`);
function close(actual,expected,label,tolerance=2e-5){finite(actual,label);finite(expected,label);assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} != ${expected}`);}
function vector(actual,expected,label){assert.equal(actual?.length,expected.length,label);actual.forEach((n,i)=>close(n,expected[i],`${label}[${i}]`));}
function ids(views,label){assert.deepEqual(views?.map(v=>v.id).sort(),[...VIEW_IDS].sort(),`${label}: seven unique captures`);}
function encoding(value,label){assert.equal(value?.type,'log2-rgb',label);finite(value.min,label);finite(value.max,label);assert.ok(value.max>value.min,label);}
export function safeAssetName(name){assert.equal(typeof name,'string');assert.ok(name.length>0&&name===path.basename(name)&&!/[\\/]/.test(name)&&!['.','..'].includes(name),'asset must be a local filename');return name;}
export function validateClassroomReceipt(receipt){
  assert.ok(receipt&&Object.keys(receipt).length===36&&receipt['manifest.json'],'complete 36-file SHA receipt');
  for(const [file,record]of Object.entries(receipt)){
    safeAssetName(file);assert.ok(Number.isSafeInteger(record?.bytes)&&record.bytes>0,`${file}: byte count`);
    assert.match(record.sha256,/^[a-f0-9]{64}$/,`${file}: SHA-256`);
  }
}

// On import, also bind the delivered camera to the frozen, reviewed renderer
// specification. This is separate from validating a self-consistent manifest.
export function validateClassroomRig(pack,rig){
  if(rig.sourceSha256){
    assert.equal(pack.sourceSha256,rig.sourceSha256);
    assert.deepEqual(pack.defaults,rig.defaults,'reviewed per-rig focus/exposure defaults');
    assert.deepEqual(pack.defaultsEvidence,rig.defaultsEvidence,'formal default-focus source evidence');
    validateApprovedComposition(pack,rig);
  }
  assert.equal(pack.id,`classroom-${rig.id}`);assert.equal(pack.camera.name,rig.camera);
  for(const field of ['lens','sensorWidth','sensorHeight','near','far','aspect'])close(pack.camera[field],rig[field],`${pack.id} source ${field}`);
  for(const axis of ['x','y','z','yaw','pitch','roll'])vector(pack.bounds[axis],rig.bounds[axis],`${pack.id} reviewed ${axis} bounds`);
  const origin=new Matrix4().makeRotationX(-Math.PI/2).multiply(new Matrix4().set(...rig.matrix.flat()));
  for(const view of pack.views){
    vector(view.offset,rig.offsets[view.id],`${pack.id}/${view.id} reviewed offset`);
    const expected=origin.clone().setPosition(new Vector3(...rig.offsets[view.id]).applyMatrix4(origin));
    vector(view.cameraMatrix,expected.toArray(),`${pack.id}/${view.id} reviewed camera`);
  }
}

// The delivered PNG contract is axial camera-Z in metres, not ray distance.
// Its 64m far saturation includes sky; it must never be interpreted as a wall.
export function validateClassroomManifest(pack,reviewedSourceSha256=CLASSROOM_SOURCE){
  assert.match(reviewedSourceSha256,/^[a-f0-9]{64}$/,'independently reviewed source SHA');
  const scene=CLASSROOM_VIEWPOINTS.find(scene=>scene.id===pack.id);assert.ok(scene,'known classroom viewpoint');
  assert.equal(pack.version,1);assert.equal(pack.sourceSha256,reviewedSourceSha256);
  assert.equal(pack.sourceProvenance?.originalSha256,ORIGINAL_CLASSROOM_SOURCE);
  assert.equal(pack.sourceProvenance?.originalAuthor,'Christophe Seux');assert.equal(pack.sourceProvenance?.license,'CC0');
  assert.ok(pack.sourceProvenance?.derivations?.length>0,'derived source must be attributed');
  assert.deepEqual(pack.depth,{type:'uint16-rg',space:'capture-camera-z',range:64});
  assert.ok(pack.camera?.near>0&&pack.camera.far>pack.camera.near,'source clip planes');
  assert.ok(pack.camera.lens>0&&pack.camera.sensorWidth>0&&pack.camera.aspect>0,'source optics');
  close(pack.referenceFocal,pack.camera.lens/pack.camera.sensorWidth*36,'full-frame reference focal');
  close(pack.captureLens,pack.camera.lens/1.2,'20% overscan capture lens');
  assert.ok(pack.defaults&&pack.defaultsEvidence,'asset-backed teaching defaults');
  sceneDefaults(scene,pack);assert.equal(pack.defaults.baseEV,8);
  encoding(pack.encoding,'base');encoding(pack.detail?.encoding,'detail');encoding(pack.flash?.encoding,'flash');
  ids(pack.views,'base');assert.equal(pack.views[0].id,'center','initial capture is the center');
  for(const layer of ['detail','detailDepth','flash']){
    assert.equal(pack[layer]?.sourceSha256,reviewedSourceSha256,`${layer} source`);ids(pack[layer].views,layer);
  }
  assert.equal(pack.detailDepth.space,'capture-camera-z');assert.equal(pack.detailDepth.range,64);
  assert.equal(pack.flash.referenceEnergy,1000);assert.equal(pack.flash.referenceDuration,.01);
  assert.equal(pack.flash.areaDiameter,.08);assert.equal(pack.flash.originOffsetForward,0);
  assert.match(pack.flash.method,/isolated CameraFlash light group/);assert.equal(pack.flash.samples,32);
  const quality=pack.captureQuality;
  for(const [layer,width,height,samples] of [['center',5120,2880,256],['neighbors',4096,2304,32],['baseDepth',1280,720,1],['detailDepth',2048,1152,1],['flash',1280,720,32]]){
    assert.equal(quality?.[layer]?.width,width,`${layer} width`);assert.equal(quality[layer].height,height,`${layer} height`);assert.equal(quality[layer].samples,samples,`${layer} samples`);
  }
  assert.equal(quality.base.width,2560);assert.equal(quality.base.height,1440);
  assert.equal(quality.base.centerSourceSamples,256);assert.equal(quality.base.neighborSamples,32);
  const center=pack.views[0],origin=new Matrix4().fromArray(center.cameraMatrix);
  for(const [axis,index]of [['x',0],['y',1],['z',2]]){
    const values=pack.views.map(v=>v.offset[index]);vector(pack.bounds?.[axis],[Math.min(...values),Math.max(...values)],`${axis} capture bounds`);
  }
  for(const axis of ['yaw','pitch','roll']){assert.equal(pack.bounds?.[axis]?.length,2);assert.ok(pack.bounds[axis][0]<=0&&pack.bounds[axis][1]>=0);pack.bounds[axis].forEach(v=>finite(v,axis));}
  for(const view of pack.views){
    const label=`${pack.id}/${view.id}`,samples=view.id==='center'?256:32,detailSize=view.id==='center'?[5120,2880]:[4096,2304];
    assert.equal(view.cameraMatrix?.length,16);assert.equal(view.projectionMatrix?.length,16);assert.equal(view.matrix?.length,16);
    view.cameraMatrix.forEach(n=>finite(n,label));view.projectionMatrix.forEach(n=>finite(n,label));
    const camera=new Matrix4().fromArray(view.cameraMatrix),projection=new Matrix4().fromArray(view.projectionMatrix);
    close(camera.determinant(),1,`${label} rigid camera`,1e-4);
    vector(view.position,new Vector3(...view.offset).applyMatrix4(origin).toArray(),`${label} captured offset`);
    vector(view.position,new Vector3().setFromMatrixPosition(camera).toArray(),`${label} camera translation`);
    vector(view.matrix,projection.clone().multiply(camera.clone().invert()).toArray(),`${label} capture projection`,2e-5);
    close(view.projectionMatrix[11],-1,`${label} perspective`);close(view.projectionMatrix[15],0,`${label} perspective`);
    close(view.near,pack.camera.near,`${label} near`);
    assert.equal(view.samples,samples,`${label} sampling`);assert.equal(view.clampedChannels,0);
    assert.ok(view.maximumDepth>view.minimumDepth&&view.minimumDepth>=view.near,'physical source depth range');
    for(const [w,h,size]of [['width','height',[2560,1440]],['depthWidth','depthHeight',[1280,720]],['detailWidth','detailHeight',detailSize],['detailDepthWidth','detailDepthHeight',[2048,1152]],['flashWidth','flashHeight',[1280,720]]])assert.deepEqual([view[w],view[h]],size,`${label} ${w}`);
    for(const [layer,fileKey,bytesKey]of [['detail','detailFile','detailBytes'],['detailDepth','detailDepth','detailDepthBytes'],['flash','flash','flashBytes']]){
      const record=pack[layer].views.find(v=>v.id===view.id);
      vector(record.cameraMatrix,view.cameraMatrix,`${label} ${layer} pose`);close(record.near,view.near,`${label} ${layer} near`);
      assert.equal(record.file,view[fileKey]);assert.equal(record.bytes,view[bytesKey]);
      if(layer==='detail'){assert.equal(record.samples,samples);assert.equal(record.clampedChannels,0);}
      if(layer==='flash'){vector(record.flashPosition,view.position,`${label} flash origin`);assert.equal(record.clampedChannels,0);}
    }
    if(view.id==='center'){
      assert.equal(view.radianceCapture?.samples,256);assert.match(view.radianceCapture.sourceExrSha256,/^[a-f0-9]{64}$/);
      assert.equal(view.radianceCapture.sourceFile,'center.exr');assert.ok(view.radianceCapture.captureSeconds>0);
      assert.match(view.radianceCapture.jobEvidence,new RegExp(`^jobs/${pack.id.replace('classroom-','')}/detail/center/attempt-\\d+$`));
      assert.equal(view.independentBaseCapture?.samples,32);assert.equal(view.independentBaseCapture.delivered,false);
      assert.match(view.independentBaseCapture.sourceSha256,/^[a-f0-9]{64}$/);
      for(const obsolete of ['jobEvidence','sha256','seconds'])assert.ok(!Object.hasOwn(view,obsolete),`${label}: retired 32-sample evidence is not the delivered image`);
      assert.equal(pack.detail.views.find(v=>v.id==='center').sourceExrSha256,view.radianceCapture.sourceExrSha256);
      assert.match(view.baseRadianceMethod,/scene-linear/i);
    }
  }
  assert.equal(pack.initialBytes,center.bytes+center.depthBytes);
  assert.equal(pack.totalBytes,pack.views.reduce((sum,v)=>sum+v.bytes+v.depthBytes,0));
  assert.ok(pack.initialBytes<4*1024*1024,'initial pack budget');assert.ok(pack.totalBytes<25*1024*1024,'base pack budget');
  return scene;
}

// Check actual encoded bytes/dimensions and independent view content, not just
// a manifest's claim. Required delivery receipts bind every file to packaging QA.
export async function auditClassroomPack(directory,receipt,reviewedRig){
  validateClassroomReceipt(receipt);
  const bytes=await readFile(path.join(directory,'manifest.json')),pack=JSON.parse(bytes);validateClassroomManifest(pack,reviewedRig?.sourceSha256??CLASSROOM_SOURCE);
  if(reviewedRig)validateClassroomRig(pack,reviewedRig);
  const expected=new Set(['manifest.json']),hashes={file:new Set(),depth:new Set()};
  let totalBytes=bytes.length;
  const verifyReceipt=(file,data)=>{
    assert.equal(receipt[file]?.bytes,data.length,`${file}: delivery byte count`);
    assert.equal(receipt[file].sha256,sha256(data),`${file}: delivery SHA-256`);
  };
  verifyReceipt('manifest.json',bytes);
  for(const view of pack.views){
    for(const [fileKey,bytesKey,w,h,format]of [['file','bytes','width','height','webp'],['depth','depthBytes','depthWidth','depthHeight','png'],['detailFile','detailBytes','detailWidth','detailHeight','webp'],['detailDepth','detailDepthBytes','detailDepthWidth','detailDepthHeight','png'],['flash','flashBytes','flashWidth','flashHeight','webp']]){
      const file=safeAssetName(view[fileKey]);assert.ok(!expected.has(file),`${file}: distinct layer filename`);expected.add(file);
      const data=await readFile(path.join(directory,file));assert.equal(data.length,view[bytesKey],`${file}: bytes`);verifyReceipt(file,data);
      const image=await sharp(data).metadata();assert.deepEqual([image.width,image.height,image.format],[view[w],view[h],format],`${file}: real dimensions/format`);
      if(hashes[fileKey])hashes[fileKey].add(sha256(data));
      totalBytes+=data.length;
    }
  }
  assert.equal(hashes.file.size,7,'seven independent radiance captures');assert.equal(hashes.depth.size,7,'seven independent depth captures');
  assert.deepEqual((await readdir(directory)).sort(),[...expected].sort(),'only reviewed runtime assets');
  assert.deepEqual(Object.keys(receipt).sort(),[...expected].sort(),'complete delivery receipt');
  return {id:pack.id,files:expected.size,totalBytes,sourceSha256:pack.sourceSha256,referenceFocal:pack.referenceFocal,defaults:pack.defaults};
}
