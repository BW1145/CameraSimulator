import {test,expect} from '@playwright/test';
import {waitInitialFrame,waitFrame,waitLayers} from './controls.js';
import {installRuntimeDiagnostics} from './runtime-diagnostics.js';
installRuntimeDiagnostics(test);

// A 2.5x photographic crop crosses the lazy-detail threshold, while this
// unmagnified preview still fits the original 2560px source.
test.use({viewport:{width:1280,height:800}});

async function observeProgressiveDetail(page){
  await page.addInitScript(()=>{
    const evidence=window.progressiveDetail={hold:true,releaseNext:0,pboReads:0,failedReadbacks:0,writes:[],previewCopies:0};
    const pending=new WeakSet(),readbackFences=new WeakSet(),allowed=new WeakSet();
    const read=WebGL2RenderingContext.prototype.readPixels,fence=WebGL2RenderingContext.prototype.fenceSync,wait=WebGL2RenderingContext.prototype.clientWaitSync;
    WebGL2RenderingContext.prototype.readPixels=function(...args){
      if(typeof args[6]==='number'){pending.add(this);evidence.pboReads++;}
      return read.apply(this,args);
    };
    WebGL2RenderingContext.prototype.fenceSync=function(...args){
      const sync=fence.apply(this,args);
      if(sync&&pending.has(this)){readbackFences.add(sync);pending.delete(this);}
      return sync;
    };
    WebGL2RenderingContext.prototype.clientWaitSync=function(...args){
      // Only Three's PBO fences are held. Independent photograph pacing must
      // keep completing even while pixel delivery is deliberately delayed.
      if(readbackFences.has(args[0])&&evidence.hold&&!allowed.has(args[0])){
        if(evidence.releaseNext>0){evidence.releaseNext--;allowed.add(args[0]);}
        else return this.TIMEOUT_EXPIRED;
      }
      const result=wait.apply(this,args);
      if(readbackFences.has(args[0])&&result===this.WAIT_FAILED)evidence.failedReadbacks++;
      return result;
    };
    const put=CanvasRenderingContext2D.prototype.putImageData,draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.putImageData=function(...args){
      const result=put.apply(this,args);
      if(this.canvas.id==='magnifier'){
        const canvas=this.canvas;
        // App metadata is written immediately after the actual pixel write.
        queueMicrotask(()=>evidence.writes.push({at:performance.now(),dataset:{...canvas.dataset},hidden:canvas.hidden,visibility:getComputedStyle(canvas).visibility}));
      }
      return result;
    };
    CanvasRenderingContext2D.prototype.drawImage=function(...args){
      if(this.canvas.id==='magnifier'&&args[0]?.id==='image')evidence.previewCopies++;
      return draw.apply(this,args);
    };
  });
}

async function holdDetailNetwork(page){
  let release,requests=0;
  const held=new Promise(resolve=>release=resolve);
  await page.route('**/barbershop-plates/center-detail.webp',async route=>{requests++;await held;await route.continue();});
  return {release,requests:()=>requests};
}
async function hoverCenter(page){
  const box=await page.locator('#image').boundingBox();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
}
async function releaseOneRead(page){await page.evaluate(()=>window.progressiveDetail.releaseNext++);}
const evidence=page=>page.evaluate(()=>window.progressiveDetail);
const photo=page=>page.locator('#image').evaluate(canvas=>({pixels:canvas.toDataURL(),width:canvas.width,height:canvas.height,focus:canvas.dataset.focus,meter:canvas.dataset.meterEv,exposure:canvas.dataset.ev,frame:canvas.dataset.frame}));

