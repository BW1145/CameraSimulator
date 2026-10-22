import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {openControl,motionSample,waitForMotion} from './controls.js';
import {focusRoom} from './focus-room.js';
const waitFrame=async page=>{await expect(page.locator('#image')).toHaveAttribute('data-ready','true');await page.waitForTimeout(180);};
const range=async(page,id,value)=>{await openControl(page,id);await page.locator('#'+id).fill(String(value));await page.locator('#'+id).dispatchEvent('input');await waitFrame(page);};
const stats=async page=>{
  await page.mouse.move(0,0);
  const b=await page.locator('#image').screenshot();const {data,info}=await sharp(b).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let brightness=0,edge=0;for(let i=0;i<data.length;i+=3){brightness+=(data[i]+data[i+1]+data[i+2])/3;if(i>=info.width*3)edge+=Math.abs(data[i]-data[i-info.width*3]);}
  return {brightness:brightness/(data.length/3),edge:edge/(data.length/3),buffer:b};
};
test('four complete scenes load on demand, without browser errors',async({page})=>{
  const errors=[],models=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(r.url().endsWith('scene.glb'))models.push(r.url());});
  await page.goto('/?renderer=gltf');await waitFrame(page);expect(models).toHaveLength(1);
  await expect(page.locator('#more details[open]')).toHaveCount(0);
  for(const id of ['barbershop','classroom','kitchen','apartment']){
    await page.locator('#scene').selectOption(id);await expect(page.locator('#image')).toHaveAttribute('data-scene',id);await waitFrame(page);
    expect(Number(await page.locator('#image').getAttribute('data-triangles'))).toBeGreaterThan(100000);
    const image=await stats(page);expect(image.brightness).toBeGreaterThan(15);expect(image.brightness).toBeLessThan(245);
    await page.screenshot({path:`test-results/${id}.png`,fullPage:true});
  }
  expect(errors).toEqual([]);
});
test('exposure, white balance, focus blur, real dolly and focal length alter the frame',async({page})=>{
  await page.goto('/?renderer=gltf');await waitFrame(page);await page.locator('#scene').selectOption('kitchen');await expect(page.locator('#image')).toHaveAttribute('data-scene','kitchen');await waitFrame(page);
  await page.locator('#autoISO').uncheck();
  await range(page,'shutter',6);await range(page,'iso',2);
  await range(page,'aperture',3);const base=await stats(page);
  await range(page,'iso',4);expect((await stats(page)).brightness).toBeGreaterThan(base.brightness*1.15);
  await range(page,'iso',2);await range(page,'wb',8000);const warm=await stats(page);expect(warm.buffer.equals(base.buffer)).toBe(false);
  await range(page,'wb',5000);await range(page,'aperture',0);await range(page,'focus',5);const focused=await stats(page);
  await range(page,'focus',.2);const blurred=await stats(page);expect(blurred.edge).toBeLessThan(focused.edge*.9);
  await range(page,'focus',5);await range(page,'aperture',4);
  const box=await page.locator('#image').boundingBox();await page.locator('#image').click({position:{x:box.width/2,y:box.height/2}});await waitFrame(page);
  const before=Number(await page.locator('#image').getAttribute('data-focus'));
  await range(page,'z',.5);await page.locator('#image').click({position:{x:box.width/2,y:box.height/2}});await waitFrame(page);
  const after=Number(await page.locator('#image').getAttribute('data-focus'));expect(before-after).toBeCloseTo(.5,1);
  const dolly=await stats(page);await range(page,'focal',70);expect((await stats(page)).buffer.equals(dolly.buffer)).toBe(false);
});
test('auto exposure compensation, assist overlays, portrait and capture work',async({page})=>{
  await page.goto('/?renderer=gltf');await waitFrame(page);await page.locator('#mode').selectOption('A');await waitFrame(page);
  const base=await stats(page);await range(page,'compensation',3);expect((await stats(page)).brightness).toBeGreaterThan(base.brightness*1.1);
  for(const id of ['grid-toggle','level-toggle','histogram-toggle','zebra']){await openControl(page,id);await page.locator('#'+id).check();}
  await waitFrame(page);await expect(page.locator('#grid')).toBeVisible();await expect(page.locator('#histogram-view')).toBeVisible();
  await openControl(page,'crop');await page.locator('#crop').selectOption('2:3');await waitFrame(page);
  const box=await page.locator('#image').boundingBox();expect(box.height).toBeGreaterThan(box.width);
  const download=page.waitForEvent('download');await page.locator('#capture').click();expect((await download).suggestedFilename()).toBe('camera-barbershop.png');
  await page.setViewportSize({width:390,height:844});await waitFrame(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
});
test('AF-S locks distance and AF-C follows a moving three dimensional subject',async({page})=>{
  // This legacy full-geometry test verifies focus, not desktop raster cost.
  // Use the same real viewport on hardware and software GPUs; default desktop
  // and narrow-screen visual coverage remains in the separate scene tests.
  await page.setViewportSize({width:800,height:700});
  await page.route('**/scenes/barbershop/scene.glb',r=>r.fulfill({json:focusRoom}));
  await page.goto('/?renderer=gltf');await waitFrame(page);await openControl(page,'motion');
  await page.locator('#pause').check();await page.locator('#motion').check();await waitFrame(page);
  const box=await page.locator('#image').boundingBox();
  const x=Number(await page.locator('#image').getAttribute('data-ball-x')),y=Number(await page.locator('#image').getAttribute('data-ball-y'));
  await page.locator('#image').click({position:{x:x*box.width,y:(1-y)*box.height}});await waitFrame(page);
  const locked=await motionSample(page);
  await page.locator('#pause').uncheck();await waitForMotion(page,locked);await page.locator('#pause').check();
  const movedLocked=await motionSample(page);expect(movedLocked.focus).toBeCloseTo(locked.focus,2);
  // Pause the genuine moving scene before changing a collapsed panel. On the
  // software GPU, continuous full-room redraws can starve pointer hit testing.
  await openControl(page,'af');await page.locator('#af').selectOption('AF-C');await waitFrame(page);
  const initial=await motionSample(page);await openControl(page,'pause');await page.locator('#pause').uncheck();await waitForMotion(page,initial);
  let tracked;await expect.poll(async()=>{tracked=await motionSample(page);return Math.abs(tracked.focus-initial.focus);},{message:'AF-C must follow depth after the rendered target actually moves',timeout:45000}).toBeGreaterThan(.03);
  await page.locator('#pause').check();
  await test.info().attach('legacy-af-progress.json',{body:JSON.stringify({locked,movedLocked,initial,tracked},null,2),contentType:'application/json'});
});
test('spot metering follows real image regions and fill flash lights the scene',async({page})=>{
  // Functional fixture shared by hardware and software GPUs. Independent
  // scene tests retain the full desktop raster and screenshot coverage.
  await page.setViewportSize({width:800,height:700});
  await page.goto('/?renderer=gltf');await waitFrame(page);await openControl(page,'metering');
  await page.locator('#metering').selectOption('spot');
  const image=page.locator('#image'),box=await image.boundingBox();
  await image.click({position:{x:box.width*.12,y:box.height*.65}});await waitFrame(page);const left=Number(await image.getAttribute('data-ev'));
  await image.click({position:{x:box.width*.9,y:box.height*.6}});await waitFrame(page);const right=Number(await image.getAttribute('data-ev'));
  expect(Math.abs(left-right)).toBeGreaterThan(.2);
  await page.locator('#metering').selectOption('matrix');await waitFrame(page);
  const unlit=await stats(page);await range(page,'flash',2);const lit=await stats(page);expect(lit.brightness).toBeGreaterThan(unlit.brightness*1.01);
  console.log('legacy meter and flash',JSON.stringify({left,right,unlit:unlit.brightness,lit:lit.brightness}));
});

test('paused legacy motion target responds to short and long shutter intervals',async({page})=>{
  await page.setViewportSize({width:800,height:700});
  await page.goto('/?renderer=gltf');await waitFrame(page);await openControl(page,'motion');
  // Pause before enabling motion so genuine UI actions do not queue behind
  // continuous full-room software rendering. The shutter still spans its path.
  await page.locator('#pause').check();await page.locator('#motion').check();
  const image=page.locator('#image');await page.locator('#autoISO').uncheck();
  await range(page,'shutter',3);await range(page,'iso',7);await expect(image).toHaveAttribute('data-ev','7.966');const fast=await stats(page),initial=await motionSample(page);
  await range(page,'shutter',10);await range(page,'iso',0);await expect(image).toHaveAttribute('data-ev','8.000');const slow=await stats(page),final=await motionSample(page);
  expect(final.x).toBeCloseTo(initial.x,5);expect(final.y).toBeCloseTo(initial.y,5);
  expect(slow.buffer.equals(fast.buffer)).toBe(false);
  console.log('legacy shutter comparison',JSON.stringify({fastEV:7.966,slowEV:8,initial,final,fastBrightness:fast.brightness,slowBrightness:slow.brightness}));
  await page.screenshot({path:'test-results/long-exposure.png',fullPage:true});
});
