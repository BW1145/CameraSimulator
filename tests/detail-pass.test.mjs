import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {DetailPass} from '../src/detail-pass.js';
import {AsyncReadback} from '../src/async-readback.js';

function setup(fail=false){
  const sceneTarget={width:640,height:480},originalIntegrator={},originalOptics={},originalStats={calls:42};
  const originalTexture=new T.Texture(),view=new T.Vector4(2,3,640,480),scissor=new T.Vector4(4,5,600,450);
  const gl={target:null,viewport:view.clone(),scissor:scissor.clone(),scissorTest:false,autoClear:true,clearColor:new T.Color(.1,.2,.3),clearAlpha:1,
    getRenderTarget(){return this.target;},setRenderTarget(target){this.target=target;},
    getViewport(destination){return destination.copy(this.viewport);},setViewport(value){this.viewport.copy(value);},
    getScissor(destination){return destination.copy(this.scissor);},setScissor(value){this.scissor.copy(value);},
    getScissorTest(){return this.scissorTest;},setScissorTest(value){this.scissorTest=value;},
    getClearColor(destination){return destination.copy(this.clearColor);},getClearAlpha(){return this.clearAlpha;},
    setClearColor(value,alpha){this.clearColor.set(value);if(alpha!==undefined)this.clearAlpha=alpha;},setClearAlpha(value){this.clearAlpha=value;},
    async readRenderTargetPixelsAsync(target,x,y,w,h,bytes){assert.equal(target,pass.output);assert.deepEqual([x,y,w,h],[1,1,2,2]);bytes.set([1,2,3,255,4,5,6,255,7,8,9,255,10,11,12,255]);return bytes;},
  };
  const makeTarget=()=>({width:1,height:1,texture:new T.Texture(),setSize(w,h){this.width=w;this.height=h;}});
  const pass={readback:new AsyncReadback(),target:makeTarget(),output:makeTarget(),integrator:{},optics:{}};
  const owner={renderer:gl,target:sceneTarget,integrator:originalIntegrator,plateOptics:originalOptics,frameStats:originalStats,
    uniforms:{resolution:{value:new T.Vector2(640,480)},plate:{value:originalTexture},focus:{value:3},sensorWidth:{value:36},lensRadiusLimit:{value:51.2}},
    flashLight:{intensity:12},plateUniforms:{flashStrength:{value:.8}},
    canvas:{width:640,height:480,dataset:{temporalSamples:'7',temporalWeight:'1.0',temporalRegion:'old'}},
    geometry(settings){this.restoredGeometry=settings;},fan:{setQuality(camera,w,h){this.restoredQuality=[camera,w,h];}},camera:{},
    updateMotion(settings,exposure,time){this.restoredMotion=[settings,exposure,time];},
    draw(settings,exposure,time,analyse,target){
      assert.equal(this.target,pass.target);assert.equal(this.integrator,pass.integrator);assert.equal(this.plateOptics,pass.optics);
      assert.equal(analyse,false);assert.equal(target,pass.output);assert.deepEqual(this.uniforms.resolution.value.toArray(),[4,4]);
      this.uniforms.focus.value=10;this.uniforms.sensorWidth.value=5;this.uniforms.lensRadiusLimit.value=200;
      this.canvas.dataset.temporalSamples='24';this.canvas.dataset.temporalWeight='new';this.canvas.dataset.temporalRegion='detail';
      this.frameStats={calls:99};gl.target=target;gl.viewport.set(0,0,4,4);gl.scissor.set(1,1,2,2);gl.scissorTest=true;
      gl.autoClear=false;gl.setClearColor(new T.Color(.9,.8,.7),.5);this.flashLight.intensity=0;this.plateUniforms.flashStrength.value=0;
      if(fail)throw Error('Synthetic read/render failure');
    },
  };
  const region={width:4,height:4,readX:1,readY:1,outputWidth:2,outputHeight:2};
  const destination={width:1,height:1,getContext(){return {createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(image){destination.image=image;}};}};
  return {owner,pass,region,destination,gl,originalTexture,sceneTarget,originalIntegrator,originalOptics,originalStats,view,scissor};
}

