import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {PlateRenderer} from '../src/plate-renderer.js';

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function target(){return {texture:new T.Texture(),disposed:0,dispose(){this.disposed++;}};}
function setup(){
  const owner=Object.assign(Object.create(PlateRenderer.prototype),{
    cache:new Map(),subjectEnvironments:new Map(),subjectViewLights:new Map(),subjectFallbackLights:[],
    pendingLayers:0,moveVersion:0,packBase:'/room/',canvas:{dataset:{}},world:new T.Scene(),camera:{},
    uniforms:{nearClip:{value:0}},plateUniforms:Object.fromEntries(['near','image','depth','flashImage','flashStrength'].map(key=>[key,{value:null}])),
    pack:{camera:{near:1},views:['center','left','right','up','down','front','back'].map(id=>({id,matrix:new T.Matrix4().toArray(),position:[1,2,3]}))},
    subjectConfig:{environment:'legacy.hdr',viewLighting:{center:{environment:'refined.hdr',areaLights:[{radiance:1.193662}]}}},
    trimDecodedCache(){},
  });
  owner.subjectViewLights.set('center',Object.assign(new T.Group(),{visible:false}));
  owner.seedPlate=id=>{
    const image=new T.Texture();image.image={width:128,height:64};
    const plate={image,depth:new T.Texture(),width:128,height:64};
    owner.cache.set('/room/'+id,Promise.resolve(plate));return plate;
  };
  return owner;
}

test('view-only fill and refined HDR switch atomically and every legacy view restores the default rig',async()=>{
  const owner=setup(),legacy=target(),refined=target(),pending=deferred(),requested=[];
  const originalKey=new T.RectAreaLight(0xffffff,40,.5,.5);owner.world.add(originalKey);
  owner.createSubjectEnvironment=async url=>{requested.push(url);return url.endsWith('refined.hdr')?pending.promise:legacy;};
  owner.seedPlate('left');await owner.selectPosition('left');
  const oldPlate=owner.plate;
  owner.seedPlate('center');const selecting=owner.selectPosition('center');
  await Promise.resolve();
  assert.equal(owner.plate,oldPlate);assert.equal(owner.world.environment,legacy.texture);
  assert.equal(owner.subjectViewLights.get('center').visible,false);
  pending.resolve(refined);await selecting;
  assert.equal(owner.entry.id,'center');assert.equal(owner.world.environment,refined.texture);
  assert.equal(owner.subjectViewLights.get('center').visible,true);
  for(const id of ['left','right','up','down','front','back']){
    owner.seedPlate(id);await owner.selectPosition(id);
    assert.equal(owner.entry.id,id);assert.equal(owner.world.environment,legacy.texture);
    assert.equal(owner.subjectViewLights.get('center').visible,false);
    assert.equal(originalKey.intensity,40);assert.equal(originalKey.parent,owner.world);
  }
  assert.deepEqual(requested,['/room/legacy.hdr','/room/refined.hdr']);
  assert.equal(owner.world.environmentRotation.y,Math.PI/2);
  owner.releaseSubjectLighting();assert.equal(legacy.disposed,1);assert.equal(refined.disposed,1);
  assert.equal(owner.world.environment,null);assert.equal(owner.canvas.dataset.pendingLayers,'0');
});

test('a late environment cannot replace a newer position',async()=>{
  const owner=setup(),pending=deferred(),legacy=target(),refined=target();
  owner.createSubjectEnvironment=async url=>url.endsWith('refined.hdr')?pending.promise:legacy;
  owner.seedPlate('center');const center=owner.selectPosition('center');
  owner.seedPlate('right');await owner.selectPosition('right');
  pending.resolve(refined);await center;
  assert.equal(owner.entry.id,'right');assert.equal(owner.world.environment,legacy.texture);
  assert.equal(owner.subjectViewLights.get('center').visible,false);
  owner.seedPlate('center');await owner.selectPosition('center');
  assert.equal(owner.world.environment,refined.texture);
  owner.releaseSubjectLighting();assert.equal(refined.disposed,1);
});

test('scene changes dispose late targets without touching the new scene',async()=>{
  const owner=setup(),pending=deferred(),oldTarget=target(),newEnvironment=new T.Texture();
  owner.createSubjectEnvironment=()=>pending.promise;
  owner.seedPlate('center');const selecting=owner.selectPosition('center');
  ++owner.moveVersion;owner.releaseSubjectLighting();owner.world=new T.Scene();owner.world.environment=newEnvironment;
  pending.resolve(oldTarget);await selecting;
  assert.equal(oldTarget.disposed,1);assert.equal(owner.world.environment,newEnvironment);
  assert.equal(owner.entry,undefined);assert.equal(owner.subjectEnvironments.size,0);
});

