// Real delivered depth through the existing renderer's native rays and hitAt.
// No WebGL/browser: this supplements, never replaces, final browser acceptance.
import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';
import * as T from 'three';
import {PlateRenderer} from '../src/plate-renderer.js';
import {sceneDefaults} from '../src/scenes.js';
import {nativeProbePixelCenter} from './native-probe-pixel.mjs';
import {DEFAULTS,resolveExposure,ev100} from '../src/camera.js';
const close=(a,b,label,tolerance=2e-5)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
export async function auditMonkRuntimeFocus(directory,pack){
  const settings={...DEFAULTS,...sceneDefaults({},pack),sensor:'full',crop:'native',aperture:8,shutter:.25,iso:100,autoISO:false,yaw:0,pitch:0,roll:0};
  const exposure=resolveExposure(settings,8);close(ev100(exposure.aperture,exposure.shutter,exposure.iso),8,'native physical EV, independent of creative -1.5 display');
  const owner=Object.assign(Object.create(PlateRenderer.prototype),{plateMode:true,pack,ready:true,canvas:{width:1600,height:900},entry:pack.views[0],
    camera:new T.PerspectiveCamera(50,pack.camera.aspect,pack.camera.near,pack.camera.far),
    anchorRotation:new T.Quaternion().setFromRotationMatrix(new T.Matrix4().fromArray(pack.views[0].cameraMatrix)),
    captureMatrix:new T.Matrix4().fromArray(pack.views[0].matrix),raycaster:new T.Raycaster(),ballGroup:{visible:false},
    plateUniforms:{viewShift:{value:new T.Vector2()},rayToCapture:{value:new T.Matrix4()},tanHalfFov:{value:new T.Vector2()}},ensureDetail(){},applyDetailView(){}});
  owner.geometry(settings);const center=pack.views[0],samples=pack.defaultsEvidence.focus.samples,results=[];
  assert.ok(samples&&Object.keys(samples).length>0,'actual formal subject probes');
  for(const [file,width,height]of [[center.depth,center.depthWidth,center.depthHeight],[center.detailDepth,center.detailDepthWidth,center.detailDepthHeight]]){
    const decoded=await sharp(path.join(directory,file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual([decoded.info.width,decoded.info.height],[width,height]);
    owner.plate={pixels:decoded.data,width,height};
    for(const [name,sample]of Object.entries(samples)){
      const probe=nativeProbePixelCenter(sample.nativeNormalized,width,height);
      const [x,y]=probe.nativeNormalized,uv=owner.uvAt(x,1-y),hit=owner.hitAt(x,1-y);
      assert.deepEqual([Math.floor(uv.x*width),Math.floor((1-uv.y)*height)],probe.pixel,'actual native ray selects the formally nearest texel at its center');
      close(uv.x,.5+(x-.5)/1.2,'native subject horizontal overscan');close(uv.y,.5+(1-y-.5)/1.2,'native subject vertical overscan');close(uv.depthScale,1,'native axial depth');
      assert.ok(hit,'actual opaque source surface');close(hit.z,sample.z,`${pack.id}/${name}: runtime hitAt agrees with formal source Z`,.025);
      results.push({name,depthFile:file,nativeNormalized:sample.nativeNormalized,verificationNativeNormalized:probe.nativeNormalized,verificationPixel:probe.pixel,formalCameraZ:sample.z,actualCameraZ:hit.z,defaultFocus:settings.focus});
    }
  }
  return {id:pack.id,status:'pass',scope:'actual PNG/native-ray/hitAt only; not browser, drawn DOF, UI or color acceptance',physicalEV:8,defaultFocus:settings.focus,displayExposure:pack.displayTransform.exposure,samples:results};
}
