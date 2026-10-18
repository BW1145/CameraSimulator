import {test,expect} from '@playwright/test';
import sharp from 'sharp';

test('pre-rendered pack loads one position, meters HDR, and focuses on source depth',async({page})=>{
  const requests=[],errors=[];page.on('request',r=>{if(r.url().includes('/scenes/'))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?renderer=plates');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  expect(requests.filter(u=>u.endsWith('.glb'))).toHaveLength(0);expect(requests.filter(u=>u.endsWith('.webp'))).toHaveLength(1);
  await expect(page.locator('#image')).toHaveAttribute('data-position','center');
  const image=page.locator('#image'),box=await image.boundingBox();
  await image.click({position:{x:box.width*.1,y:box.height*.65}});const near=Number(await image.getAttribute('data-focus'));
  await image.click({position:{x:box.width*.5,y:box.height*.46}});const far=Number(await image.getAttribute('data-focus'));
  expect(near).toBeGreaterThan(1);expect(far).toBeGreaterThan(near+2);
  await page.locator('#mode').selectOption('A');
  const range=async(id,n)=>{await page.locator('#'+id).fill(String(n));await page.locator('#'+id).dispatchEvent('input');await page.waitForTimeout(150);};
  await range('aperture',0);const fast=Number(await page.locator('#shutter').inputValue());await range('aperture',5);const slow=Number(await page.locator('#shutter').inputValue());expect(slow).toBeGreaterThan(fast+3);
  expect(errors).toEqual([]);
});

test('real position selection retries failures, ignores stale loads, and exports portrait crops',async({page})=>{
  await page.goto('/?renderer=plates');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');await page.locator('#more summary').click();
  let fail=true;await page.route('**/barbershop-plates/right.webp',route=>fail?route.abort():route.continue());
  const move=async(id,n)=>{await page.locator('#'+id).fill(String(n));await page.locator('#'+id).dispatchEvent('input');};
  await move('x',.3);await expect(page.locator('#loading')).toContainText('机位加载失败');fail=false;await page.locator('#loading button').click();
  await expect(page.locator('#image')).toHaveAttribute('data-position','right');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  await move('y',.2);await expect(page.locator('#image')).toHaveAttribute('data-position','up');await expect(page.locator('#x')).toHaveValue('0');
  await page.locator('#reset-view').click();await expect(page.locator('#image')).toHaveAttribute('data-position','center');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  let releaseLeft,enteredLeft;const entered=new Promise(resolve=>{enteredLeft=resolve;});
  await page.route('**/barbershop-plates/left.webp',async route=>{enteredLeft();await new Promise(resolve=>{releaseLeft=resolve;});await route.continue();});
  await move('x',-.3);await entered;await move('x',0);await expect(page.locator('#image')).toHaveAttribute('data-ready','true');releaseLeft();await page.waitForTimeout(300);
  await expect(page.locator('#image')).toHaveAttribute('data-position','center');
  await page.locator('#crop').selectOption('2:3');const pending=page.waitForEvent('download');await page.locator('#capture').click();const metadata=await sharp(await (await pending).path()).metadata();expect(metadata.width).toBe(1365);expect(metadata.height).toBe(2048);
});
