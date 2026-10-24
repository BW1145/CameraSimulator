// An approved image describes the native composition, never the whole overscan.
// These checks use real renderer geometry only; they do not start a browser/GPU.
import assert from 'node:assert/strict';
import {Matrix4,PerspectiveCamera,Quaternion,Vector2} from 'three';
import {PlateRenderer} from '../src/plate-renderer.js';
import {sceneDefaults} from '../src/scenes.js';
import {validateStagedCenter} from './classroom-processing-audit.mjs';
const close=(a,b,label,tolerance=2e-5)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
const hash=(value,label)=>assert.match(value,/^[a-f0-9]{64}$/,label);

export function validateApprovedComposition(pack,rig,{previewSourceField='previewSourceSha256'}={}){
  assert.ok(['previewSourceSha256','originalSha256'].includes(previewSourceField),'explicit reviewed preview-parent field');
  const approved=rig.approvedComposition;
  assert.ok(approved,'new capture requires the frozen approved native composition');
  assert.deepEqual(pack.approvedComposition,approved,'manifest matches independently frozen approval');
  assert.equal(approved.version,1);hash(rig.sourceSha256,'per-rig source');
  assert.equal(pack.sourceSha256,rig.sourceSha256,'source belongs to this rig, not another classroom');
  hash(approved.preview.sourceSha256,'approved preview source');
  assert.equal(pack.sourceProvenance?.[previewSourceField],approved.preview.sourceSha256,'reviewed preview source parent');
  hash(approved.preview.sourceReportSha256,'approved preview capture report');
  close(approved.preview.captureLens,rig.lens,'preview becomes the native lens');
  close(approved.preview.sensorWidth,rig.sensorWidth,'approved preview sensor');
  hash(approved.preview.sha256,'approved preview image');
  assert.ok(Number.isInteger(approved.preview.width)&&approved.preview.width>0);
  assert.ok(Number.isInteger(approved.preview.height)&&approved.preview.height>0);
  close(approved.preview.width/approved.preview.height,approved.aspect,'approved preview aspect');
  close(approved.referenceFocal,rig.lens/rig.sensorWidth*36,'approved native focal');
  close(approved.referenceFocal,pack.referenceFocal,'runtime native focal');
  close(approved.aspect,pack.camera.aspect,'native aspect');close(approved.overscan,1.2,'real overscan');
  assert.deepEqual(approved.captureFrame,{width:6144,height:3456});
  assert.deepEqual(approved.nativeFrame,{width:5120,height:2880});
  assert.deepEqual(approved.nativeCrop,{left:512,top:288,width:5120,height:2880});
  close(approved.captureFrame.width/approved.nativeFrame.width,approved.overscan,'horizontal native crop');
  close(approved.captureFrame.height/approved.nativeFrame.height,approved.overscan,'vertical native crop');
  validateStagedCenter(pack);
  const sourceCenter=pack.captureQuality.sourceCenter;
  for(const [key,value]of Object.entries({width:6144,height:3456,samples:256,overscan:1.2}))assert.equal(sourceCenter?.[key],value,`source center ${key}`);
  for(const record of [pack.views[0].radianceCapture,pack.detail.views.find(view=>view.id==='center')]){
    assert.equal(record.sourceWidth,6144);assert.equal(record.sourceHeight,3456);
    assert.equal(record.runtimeDetailWidth,5120);assert.equal(record.runtimeDetailHeight,2880);
  }
  const settings={...sceneDefaults({},pack),sensor:'full',crop:'native',yaw:0,pitch:0,roll:0};
  close(settings.focal,approved.referenceFocal,'load/reset preserve approved fractional focal');
  const owner=Object.assign(Object.create(PlateRenderer.prototype),{
    plateMode:true,ready:true,pack,canvas:{width:1600,height:900},camera:new PerspectiveCamera(50,approved.aspect,pack.camera.near,pack.camera.far),
    anchorRotation:new Quaternion().setFromRotationMatrix(new Matrix4().fromArray(pack.views[0].cameraMatrix)),
    plateUniforms:{viewShift:{value:new Vector2()},rayToCapture:{value:new Matrix4()},tanHalfFov:{value:new Vector2()}},
    ensureDetail(){},applyDetailView(){},
  });
  for(const view of pack.views){
    // Correct layer registration alone is insufficient: the projection must
    // really contain wider photographed rays, not a relabelled/cropped plate.
    close(view.projectionMatrix[0],2*pack.captureLens/rig.sensorWidth,'capture horizontal FOV');
    close(view.projectionMatrix[5],2*pack.captureLens/rig.sensorWidth*approved.aspect,'capture vertical FOV');
    close(view.projectionMatrix[8],0,'reviewed unshifted horizontal projection');close(view.projectionMatrix[9],0,'reviewed unshifted vertical projection');
    owner.entry=view;owner.captureMatrix=new Matrix4().fromArray(view.matrix);owner.geometry(settings);
    for(const [x,y]of [[0,0],[0,1],[1,0],[1,1],[.5,.5]]){
      const uv=owner.uvAt(x,y);
      close(uv.x,.5+(x-.5)/approved.overscan,'approved native horizontal ray');
      close(uv.y,.5+(y-.5)/approved.overscan,'approved native vertical ray');
      close(uv.depthScale,1,'native axial depth');
    }
  }
  return {referenceFocal:settings.focal,nativeFrame:approved.nativeFrame,realOverscan:approved.overscan,views:pack.views.length};
}

