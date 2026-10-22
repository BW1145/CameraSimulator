import {test,expect} from '@playwright/test';
import {waitInitialFrame,waitFrame,waitLayers,setRanges} from './controls.js';

test.use({viewport:{width:1000,height:800}});

async function observeDelayedReadbacks(page){
  await page.addInitScript(()=>{
    window.aidEvidence={hold:false,detailWrites:0,histogramWrites:0};
    const wait=WebGL2RenderingContext.prototype.clientWaitSync,fences=new WeakMap();
    WebGL2RenderingContext.prototype.clientWaitSync=function(...args){
      if(window.aidEvidence.hold)return this.TIMEOUT_EXPIRED;
      if(window.aidEvidence.motionDelayFrames){
        const count=window.__cameraDiagnostics.snapshot().counts.preview||0;
        if(!fences.has(args[0]))fences.set(args[0],count);
        if(count-fences.get(args[0])<window.aidEvidence.motionDelayFrames)return this.TIMEOUT_EXPIRED;
      }
      return wait.apply(this,args);
    };
    const put=CanvasRenderingContext2D.prototype.putImageData,fill=CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.putImageData=function(...args){
      if(this.canvas.id==='magnifier')window.aidEvidence.detailWrites++;
      return put.apply(this,args);
    };
    CanvasRenderingContext2D.prototype.fillRect=function(...args){
      if(this.canvas.id==='histogram-view')window.aidEvidence.histogramWrites++;
      return fill.apply(this,args);
    };
  });
}

async function toggle(page,id,value){
  await page.locator('#'+id).evaluate((input,value)=>{input.checked=value;input.dispatchEvent(new Event('change',{bubbles:true}));},value);
  await waitFrame(page);
}
async function hover(page){
  const box=await page.locator('#image').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
}
const photo=page=>page.locator('#image').evaluate(canvas=>({pixels:canvas.toDataURL(),frame:canvas.dataset.frame,meter:canvas.dataset.meterEv,ev:canvas.dataset.ev}));
const previewCount=page=>page.evaluate(()=>window.__cameraDiagnostics.snapshot().counts.preview||0);

test('slow obsolete aids cannot repaint after focus/hide; current aids do not restart the whole photograph',async({page})=>{
  await observeDelayedReadbacks(page);await page.goto('/?subject=none&diagnostics=performance');await waitInitialFrame(page);await waitLayers(page);
  await page.evaluate(()=>{window.aidEvidence.hold=true;});
  await toggle(page,'histogram-toggle',true);await hover(page);
  await expect(page.locator('#magnifier')).toHaveAttribute('data-state','pending');
  await page.locator('#focus').evaluate(input=>{input.value='.2';input.dispatchEvent(new Event('input',{bubbles:true}));});await waitFrame(page);
  await toggle(page,'histogram-toggle',false);await toggle(page,'magnifier-toggle',false);await page.mouse.move(0,0);
  const before=await page.evaluate(()=>({...window.aidEvidence}));
  await page.evaluate(()=>{window.aidEvidence.hold=false;});
  await page.waitForTimeout(150);
  expect(await page.evaluate(()=>window.aidEvidence.detailWrites)).toBe(before.detailWrites);
  expect(await page.evaluate(()=>window.aidEvidence.histogramWrites)).toBe(before.histogramWrites);
  await toggle(page,'histogram-toggle',true);await toggle(page,'magnifier-toggle',true);await hover(page);
  await waitLayers(page);
  // A detail texture promotion invalidates the old request, then the idle RAF
  // retries the newest crop. Both aids must eventually commit that new frame.
  await expect(page.locator('#magnifier')).toHaveAttribute('data-state','ready');
  await expect(page.locator('#histogram-view')).toHaveAttribute('data-frame',await page.locator('#image').getAttribute('data-frame'));
  const frozen=await photo(page),count=await previewCount(page);
  await page.waitForTimeout(300);
  expect(await photo(page)).toEqual(frozen);expect(await previewCount(page)).toBe(count);
});

