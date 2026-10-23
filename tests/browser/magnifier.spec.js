import {test,expect} from '@playwright/test';
import {openControl,setRange,setRanges,waitFrame,waitInitialFrame,waitLayers} from './controls.js';
import {installRuntimeDiagnostics} from './runtime-diagnostics.js';
installRuntimeDiagnostics(test);

test.use({viewport:{width:1000,height:800}});

async function observeMagnifier(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/WebGL|THREE|shader|framebuffer/i.test(message.text()))errors.push(message.text());});
  // Observe actual pixel delivery, so a stale data-source attribute cannot make
  // a hover/focus/scene transition pass without rendering a new detail image.
  await page.addInitScript(()=>{
    window.magnifierEvidence={writes:0,previewCopies:0};
    const put=CanvasRenderingContext2D.prototype.putImageData,draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.putImageData=function(...args){
      const result=put.apply(this,args);if(this.canvas.id==='magnifier')window.magnifierEvidence.writes++;return result;
    };
    CanvasRenderingContext2D.prototype.drawImage=function(...args){
      if(this.canvas.id==='magnifier'&&args[0]?.id==='image')window.magnifierEvidence.previewCopies++;
      return draw.apply(this,args);
    };
  });
  return errors;
}

async function hoverDetail(page,x=.5,y=.5){
  await page.mouse.move(0,0);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const image=page.locator('#image');await image.scrollIntoViewIfNeeded();await waitFrame(page);
  const before=await page.evaluate(()=>window.magnifierEvidence.writes),box=await image.boundingBox();
  await page.mouse.move(box.x+box.width*x,box.y+box.height*y);
  await expect.poll(()=>page.evaluate(()=>window.magnifierEvidence.writes),{message:'hover must produce a fresh offscreen detail image'}).toBeGreaterThan(before);
  await expect(page.locator('#magnifier')).toBeVisible();
  await expect(page.locator('#magnifier')).toHaveAttribute('data-source','detail-render');
  // Provisional feedback is useful, but every photographic assertion below
  // still waits for the actual selected high-resolution source to be rendered.
  await waitLayers(page);
  await expect(page.locator('#magnifier')).toHaveAttribute('data-state','ready');
  await expect.poll(()=>page.locator('#magnifier').evaluate(canvas=>{
    const image=document.getElementById('image');
    return Number(canvas.dataset.sourceWidth)>=Number(image.dataset.detailWidth)&&Number(canvas.dataset.sourceDepthWidth)>=Number(image.dataset.detailDepthWidth);
  })).toBe(true);
}

async function assertDetailPixels(page){
  const metrics=await page.locator('#magnifier').evaluate(canvas=>{
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let sum=0,min=255,max=0,opaque=0;
    for(let i=0;i<pixels.length;i+=4){const value=(pixels[i]+pixels[i+1]+pixels[i+2])/3;sum+=value;min=Math.min(min,value);max=Math.max(max,value);if(pixels[i+3]===255)opaque++;}
    return {width:canvas.width,height:canvas.height,cssWidth:canvas.clientWidth,cssHeight:canvas.clientHeight,density:Math.min(2,Math.max(1,devicePixelRatio)),mean:sum/(pixels.length/4),range:max-min,opaque:opaque/(pixels.length/4)};
  });
  expect(metrics.width).toBe(Math.round(metrics.cssWidth*metrics.density));
  expect(metrics.height).toBe(Math.round(metrics.cssHeight*metrics.density));
  expect(metrics.opaque).toBe(1);expect(metrics.mean).toBeGreaterThan(2);expect(metrics.range).toBeGreaterThan(4);
  expect(await page.evaluate(()=>window.magnifierEvidence.previewCopies)).toBe(0);
  return metrics;
}

async function saveEvidence(page,name){
  const path=test.info().outputPath(`${name}.png`);
  await page.locator('#viewfinder').screenshot({path});
  await test.info().attach(name,{path,contentType:'image/png'});
}

