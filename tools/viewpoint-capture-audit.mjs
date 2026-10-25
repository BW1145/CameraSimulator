// Shared capture mechanics only: callers must separately validate their explicit
// source/approval identity, immutable manifest SHA and final-default evidence.
// Extracted without relaxing the existing derived-viewpoint acceptance checks.
import assert from 'node:assert/strict';
import {readFile,readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Matrix4,Vector3} from 'three';
import {sceneDefaults} from '../src/scenes.js';
import {validateStagedCenter} from './classroom-processing-audit.mjs';
export const VIEW_IDS=['center','left','right','up','down','front','back'];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const finite=(value,label)=>assert.ok(Number.isFinite(value),`${label}: expected finite number`);
function close(actual,expected,label,tolerance=2e-5){finite(actual,label);finite(expected,label);assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} != ${expected}`);}
function vector(actual,expected,label){assert.equal(actual?.length,expected.length,label);actual.forEach((n,i)=>close(n,expected[i],`${label}[${i}]`));}
function ids(views,label){assert.deepEqual(views?.map(v=>v.id).sort(),[...VIEW_IDS].sort(),`${label}: seven unique captures`);}
function encoding(value,label){
  assert.equal(value?.type,'log2-rgb',label);finite(value.min,label);finite(value.max,label);assert.ok(value.max>value.min,label);
  assert.equal(value.losslessContainer,'WebP',`${label}: lossless HDR transport`);
  close(value.maximumChannelQuantizationEV,(value.max-value.min)/510,`${label}: quantization evidence`,1e-12);
  assert.ok(Number.isFinite(value.sourceMaximumRadiance)&&value.sourceMaximumRadiance>0,`${label}: measured HDR maximum`);
  assert.ok(value.sourceMaximumRadiance<=2**value.max,`${label}: source HDR must fit the dynamic encoding`);
}
function radiance(record,shared,label){
  const enc=record.encoding??shared;encoding(enc,label);
  assert.ok(Number.isFinite(record.maximumRadiance)&&record.maximumRadiance>=0,`${label}: actual radiance maximum`);
  assert.ok(record.maximumRadiance<=2**enc.max,`${label}: delivered HDR cannot be clipped to a fixed range`);
  if(record.sourceMaximumRadiance!==undefined)assert.ok(Number.isFinite(record.sourceMaximumRadiance)&&record.sourceMaximumRadiance>=0&&record.sourceMaximumRadiance<=2**enc.max,`${label}: original HDR fits range`);
  assert.equal(record.clampedChannels,0,`${label}: no clipped channels`);
  if(record.negativeChannels!==undefined)assert.equal(record.negativeChannels,0,`${label}: nonnegative radiance`);
}
export function safeAssetName(name){assert.equal(typeof name,'string');assert.ok(name.length>0&&name===path.basename(name)&&!/[\\/]/.test(name)&&!['.','..'].includes(name),'asset must be a local filename');return name;}
export function validateCaptureReceipt(receipt){
  assert.ok(receipt&&Object.keys(receipt).length===36&&receipt['manifest.json'],'complete 36-file SHA receipt');
  const expected=['manifest.json',...VIEW_IDS.flatMap(id=>[`${id}.webp`,`${id}-depth.png`,`${id}-detail.webp`,`${id}-detail-depth.png`,`${id}-flash.webp`])];
  assert.deepEqual(Object.keys(receipt).sort(),expected.sort(),'exact five layers for each of seven views');
  for(const [file,record]of Object.entries(receipt)){
    safeAssetName(file);assert.ok(Number.isSafeInteger(record?.bytes)&&record.bytes>0,`${file}: byte count`);
    assert.match(record.sha256,/^[a-f0-9]{64}$/,`${file}: SHA-256`);
  }
}

export function validateCaptureGeometry(pack,rig){
  assert.equal(pack.id,rig.id);assert.equal(pack.camera.name,rig.camera);
  for(const field of ['lens','sensorWidth','sensorHeight','near','far','aspect'])close(pack.camera[field],rig[field],`${pack.id} source ${field}`);
  for(const axis of ['x','y','z','yaw','pitch','roll'])vector(pack.bounds[axis],rig.bounds[axis],`${pack.id} reviewed ${axis} bounds`);
  const origin=new Matrix4().makeRotationX(-Math.PI/2).multiply(new Matrix4().set(...rig.matrix.flat()));
  for(const view of pack.views){
    vector(view.offset,rig.offsets[view.id],`${pack.id}/${view.id} reviewed offset`);
    const expected=origin.clone().setPosition(new Vector3(...rig.offsets[view.id]).applyMatrix4(origin));
    vector(view.cameraMatrix,expected.toArray(),`${pack.id}/${view.id} reviewed camera`);
  }
}

export function validateCaptureMechanics(pack,reviewedSourceSha256){
  assert.match(reviewedSourceSha256,/^[a-f0-9]{64}$/);
  assert.equal(pack.sourceSha256,reviewedSourceSha256);
  assert.deepEqual(pack.depth,{type:'uint16-rg',space:'capture-camera-z',range:64});
  assert.ok(pack.camera?.near>0&&pack.camera.far>pack.camera.near,'source clip planes');
  assert.ok(pack.camera.lens>0&&pack.camera.sensorWidth>0&&pack.camera.aspect>0,'source optics');
  close(pack.referenceFocal,pack.camera.lens/pack.camera.sensorWidth*36,'full-frame reference focal');
  close(pack.captureLens,pack.camera.lens/1.2,'20% overscan capture lens');
  assert.ok(pack.defaults&&pack.defaultsEvidence,'asset-backed teaching defaults');
  sceneDefaults({},pack);assert.equal(pack.defaults.baseEV,8);
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
  for(const [key,value]of Object.entries({width:6144,height:3456,samples:256,overscan:1.2}))assert.equal(quality?.sourceCenter?.[key],value,`source center ${key}`);
  for(const record of [pack.views[0].radianceCapture,pack.detail.views.find(v=>v.id==='center')]){
    assert.equal(record.sourceWidth,6144);assert.equal(record.sourceHeight,3456);assert.equal(record.runtimeDetailWidth,5120);assert.equal(record.runtimeDetailHeight,2880);
  }
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
    for(let axis=0;axis<3;axis++){const basis=new Vector3().setFromMatrixColumn(camera,axis);close(basis.length(),1,`${label} unit camera basis`);for(let other=0;other<axis;other++)close(basis.dot(new Vector3().setFromMatrixColumn(camera,other)),0,`${label} orthogonal camera basis`);}
    vector(view.cameraMatrix.slice(0,12),center.cameraMatrix.slice(0,12),`${label} same rigid rig orientation`);
    close(view.cameraMatrix[15],1,`${label} affine camera`);
    radiance(view,pack.encoding,`${label} base`);
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
      if(layer==='detail'){assert.equal(record.samples,samples);radiance(record,pack.detail.encoding,`${label} detail`);}
      if(layer==='flash'){vector(record.flashPosition,view.position,`${label} flash origin`);radiance(record,pack.flash.encoding,`${label} flash`);}
    }
    if(view.id==='center'){
      assert.equal(view.radianceCapture?.samples,256);assert.match(view.radianceCapture.sourceExrSha256,/^[a-f0-9]{64}$/);
      assert.equal(view.radianceCapture.sourceFile,'center.exr');assert.ok(view.radianceCapture.captureSeconds>0);
      assert.match(view.radianceCapture.jobEvidence,new RegExp(`^jobs/${pack.id}/detail/center/attempt-\\d+$`));
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
  return {id:pack.id,referenceFocal:pack.referenceFocal,defaults:pack.defaults};
}

// Normal captures keep the original exit-0 staged-process gate. Recovery is
// never accepted implicitly by the source-independent layer checks above.
export function validateCaptureManifest(pack,reviewedSourceSha256){
  const result=validateCaptureMechanics(pack,reviewedSourceSha256);validateStagedCenter(pack);return result;
}

export async function readCaptureAsset(file){
  const info=await lstat(file);assert.ok(info.isFile()&&!info.isSymbolicLink(),`regular non-symlink runtime asset: ${file}`);return readFile(file);
}

export async function auditCaptureFiles(directory,receipt,{expectedManifestSha256}={}){
  validateCaptureReceipt(receipt);
  const bytes=await readCaptureAsset(path.join(directory,'manifest.json'));
  if(expectedManifestSha256!==undefined)assert.equal(sha256(bytes),expectedManifestSha256,'manifest unchanged since independent validation');
  const pack=JSON.parse(bytes);
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
      const data=await readCaptureAsset(path.join(directory,file));assert.equal(data.length,view[bytesKey],`${file}: bytes`);verifyReceipt(file,data);
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
