import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {openControl,setRange,waitLayers} from './controls.js';
import {readFile} from 'node:fs/promises';
import {Matrix4} from 'three';

test('source lens shift stays consistent between the photographic ray and click focus',async({page})=>{
  const manifest=JSON.parse(await readFile('public/scenes/barbershop-plates/manifest.json','utf8'));
  const entry=manifest.views[0];entry.projectionMatrix[8]=.1;entry.projectionMatrix[9]=.2;delete entry.detailFile;
  entry.matrix=new Matrix4().fromArray(entry.projectionMatrix).multiply(new Matrix4().fromArray(entry.cameraMatrix).invert()).toArray();
  await page.route('**/barbershop-plates/manifest.json',r=>r.fulfill({json:manifest}));
  const {data,info}=await sharp('public/scenes/barbershop-plates/center-depth.png').raw().toBuffer({resolveWithObject:true});
  await page.goto('/?subject=none&view=source');const image=page.locator('#image');await expect(image).toHaveAttribute('data-ready','true');const box=await image.boundingBox();
  for(const [x,y]of [[.2,.7],[.5,.46]]){
    const u=.5+(x-.5)/1.2+.1*(1/1.2-1)/2,v=.5+(y-.5)/1.2-.2*(1/1.2-1)/2;
    const cx=Math.floor(u*info.width),cy=Math.floor(v*info.height),values=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const i=((cy+dy)*info.width+cx+dx)*info.channels;values.push((data[i]*256+data[i+1])/65535*64);}
    await image.click({position:{x:x*box.width,y:y*box.height}});const actual=Number(await image.getAttribute('data-focus'));
    expect(actual).toBeGreaterThanOrEqual(Math.min(...values)-.02);expect(actual).toBeLessThanOrEqual(Math.max(...values)+.02);
  }
});

test('off-axis autofocus preserves the source axial Z instead of treating it as radial distance',async({page})=>{
  const {data,info}=await sharp('public/scenes/barbershop-plates/center-depth.png').raw().toBuffer({resolveWithObject:true});
  await page.goto('/?renderer=plates&subject=none&view=source');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  const image=page.locator('#image'),box=await image.boundingBox();
  for(const [x,y] of [[.16,.85],[.5,.46]]){
    const u=.5+(x-.5)/1.2,v=.5+(y-.5)/1.2,cx=Math.floor(u*info.width),cy=Math.floor(v*info.height),values=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const i=((cy+dy)*info.width+cx+dx)*info.channels;values.push((data[i]*256+data[i+1])/65535*64);}
    await image.click({position:{x:box.width*x,y:box.height*y}});const actual=Number(await image.getAttribute('data-focus'));
    expect(actual).toBeGreaterThanOrEqual(Math.min(...values)-.015);expect(actual).toBeLessThanOrEqual(Math.max(...values)+.015);
  }
});

test('pre-rendered pack loads one position, meters HDR, and focuses on source depth',async({page})=>{
  const requests=[],errors=[];page.on('request',r=>{if(r.url().includes('/scenes/'))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?renderer=plates&subject=none');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  expect(requests.filter(u=>u.endsWith('.glb'))).toHaveLength(0);expect(requests.filter(u=>u.endsWith('.webp'))).toHaveLength(1);
  await expect(page.locator('#image')).toHaveAttribute('data-position','center');
  const image=page.locator('#image'),box=await image.boundingBox();
  await image.click({position:{x:box.width*.1,y:box.height*.65}});const near=Number(await image.getAttribute('data-focus'));
  await image.click({position:{x:box.width*.5,y:box.height*.46}});const far=Number(await image.getAttribute('data-focus'));
  expect(near).toBeGreaterThan(1);expect(far).toBeGreaterThan(near+2);
  await page.locator('#mode').selectOption('A');
  const range=(id,n)=>setRange(page,id,n);
  await range('aperture',0);const fast=Number(await page.locator('#shutter').inputValue());await range('aperture',5);const slow=Number(await page.locator('#shutter').inputValue());expect(slow).toBeGreaterThan(fast+3);
  expect(errors).toEqual([]);
});

test('real position selection retries failures, ignores stale loads, and exports portrait crops',async({page})=>{
  await page.goto('/?renderer=plates&subject=none');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  let fail=true;await page.route('**/barbershop-plates/right.webp',route=>fail?route.abort():route.continue());
  const move=async(id,n)=>{const position=id==='x'?(n<0?'left':n>0?'right':'center'):id==='y'?(n<0?'down':n>0?'up':'center'):(n<0?'back':n>0?'front':'center');await openControl(page,'position-controls');await page.locator(`button[data-position=${position}]`).click();};
  await move('x',.3);await expect(page.locator('#loading')).toContainText('机位加载失败');fail=false;await page.locator('#loading button').click();
  await expect(page.locator('#image')).toHaveAttribute('data-position','right');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  await move('y',.2);await expect(page.locator('#image')).toHaveAttribute('data-position','up');await expect(page.locator('#x')).toHaveValue('0');
  await openControl(page,'position-controls');await page.locator('button[data-position=center]').click();await expect(page.locator('#image')).toHaveAttribute('data-position','center');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  let releaseLeft,enteredLeft;const entered=new Promise(resolve=>{enteredLeft=resolve;});
  await page.route('**/barbershop-plates/left.webp',async route=>{enteredLeft();await new Promise(resolve=>{releaseLeft=resolve;});await route.continue();});
  await move('x',-.3);await entered;await move('x',0);await expect(page.locator('#image')).toHaveAttribute('data-ready','true');releaseLeft();await waitLayers(page);
  await expect(page.locator('#image')).toHaveAttribute('data-position','center');
  await openControl(page,'crop');await page.locator('#crop').selectOption('2:3');const pending=page.waitForEvent('download');await page.locator('#capture').click();const metadata=await sharp(await (await pending).path()).metadata();expect(metadata.width).toBe(1365);expect(metadata.height).toBe(2048);
});