const mainFrame=page=>page.locator('#image').evaluate(canvas=>({
  width:canvas.width,height:canvas.height,pixels:canvas.toDataURL(),focus:canvas.dataset.focus,
  meter:canvas.dataset.meterEv,exposure:canvas.dataset.ev,frame:canvas.dataset.frame,
  position:canvas.dataset.cameraPosition,temporal:canvas.dataset.temporalSamples,
}));

test('paused fan magnifier requests real detail, resolves edge crops, and preserves the main photograph',async({page})=>{
  // A 2.5× crop must exceed the 2560px base plate's 15% upgrade threshold;
  // the unmagnified preview must still fit the base, preserving lazy loading.
  await page.setViewportSize({width:1280,height:800});
  const errors=await observeMagnifier(page),requests=[];
  page.on('request',request=>{if(request.url().endsWith('/barbershop-plates/center-detail.webp'))requests.push(request.url());});
  await page.goto('/');await waitInitialFrame(page);await waitLayers(page);
  const image=page.locator('#image'),initialDetail=Number(await image.getAttribute('data-detail-width'));
  expect(requests).toHaveLength(0);
  await openControl(page,'pause');await page.locator('#pause').check();await page.locator('#motion').check();
  // Retain the normal room exposure while keeping temporal work bounded on CI.
  await setRanges(page,{aperture:3,shutter:6,iso:4});
  const fan=await image.evaluate(canvas=>({x:Number(canvas.dataset.ballX),y:1-Number(canvas.dataset.ballY)}));
  expect(fan.x).toBeGreaterThan(0);expect(fan.x).toBeLessThan(1);expect(fan.y).toBeGreaterThan(0);expect(fan.y).toBeLessThan(1);
  await hoverDetail(page,fan.x,fan.y);await expect.poll(()=>requests.length).toBe(1);await waitLayers(page);
  await expect.poll(async()=>Number(await image.getAttribute('data-detail-width'))).toBeGreaterThan(initialDetail);
  await hoverDetail(page,fan.x,fan.y);const metrics=[await assertDetailPixels(page)];
  await saveEvidence(page,'paused-fan-detail-center');
  const original=await mainFrame(page);
  for(const [x,y]of [[.002,.5],[.998,.5],[.5,.002],[.5,.998]]){
    await hoverDetail(page,x,y);metrics.push(await assertDetailPixels(page));
    expect(await mainFrame(page)).toEqual(original);
  }
  await saveEvidence(page,'paused-fan-detail-bottom-edge');
  await hoverDetail(page,fan.x,fan.y);expect(await mainFrame(page)).toEqual(original);
  await test.info().attach('detail-render-metrics.json',{body:JSON.stringify(metrics,null,2),contentType:'application/json'});
  expect(errors).toEqual([]);
});

test('detail magnifier follows focus changes and switches across all four photographic scenes',async({page})=>{
  const errors=await observeMagnifier(page),metrics=[];
  await page.goto('/?subject=none');await waitInitialFrame(page);
  const image=page.locator('#image');
  for(const scene of ['barbershop','classroom','kitchen','apartment']){
    if(scene!=='barbershop')await page.locator('#scene').selectOption(scene);
    await expect(image).toHaveAttribute('data-scene',scene);await waitFrame(page);
    await hoverDetail(page);await waitLayers(page);await hoverDetail(page);
    if(scene==='barbershop'){
      const initial=await page.locator('#magnifier').evaluate(canvas=>canvas.toDataURL());
      await setRange(page,'focus',.2);await hoverDetail(page);await expect(image).toHaveAttribute('data-focus','0.200');
      expect(await page.locator('#magnifier').evaluate(canvas=>canvas.toDataURL())).not.toBe(initial);
      const box=await image.boundingBox();await image.click({position:{x:box.width/2,y:box.height/2}});await waitFrame(page);
      expect(Number(await image.getAttribute('data-focus'))).toBeGreaterThan(.2);await hoverDetail(page);
    }
    metrics.push({scene,...await assertDetailPixels(page)});
    await saveEvidence(page,`${scene}-detail-magnifier`);
  }
  await test.info().attach('scene-detail-metrics.json',{body:JSON.stringify(metrics,null,2),contentType:'application/json'});
  expect(errors).toEqual([]);
});
