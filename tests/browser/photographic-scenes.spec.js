import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {openControl,motionSample,waitForMotion,waitFrame,setRange} from './controls.js';
import {capturePhotographicPage} from './photo-evidence.js';

test('all four photographic packs use independent real positions and load only the selected room',async({page})=>{
  const requests=[],errors=[];page.on('request',r=>{if(r.url().includes('/scenes/'))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?subject=none&view=source');const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-ready','true');
  expect(requests.some(u=>/classroom|kitchen|apartment/.test(u))).toBe(false);
  for(const scene of ['barbershop','classroom','kitchen','apartment']){
    if(scene!=='barbershop')await page.locator('#scene').selectOption(scene);
    await expect(canvas).toHaveAttribute('data-scene',scene);await expect(canvas).toHaveAttribute('data-ready','true');await expect(canvas).toHaveAttribute('data-view','prerender');
    // Check the first center image inside the actual full-page screenshot.
    // CSS background RGB(22,23,25) passes a mean-only check but has zero detail.
    await capturePhotographicPage(page);
    const positions=[];
    for(const pose of ['center','left','right','up','down','front','back']){
      await openControl(page,'position-controls');await page.locator(`button[data-position=${pose}]`).click();await expect(canvas).toHaveAttribute('data-position',pose);await expect(canvas).toHaveAttribute('data-ready','true');positions.push(await canvas.getAttribute('data-camera-position'));await capturePhotographicPage(page);
    }
    expect(new Set(positions).size).toBe(7);
    await page.mouse.move(0,0);const stats=await sharp(await canvas.screenshot()).stats();expect(stats.channels.slice(0,3).reduce((s,c)=>s+c.mean,0)/3).toBeGreaterThan(12);
  }
  expect(requests.some(u=>u.endsWith('.glb'))).toBe(false);expect(errors).toEqual([]);
});

test('production photo exposure modes, ISO and compensation share the linear scene meter',async({page})=>{
  await page.goto('/?subject=none');const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-ready','true');await page.locator('#scene').selectOption('classroom');await expect(canvas).toHaveAttribute('data-scene','classroom');await expect(canvas).toHaveAttribute('data-ready','true');
  const range=(id,n)=>setRange(page,id,n);
  await page.locator('#autoISO').uncheck();await range('iso',1);const low=Number(await canvas.getAttribute('data-ev'));await range('iso',3);const high=Number(await canvas.getAttribute('data-ev'));expect(low-high).toBeCloseTo(2,1);
  await page.locator('#mode').selectOption('A');await expect(page.locator('#shutter')).toBeDisabled();await expect(page.locator('#aperture')).toBeEnabled();
  await page.locator('#mode').selectOption('S');await expect(page.locator('#aperture')).toBeDisabled();await expect(page.locator('#shutter')).toBeEnabled();await page.locator('#autoISO').check();await range('shutter',3);expect(Number(await canvas.getAttribute('data-iso'))).toBeGreaterThan(100);
  await page.locator('#mode').selectOption('P');await expect(page.locator('#aperture')).toBeDisabled();await expect(page.locator('#shutter')).toBeDisabled();const baseline=Number(await canvas.getAttribute('data-ev'));await range('compensation',3);expect(baseline-Number(await canvas.getAttribute('data-ev'))).toBeCloseTo(1,1);
});

test('AF-C tracks the clicked moving ball in each photographic room',async({page})=>{
  await page.goto('/');const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-ready','true');
  const evidence=[];
  for(const scene of ['classroom','kitchen','apartment']){
    await page.locator('#scene').selectOption(scene);await expect(canvas).toHaveAttribute('data-scene',scene);await expect(canvas).toHaveAttribute('data-ready','true');await page.locator('#reset').click();await expect(canvas).toHaveAttribute('data-ready','true');
    // AF is independent of long-exposure sampling. A real short shutter keeps
    // this test about focus, while the temporal tests cover slow-shutter blur.
    await page.locator('#shutter').fill('6');
    await openControl(page,'motion');await page.locator('#pause').check();await page.locator('#motion').check();await expect(canvas).toHaveAttribute('data-ball-x',/\d/);
    await openControl(page,'af');await page.locator('#af').selectOption('AF-C');await waitFrame(page);
    // Sample the current rendered ball, never coordinates retained from a prior scene.
    const point=await canvas.evaluate(e=>({x:+e.dataset.ballX,y:+e.dataset.ballY})),box=await canvas.boundingBox();await canvas.click({position:{x:point.x*box.width,y:(1-point.y)*box.height}});
    await waitFrame(page);const initial=await motionSample(page);expect(initial.focus).toBeGreaterThan(1);
    // Prove the clicked target while paused and in frame; it may later move offscreen.
    const initialSelection=await canvas.evaluate(canvas=>{const mark=document.getElementById('focus-mark');return {ball:{x:+canvas.dataset.ballX,y:+canvas.dataset.ballY},mark:{x:parseFloat(mark.style.left)/100,y:1-parseFloat(mark.style.top)/100},visible:!mark.hidden};});
    expect(initialSelection.visible).toBe(true);expect(Math.hypot(initialSelection.ball.x-initialSelection.mark.x,initialSelection.ball.y-initialSelection.mark.y)).toBeLessThan(.015);
    await openControl(page,'pause');await page.locator('#pause').uncheck();await waitForMotion(page,initial);
    let tracked;await expect.poll(async()=>{tracked=await motionSample(page);return Math.abs(tracked.focus-initial.focus);},{message:`${scene} AF-C must change focus as its selected subject changes depth`,timeout:45000}).toBeGreaterThan(.05);
    await page.locator('#pause').check();await waitFrame(page);
    evidence.push({scene,initial,tracked,initialSelection});
  }
  await test.info().attach('photographic-af-progress.json',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
});

test('static photographs survive hidden layouts, viewport changes and opening controls',async({page})=>{
  await page.goto('/');const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-ready','true');
  for(const scene of ['classroom','kitchen','apartment']){
    await page.locator('#scene').selectOption(scene);await expect(canvas).toHaveAttribute('data-scene',scene);await expect(canvas).toHaveAttribute('data-ready','true');
    const size=await canvas.evaluate(e=>[e.width,e.height]);await page.locator('#viewfinder').evaluate(e=>{e.style.display='none';});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await canvas.evaluate(e=>[e.width,e.height])).toEqual(size);await page.locator('#viewfinder').evaluate(e=>{e.style.display='';});await waitFrame(page);
    for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await capturePhotographicPage(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await openControl(page,'flash');await capturePhotographicPage(page);}
  }
});

