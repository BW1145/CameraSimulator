import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PlateRenderer} from '../src/plate-renderer.js';

const encoding=max=>({type:'log2-rgb',min:-16,max});
const codes=[247,160,32,255,0,128,255,255];
const legacyIds=['left','right','up','down','front','back'];

function fixture(t){
  // Only image transport and the browser's 2D pixel readback are faked. The
  // renderer's selection, promotion, encoding precedence and HDR decoding run.
  const documentDescriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(name){
    assert.equal(name,'canvas');let source;
    return {width:0,height:0,getContext(){return {
      drawImage(image){source=image;},
      getImageData(){return {data:source.pixels};},
    };}};
  }}});
  t.after(()=>{
    if(documentDescriptor)Object.defineProperty(globalThis,'document',documentDescriptor);
    else delete globalThis.document;
  });
  const requests=[];
  t.mock.method(T.TextureLoader.prototype,'loadAsync',async function(url){
    requests.push(url);const width=url.includes('-detail')?4:2;
    const texture=new T.Texture(),pixels=new Uint8ClampedArray(width*4);
    for(let i=0;i<pixels.length;i++)pixels[i]=codes[i%codes.length];
    texture.image={width,height:1,pixels};return texture;
  });
  const owner=Object.assign(Object.create(PlateRenderer.prototype),{
    cache:new Map(),subjectEnvironments:new Map(),subjectViewLights:new Map(),
    subjectFallbackLights:[],pendingLayers:0,moveVersion:0,packBase:'/room/',
    canvas:{width:2,dataset:{}},world:new T.Scene(),camera:{},filmWidth:36,
    renderer:{capabilities:{getMaxAnisotropy:()=>8,maxTextureSize:4096}},
    uniforms:{nearClip:{value:0}},
    plateUniforms:Object.fromEntries(['near','image','depth','flashImage','flashStrength'].map(key=>[key,{value:null}])),
    pack:{camera:{near:1},referenceFocal:50,encoding:encoding(6),detail:{encoding:encoding(7)},flash:{encoding:encoding(5)},
      views:['center',...legacyIds].map(id=>({
        id,matrix:new T.Matrix4().toArray(),position:[1,2,3],
        file:`${id}.webp`,depth:`${id}-depth.png`,detailFile:`${id}-detail.webp`,detailWidth:4,
        flash:`${id}-flash.webp`,
        ...(id==='center'?{encoding:encoding(9),detailEncoding:encoding(8)}:{}),
      })),
    },
    trimDecodedCache(){},
  });
  t.after(async()=>{
    owner.releaseSubjectLighting();
    for(const task of owner.cache.values()){
      const resource=await task;resource.image.dispose();resource.depth.dispose();resource.flash?.dispose();
    }
  });
  return {owner,requests};
}

function assertDecoded(texture,range){
  assert.equal(texture.type,T.HalfFloatType);
  const pixels=texture.image.data;
  for(let i=0;i<pixels.length;i++){
    const expected=i%4===3?1:2**(range.min+codes[i%codes.length]/255*(range.max-range.min));
    const actual=T.DataUtils.fromHalfFloat(pixels[i]);
    assert.ok(Math.abs(actual/expected-1)<.001,`channel ${i}: ${actual} should decode as ${expected}`);
  }
}

test('base plates use their own encoding and restore the shared range for every legacy view',async t=>{
  const {owner,requests}=fixture(t);
  await owner.selectPosition('center');assertDecoded(owner.plate.image,encoding(9));
  const center=owner.plate;
  for(const id of legacyIds){
    await owner.selectPosition(id);assertDecoded(owner.plate.image,owner.pack.encoding);
    assert.equal(owner.plateUniforms.image.value,owner.plate.image);
    await owner.selectPosition('center');assert.equal(owner.plate,center);
    assertDecoded(owner.plate.image,encoding(9));
  }
  assert.ok(requests.every(url=>!url.includes('-detail')&&!url.includes('-flash')));
  assert.equal(owner.canvas.dataset.pendingLayers,'0');
});

test('detail promotion decodes the brighter center override without changing six legacy detail ranges',async t=>{
  const {owner,requests}=fixture(t),settings={focal:50};
  await owner.selectPosition('center');
  assert.ok(requests.every(url=>!url.includes('-detail')));
  await owner.ensureDetail(settings,100);assertDecoded(owner.plate.image,encoding(8));
  // Kitchen's 147.6191 source peak becomes code 247 in its -16...8 range.
  // Decoding with the legacy detail max=7 would halve this highlight instead.
  const peak=T.DataUtils.fromHalfFloat(owner.plate.image.image.data[0]);
  assert.ok(peak>128&&peak<256);
  assert.ok(Math.abs(Math.log2(peak/147.61911010742188))<24/510+.001);
  const center=owner.plate;
  for(const id of legacyIds){
    await owner.selectPosition(id);await owner.ensureDetail(settings,100);
    assertDecoded(owner.plate.image,owner.pack.detail.encoding);
    await owner.selectPosition('center');assert.equal(owner.plate,center);
    assertDecoded(owner.plate.image,encoding(8));
  }
  assert.equal(requests.filter(url=>url==='/room/center-detail.webp').length,1);
  assert.equal(owner.plateUniforms.image.value,center.image);
  assert.equal(owner.plateUniforms.flashImage.value,center.image);
  assert.equal(owner.canvas.dataset.detailWidth,'4');
  assert.equal(owner.canvas.dataset.pendingLayers,'0');
});

test('detail falls back to the pack base range only when no view or shared detail range exists',async t=>{
  const {owner}=fixture(t);delete owner.pack.detail;
  await owner.selectPosition('center');await owner.ensureDetail({focal:50},100);
  assertDecoded(owner.plate.image,encoding(8));
  await owner.selectPosition('left');await owner.ensureDetail({focal:50},100);
  assertDecoded(owner.plate.image,owner.pack.encoding);
});

test('flash decoding remains independent of center base and detail encoding overrides',async t=>{
  const {owner}=fixture(t);
  await owner.selectPosition('center');await owner.ensureDetail({focal:50},100);
  owner.ensureFlash();await owner.plate.flashTask;
  assertDecoded(owner.plate.image,encoding(8));assertDecoded(owner.plate.flash,owner.pack.flash.encoding);
  assert.equal(owner.plateUniforms.flashImage.value,owner.plate.flash);
  delete owner.pack.flash;
  await owner.selectPosition('left');owner.ensureFlash();await owner.plate.flashTask;
  assertDecoded(owner.plate.flash,owner.pack.encoding);
  assert.equal(owner.canvas.dataset.pendingLayers,'0');
});