export function validateApprovedPreviewReport(report,rig,{viewId='center'}={}){
  const approved=rig.approvedComposition;
  assert.equal(report.status,'complete');assert.equal(report.sourceSha256,approved.preview.sourceSha256);
  close(report.captureLens,rig.lens,'approved capture is revised native lens');
  close(report.camera.sensorWidth,rig.sensorWidth,'approved capture sensor');
  close(report.camera.aspect,approved.aspect,'approved capture aspect');
  for(const [i,row]of rig.matrix.entries())for(const [j,value]of row.entries())close(report.camera.matrix[i][j],value,'approved unchanged camera pose');
  const center=report.views.find(view=>view.id===viewId);assert.ok(center,'independently pinned approved capture view');
  assert.equal(center.projectionMatrix?.length,16);assert.equal(center.cameraMatrix?.length,16);
  const expectedPose=new Matrix4().makeRotationX(-Math.PI/2).multiply(new Matrix4().set(...rig.matrix.flat())).toArray();
  expectedPose.forEach((value,index)=>close(center.cameraMatrix[index],value,'actual approved capture pose'));
  assert.equal(center.offset?.length,3);assert.equal(center.position?.length,3);
  center.offset.forEach(value=>close(value,0,'approved center offset'));
  center.position.forEach((value,index)=>close(value,expectedPose[12+index],'actual approved center position'));
  close(report.camera.near,rig.near,'approved camera near');close(report.camera.far,rig.far,'approved camera far');
  const expectedProjection=new PerspectiveCamera(2*Math.atan(rig.sensorWidth/approved.aspect/(2*rig.lens))*180/Math.PI,approved.aspect,rig.near,rig.far).projectionMatrix;
  expectedProjection.toArray().forEach((value,index)=>close(center.projectionMatrix[index],value,'complete approved perspective projection'));
  assert.equal(center.matrix?.length,16);
  expectedProjection.clone().multiply(new Matrix4().fromArray(expectedPose).invert()).toArray().forEach((value,index)=>close(center.matrix[index],value,'actual approved world projection'));
  close(center.projectionMatrix[0],2*rig.lens/rig.sensorWidth,'approved full horizontal view');
  close(center.projectionMatrix[5],2*rig.lens/rig.sensorWidth*approved.aspect,'approved full vertical view');
  close(center.projectionMatrix[8],0,'approved unshifted horizontal projection');
  close(center.projectionMatrix[9],0,'approved unshifted vertical projection');
  close(center.near,rig.near,'approved near clipping');
  assert.deepEqual([center.width,center.height],[approved.preview.width,approved.preview.height]);
}