for(const fail of [false,true])test(`detail pass restores main render bindings ${fail?'after a rendering failure':'after successful readback'}`,async()=>{
  const t=setup(fail),settings={focus:3},exposure={shutter:1/125},time=7.5;
  const render=()=>DetailPass.prototype.render.call(t.pass,t.owner,settings,exposure,time,t.region,t.destination);
  if(fail)assert.throws(render,/Synthetic/);else render();
  assert.equal(t.owner.target,t.sceneTarget);assert.equal(t.owner.integrator,t.originalIntegrator);assert.equal(t.owner.plateOptics,t.originalOptics);
  assert.equal(t.owner.frameStats,t.originalStats);assert.equal(t.owner.uniforms.plate.value,t.originalTexture);
  assert.deepEqual(t.owner.uniforms.resolution.value.toArray(),[640,480]);
  assert.equal(t.owner.uniforms.focus.value,3);assert.equal(t.owner.uniforms.sensorWidth.value,36);assert.equal(t.owner.uniforms.lensRadiusLimit.value,51.2);
  assert.equal(t.owner.detailView,null);assert.equal(t.owner.restoredGeometry,settings);
  assert.deepEqual(t.owner.fan.restoredQuality,[t.owner.camera,640,480]);assert.deepEqual(t.owner.restoredMotion,[settings,exposure,time]);
  assert.deepEqual(t.owner.canvas.dataset,{temporalSamples:'7',temporalWeight:'1.0',temporalRegion:'old'});
  assert.deepEqual([t.owner.canvas.width,t.owner.canvas.height],[640,480]);
  assert.equal(t.gl.getRenderTarget(),null);assert.deepEqual(t.gl.viewport.toArray(),t.view.toArray());assert.deepEqual(t.gl.scissor.toArray(),t.scissor.toArray());assert.equal(t.gl.scissorTest,false);
  assert.equal(t.gl.autoClear,true);assert.deepEqual(t.gl.clearColor.toArray(),[.1,.2,.3]);assert.equal(t.gl.clearAlpha,1);
  assert.equal(t.owner.flashLight.intensity,12);assert.equal(t.owner.plateUniforms.flashStrength.value,.8);
  // Main bindings are already restored while the GPU fence is still pending.
  assert.equal(t.destination.image,undefined);
  if(!fail)await t.pass.readback.pending.promise;
  if(!fail)assert.deepEqual(Array.from(t.destination.image.data),[7,8,9,255,10,11,12,255,1,2,3,255,4,5,6,255]);
});

test('detail readback has backpressure and discards an obsolete hover/frame after immediate state restore',async()=>{
  const t=setup();let resolve,current=true,writes=0;
  t.gl.readRenderTargetPixelsAsync=(target,x,y,w,h,bytes)=>new Promise(done=>{resolve=()=>done(bytes);});
  const context=t.destination.getContext;t.destination.getContext=()=>({...context(),putImageData(){writes++;}});
  const render=()=>DetailPass.prototype.render.call(t.pass,t.owner,{}, {shutter:1/125},0,t.region,t.destination,{isCurrent:()=>current});
  assert.equal(render(),true);const done=t.pass.readback.pending.promise;
  assert.equal(t.owner.target,t.sceneTarget);assert.equal(t.gl.getRenderTarget(),null);
  assert.equal(render(),false);current=false;resolve();await done;
  assert.equal(writes,0);assert.equal(t.pass.readback.available,true);
});

test('detail commit metadata retains the actual rendered color/depth source across delayed promotion',async()=>{
  const t=setup();let resolve,metadata;
  t.owner.plate={image:{image:{width:2560}},width:2560};
  t.gl.readRenderTargetPixelsAsync=(target,x,y,w,h,bytes)=>new Promise(done=>{resolve=()=>done(bytes);});
  DetailPass.prototype.render.call(t.pass,t.owner,{}, {shutter:1/125},0,t.region,t.destination,{onCommit:value=>metadata=value});
  const done=t.pass.readback.pending.promise;
  t.owner.plate.image.image.width=5120;t.owner.plate.width=5120;
  resolve();await done;
  assert.deepEqual(metadata,{sourceWidth:2560,sourceDepthWidth:2560});
});