test('environment requests deduplicate, release cached targets once, and allow retry after failure',async()=>{
  const owner=setup(),pending=deferred(),environment=target();let calls=0;
  owner.createSubjectEnvironment=()=>{calls++;return calls===1?pending.promise:Promise.resolve(environment);};
  const first=owner.loadSubjectEnvironment('legacy.hdr');
  assert.equal(owner.loadSubjectEnvironment('legacy.hdr'),first);assert.equal(calls,1);
  pending.reject(Error('Synthetic download failure'));await assert.rejects(first,/Synthetic/);
  assert.equal(owner.subjectEnvironments.size,0);
  assert.equal(await owner.loadSubjectEnvironment('legacy.hdr'),environment);assert.equal(calls,2);
  owner.releaseLighting();owner.releaseLighting();assert.equal(environment.disposed,1);
  assert.equal(owner.canvas.dataset.pendingLayers,'0');
});

test('failed view lighting leaves the current plate and rig together',async()=>{
  const owner=setup(),legacy=target();
  owner.createSubjectEnvironment=async url=>{if(url.endsWith('refined.hdr'))throw Error('Missing HDR');return legacy;};
  owner.seedPlate('left');await owner.selectPosition('left');const plate=owner.plate;
  owner.seedPlate('center');await assert.rejects(owner.selectPosition('center'),/Missing HDR/);
  assert.equal(owner.plate,plate);assert.equal(owner.entry.id,'left');assert.equal(owner.world.environment,legacy.texture);
  assert.equal(owner.subjectViewLights.get('center').visible,false);
  owner.releaseSubjectLighting();
});

test('missing overrides use default lighting and no-HDR subjects retain their fallback lights',async()=>{
  const owner=setup(),legacy=target(),light=new T.DirectionalLight(0xffffff,3);
  owner.subjectFallbackLights=[{light,intensity:3}];
  delete owner.subjectConfig.viewLighting;owner.createSubjectEnvironment=async()=>legacy;
  owner.seedPlate('center');await owner.selectPosition('center');assert.equal(owner.world.environment,legacy.texture);assert.equal(light.intensity,0);
  delete owner.subjectConfig.environment;owner.seedPlate('left');await owner.selectPosition('left');
  assert.equal(owner.world.environment,null);assert.equal(light.intensity,3);
  owner.releaseSubjectLighting();
});

for(const fail of [false,true])test(`HDR and temporary PMREM generator are disposed ${fail?'on conversion failure':'after conversion'}`,async t=>{
  const owner=setup(),hdr=new T.Texture(),environment=target();let hdrDisposals=0,generatorDisposals=0;
  hdr.addEventListener('dispose',()=>hdrDisposals++);
  t.mock.method(HDRLoader.prototype,'loadAsync',async()=>hdr);
  t.mock.method(T.PMREMGenerator.prototype,'fromEquirectangular',function(texture){assert.equal(texture.mapping,T.EquirectangularReflectionMapping);if(fail)throw Error('Conversion failed');return environment;});
  t.mock.method(T.PMREMGenerator.prototype,'dispose',()=>generatorDisposals++);
  const result=owner.loadSubjectEnvironment('legacy.hdr');
  if(fail)await assert.rejects(result,/Conversion failed/);else assert.equal(await result,environment);
  assert.equal(hdrDisposals,1);assert.equal(generatorDisposals,1);
  owner.releaseSubjectLighting();assert.equal(environment.disposed,fail?0:1);
});

test('an HDR arriving after scene release is disposed before any PMREM conversion',async t=>{
  const owner=setup(),pending=deferred(),hdr=new T.Texture();let disposed=0,converted=0;
  hdr.addEventListener('dispose',()=>disposed++);
  t.mock.method(HDRLoader.prototype,'loadAsync',()=>pending.promise);
  t.mock.method(T.PMREMGenerator.prototype,'fromEquirectangular',()=>{converted++;return target();});
  const request=owner.loadSubjectEnvironment('legacy.hdr');owner.releaseSubjectLighting();pending.resolve(hdr);
  assert.equal(await request,null);assert.equal(disposed,1);assert.equal(converted,0);
});
