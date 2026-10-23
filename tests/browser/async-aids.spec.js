import {downloadRecentPhoto} from './photo-controls.js';
import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {openControl,waitInitialFrame,waitFrame,waitLayers,setRanges} from './controls.js';
import {installRuntimeDiagnostics} from './runtime-diagnostics.js';
installRuntimeDiagnostics(test);

test.use({viewport:{width:1000,height:800}});

async function observeDelayedReadbacks(page){
  await page.addInitScript(()=>{
    window.aidEvidence={hold:false,detailWrites:0,histogramWrites:0};
    const wait=WebGL2RenderingContext.prototype.clientWaitSync,fences=new WeakMap(),readbackFences=new WeakSet(),pbo=new WeakSet();
    const read=WebGL2RenderingContext.prototype.readPixels,fence=WebGL2RenderingContext.prototype.fenceSync;
    WebGL2RenderingContext.prototype.readPixels=function(...args){if(typeof args[6]==='number')pbo.add(this);return read.apply(this,args);};
    WebGL2RenderingContext.prototype.fenceSync=function(...args){const sync=fence.apply(this,args);if(sync&&pbo.has(this)){readbackFences.add(sync);pbo.delete(this);}return sync;};
    WebGL2RenderingContext.prototype.clientWaitSync=function(...args){
      // Delay only Three's PBO fences, not the independent frame-pacing fence:
      // waiting for two new frames must not itself prevent those frames.
      if(!readbackFences.has(args[0]))return window.aidEvidence.holdFrames?this.TIMEOUT_EXPIRED:wait.apply(this,args);
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
  await openControl(page,'position-controls');
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
  await expect.poll(()=>page.locator('#magnifier').evaluate(canvas=>{
    const image=document.getElementById('image');
    return Number(canvas.dataset.sourceWidth)>=Number(image.dataset.detailWidth)&&canvas.dataset.quality==='final'&&document.getElementById('magnifier-status').hidden;
  }),{message:'routine final-resolution motion updates must not display a perpetual detail loader',timeout:90000}).toBe(true);
  await page.evaluate(()=>{window.aidEvidence.motionDelayFrames=0;});await toggle(page,'motion',false);await waitLayers(page);
  await expect(page.locator('#magnifier')).toHaveAttribute('data-state','ready');
  const frozen=await photo(page),count=await previewCount(page);await page.waitForTimeout(300);
  expect(await photo(page)).toEqual(frozen);expect(await previewCount(page)).toBe(count);
});

test('a blocked GPU batch keeps controls live and coalesces a drag to only the newest requested photograph',async({page})=>{
  await observeDelayedReadbacks(page);await page.goto('/?subject=none&diagnostics=performance');await waitInitialFrame(page);await waitLayers(page);
  const original=await photo(page),oldSerial=Number(await page.locator('#image').getAttribute('data-submitted-serial'));
  await page.evaluate(()=>{window.aidEvidence.holdFrames=true;const input=document.getElementById('wb');input.value='5100';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect.poll(()=>page.locator('#image').evaluate(canvas=>Number(canvas.dataset.submittedSerial))).toBeGreaterThan(oldSerial);
  const first=Number(await page.locator('#image').getAttribute('data-submitted-serial'));
  await page.evaluate(()=>{const input=document.getElementById('wb');for(let value=5200;value<=6600;value+=100){input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));}});
  await expect(page.locator('#wb')).toHaveValue('6600');await expect(page.locator('#wb-value')).toHaveText('6600 K');
  await page.waitForTimeout(150);
  expect(Number(await page.locator('#image').getAttribute('data-submitted-serial'))).toBe(first);
  await expect(page.locator('#image')).toHaveAttribute('data-ready','false');
  await page.evaluate(()=>{window.aidEvidence.holdFrames=false;});await waitFrame(page);
  expect(Number(await page.locator('#image').getAttribute('data-submitted-serial'))).toBe(first+1);
  await page.locator('#wb').evaluate(input=>{input.value='5000';input.dispatchEvent(new Event('input',{bubbles:true}));});await waitFrame(page);
  expect((await photo(page)).pixels).toBe(original.pixels);
});

test('capture reprepares changed focal/flash requirements and restores preview after an export exception',async({page})=>{
  let releaseFlash,releaseDetail,flashRequested=false,detailRequested=false,downloads=0;
  const flash=new Promise(resolve=>releaseFlash=resolve),detail=new Promise(resolve=>releaseDetail=resolve);
  page.on('download',()=>downloads++);
  await page.route('**/barbershop-plates/center-flash.webp',async route=>{flashRequested=true;await flash;await route.continue();});
  await page.route('**/barbershop-plates/center-detail.webp',async route=>{detailRequested=true;await detail;await route.continue();});
  try{
    await page.goto('/?subject=none');await waitInitialFrame(page);await waitLayers(page);
    await page.locator('#flash').evaluate(input=>{input.value='.5';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await expect.poll(()=>flashRequested).toBe(true);await page.locator('#capture').click();await expect(page.locator('#capture')).toBeDisabled();
    await page.locator('#focal').evaluate(input=>{input.value='70';input.dispatchEvent(new Event('input',{bubbles:true}));});
    releaseFlash();await expect.poll(()=>detailRequested).toBe(true);
    expect(downloads).toBe(0);await expect(page.locator('#capture')).toBeDisabled();
    releaseDetail();const download=await downloadRecentPhoto(page);
    const metadata=await sharp(await download.path()).metadata();expect(Math.max(metadata.width,metadata.height)).toBe(2048);
    await waitLayers(page);expect(Number(await page.locator('#image').getAttribute('data-detail-width'))).toBeGreaterThan(2560);
    await page.locator('#flash').evaluate(input=>{input.value='0';input.dispatchEvent(new Event('input',{bubbles:true}));});await waitFrame(page);await toggle(page,'zebra',true);
    const original=await photo(page),size=await page.locator('#image').evaluate(canvas=>[canvas.width,canvas.height]);
    await page.evaluate(()=>{
      const original=HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob=function(...args){
        if(this.id==='image'&&Math.max(this.width,this.height)===2048){HTMLCanvasElement.prototype.toBlob=original;throw Error('Synthetic export failure');}
        return original.apply(this,args);
      };
    });
    await page.locator('#capture').click();await expect(page.locator('#image')).toHaveAttribute('data-capture-error','Synthetic export failure');
    await expect(page.locator('#capture')).toBeEnabled();await expect(page.locator('#review-photos')).toHaveAttribute('data-count','1');await waitFrame(page);
    expect(await page.locator('#image').evaluate(canvas=>[canvas.width,canvas.height])).toEqual(size);
    await expect(page.locator('#zebra')).toBeChecked();expect((await photo(page)).pixels).toBe(original.pixels);expect(downloads).toBe(1);
  }finally{releaseFlash();releaseDetail();}
});
