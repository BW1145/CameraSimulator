import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {waitFrame} from './controls.js';

test('shared source irradiance keeps independent material UV channels',async({page})=>{
  const positions=new Float32Array([-.6,-.6,0,.6,-.6,0,.6,.6,0,-.6,-.6,0,.6,.6,0,-.6,.6,0]),uv0=new Float32Array(12),uv1=new Float32Array(12);
  for(let i=0;i<12;i+=2){uv0[i]=.25;uv1[i]=.75;uv0[i+1]=uv1[i+1]=.5;}
  const bytes=Buffer.concat([Buffer.from(positions.buffer),Buffer.from(uv0.buffer),Buffer.from(uv1.buffer)]);
  const white=await sharp({create:{width:1,height:1,channels:3,background:'white'}}).png().toBuffer();
  const room={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1,2]}],nodes:[{camera:0,name:'Camera'},{mesh:0,translation:[-.8,0,-4]},{mesh:1,translation:[.8,0,-4]}],cameras:[{name:'Camera',type:'perspective',perspective:{yfov:1,znear:.03,zfar:150}}],
    meshes:[0,1].map(material=>({primitives:[{attributes:{POSITION:0,TEXCOORD_0:1,TEXCOORD_1:2},material}]})),materials:[0,1].map(texCoord=>({doubleSided:true,extras:{bakedDiffuse:'fixture.hdr',bakedDiffuseUV:texCoord},pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:1,baseColorTexture:{index:0,texCoord}}})),
    textures:[{source:0}],images:[{uri:'data:image/png;base64,'+white.toString('base64')}],buffers:[{byteLength:bytes.length,uri:'data:application/octet-stream;base64,'+bytes.toString('base64')}],bufferViews:[{buffer:0,byteLength:72},{buffer:0,byteOffset:72,byteLength:48},{buffer:0,byteOffset:120,byteLength:48}],accessors:[{bufferView:0,componentType:5126,count:6,type:'VEC3',min:[-.6,-.6,0],max:[.6,.6,0]},{bufferView:1,componentType:5126,count:6,type:'VEC2'},{bufferView:2,componentType:5126,count:6,type:'VEC2'}]};
  const hdr=Buffer.concat([Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 2\n'),Buffer.from([128,0,0,129,0,0,128,129])]),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/scenes/barbershop/scene.glb',r=>r.fulfill({json:room}));await page.route('**/fixture.hdr',r=>r.fulfill({body:hdr}));
  await page.setViewportSize({width:800,height:700});await page.goto('/?renderer=gltf');await waitFrame(page);await page.mouse.move(0,0);
  const {data,info}=await sharp(await page.locator('#image').screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});let redLeft=0,blueRight=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*3;if(x<info.width/2&&data[i]>data[i+2]*1.5&&data[i]>50)redLeft++;if(x>info.width/2&&data[i+2]>data[i]*1.5&&data[i+2]>50)blueRight++;}
  expect(redLeft).toBeGreaterThan(100);expect(blueRight).toBeGreaterThan(100);expect(errors).toEqual([]);
});
