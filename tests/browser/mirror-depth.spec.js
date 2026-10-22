import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {openControl,setRange,setRanges,waitFrame} from './controls.js';

test('photographic mirror depth changes focus and blur without changing surface occlusion',async({page})=>{
  const manifest=JSON.parse(await readFile('public/scenes/barbershop-plates/manifest.json','utf8'));
  const view=manifest.views[0];delete view.detailFile;delete manifest.subjects;view.opticalDepth='fixture-optics.png';
  const depth=async(z,mirror=false)=>{const n=Math.round(z/64*65535),pixels=Buffer.alloc(64*32*3);for(let i=0;i<64*32;i++){pixels[i*3]=n>>8;pixels[i*3+1]=n&255;pixels[i*3+2]=mirror&&i%64>=16?255:0;}return sharp(pixels,{raw:{width:64,height:32,channels:3}}).png().toBuffer();};
  const image=Buffer.alloc(64*32*3);for(let y=0;y<32;y++)for(let x=0;x<64;x++){const i=(y*64+x)*3;image[i]=x<32?160:64;image[i+1]=image[i+2]=64;}
  const color=await sharp(image,{raw:{width:64,height:32,channels:3}}).webp({lossless:true}).toBuffer(),physical=await depth(1.5),optical=await depth(8,true),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/barbershop-plates/manifest.json',r=>r.fulfill({json:manifest}));
  await page.route('**/barbershop-plates/center.webp',r=>r.fulfill({contentType:'image/webp',body:color}));
  await page.route('**/barbershop-plates/center-depth.png',r=>r.fulfill({contentType:'image/png',body:physical}));
  await page.route('**/fixture-optics.png',r=>r.fulfill({contentType:'image/png',body:optical}));
  await page.setViewportSize({width:800,height:700});await page.goto('/?subject=none');await waitFrame(page);
  await setRange(page,'focal',120);await setRanges(page,{aperture:0,shutter:3,iso:4});
  const canvas=page.locator('#image'),box=await canvas.boundingBox();await canvas.click({position:{x:box.width/2,y:box.height/2}});await waitFrame(page);
  expect(Number(await canvas.getAttribute('data-focus'))).toBeCloseTo(8,1);
  const edge=async()=>{await page.mouse.move(0,0);const {data,info}=await sharp(await canvas.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});let maximum=0;for(let x=1;x<info.width;x++){const i=(Math.floor(info.height/2)*info.width+x)*3;maximum=Math.max(maximum,Math.abs(data[i]-data[i-3]));}return maximum;};
  const focused=await edge();await setRange(page,'focus',1.5);expect(focused).toBeGreaterThan((await edge())*1.5);
  // The practice ball is between the physical mirror and its virtual image.
  // It must remain occluded, including click focus, by the physical surface.
  await openControl(page,'pause');await page.locator('#pause').check();await page.locator('#motion').check();await waitFrame(page);
  await canvas.click({position:{x:box.width/2,y:box.height/2}});await waitFrame(page);
  expect(Number(await canvas.getAttribute('data-focus'))).toBeCloseTo(8,1);expect(errors).toEqual([]);
  await setRange(page,'focal',20);await canvas.click({position:{x:box.width*.02,y:box.height/2}});await waitFrame(page);
  expect(Number(await canvas.getAttribute('data-focus'))).toBeCloseTo(1.5,1);
});
