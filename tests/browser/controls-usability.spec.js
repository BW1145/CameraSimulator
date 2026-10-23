import {test,expect} from '@playwright/test';
import {APERTURES,SHUTTERS,ISOS,formatShutter} from '../../src/camera.js';
import {waitInitialFrame,waitFrame,openControl} from './controls.js';
import {installRuntimeDiagnostics} from './runtime-diagnostics.js';
installRuntimeDiagnostics(test);
async function wheelAt(page,locator,delta){await locator.hover();const scroll=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,delta);return scroll;}
const value=async(page,id)=>Number(await page.locator('#'+id).inputValue());
test('wheel controls change native parameters, respect disabled controls and leave outside scrolling',async({page})=>{
 await page.setViewportSize({width:1366,height:768});await page.goto('/');await waitInitialFrame(page);await page.locator('#magnifier-toggle').uncheck();
 const image=page.locator('#image'),before=await value(page,'focal');const scroll=await wheelAt(page,image,-120);
 await expect.poll(()=>value(page,'focal')).toBe(before+1);expect(await page.evaluate(()=>scrollY)).toBe(scroll);await waitFrame(page);await expect(page.locator('#focal-value')).toHaveText(`${before+1} mm`);
 await page.mouse.wheel(0,120);await expect.poll(()=>value(page,'focal')).toBe(before);await waitFrame(page);
 const wb=await value(page,'wb');await wheelAt(page,page.locator('#wb').locator('..'),-120);await expect.poll(()=>value(page,'wb')).toBe(wb+100);await waitFrame(page);
 // One ordinary wheel notch advances exactly one discrete exposure stop.
 await page.locator('#autoISO').uncheck();const iso=await value(page,'iso');await wheelAt(page,page.locator('#iso'),-120);await expect.poll(()=>value(page,'iso')).toBe(iso+1);await waitFrame(page);await expect(page.locator('#iso-value')).toHaveText(String(ISOS[iso+1]));
 const apertureIndex=await value(page,'aperture');await wheelAt(page,page.locator('#aperture'),-120);await waitFrame(page);await expect(page.locator('#aperture-value')).toHaveText(`f/${APERTURES[apertureIndex+1]}`);
 const shutterIndex=await value(page,'shutter');await wheelAt(page,page.locator('#shutter'),-120);await waitFrame(page);await expect(page.locator('#shutter-value')).toHaveText(formatShutter(SHUTTERS[shutterIndex+1]));
 await page.locator('#autoISO').check();await waitFrame(page);const locked=await value(page,'iso');await wheelAt(page,page.locator('#iso'),-120);await waitFrame(page);expect(await value(page,'iso')).toBe(locked);
 await page.locator('#mode').selectOption('P');await waitFrame(page);const aperture=await value(page,'aperture');await wheelAt(page,page.locator('#aperture'),-120);expect(await value(page,'aperture')).toBe(aperture);
 // Non-cancelable/zoom/horizontal events never modify the parameter or get canceled.
 const unchanged=await value(page,'focal');const flags=await image.evaluate(canvas=>[
  {ctrlKey:true},{metaKey:true},{shiftKey:true},{deltaX:120},{cancelable:false}
 ].map(extra=>{const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-40,...extra});canvas.dispatchEvent(e);return e.defaultPrevented;}));
 expect(flags).toEqual([false,false,false,false,false]);expect(await value(page,'focal')).toBe(unchanged);
 await page.evaluate(()=>scrollTo(0,0));await page.mouse.move(3,200);await page.mouse.wheel(0,500);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
});
test('fractional focus wheel, limits and normal keyboard remain usable',async({page})=>{
 await page.setViewportSize({width:1000,height:800});await page.goto('/');await waitInitialFrame(page);await page.locator('#magnifier-toggle').uncheck();await openControl(page,'focus');
 const focus=page.locator('#focus');await focus.fill('2');await focus.dispatchEvent('input');await waitFrame(page);
 await wheelAt(page,focus,-120);await expect.poll(()=>value(page,'focus')).toBe(2.1);await expect(page.locator('#af')).toHaveValue('MF');
 await focus.focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>value(page,'focus')).toBe(2.2);
 await focus.fill('50');await focus.dispatchEvent('input');await waitFrame(page);const scroll=await wheelAt(page,focus,-120);expect(await value(page,'focus')).toBe(50);expect(await page.evaluate(()=>scrollY)).toBe(scroll);
});
test('usable layout evidence at matched desktop and mobile sizes',async({page},testInfo)=>{
 const observations=[];
 for(const [name,size]of [['desktop',{width:1366,height:768}],['mobile',{width:390,height:844}]]){
  await page.setViewportSize(size);
  for(const [side,url]of [['before',process.env.UI_BASELINE_URL],['after','/']]){
   if(!url)continue;
   await page.goto(url);await waitInitialFrame(page);await page.mouse.move(0,0);await page.evaluate(()=>scrollTo(0,0));
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   if(side==='after'){
    for(const id of ['scene','mode','capture','focal','focus-center','grid-toggle','magnifier-toggle'])await expect(page.locator('#'+id)).toBeVisible();
    expect(await page.locator('[id]').evaluateAll(nodes=>new Set(nodes.map(n=>n.id)).size===nodes.length)).toBe(true);
    if(name==='desktop')for(const id of ['capture','focal','aperture','shutter','iso','wb']){const box=await page.locator('#'+id).boundingBox();expect(box.y+box.height,`${id} below initial viewport`).toBeLessThanOrEqual(size.height);}
   }
   observations.push({name,side,viewport:size,photo:await page.locator('#image').boundingBox(),focal:await page.locator('#focal').boundingBox(),scrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth)});
   await page.screenshot({path:testInfo.outputPath(`${name}-${side}.png`),fullPage:true});
   await page.locator('#composition-tools summary').click();await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:testInfo.outputPath(`${name}-${side}-expanded.png`),fullPage:true});
  }
 }
 await testInfo.attach('layout-observations.json',{body:JSON.stringify(observations,null,2),contentType:'application/json'});
});
