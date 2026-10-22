import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {waitFrame} from './controls.js';

test('click focus follows the visible surface through alpha-cutout geometry',async({page})=>{
  const positions=new Float32Array([-2,-2,0,2,-2,0,2,2,0,-2,-2,0,2,2,0,-2,2,0]),uv=new Float32Array([0,0,1,0,1,1,0,0,1,1,0,1]);
  const bytes=Buffer.concat([Buffer.from(positions.buffer),Buffer.from(uv.buffer)]);
  const mask=await sharp(Buffer.from([255,255,255,0,255,255,255,255]),{raw:{width:2,height:1,channels:4}}).png().toBuffer();
  const room={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1,2]}],nodes:[{camera:0,name:'Camera'},{mesh:0,translation:[0,0,-3]},{mesh:1,translation:[0,0,-6],scale:[3,3,1]}],cameras:[{name:'Camera',type:'perspective',perspective:{yfov:1,znear:.03,zfar:150}}],
    meshes:[0,1].map(material=>({primitives:[{attributes:{POSITION:0,TEXCOORD_0:1},material}]})),materials:[{doubleSided:true,alphaMode:'MASK',alphaCutoff:.5,pbrMetallicRoughness:{baseColorFactor:[1,0,0,1],baseColorTexture:{index:0}},extensions:{KHR_materials_unlit:{}}},{doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[0,0,1,1]},extensions:{KHR_materials_unlit:{}}}],extensionsUsed:['KHR_materials_unlit'],textures:[{source:0,sampler:0}],samplers:[{magFilter:9728,minFilter:9728}],images:[{uri:'data:image/png;base64,'+mask.toString('base64')}],buffers:[{byteLength:bytes.length,uri:'data:application/octet-stream;base64,'+bytes.toString('base64')}],bufferViews:[{buffer:0,byteLength:72},{buffer:0,byteOffset:72,byteLength:48}],accessors:[{bufferView:0,componentType:5126,count:6,type:'VEC3',min:[-2,-2,0],max:[2,2,0]},{bufferView:1,componentType:5126,count:6,type:'VEC2'}]};
  await page.route('**/scenes/barbershop/scene.glb',r=>r.fulfill({json:room}));
  await page.setViewportSize({width:800,height:700});await page.goto('/?renderer=gltf');await waitFrame(page);
  const canvas=page.locator('#image'),box=await canvas.boundingBox();
  await canvas.click({position:{x:box.width*.35,y:box.height*.5}});await waitFrame(page);expect(Number(await canvas.getAttribute('data-focus'))).toBeCloseTo(4.75,1);
  await canvas.click({position:{x:box.width*.65,y:box.height*.5}});await waitFrame(page);expect(Number(await canvas.getAttribute('data-focus'))).toBeCloseTo(1.75,1);
});
