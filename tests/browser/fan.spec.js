import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {openControl,setRange,setRanges,waitFrame,waitLayers} from './controls.js';

test('switching away during a delayed fan probe cannot replace the selected scene',async({page})=>{
  const subjects=JSON.parse(await readFile(new URL('../../public/scenes/barbershop-plates/subjects.json',import.meta.url),'utf8'));
  const fan=subjects.find(subject=>subject.type==='desk-fan'),environment=fan?.viewLighting?.center?.environment??fan?.environment;
  expect(environment,'the default fan must configure a center probe').toBeTruthy();
  let intercepted=0,release;const pending=new Promise(resolve=>{release=resolve;});
  await page.route(`**/barbershop-plates/${environment}`,async route=>{if(++intercepted===1)await pending;await route.continue();});
  try{
    await page.goto('/',{waitUntil:'domcontentloaded'});
    await expect.poll(()=>intercepted,{message:`the configured center probe ${environment} must be intercepted`,timeout:30000}).toBe(1);
    await page.locator('#scene').selectOption('kitchen');
    await expect(page.locator('#image')).toHaveAttribute('data-scene','kitchen');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
    // Resolve the old probe only after the replacement scene is actually live.
    await expect.poll(async()=>Number(await page.locator('#image').getAttribute('data-pending-layers'))).toBeGreaterThan(0);
    release();await waitLayers(page);
    await expect(page.locator('#image')).toHaveAttribute('data-scene','kitchen');
    await openControl(page,'motion');await expect(page.locator('#motion')).toBeVisible();await expect(page.locator('#position-controls')).toBeVisible();
    await page.locator('#scene').selectOption('barbershop');await expect(page.locator('#image')).toHaveAttribute('data-scene','barbershop');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');await expect(page.locator('#position-controls')).toBeVisible();
    expect(intercepted,'returning to the fan scene must request its probe again').toBe(2);
  }finally{release();}
});

test('default photographic fan conserves static light while the shutter integrates its rotor',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?view=source');const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-ready','true');
  await openControl(page,'position-controls');await expect(page.locator('#legacy-view')).toBeHidden();await expect(page.locator('#more details[open]')).toHaveCount(0);
  const range=(id,value)=>setRange(page,id,value);
  await range('focal',50);await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.6-156.25,box.y+box.height*.4+18.75,{steps:8});await page.mouse.up();
  await openControl(page,'pause');await page.locator('#pause').check();await page.locator('#motion').check();
  await expect(canvas).toHaveAttribute('data-detail-width','5120');await waitFrame(page);
  await setRanges(page,{aperture:0,shutter:3,iso:4});const meter=Number(await canvas.getAttribute('data-meter-ev'));expect(Number(await canvas.getAttribute('data-temporal-samples'))).toBeGreaterThan(1);await page.mouse.move(0,0);const fast=await canvas.screenshot();
  await setRanges(page,{aperture:7,shutter:10});await expect(canvas).toHaveAttribute('data-temporal-samples','24');const slow=await canvas.screenshot();
  const region=JSON.parse(await canvas.getAttribute('data-temporal-region')),meta=await sharp(slow).metadata();
  const corner={left:region.x+4,top:meta.height-region.y-region.height+4,width:8,height:8};
  const mean=async(buffer,rect)=>(await sharp(buffer).extract(rect).stats()).channels.slice(0,3).reduce((sum,c)=>sum+c.mean,0)/3;
  expect(Math.abs(await mean(fast,corner)-await mean(slow,corner))).toBeLessThan(4);
  const area={left:region.x,top:meta.height-region.y-region.height,width:region.width,height:region.height};
  const a=await sharp(fast).extract(area).removeAlpha().raw().toBuffer(),b=await sharp(slow).extract(area).removeAlpha().raw().toBuffer();
  expect(a.reduce((sum,n,i)=>sum+Math.abs(n-b[i]),0)/a.length).toBeGreaterThan(3);
  await setRanges(page,{shutter:18,aperture:8,iso:0});
  await expect(canvas).toHaveAttribute('data-ev',Math.log2(22*22/30*100/50).toFixed(3));await expect(canvas).toHaveAttribute('data-temporal-samples','24');
  await expect(canvas).toHaveAttribute('data-temporal-weight','1.000000000000');expect(errors).toEqual([]);
  expect(Number(await canvas.getAttribute('data-meter-ev'))).toBeCloseTo(meter,3);
});