async function assertActualDetail(page,width,state){
  const magnifier=page.locator('#magnifier');
  await expect(magnifier).toBeVisible();await expect(magnifier).toHaveAttribute('data-source','detail-render');
  await expect(magnifier).toHaveAttribute('data-source-width',String(width));await expect(magnifier).toHaveAttribute('data-state',state);
  // This fixture's depth source is independently 1280 -> 2560, not 5120.
  await expect(magnifier).toHaveAttribute('data-source-depth-width',String(width/2));
  await expect(magnifier).toHaveAttribute('data-quality',state==='loading'?'provisional':'final');
  const metrics=await magnifier.evaluate(canvas=>{
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let opaque=0,min=255,max=0;
    for(let i=0;i<pixels.length;i+=4){min=Math.min(min,pixels[i],pixels[i+1],pixels[i+2]);max=Math.max(max,pixels[i],pixels[i+1],pixels[i+2]);if(pixels[i+3]===255)opaque++;}
    return {width:canvas.width,height:canvas.height,cssWidth:canvas.clientWidth,cssHeight:canvas.clientHeight,opaque:opaque/(pixels.length/4),range:max-min,pointerEvents:getComputedStyle(canvas).pointerEvents};
  });
  expect(metrics.width).toBe(metrics.cssWidth);expect(metrics.height).toBe(metrics.cssHeight);
  expect(metrics.opaque).toBe(1);expect(metrics.range).toBeGreaterThan(4);expect(metrics.pointerEvents).toBe('none');
  expect(await page.locator('#magnifier-status').evaluate(element=>getComputedStyle(element).pointerEvents)).toBe('none');
  expect((await evidence(page)).previewCopies).toBe(0);
}

test('same-capture promotion keeps actual lower-source feedback visible until the 5120px detail completes',async({page})=>{
  await observeProgressiveDetail(page);const network=await holdDetailNetwork(page);
  try{
    await page.goto('/?subject=none&diagnostics=performance');await waitInitialFrame(page);await waitLayers(page);
    await expect(page.locator('#image')).toHaveAttribute('data-detail-width','2560');expect(network.requests()).toBe(0);
    const original=await photo(page);await hoverCenter(page);
    await expect.poll(network.requests).toBe(1);await expect.poll(()=>page.evaluate(()=>window.progressiveDetail.pboReads)).toBe(1);
    expect((await evidence(page)).writes).toHaveLength(0);
    await expect(page.locator('#magnifier-status')).toBeHidden();
    await releaseOneRead(page);await assertActualDetail(page,2560,'loading');
    await expect(page.locator('#magnifier-status')).toBeVisible();await expect(page.locator('#magnifier-status')).toHaveText('精细图加载中…');
    expect(await photo(page)).toEqual(original);

    // Re-enter the SAME physical crop to produce a second lower-source read.
    // Keep it pending across promotion while retaining the valid first image.
    await page.mouse.move(0,0);await hoverCenter(page);
    await expect.poll(()=>page.evaluate(()=>window.progressiveDetail.pboReads)).toBe(2);
    await expect(page.locator('#magnifier')).toBeVisible();
    network.release();await waitLayers(page);await expect(page.locator('#image')).toHaveAttribute('data-detail-width','5120');
    const promotedPhoto=await photo(page);
    await expect(page.locator('#magnifier')).toBeVisible();await expect(page.locator('#magnifier')).toHaveAttribute('data-source-width','2560');
    await releaseOneRead(page);
    await expect.poll(()=>page.evaluate(()=>window.progressiveDetail.writes.length)).toBe(2);
    const lowerAfterPromotion=(await evidence(page)).writes[1];
    expect(lowerAfterPromotion.dataset.sourceWidth).toBe('2560');expect(lowerAfterPromotion.dataset.state).toBe('loading');expect(lowerAfterPromotion.visibility).toBe('visible');
    await expect.poll(()=>page.evaluate(()=>window.progressiveDetail.pboReads)).toBe(3);
    await expect(page.locator('#magnifier')).toBeVisible();await expect(page.locator('#magnifier-status')).toBeVisible();
    expect(await photo(page)).toEqual(promotedPhoto);
    await releaseOneRead(page);await assertActualDetail(page,5120,'ready');
    await expect(page.locator('#magnifier-status')).toBeHidden();expect(await photo(page)).toEqual(promotedPhoto);
    const writes=(await evidence(page)).writes;
    expect(writes.map(write=>Number(write.dataset.sourceWidth))).toEqual([2560,2560,5120]);
    await test.info().attach('progressive-delivery-evidence.json',{body:JSON.stringify(await evidence(page),null,2),contentType:'application/json'});
  }finally{network.release();await page.evaluate(()=>{if(window.progressiveDetail)window.progressiveDetail.hold=false;}).catch(()=>{});}
});

