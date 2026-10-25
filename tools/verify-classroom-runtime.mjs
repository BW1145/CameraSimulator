// Real delivered metadata/depth + existing renderer math, without a browser or
// WebGL context. This does NOT replace visual, UI, lazy-fetch or download tests.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import readExif from 'exif-reader';
import * as T from 'three';
import {DERIVED_VIEWPOINTS,sceneDefaults} from '../src/scenes.js';
import {DEFAULTS,resolveExposure,ev100} from '../src/camera.js';
import {MONK_VIEWPOINT_IDS} from './monk-public-manifest.mjs';
import {auditMonkRuntimeFocus} from './monk-runtime-focus-audit.mjs';
import {PlateRenderer} from '../src/plate-renderer.js';
import {photoSnapshot,assertCaptureLayers} from '../src/photo-snapshot.js';
import {addPhotoMetadata} from '../src/photo-metadata.js';

const results=[];
const near=(actual,expected,message,tolerance=2e-5)=>assert.ok(Math.abs(actual-expected)<tolerance,`${message}: ${actual} != ${expected}`);
for(const definition of DERIVED_VIEWPOINTS){
  const root=`public/${definition.platePack}/`,pack=JSON.parse(await readFile(root+'manifest.json','utf8'));
  const scene={...definition,...sceneDefaults(definition,pack)};
  const settings={...DEFAULTS,...sceneDefaults(scene,pack),crop:'native',aperture:8,shutter:.25,iso:100,autoISO:false,flash:1};
  const exposure=resolveExposure(settings,scene.baseEV),cameraEV=ev100(exposure.aperture,exposure.shutter,exposure.iso);near(cameraEV,8,'initial camera EV');near(scene.baseEV-cameraEV,0,'initial source exposure');
  const owner=Object.assign(Object.create(PlateRenderer.prototype),{
    plateMode:true,ready:true,pack,scene,exposureOffset:0,sourceView:false,
    camera:new T.PerspectiveCamera(50,pack.camera.aspect,pack.camera.near,pack.camera.far),
    anchorRotation:new T.Quaternion().setFromRotationMatrix(new T.Matrix4().fromArray(pack.views[0].cameraMatrix)),
    canvas:{width:1600,height:900,dataset:{}},world:new T.Scene(),flashLight:new T.PointLight(),ballGroup:{visible:false},raycaster:new T.Raycaster(),
    target:{width:1600,height:900,depthTexture:null},
    uniforms:{sceneDepth:{value:null},linearDepth:{value:false},radianceScale:{value:1}},
    plateUniforms:{rayToCapture:{value:new T.Matrix4()},tanHalfFov:{value:new T.Vector2()},viewShift:{value:new T.Vector2()},flashStrength:{value:0}},
    // Only GPU/lazy loading boundaries are absent; geometry, focus, fixed-energy
    // flash normalization and immutable capture metadata run their real code.
    ensureDetail(){},ensureFlash(){},applyDetailView(){},updateMotion(){},integrator:{render(){}},
  });
  let focusChecks=0,flashChecks=0;
  for(const entry of pack.views){
    owner.entry=entry;owner.captureMatrix=new T.Matrix4().fromArray(entry.matrix);owner.camera.near=entry.near;
    for(const [file,width,height]of [[entry.depth,entry.depthWidth,entry.depthHeight],[entry.detailDepth,entry.detailDepthWidth,entry.detailDepthHeight]]){
      const depth=await sharp(root+file).ensureAlpha().raw().toBuffer();
      owner.plate={pixels:depth,width,height,flash:{},image:{image:{width:entry.detailWidth,height:entry.detailHeight}}};
      owner.geometry(settings);assert.deepEqual(owner.camera.position.toArray(),entry.position);
      near(owner.camera.near,pack.camera.near,'source near');near(owner.camera.far,pack.camera.far,'source far');
      for(const [x,y]of [[.5,.5],[.3,.7],[.7,.3]]){
        // For the initial native source composition, capture UV has exactly the
        // documented 20% overscan. Check against independently sampled RG depth.
        const u=.5+(x-.5)/1.2,v=.5+(y-.5)/1.2,uv=owner.uvAt(x,y);
        near(uv.x,u,'source horizontal projection');near(uv.y,v,'source vertical projection');near(uv.depthScale,1,'axial-Z scale');
        const col=Math.floor(u*width),row=Math.floor((1-v)*height),values=[];
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const i=((row+dy)*width+col+dx)*4;values.push((depth[i]*256+depth[i+1])/65535*64);}
        const hit=owner.hitAt(x,y);assert.ok(hit.z>=Math.min(...values)-.02&&hit.z<=Math.max(...values)+.02,`${scene.id}/${entry.id}: real depth autofocus`);
        focusChecks++;
      }
    }
    for(const shutter of [1/8000,.25,30]){
      owner.renderPlate(settings,{...exposure,shutter},0);const amount=owner.plateUniforms.flashStrength.value;
      near(amount*shutter,.01,'fixed flash pulse energy');near(owner.uniforms.radianceScale.value,1/(1+amount),'pre-HalfFloat normalization');
      assert.ok(amount*owner.uniforms.radianceScale.value<=1,'short-flash intermediate bounded');
      near(owner.flashLight.intensity*shutter,1000/Math.PI*.01,'matching live-subject flash');
      owner.flashLight.position.toArray().forEach((n,i)=>near(n,entry.position[i],'flash source origin'));flashChecks++;
    }
  }
  owner.entry=pack.views[0];owner.captureMatrix=new T.Matrix4().fromArray(owner.entry.matrix);owner.geometry(settings);
  const subjectFocus=[];
  if(pack.id==='classroom-desk'&&pack.approvedComposition){
    // Approved native JPEG coordinate, measured on the blue cover, NOT the
    // closer pen/table foreground. Pointer events invert top-down image Y.
    for(const [file,width,height]of [[owner.entry.depth,owner.entry.depthWidth,owner.entry.depthHeight],[owner.entry.detailDepth,owner.entry.detailDepthWidth,owner.entry.detailDepthHeight]]){
      owner.plate.pixels=await sharp(root+file).ensureAlpha().raw().toBuffer();owner.plate.width=width;owner.plate.height=height;
      const nativeXY=[770/1280,480/720],hit=owner.hitAt(nativeXY[0],1-nativeXY[1]);
      near(settings.focus,hit.z,'default focus targets actual blue-cover center, not retired foreground ROI',.025);
      subjectFocus.push({subject:'approved blue-cover center',nativeXY1280:[770,480],depthFile:file,actualCameraZ:hit.z,defaultFocus:settings.focus});
    }
  }
  if(pack.id.startsWith('kitchen-')||pack.id==='apartment-armchair'){
    const samples=pack.defaultsEvidence.focus.samples;
    assert.ok(samples&&Object.keys(samples).length>=2,'formal opaque teaching-subject depth samples');
    for(const [file,width,height]of [[owner.entry.depth,owner.entry.depthWidth,owner.entry.depthHeight],[owner.entry.detailDepth,owner.entry.detailDepthWidth,owner.entry.detailDepthHeight]]){
      owner.plate.pixels=await sharp(root+file).ensureAlpha().raw().toBuffer();owner.plate.width=width;owner.plate.height=height;
      for(const [subject,sample]of Object.entries(samples)){
        const [x,y]=sample.nativeNormalized,hit=owner.hitAt(x,1-y);
        near(hit.z,sample.z,'actual delivered Z agrees with the reviewed formal subject sample',.025);
        if(pack.id==='apartment-armchair'&&subject==='pillow-center')near(settings.focus,hit.z,'default focus targets the actual gray armchair pillow',.025);
        subjectFocus.push({subject,nativeNormalized:sample.nativeNormalized,depthFile:file,actualCameraZ:hit.z,formalCameraZ:sample.z,defaultFocus:settings.focus});
      }
    }
  }
  if(MONK_VIEWPOINT_IDS.includes(pack.id))subjectFocus.push(...(await auditMonkRuntimeFocus(root,pack)).samples);
  owner.plate.image.image={width:owner.entry.detailWidth,height:owner.entry.detailHeight};
  assertCaptureLayers(owner,settings);
  const snapshot=photoSnapshot({settings,resolved:exposure,scene,renderer:owner,width:12,height:8,simulationTime:0,focusPoint:{x:.5,y:.5}});
  // Tiny neutral in-memory carriers test serialization only; no image fixture is
  // installed or represented as a captured browser photograph.
  for(const format of ['jpeg','png']){
    const carrier=await sharp({create:{width:12,height:8,channels:3,background:'#808080'}})[format]().toBuffer();
    const encoded=Buffer.from(await addPhotoMetadata(carrier,format,snapshot,12,8));
    const photo=readExif((await sharp(encoded).metadata()).exif).Photo,comment=JSON.parse(photo.UserComment.subarray(8).toString('ascii'));
    near(photo.SubjectDistance,scene.focus,'export focus');near(photo.FocalLength,pack.referenceFocal,'export focal');near(photo.ExposureTime,.25,'export shutter');
    assert.deepEqual(comment.scene,{id:scene.id,name:scene.name});assert.equal(comment.source.sourceSha256,pack.sourceSha256);assert.equal(comment.source.viewId,'center');assert.equal(comment.source.flashLayerLoaded,true);
  }
  results.push({scene:scene.id,realViews:pack.views.length,focusChecks,subjectFocus,flashChecks,metadataContainers:['jpeg','png']});
}
console.log(JSON.stringify({scope:'Actual delivered metadata/depth and real renderer math only; no WebGL drawing, UI, network race, lazy-load or browser-photo acceptance.',results},null,2));
