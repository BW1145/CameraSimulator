import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {DepthOfFieldEffect} from 'postprocessing';
import {circleOfConfusion} from '../src/camera.js';
import {LibraryDof,physicalCocChannels,physicalCocFragment} from '../src/library-dof.js';
import {Renderer} from '../src/renderer.js';
import {detailRegion} from '../src/detail-region.js';
import {TemporalIntegrator} from '../src/temporal-integrator.js';

function setup(){
  const u=Object.fromEntries(Object.entries({sceneDepth:new T.Texture(),linearDepth:false,nearClip:.03,farClip:150,
    focus:3,focal:50,aperture:1.4,sensorWidth:36,lensRadiusLimit:51.2,resolution:new T.Vector2(640,480)}).map(([key,value])=>[key,new T.Uniform(value)]));
  const renderer={outputColorSpace:T.LinearSRGBColorSpace,toneMapping:T.NoToneMapping,capabilities:{logarithmicDepthBuffer:false},
    autoClear:false,target:{name:'caller'},viewport:new T.Vector4(1,2,300,200),scissor:new T.Vector4(3,4,100,80),scissorTest:true,renders:[],
    getRenderTarget(){return this.target;},setRenderTarget(value){this.target=value;},
    getViewport(value){return value.copy(this.viewport);},setViewport(value){this.viewport.copy(value);},
    getScissor(value){return value.copy(this.scissor);},setScissor(value){this.scissor.copy(value);},
    getScissorTest(){return this.scissorTest;},setScissorTest(value){this.scissorTest=value;},
    render(scene){this.renders.push({material:scene.children[0].material,target:this.target,autoClear:this.autoClear,scissor:this.scissorTest});},
  };
  const owner={renderer,uniforms:u,camera:new T.PerspectiveCamera(50,4/3,.03,150)};
  return {owner,renderer,u};
}

test('physical CoC matches the existing thin lens across all controls and distances',()=>{
  for(const width of [320,1280,2048])for(const sensorWidth of [23.5,36])for(const aperture of [1.4,5.6,22])
    for(const focal of [18.8,50,200])for(const focus of [.3,3,65])for(const depth of [.05,.3,1.5,3,25,150]){
      const radiusLimit=width*.08;
      const actual=physicalCocChannels(depth,{width,sensorWidth,aperture,focal,focus,radiusLimit});
      const expected=Math.min(radiusLimit,circleOfConfusion(depth,focus,focal,aperture,sensorWidth)*width*.5);
      assert.ok(Math.abs(actual.radius-expected)<1e-9);
      assert.equal(actual.near>0,depth<focus);assert.equal(actual.far>0,depth>focus);
      assert.ok(Math.abs((actual.near+actual.far)*radiusLimit-expected)<1e-9);
    }
});

test('the physical CoC has no invented focus band and scales with resolution and sensor crop',()=>{
  const settings={width:640,focus:3,focal:50,aperture:1.4};
  assert.equal(physicalCocChannels(3,settings).radius,0);
  assert.ok(physicalCocChannels(3.001,settings).far>0);
  const near=physicalCocChannels(2,settings),far=physicalCocChannels(6,settings);
  assert.ok(Math.abs(near.radius-far.radius)<1e-10);
  assert.equal(physicalCocChannels(6,{...settings,width:1280}).radius,far.radius*2);
  assert.ok(physicalCocChannels(6,{...settings,sensorWidth:23.5}).radius>far.radius);
});

test('only the public CoC material changes; the package owns its actual blur and composite',()=>{
  const {owner,u}=setup(),adapter=new LibraryDof(owner),vanilla=new DepthOfFieldEffect(owner.camera);
  assert.equal(adapter.effect.update,DepthOfFieldEffect.prototype.update);
  assert.equal(adapter.effect.getFragmentShader(),vanilla.getFragmentShader());
  assert.equal(adapter.effect.cocMaterial.fragmentShader,physicalCocFragment);
  assert.equal(adapter.effect.cocMaterial.uniforms.physicalDepth,u.sceneDepth);
  assert.equal(adapter.effect.cocMaterial.uniforms.axialDepth,u.linearDepth);
  assert.equal(adapter.effect.cocMaterial.uniforms.opticalFocus,u.focus);
  assert.equal(adapter.output.texture.type,T.HalfFloatType);
  assert.equal(adapter.pass.fullscreenMaterial.encodeOutput,false);
  assert.equal(adapter.pass.fullscreenMaterial.toneMapped,false);
  adapter.dispose();vanilla.dispose();
});

