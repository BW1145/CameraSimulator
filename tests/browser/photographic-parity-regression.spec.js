import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {openControl,setRange,setRanges,waitInitialFrame,waitLayers} from './controls.js';

// A deliberately bounded real-asset smoke check, not a visual-quality verdict.
// Rotor/static-background and real-detail magnifier coverage comes from the two
// existing focused specs selected alongside this one in the isolated workflow.
test('prototype photographic controls keep real flash, focus, scene and position flows',async({page})=>{
  const evidence={scope:'Functional real-browser checks only; no visual acceptance claim.',steps:[],pageErrors:[],consoleErrors:[],requestFailures:[],httpErrors:[],flashRequests:[]};
  page.on('pageerror',e=>evidence.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')evidence.consoleErrors.push(m.text());});page.on('requestfailed',r=>evidence.requestFailures.push({url:r.url(),failure:r.failure()}));page.on('response',r=>{if(r.status()>=400)evidence.httpErrors.push({url:r.url(),status:r.status()});});page.on('request',r=>{if(/\/barbershop-plates\/.*flash.*\.webp(?:\?|$)/.test(r.url()))evidence.flashRequests.push(r.url());});
  const image=page.locator('#image');
  const snapshot=async(name)=>{await page.mouse.move(0,0);await waitLayers(page);const path=test.info().outputPath(`${name}.png`);await image.screenshot({path});return path;};
  const difference=async(a,b)=>{const x=await sharp(a).removeAlpha().raw().toBuffer(),y=await sharp(b).removeAlpha().raw().toBuffer();expect(x.length).toBe(y.length);return x.reduce((s,v,i)=>s+Math.abs(v-y[i]),0)/x.length;};
  try{
    await page.goto('/');await waitInitialFrame(page);await waitLayers(page);await page.locator('#autoISO').uncheck();await openControl(page,'motion');await page.locator('#motion').uncheck();
    await setRanges(page,{aperture:3,shutter:6,iso:4});await setRange(page,'flash',0);const ambient=await snapshot('real-flash-off');expect(evidence.flashRequests).toHaveLength(0);
    await setRange(page,'flash',1);await waitLayers(page);await expect(image).toHaveAttribute('data-flash-ready','true');const flash=await snapshot('real-flash-on'),flashDelta=await difference(ambient,flash);expect(evidence.flashRequests.length).toBeGreaterThan(0);expect(flashDelta).toBeGreaterThan(.2);
    await setRange(page,'flash',0);const restored=await snapshot('real-flash-restored'),restoreDelta=await difference(ambient,restored);expect(restoreDelta).toBeLessThan(.2);evidence.steps.push({step:'real flash 0→1→0',flashDelta,restoreDelta,requests:evidence.flashRequests});
    await setRanges(page,{aperture:0,iso:2});await setRange(page,'focus',.2);await expect(image).toHaveAttribute('data-focus','0.200');const near=await snapshot('focus-near');await setRange(page,'focus',3);await expect(image).toHaveAttribute('data-focus','3.000');const far=await snapshot('focus-three-metres'),focusDelta=await difference(near,far);expect(focusDelta).toBeGreaterThan(.2);evidence.steps.push({step:'f/1.4 manual focus .2→3m changes actual photograph',focusDelta});
    await page.locator('#scene').selectOption('classroom');await expect(image).toHaveAttribute('data-scene','classroom');await waitLayers(page);evidence.steps.push({step:'classroom loaded',data:await image.evaluate(e=>({...e.dataset}))});
    await page.locator('#scene').selectOption('barbershop');await expect(image).toHaveAttribute('data-scene','barbershop');await waitLayers(page);evidence.steps.push({step:'returned to barbershop',data:await image.evaluate(e=>({...e.dataset}))});
    for(const position of ['left','center']){await page.locator(`button[data-position=${position}]`).click();await expect(image).toHaveAttribute('data-position',position);await waitLayers(page);evidence.steps.push({step:`position ${position}`,data:await image.evaluate(e=>({...e.dataset}))});}
    for(const key of ['pageErrors','consoleErrors','requestFailures','httpErrors'])expect(evidence[key],key).toEqual([]);
  }finally{await test.info().attach('functional-regression-evidence.json',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});}
});
