import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createDeskFan} from '../src/desk-fan.js';

// Geometry/material construction does not require a WebGL context. A tiny
// canvas stand-in supplies deterministic finish/contact texture containers.
const canvas=()=>({width:0,height:0,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})});
const originalDocument=globalThis.document;
function make(config={}){
  globalThis.document={createElement:canvas};
  try{return createDeskFan({position:[3.8,.8165531,-6.95],rotationsPerSecond:4,...config},new T.Vector3(2.9678,1.5455,-9.9551));}
  finally{globalThis.document=originalDocument;}
}
function destroy(fan){const geometry=new Set(),material=new Set(),texture=new Set();fan.group.traverse(o=>{if(!o.isMesh)return;geometry.add(o.geometry);material.add(o.material);for(const v of Object.values(o.material))if(v?.isTexture)texture.add(v);});for(const r of [...geometry,...material,...texture])r.dispose();}

test('vintage live fan has finite closed blade geometry, black dielectric enamel, and no original image assets',()=>{
  const fan=make();let meshes=0,blades=0;
  fan.group.traverse(o=>{
    if(!o.isMesh)return;meshes++;
    for(const key of ['position','normal']){const attribute=o.geometry.attributes[key];if(attribute)assert.ok(Array.from(attribute.array).every(Number.isFinite));}
    assert.ok(o.material.color);
    if(o.parent===fan.rotor&&o.geometry.type==='BufferGeometry'){
      blades++;assert.equal(o.geometry.index.count,3*(20*16*2*2+2*(20+16)*2));
      assert.equal(o.material.metalness,.92);
    }
    if(o.geometry.type==='LatheGeometry'){assert.equal(o.material.metalness,.04);assert.ok(o.material.color.r<.02);}
    for(const v of Object.values(o.material))if(v?.isTexture)assert.ok(v.isCanvasTexture);
  });
  assert.equal(blades,3);assert.ok(meshes>40);
  assert.equal(fan.period,1/12);fan.setTime(1/24);assert.ok(Math.abs(fan.rotor.rotation.z-Math.PI/3)<1e-12);
  destroy(fan);
});

test('explicit photographic placement preserves baseline-transform ablation and expands motion bounds',()=>{
  const old=make(),large=make({headScale:1.6,headHeight:.5,headTilt:-.15,yawOffset:.1});
  assert.equal(old.head.position.y,.435);assert.equal(old.head.rotation.x,-.09);assert.equal(old.head.scale.x,1);
  assert.equal(large.head.position.y,.5);assert.equal(large.head.scale.x,1.6);
  const camera=new T.PerspectiveCamera(40,2048/858,1.1,100);camera.position.set(2.9678,1.5455,-9.9551);camera.lookAt(old.center());camera.updateMatrixWorld();
  const a=old.bounds(camera,2048,858),b=large.bounds(camera,2048,858);assert.ok(b.width>a.width*1.4);assert.ok(b.height>a.height*1.4);
  old.setQuality(camera,2048,858);large.setQuality(camera,2048,858);
  destroy(old);destroy(large);
});

test('configured enlarged head stays above its tabletop support plane',async()=>{
  const {readFile}=await import('node:fs/promises');
  const config=JSON.parse(await readFile(new URL('../public/scenes/barbershop-plates/subjects.json',import.meta.url),'utf8')).find(s=>s.type==='desk-fan');
  const fan=make(config);fan.group.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(fan.head);
  assert.ok(box.min.y>config.position[1]+.025,`Head/table clearance ${box.min.y-config.position[1]} m`);
  assert.equal(config.rotationsPerSecond,4);destroy(fan);
});