for(const change of ['focus','white-balance','crop'])test(`changed ${change} discards a pending lower-source crop before any obsolete pixel delivery`,async({page})=>{
  await observeProgressiveDetail(page);const network=await holdDetailNetwork(page);
  try{
    await page.goto('/?subject=none&diagnostics=performance');await waitInitialFrame(page);await waitLayers(page);await hoverCenter(page);
    await expect.poll(network.requests).toBe(1);await expect.poll(()=>page.evaluate(()=>window.progressiveDetail.pboReads)).toBe(1);
    await page.evaluate(change=>{
      const id=change==='white-balance'?'wb':change,input=document.getElementById(id);
      input.value=change==='focus'?'.2':change==='white-balance'?'6500':'16:9';
      input.dispatchEvent(new Event(change==='crop'?'change':'input',{bubbles:true}));
    },change);
    await waitFrame(page);await hoverCenter(page);const frozen=await photo(page);
    await expect(page.locator('#magnifier-status')).toBeHidden();
    await releaseOneRead(page);
    // Newest intent must be requested after the obsolete PBO drains, but its
    // fence stays held so NO changed-intent image can mask an obsolete write.
    await expect.poll(()=>page.evaluate(()=>window.progressiveDetail.pboReads)).toBe(2);
    expect((await evidence(page)).writes).toHaveLength(0);
    await releaseOneRead(page);await assertActualDetail(page,2560,'loading');
    expect((await evidence(page)).writes).toHaveLength(1);expect(await photo(page)).toEqual(frozen);
    if(change==='focus')await expect(page.locator('#image')).toHaveAttribute('data-focus','0.200');
    if(change==='white-balance')await expect(page.locator('#wb')).toHaveValue('6500');
    if(change==='crop')await expect(page.locator('#crop')).toHaveValue('16:9');
  }finally{network.release();await page.evaluate(()=>{if(window.progressiveDetail)window.progressiveDetail.hold=false;}).catch(()=>{});}
});

test('native context loss cancels a pending lower-source image and restoration requests fresh feedback',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await observeProgressiveDetail(page);const network=await holdDetailNetwork(page);
  try{
    await page.goto('/?subject=none&diagnostics=performance');await waitInitialFrame(page);await waitLayers(page);
    const supported=await page.locator('#image').evaluate(canvas=>{
      const extension=canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
      if(!extension)return false;
      window.progressiveLoseContext=extension;
      canvas.addEventListener('webglcontextlost',()=>window.progressiveDetail.nativeLost=(window.progressiveDetail.nativeLost||0)+1);
      canvas.addEventListener('webglcontextrestored',()=>window.progressiveDetail.nativeRestored=(window.progressiveDetail.nativeRestored||0)+1);
      return true;
    });
    test.skip(!supported,'WEBGL_lose_context is unavailable; native restoration cannot be exercised');
    await hoverCenter(page);await expect.poll(network.requests).toBe(1);
    await expect.poll(()=>page.evaluate(()=>window.progressiveDetail.pboReads)).toBe(1);
    await page.evaluate(()=>window.progressiveLoseContext.loseContext());
    await expect.poll(()=>page.evaluate(()=>window.progressiveDetail.nativeLost||0)).toBe(1);
    await expect(page.locator('#magnifier')).toBeHidden();await expect(page.locator('#magnifier-status')).toBeHidden();
    // Let the obsolete native PBO poll fail WHILE the context is lost. Waiting
    // for that outcome avoids trying to read an old-context buffer after restore.
    await page.evaluate(()=>{window.progressiveDetail.hold=false;});
    await expect.poll(()=>page.evaluate(()=>window.progressiveDetail.failedReadbacks)).toBeGreaterThan(0);
    expect((await evidence(page)).writes).toHaveLength(0);
    await page.evaluate(()=>window.progressiveLoseContext.restoreContext());
    await expect.poll(()=>page.evaluate(()=>window.progressiveDetail.nativeRestored||0),{timeout:30000}).toBe(1);
    await waitInitialFrame(page);await hoverCenter(page);await assertActualDetail(page,2560,'loading');
    const fresh=(await evidence(page)).writes;
    expect(fresh.length).toBeGreaterThan(0);expect(fresh.every(write=>write.dataset.sourceWidth==='2560')).toBe(true);
    const frozen=await photo(page);await page.waitForTimeout(150);expect(await photo(page)).toEqual(frozen);
    expect(errors).toEqual([]);
    await test.info().attach('native-context-progressive-evidence.json',{body:JSON.stringify(await evidence(page),null,2),contentType:'application/json'});
  }finally{network.release();await page.evaluate(()=>{if(window.progressiveDetail)window.progressiveDetail.hold=false;}).catch(()=>{});}
});
