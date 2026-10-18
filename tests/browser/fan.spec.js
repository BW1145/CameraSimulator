import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {openControl} from './controls.js';

test('switching away during a delayed fan probe cannot replace the selected scene',async({page})=>{
  let entered,release;const pending=new Promise(resolve=>{entered=resolve;});let first=true;
  await page.route('**/fan-room.hdr',async route=>{if(first){first=false;entered();await new Promise(resolve=>{release=resolve;});}await route.continue();});
  await page.goto('/');await pending;await page.locator('#scene').selectOption('kitchen');release();
  await expect(page.locator('#image')).toHaveAttribute('data-scene','kitchen');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  await openControl(page,'motion');await expect(page.locator('#motion')).toBeVisible();await expect(page.locator('#position-controls')).toBeHidden();
  await page.locator('#scene').selectOption('barbershop');await expect(page.locator('#image')).toHaveAttribute('data-scene','barbershop');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');await expect(page.locator('#position-controls')).toBeVisible();
});

test('default photographic fan conserves static light while the shutter integrates its rotor',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?view=source');const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-ready','true');
  await expect(page.locator('#legacy-view')).toBeHidden();await expect(page.locator('#more details[open]')).toHaveCount(0);
  const range=async(id,value)=>{await openControl(page,id);await page.locator('#'+id).fill(String(value));await page.locator('#'+id).dispatchEvent('input');await page.waitForTimeout(180);};
  await range('focal',50);await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.6-156.25,box.y+box.height*.4+18.75,{steps:8});await page.mouse.up();
  await page.locator('#pause').check();await page.locator('#motion').check();
  await range('aperture',0);await range('shutter',3);await range('iso',4);await expect(canvas).toHaveAttribute('data-temporal-samples','1');await page.mouse.move(0,0);const fast=await canvas.screenshot();
  await range('aperture',7);await range('shutter',10);await expect(canvas).toHaveAttribute('data-temporal-samples','24');const slow=await canvas.screenshot();
  const region=JSON.parse(await canvas.getAttribute('data-temporal-region')),meta=await sharp(slow).metadata();
  const corner={left:region.x+4,top:meta.height-region.y-region.height+4,width:8,height:8};
  const mean=async(buffer,rect)=>(await sharp(buffer).extract(rect).stats()).channels.slice(0,3).reduce((sum,c)=>sum+c.mean,0)/3;
  expect(Math.abs(await mean(fast,corner)-await mean(slow,corner))).toBeLessThan(4);
  const area={left:region.x,top:meta.height-region.y-region.height,width:region.width,height:region.height};
  const a=await sharp(fast).extract(area).removeAlpha().raw().toBuffer(),b=await sharp(slow).extract(area).removeAlpha().raw().toBuffer();
  expect(a.reduce((sum,n,i)=>sum+Math.abs(n-b[i]),0)/a.length).toBeGreaterThan(3);
  await range('shutter',18);await range('aperture',8);await range('iso',0);
  await expect(canvas).toHaveAttribute('data-ev',Math.log2(22*22/30*100/50).toFixed(3));await expect(canvas).toHaveAttribute('data-temporal-samples','24');
  await expect(canvas).toHaveAttribute('data-temporal-weight','1.000000000000');expect(errors).toEqual([]);
});