test('scene and position races discard delayed aid images and preserve the newest selected view',async({page})=>{
  await observeDelayedReadbacks(page);await page.goto('/?subject=none&diagnostics=performance');await waitInitialFrame(page);
  await page.evaluate(()=>{window.aidEvidence.hold=true;});
  await toggle(page,'histogram-toggle',true);await hover(page);await expect(page.locator('#magnifier')).toHaveAttribute('data-state','pending');
  await page.evaluate(()=>{
    const scene=document.getElementById('scene');
    for(const id of ['classroom','apartment','kitchen']){scene.value=id;scene.dispatchEvent(new Event('change',{bubbles:true}));}
  });
  await expect(page.locator('#image')).toHaveAttribute('data-scene','kitchen');await waitLayers(page);
  await page.evaluate(()=>{for(const id of ['left','right','down'])document.querySelector(`button[data-position=${id}]`).click();});
  await expect(page.locator('#image')).toHaveAttribute('data-position','down');await waitLayers(page);
  await page.mouse.move(0,0);await page.evaluate(()=>{window.aidEvidence.hold=false;});await page.waitForTimeout(150);
  await hover(page);await expect(page.locator('#magnifier')).toHaveAttribute('data-state','ready');
  await expect(page.locator('#histogram-view')).toHaveAttribute('data-frame',await page.locator('#image').getAttribute('data-frame'));
  await expect(page.locator('#image')).toHaveAttribute('data-position','down');
  const frozen=await photo(page);await page.waitForTimeout(150);expect(await photo(page)).toEqual(frozen);
});

test('pointer movement inside the same clamped crop does not strand a delayed magnifier',async({page})=>{
  await observeDelayedReadbacks(page);await page.goto('/?subject=none&diagnostics=performance');await waitInitialFrame(page);await waitLayers(page);
  const frozen=await photo(page),box=await page.locator('#image').boundingBox();
  await page.evaluate(()=>{window.aidEvidence.hold=true;});
  await page.mouse.move(box.x+1,box.y+box.height*.5);await expect(page.locator('#magnifier')).toHaveAttribute('data-state','pending');
  const writes=await page.evaluate(()=>window.aidEvidence.detailWrites);
  // Both positions clamp to exactly the same left-edge photographic crop.
  await page.mouse.move(box.x+2,box.y+box.height*.5);await page.evaluate(()=>{window.aidEvidence.hold=false;});
  await expect.poll(()=>page.evaluate(()=>window.aidEvidence.detailWrites)).toBeGreaterThan(writes);
  await expect(page.locator('#magnifier')).toBeVisible();await expect(page.locator('#magnifier')).toHaveAttribute('data-state','ready');
  expect(await photo(page)).toEqual(frozen);
});

test('both aids keep delivering during continuous motion even when every fence spans multiple photograph frames',async({page})=>{
  await observeDelayedReadbacks(page);await page.goto('/?diagnostics=performance');await waitInitialFrame(page);await waitLayers(page);
  await setRanges(page,{aperture:3,shutter:6,iso:4});
  await page.evaluate(()=>{window.aidEvidence.motionDelayFrames=2;});
  await toggle(page,'motion',true);await toggle(page,'histogram-toggle',true);await hover(page);
  // Every result is deliberately held until two newer main frames exist. An
  // exact-latest-animation-serial guard would discard ALL of these results.
  await expect.poll(()=>page.evaluate(()=>window.aidEvidence.detailWrites),{timeout:90000}).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=>window.aidEvidence.histogramWrites),{timeout:90000}).toBeGreaterThan(0);
  const first=await page.evaluate(()=>({detail:Number(document.getElementById('magnifier').dataset.sourceTime),histogram:Number(document.getElementById('histogram-view').dataset.sourceTime)}));
  await expect.poll(()=>page.locator('#magnifier').evaluate(canvas=>Number(canvas.dataset.sourceTime)),{timeout:90000}).toBeGreaterThan(first.detail);
  await expect.poll(()=>page.locator('#histogram-view').evaluate(canvas=>Number(canvas.dataset.sourceTime)),{timeout:90000}).toBeGreaterThan(first.histogram);
  await expect(page.locator('#magnifier')).toBeVisible();
  await page.evaluate(()=>{window.aidEvidence.motionDelayFrames=0;});await toggle(page,'motion',false);await waitLayers(page);
  await expect(page.locator('#magnifier')).toHaveAttribute('data-state','ready');
  const frozen=await photo(page),count=await previewCount(page);await page.waitForTimeout(300);
  expect(await photo(page)).toEqual(frozen);expect(await previewCount(page)).toBe(count);
});