for(const failure of [false,true])test(`library render restores caller state ${failure?'after failure':'after success'}`,()=>{
  const {owner,renderer,u}=setup(),adapter=new LibraryDof(owner);
  const saved={target:renderer.target,viewport:renderer.viewport.clone(),scissor:renderer.scissor.clone()};
  if(failure)renderer.render=()=>{renderer.viewport.set(0,0,1,1);throw Error('synthetic GPU failure');};
  const input=new T.WebGLRenderTarget(640,480,{type:T.HalfFloatType});
  const run=()=>adapter.render(owner,input);
  if(failure)assert.throws(run,/synthetic/);else{
    assert.equal(run(),adapter.output.texture);assert.ok(renderer.renders.length>8);
    assert.ok(renderer.renders.every(r=>r.autoClear&&!r.scissor));
    assert.equal(adapter.effect.bokehScale,51.2);
    assert.equal(adapter.effect.cocMaterial.uniforms.opticalImageWidth.value,640);
    assert.equal(adapter.pass.getDepthTexture(),u.sceneDepth.value);
    // A reflected metric depth can replace a hardware depth map next frame.
    u.sceneDepth.value=new T.Texture();u.linearDepth.value=true;u.focus.value=12;
    u.resolution.value.set(120,80);u.lensRadiusLimit.value=100;
    input.setSize(120,80);run();
    assert.equal(adapter.output.width,120);assert.equal(adapter.output.height,80);
    assert.equal(adapter.effect.cocMaterial.uniforms.axialDepth.value,true);
    assert.equal(adapter.effect.cocMaterial.uniforms.physicalDepth.value,u.sceneDepth.value);
    assert.equal(adapter.effect.cocMaterial.uniforms.opticalFocus.value,12);
    assert.equal(adapter.effect.cocMaterial.uniforms.opticalImageWidth.value,120);
    assert.equal(adapter.effect.bokehScale,100);
  }
  assert.equal(renderer.target,saved.target);assert.deepEqual(renderer.viewport,saved.viewport);assert.deepEqual(renderer.scissor,saved.scissor);
  assert.equal(renderer.autoClear,false);assert.equal(renderer.scissorTest,true);
  adapter.dispose();input.dispose();
});

test('display-encoded input is rejected rather than silently tone mapped twice',()=>{
  const {owner,renderer}=setup(),adapter=new LibraryDof(owner);
  renderer.outputColorSpace=T.SRGBColorSpace;
  assert.throws(()=>adapter.render(owner,{width:2,height:2}),/linear HDR/);
  renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.toneMapping=T.AgXToneMapping;
  assert.throws(()=>adapter.render(owner,{width:2,height:2}),/linear HDR/);
  adapter.dispose();
});

test('owned library resources are disposed exactly once without disposing source textures',()=>{
  const {owner,u}=setup(),adapter=new LibraryDof(owner);let outputs=0,materials=0,inputs=0;
  adapter.output.addEventListener('dispose',()=>outputs++);
  adapter.effect.cocMaterial.addEventListener('dispose',()=>materials++);
  u.sceneDepth.value.addEventListener('dispose',()=>inputs++);
  adapter.dispose();adapter.dispose();
  assert.equal(outputs,1);assert.equal(materials,1);assert.equal(inputs,0);
  assert.throws(()=>adapter.render(owner,{}),/disposed/);
});

test('trial padding covers both package blur passes and filtering without changing default detail crops',()=>{
  const {owner}=setup(),adapter=new LibraryDof(owner);
  for(const radius of [.1,40,163.84])assert.equal(adapter.supportRadius(radius),Math.ceil(2*radius)+16);
  const ordinary=detailRegion(640,360,.5,.5,240,160),trial=detailRegion(640,360,.5,.5,240,160,2.5,1,adapter.kernelSupport);
  assert.equal(ordinary.width,240+2*(Math.ceil(1600*.08)+2));
  assert.equal(trial.width,240+2*adapter.supportRadius(1600*.08));
  assert.ok(trial.width>ordinary.width);assert.equal(trial.fullWidth,ordinary.fullWidth);
  adapter.dispose();
});

