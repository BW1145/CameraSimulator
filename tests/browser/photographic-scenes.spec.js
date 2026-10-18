import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {openControl} from './controls.js';

test('all four photographic packs use independent real positions and load only the selected room',async({page})=>{
  const requests=[],errors=[];page.on('request',r=>{if(r.url().includes('/scenes/'))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?subject=none&view=source');const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-ready','true');
  expect(requests.some(u=>/classroom|kitchen|apartment/.test(u))).toBe(false);
  for(const scene of ['barbershop','classroom','kitchen','apartment']){
    if(scene!=='barbershop')await page.locator('#scene').selectOption(scene);
    await expect(canvas).toHaveAttribute('data-scene',scene);await expect(canvas).toHaveAttribute('data-ready','true');await expect(canvas).toHaveAttribute('data-view','prerender');
    const positions=[];
    for(const pose of ['center','left','right','up','down','front','back']){
      await page.locator(`button[data-position=${pose}]`).click();await expect(canvas).toHaveAttribute('data-position',pose);await expect(canvas).toHaveAttribute('data-ready','true');positions.push(await canvas.getAttribute('data-camera-position'));
    }
    expect(new Set(positions).size).toBe(7);
    await page.mouse.move(0,0);const stats=await sharp(await canvas.screenshot()).stats();expect(stats.channels.slice(0,3).reduce((s,c)=>s+c.mean,0)/3).toBeGreaterThan(12);
  }
  expect(requests.some(u=>u.endsWith('.glb'))).toBe(false);expect(errors).toEqual([]);
});

test('production photo exposure modes, ISO and compensation share the linear scene meter',async({page})=>{
  await page.goto('/?subject=none');const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-ready','true');await page.locator('#scene').selectOption('classroom');await expect(canvas).toHaveAttribute('data-scene','classroom');await expect(canvas).toHaveAttribute('data-ready','true');
  const range=async(id,n)=>{await openControl(page,id);await page.locator('#'+id).fill(String(n));await page.locator('#'+id).dispatchEvent('input');await page.waitForTimeout(140);};
  await page.locator('#autoISO').uncheck();await range('iso',1);const low=Number(await canvas.getAttribute('data-ev'));await range('iso',3);const high=Number(await canvas.getAttribute('data-ev'));expect(low-high).toBeCloseTo(2,1);
  await page.locator('#mode').selectOption('A');await expect(page.locator('#shutter')).toBeDisabled();await expect(page.locator('#aperture')).toBeEnabled();
  await page.locator('#mode').selectOption('S');await expect(page.locator('#aperture')).toBeDisabled();await expect(page.locator('#shutter')).toBeEnabled();await page.locator('#autoISO').check();await range('shutter',3);expect(Number(await canvas.getAttribute('data-iso'))).toBeGreaterThan(100);
  await page.locator('#mode').selectOption('P');await expect(page.locator('#aperture')).toBeDisabled();await expect(page.locator('#shutter')).toBeDisabled();const baseline=Number(await canvas.getAttribute('data-ev'));await range('compensation',3);expect(baseline-Number(await canvas.getAttribute('data-ev'))).toBeCloseTo(1,1);
});

test('AF-C tracks the clicked moving ball in each photographic room',async({page})=>{
  await page.goto('/');const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-ready','true');
  for(const scene of ['classroom','kitchen','apartment']){
    await page.locator('#scene').selectOption(scene);await expect(canvas).toHaveAttribute('data-scene',scene);await expect(canvas).toHaveAttribute('data-ready','true');await page.locator('#reset').click();await expect(canvas).toHaveAttribute('data-ready','true');
    await openControl(page,'motion');await page.locator('#motion').check();await page.locator('#pause').check();await openControl(page,'af');await page.locator('#af').selectOption('AF-C');
    const point=await canvas.evaluate(e=>({x:+e.dataset.ballX,y:+e.dataset.ballY})),box=await canvas.boundingBox();await canvas.click({position:{x:point.x*box.width,y:(1-point.y)*box.height}});
    const initial=Number(await canvas.getAttribute('data-focus'));await openControl(page,'pause');await page.locator('#pause').uncheck();await page.waitForTimeout(900);const later=Number(await canvas.getAttribute('data-focus'));
    expect(initial).toBeGreaterThan(1);expect(Math.abs(later-initial)).toBeGreaterThan(.05);await page.locator('#pause').check();
  }
});

