import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {detailRegion} from '../src/detail-region.js';
import {Renderer} from '../src/renderer.js';

const near=(actual,expected,message='')=>assert.ok(Math.abs(actual-expected)<1e-8,`${message}: ${actual} != ${expected}`);
const origin=region=>({
  x:(region.centerX-region.spanX+1)*region.fullWidth/2,
  y:(1-region.centerY-region.spanY)*region.fullHeight/2,
});

test('detail crops remain inside their full frame and include their complete output at every edge',()=>{
  for(const [width,height]of [[1392,583],[310,130],[360,640],[1,1]]){
    for(const dpr of [1,1.25,2,3])for(const x of [-.1,0,.17,.5,1,1.1])for(const y of [-.1,0,.31,.5,1,1.1]){
      const r=detailRegion(width,height,x,y,198,148,2.5,dpr),o=origin(r);
      assert.ok(r.width>0&&r.height>0);
      assert.ok(o.x>=-1e-8&&o.y>=-1e-8);
      assert.ok(o.x+r.width<=r.fullWidth+1e-8&&o.y+r.height<=r.fullHeight+1e-8);
      assert.ok(r.readX>=0&&r.readX+r.outputWidth<=r.width);
      assert.ok(r.readY>=0&&r.readY+r.outputHeight<=r.height);
      const expectedLeft=Math.max(0,Math.min(r.fullWidth-r.outputWidth,Math.round(x*r.fullWidth-r.outputWidth/2)));
      const expectedTop=Math.max(0,Math.min(r.fullHeight-r.outputHeight,Math.round(y*r.fullHeight-r.outputHeight/2)));
      near(o.x+r.readX,expectedLeft,'left edge');
      near(o.y+r.height-r.readY-r.outputHeight,expectedTop,'top edge after WebGL row flip');
      const halo=Math.ceil(r.fullWidth*.08)+2;
      near(r.readX,Math.min(halo,expectedLeft),'left halo');
      near(r.width-r.readX-r.outputWidth,Math.min(halo,r.fullWidth-expectedLeft-r.outputWidth),'right halo');
      near(r.height-r.readY-r.outputHeight,Math.min(halo,expectedTop),'top halo');
      near(r.readY,Math.min(halo,r.fullHeight-expectedTop-r.outputHeight),'bottom halo');
    }
  }
});

test('detail output follows native panel size and bounded display density',()=>{
  const desktop=detailRegion(1392,583,.5,.5,198,148,2.5,2);
  assert.equal(desktop.outputWidth,396);assert.equal(desktop.outputHeight,296);
  const phone=detailRegion(310,130,.5,.5,128,96,2.5,3);
  assert.equal(phone.outputWidth,256);assert.equal(phone.outputHeight,192);
  near(desktop.fullWidth,1392*2.5*2);
  // The output covers 1/zoom of its own CSS width, independent of DPR.
  for(const dpr of [1,2]){
    const r=detailRegion(1000,500,.5,.5,200,150,2.5,dpr);
    near(r.outputWidth/r.fullWidth*1000,80);
    near(r.outputHeight/r.fullHeight*500,60);
  }
  assert.ok(desktop.width*desktop.height<desktop.fullWidth*desktop.fullHeight/8);
});

test('cropped camera projection and all shared plate rays agree for shifted cameras',()=>{
  for(const [width,height]of [[1392,583],[360,640]])for(const [x,y]of [[0,0],[.23,.61],[.5,.5],[1,1]]){
    const region=detailRegion(width,height,x,y,198,148,2.5,2);
    const camera=new T.PerspectiveCamera(46,width/height,1.1,100);
    camera.position.set(2,3,4);camera.rotation.set(.07,-.2,.03);camera.updateMatrixWorld(true);
    camera.projectionMatrix.elements[8]=.13;camera.projectionMatrix.elements[9]=-.21;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const original=camera.projectionMatrix.clone(),vertical=Math.tan(camera.fov*Math.PI/360);
    const baseTan=new T.Vector2(vertical*camera.aspect,vertical),baseShift=new T.Vector2(.13,-.21);
    const owner={camera,detailView:region,filmWidth:36,plateMode:true,
      plateUniforms:{tanHalfFov:{value:baseTan.clone()},viewShift:{value:baseShift.clone()}}};
    Renderer.prototype.applyDetailView.call(owner);
    assert.deepEqual(owner.detailFullCamera.projectionMatrix.toArray(),original.toArray());
    assert.equal(owner.camera.aspect,width/height);
    near(owner.filmWidth,36*region.spanX,'cropped sensor width');
    const identity=owner.camera.projectionMatrix.clone().multiply(owner.camera.projectionMatrixInverse);
    identity.elements.forEach((v,i)=>near(v,i%5===0?1:0,'inverse projection'));
    for(const localX of [-1,-.2,1])for(const localY of [-1,.37,1]){
      const fullX=localX*region.spanX+region.centerX,fullY=localY*region.spanY+region.centerY;
      const ray=new T.Vector3((fullX+baseShift.x)*baseTan.x,(fullY+baseShift.y)*baseTan.y,-1);
      const projected=ray.clone().multiplyScalar(5).applyMatrix4(camera.matrixWorld).project(camera);
      near(projected.x,localX,'live geometry x');near(projected.y,localY,'live geometry y');
      const p=owner.plateUniforms;
      near((localX+p.viewShift.value.x)*p.tanHalfFov.value.x,ray.x,'plate ray x');
      near((localY+p.viewShift.value.y)*p.tanHalfFov.value.y,ray.y,'plate ray y');
    }
    // The crop's CoC scale is identical to a full high-resolution frame.
    near(region.width/owner.filmWidth,region.fullWidth/36,'physical lens pixel scale');
  }
});