test('ordinary draws blur before display exactly once and never feed previous lens output back in',()=>{
  const owner=setup().owner;
  owner.ready=true;owner.target={texture:new T.Texture(),width:640,height:480};owner.canvas={dataset:{}};
  owner.scene={baseEV:8};owner.exposureOffset=0;owner.filmWidth=36;owner.geometry=()=>{};owner.postScene={};owner.postCamera={};
  for(const key of ['plate','skipLens','lensOnly','exposure','iso','wb','time','zebra','agx','pixelOrigin'])owner.uniforms[key]=new T.Uniform(key==='pixelOrigin'?new T.Vector2():null);
  const output=new T.Texture(),calls=[];
  owner.libraryDof={render(actual,input){assert.equal(actual,owner);assert.equal(input.texture,owner.target.texture);calls.push(input);return output;}};
  owner.renderPlate=()=>{};owner.renderer.render=()=>{assert.equal(owner.uniforms.plate.value,output);assert.equal(owner.uniforms.skipLens.value,true);};
  const settings={focus:3,focal:50,wb:5000,zebra:false},exposure={aperture:1.4,ev:8,iso:100};
  Renderer.prototype.draw.call(owner,settings,exposure,0);
  Renderer.prototype.draw.call(owner,settings,exposure,1);
  assert.equal(calls.length,2);
  owner.renderPlate=()=>{owner.uniforms.plate.value=output;owner.uniforms.skipLens.value=true;};
  Renderer.prototype.draw.call(owner,settings,exposure,2);
  assert.equal(calls.length,2,'temporally pre-blurred radiance is not blurred again');
});

test('every shutter sample and endpoint flash pulse uses the library before accumulation, then restores the phase',()=>{
  const {owner,renderer}=setup(),calls=[];
  owner.target=new T.WebGLRenderTarget(640,480);owner.canvas={dataset:{}};owner.camera={};owner.world={updateMatrixWorld(){}};
  owner.uniforms.plate=new T.Uniform(owner.target.texture);owner.uniforms.lensOnly=new T.Uniform(false);owner.uniforms.skipLens=new T.Uniform(false);
  owner.uniforms.lensRadiusLimit.value=10;
  owner.fan={time:0,setTime(value){this.time=value;},bounds(){return {x:100,y:100,width:60,height:80};}};
  owner.flashLight={intensity:12};owner.plateUniforms={flashStrength:new T.Uniform(2)};
  const lensTexture=new T.Texture();
  owner.libraryDof={supportRadius:radius=>2*radius+16,render(actual,input){assert.equal(actual,owner);assert.equal(input,owner.target);calls.push({time:owner.fan.time,flash:owner.flashLight.intensity,room:owner.plateUniforms.flashStrength.value});return lensTexture;}};
  renderer.info={render:{calls:1,triangles:2},memory:{textures:3}};
  renderer.render=()=>{};
  renderer.getClearColor=destination=>destination.set(.1,.2,.3);renderer.getClearAlpha=()=>1;
  renderer.setClearColor=()=>{};renderer.clear=()=>{};
  // TemporalIntegrator's public bind methods use both Vector4 and scalar args.
  renderer.setScissor=function(...args){if(args[0]?.isVector4)this.scissor.copy(args[0]);else this.scissor.set(...args);};
  const integrator=new TemporalIntegrator(),samples=[{time:9.6,weight:.25},{time:9.8,weight:.75}];
  integrator.render(owner,samples,10,true);
  assert.deepEqual(calls,[{time:10,flash:0,room:0},{time:9.6,flash:0,room:0},{time:9.8,flash:0,room:0},{time:10,flash:0,room:0},{time:10,flash:12,room:2}]);
  assert.equal(owner.uniforms.plate.value,integrator.target.texture);assert.equal(owner.uniforms.skipLens.value,true);
  assert.equal(owner.fan.time,10);assert.equal(owner.flashLight.intensity,12);assert.equal(owner.plateUniforms.flashStrength.value,2);
  assert.equal(owner.canvas.dataset.temporalWeight,'1.000000000000');
  assert.deepEqual(JSON.parse(owner.canvas.dataset.temporalRegion),{x:64,y:64,width:132,height:152});
  integrator.dispose();owner.target.dispose();
});
