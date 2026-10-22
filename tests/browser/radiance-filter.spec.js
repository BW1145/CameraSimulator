import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {openControl,waitFrame} from './controls.js';

test('transport log texels are decoded before GPU interpolation and minification',async({page})=>{
  const manifest=JSON.parse(await readFile('public/scenes/barbershop-plates/manifest.json','utf8'));manifest.encoding={min:-16,max:6};for(const view of manifest.views)delete view.detailFile;
  await page.route('**/barbershop-plates/manifest.json',r=>r.fulfill({json:manifest}));
  const encode=n=>Math.round((Math.log2(n)+16)/22*255);
  const low=encode(1),high=encode(16),expected=(2**(low/255*22-16)+2**(high/255*22-16))/2;
  for(const size of [2,1024]){
    const pixels=Buffer.alloc(size*size*3);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)pixels.fill((x+y)%2?high:low,(y*size+x)*3,(y*size+x+1)*3);
    const image=await sharp(pixels,{raw:{width:size,height:size,channels:3}}).webp({lossless:true}).toBuffer();
    await page.route('**/barbershop-plates/center.webp',route=>route.fulfill({contentType:'image/webp',body:image}));
    await page.setViewportSize(size===2?{width:1440,height:1000}:{width:390,height:844});
    await page.goto('/?subject=none&view=source');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
    if(size===2){await openControl(page,'focal');await page.locator('#focal').fill('200');}
    await waitFrame(page);
    const actual=Number(await page.locator('#image').getAttribute('data-ev'))+parseFloat(await page.locator('#meter').textContent());
    // The legacy log-space sample was about 4; arithmetic radiance is 8.5.
    expect(Math.abs(actual-(8+Math.log2(expected/.18)))).toBeLessThan(.06);
    await page.unroute('**/barbershop-plates/center.webp');
  }
});

test('rule-of-thirds guides paint visible lines over the photograph',async({page})=>{
  await page.goto('/?subject=none&view=source');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  await openControl(page,'grid-toggle');await page.locator('#grid-toggle').check();await page.mouse.move(0,0);
  await expect(page.locator('#grid')).toBeVisible();
  const read=async()=>{const {data,info}=await sharp(await page.locator('#viewfinder').screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});return {data,info};};
  const on=await read();await page.locator('#grid-toggle').uncheck();const off=await read();
  let changed=0;const x=Math.round(on.info.width/3);
  for(let y=3;y<on.info.height-3;y++)for(let dx=-2;dx<=2;dx++){const i=(y*on.info.width+x+dx)*3;if(Math.abs(on.data[i]-off.data[i])+Math.abs(on.data[i+1]-off.data[i+1])+Math.abs(on.data[i+2]-off.data[i+2])>25)changed++;}
  expect(changed).toBeGreaterThan(on.info.height*.7);
});
