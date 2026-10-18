import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {openControl} from './controls.js';

test('static flash loads on demand, retries failures, and preserves pulse energy across shutter durations',async({page})=>{
  const manifest=JSON.parse(await readFile('public/scenes/barbershop-plates/manifest.json','utf8'));
  for(const view of manifest.views){delete view.detailFile;delete view.detailDepth;}
  manifest.flash={referenceEnergy:1000,referenceDuration:.01,encoding:{min:-16,max:6}};
  manifest.views[0].flash='fixture-flash.webp';
  const make=async value=>sharp(Buffer.alloc(4*4*3,value),{raw:{width:4,height:4,channels:3}}).webp({lossless:true}).toBuffer();
  const black=await make(0),flash=await make(Math.round((Math.log2(16)+16)/22*255));let requests=0,fail=true;
  await page.route('**/barbershop-plates/manifest.json',r=>r.fulfill({json:manifest}));
  await page.route('**/barbershop-plates/center.webp',r=>r.fulfill({contentType:'image/webp',body:black}));
  await page.route('**/fixture-flash.webp',r=>{requests++;return fail?r.abort():r.fulfill({contentType:'image/webp',body:flash});});
  await page.goto('/?subject=none&view=source');const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-ready','true');expect(requests).toBe(0);
  await page.locator('#autoISO').uncheck();await page.locator('#shutter').fill('11');await page.locator('#shutter').dispatchEvent('input');
  await openControl(page,'flash');await page.locator('#flash').fill('1');await page.locator('#flash').dispatchEvent('input');
  await expect(page.locator('#hint button')).toBeVisible();fail=false;await page.locator('#hint button').click();await expect(page.locator('#hint button')).toHaveCount(0);
  const mean=async()=>{await page.mouse.move(0,0);const stats=await sharp(await canvas.screenshot()).stats();return stats.channels.slice(0,3).reduce((sum,c)=>sum+c.mean,0)/3;};
  const quarter=await mean();await page.locator('#shutter').fill('10');await page.locator('#shutter').dispatchEvent('input');await page.waitForTimeout(200);const eighth=await mean();
  expect(quarter).toBeGreaterThan(80);expect(Math.abs(quarter-eighth)).toBeLessThan(2);expect(requests).toBe(2);
});

test('detail radiance is lazy and a stale pose cannot replace the selected view',async({page})=>{
  const manifest=JSON.parse(await readFile('public/scenes/barbershop-plates/manifest.json','utf8'));
  for(const view of manifest.views){delete view.detailFile;delete view.detailDepth;}
  manifest.views[0].detailFile='fixture-detail.webp';manifest.views[0].detailWidth=5120;
  const image=await sharp({create:{width:5120,height:16,channels:3,background:{r:170,g:170,b:170}}}).webp({lossless:true}).toBuffer();let requests=0,release;
  await page.route('**/barbershop-plates/manifest.json',r=>r.fulfill({json:manifest}));
  await page.route('**/fixture-detail.webp',async r=>{requests++;await new Promise(resolve=>{release=resolve;});await r.fulfill({contentType:'image/webp',body:image});});
  await page.goto('/?subject=none');const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-ready','true');expect(requests).toBe(0);
  await openControl(page,'focal');await page.locator('#focal').fill('100');await page.locator('#focal').dispatchEvent('input');await expect.poll(()=>requests).toBe(1);
  await page.locator('button[data-position=right]').click();await expect(canvas).toHaveAttribute('data-position','right');release();await page.waitForTimeout(200);
  await expect(canvas).toHaveAttribute('data-position','right');expect(await canvas.getAttribute('data-detail-width')).not.toBe('5120');
});
