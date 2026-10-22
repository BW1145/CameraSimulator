import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {openControl} from './controls.js';

test('tabletop reflection and shadow affect the receiving surface while preserving the room',async({page})=>{
  const frames=[],errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
  for(const enabled of [false,true]){
    const subjects=JSON.parse(await readFile('public/scenes/barbershop-plates/subjects.json','utf8'));subjects[0].tabletopLighting=enabled;
    await page.route('**/subjects.json',r=>r.fulfill({json:subjects}));await page.goto('/');
    await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
    if(enabled)await expect(page.locator('#image')).toHaveAttribute('data-reflections','1');
    await page.mouse.move(0,0);frames.push(await sharp(await page.locator('#image').screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true}));
    await page.unroute('**/subjects.json');
  }
  const [a,b]=frames;let changed=0,outside=0;
  for(let y=0;y<a.info.height;y++)for(let x=0;x<a.info.width;x++){
    const i=(y*a.info.width+x)*3,d=Math.abs(b.data[i]-a.data[i])+Math.abs(b.data[i+1]-a.data[i+1])+Math.abs(b.data[i+2]-a.data[i+2]);
    if(d>9){changed++;if(x>a.info.width*.4||y<a.info.height*.5)outside++;}
  }
  expect(changed).toBeGreaterThan(50);expect(outside).toBe(0);expect(errors).toEqual([]);
});

test('planar mirror shows a subject behind the camera and follows actual camera translation',async({page})=>{
  const positions=new Float32Array([-3,-3,0,3,-3,0,3,3,0,-3,-3,0,3,3,0,-3,3,0]);
  const room={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1,2]}],nodes:[{camera:0,name:'Camera'},{mesh:0,translation:[0,0,-5]},{mesh:1,translation:[0,0,1],scale:[.12,.12,1]}],cameras:[{name:'Camera',type:'perspective',perspective:{yfov:1,znear:.03,zfar:150}}],
    meshes:[{primitives:[{attributes:{POSITION:0},material:0}]},{primitives:[{attributes:{POSITION:0},material:1}]}],materials:[{name:'mirror',pbrMetallicRoughness:{metallicFactor:1,roughnessFactor:0}},{doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[1,0,0,1]},extensions:{KHR_materials_unlit:{}}}],extensionsUsed:['KHR_materials_unlit'],
    buffers:[{byteLength:positions.byteLength,uri:'data:application/octet-stream;base64,'+Buffer.from(positions.buffer).toString('base64')}],bufferViews:[{buffer:0,byteLength:positions.byteLength}],accessors:[{bufferView:0,componentType:5126,count:6,type:'VEC3',min:[-3,-3,0],max:[3,3,0]}]};
  await page.route('**/scenes/barbershop/scene.glb',r=>r.fulfill({json:room}));
  await page.setViewportSize({width:800,height:700});await page.goto('/?renderer=gltf');const canvas=page.locator('#image');
  await expect(canvas).toHaveAttribute('data-ready','true');await expect(canvas).toHaveAttribute('data-reflections','1');
  const centroid=async()=>{
    await page.mouse.move(0,0);const {data,info}=await sharp(await canvas.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});let sum=0,count=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*3;if(data[i]>50&&data[i]>data[i+1]*2&&data[i]>data[i+2]*2){sum+=x;count++;}}
    expect(count).toBeGreaterThan(50);return sum/count;
  };
  const before=await centroid();await openControl(page,'x');await page.locator('#x').fill('0.5');await page.locator('#x').dispatchEvent('input');await expect(canvas).toHaveAttribute('data-ready','true');
  expect(before-await centroid()).toBeGreaterThan(10);
});
