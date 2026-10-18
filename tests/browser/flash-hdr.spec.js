import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {openControl} from './controls.js';

async function instrument(page){
  await page.addInitScript(()=>{
    window.hdrAudit=[];window.hdrAuditEnabled=false;
    for(const name of ['drawArrays','drawElements']){
      const original=WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name]=function(...args){
        const answer=original.apply(this,args);
        if(!window.hdrAuditEnabled)return answer;
        const gl=this,program=gl.getParameter(gl.CURRENT_PROGRAM),value=name=>{const location=gl.getUniformLocation(program,name);return location?gl.getUniform(program,location):null;};
        const scale=value('radianceScale')??value('sceneRadianceScale');if(scale!==null)window.hdrLastScale=scale;
        if(value('sceneRadianceScale')!==null)window.hdrAudit.push({meshScale:scale});
        const readType=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
        if(!gl.getParameter(gl.FRAMEBUFFER_BINDING)||gl.getParameter(gl.SAMPLES)>0||![gl.FLOAT,gl.HALF_FLOAT].includes(readType))return answer;
        const viewport=gl.getParameter(gl.VIEWPORT),pixels=readType===gl.FLOAT?new Float32Array(viewport[2]*viewport[3]*4):new Uint16Array(viewport[2]*viewport[3]*4);
        gl.readPixels(viewport[0],viewport[1],viewport[2],viewport[3],gl.RGBA,readType,pixels);
        let peak=0,invalid=0;for(let i=0;i<pixels.length;i++)if(i%4!==3){const raw=pixels[i],n=readType===gl.FLOAT?raw:((raw&32768)?-1:1)*((raw&31744)===31744?Infinity:(raw&31744)?2**(((raw>>10)&31)-15)*(1+(raw&1023)/1024):2**(-14)*(raw&1023)/1024);if(!Number.isFinite(n))invalid++;else peak=Math.max(peak,n);}
        window.hdrAudit.push({peak,invalid,scale:window.hdrLastScale,lens:value('lensOnly'),difference:value('difference'),weight:value('weight')});
        return answer;
      };
    }
  });
}
async function input(page,id,value){await openControl(page,id);await page.locator('#'+id).fill(String(value));await page.locator('#'+id).dispatchEvent('input');}
async function shoot(page,shutter){
  await page.evaluate(()=>{window.hdrAudit=[];window.hdrAuditEnabled=true;});await input(page,'shutter',shutter);
  await page.waitForTimeout(250);
  const image=page.locator('#image');const scale=Number(await image.getAttribute('data-radiance-scale')),ev=Number(await image.getAttribute('data-ev'));
  await page.evaluate(()=>{window.hdrAuditEnabled=false;});const records=await page.evaluate(()=>window.hdrAudit);
  const relevant=records.filter(record=>record.peak!==undefined&&Math.abs(record.scale-scale)<1e-6);
  if(!relevant.length)console.log('empty HDR readback',JSON.stringify({scale,records:records.slice(0,10)}));expect(relevant.length).toBeGreaterThan(0);expect(relevant.reduce((sum,r)=>sum+r.invalid,0)).toBe(0);
  const peak=Math.max(...relevant.map(r=>r.peak)),stats=await sharp(await image.screenshot()).stats();
  return {scale,peak,unscaledPeak:peak/scale,exposedPeak:peak/scale*2**(8-ev),mean:stats.channels.slice(0,3).reduce((sum,c)=>sum+c.mean,0)/3,meshScales:[...new Set(records.filter(r=>r.meshScale!==undefined).map(r=>r.meshScale))]};
}

test('actual high-HDR barber flash and 4603-radiance fixture stay finite at 1/8000 and preserve energy',async({page})=>{
  await instrument(page);
  const manifest=JSON.parse(await readFile('public/scenes/barbershop-plates/manifest.json','utf8'));
  for(const view of manifest.views){delete view.detailFile;delete view.detailDepth;}
  await page.route('**/barbershop-plates/manifest.json',r=>r.fulfill({json:manifest}));
  const black=await sharp({create:{width:4,height:4,channels:3,background:{r:0,g:0,b:0}}}).webp({lossless:true}).toBuffer();
  await page.route('**/barbershop-plates/right.webp',r=>r.fulfill({contentType:'image/webp',body:black}));
  for(const fixture of [false,true]){
    if(fixture){
      const code=Math.round((Math.log2(4602.9560546875)-manifest.flash.encoding.min)/(manifest.flash.encoding.max-manifest.flash.encoding.min)*255);
      const flash=await sharp(Buffer.alloc(4*4*3,code),{raw:{width:4,height:4,channels:3}}).webp({lossless:true}).toBuffer();
      await page.route('**/barbershop-plates/right-flash.webp',r=>r.fulfill({contentType:'image/webp',body:flash}));
    }
    await page.goto('/?subject=none');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
    await page.locator('button[data-position=right]').click();await expect(page.locator('#image')).toHaveAttribute('data-position','right');
    await page.locator('#autoISO').uncheck();await input(page,'iso',0);await input(page,'aperture',8);await input(page,'flash',2);await page.waitForTimeout(400);
    const slow=await shoot(page,6),fast=await shoot(page,0);
    console.log('high HDR flash',JSON.stringify({fixture,slow,fast}));
    expect(fast.unscaledPeak).toBeGreaterThan(65504);expect(fast.peak).toBeLessThan(65504);
    expect(Math.abs(Math.log2(fast.exposedPeak/slow.exposedPeak))).toBeLessThan(.015);
    expect(Math.abs(fast.mean-slow.mean)).toBeLessThan(1);
  }
});

test('live fan uses the same pre-exposure scale during high-power short flash',async({page})=>{
  await instrument(page);
  // Isolate the real fan point-light pulse from ambient and the static plate.
  const subjects=JSON.parse(await readFile('public/scenes/barbershop-plates/subjects.json','utf8'));
  for(const subject of subjects)for(const light of subject.areaLights||[])light.radiance=0;
  await page.route('**/barbershop-plates/subjects.json',r=>r.fulfill({json:subjects}));
  const black=await sharp({create:{width:4,height:4,channels:3,background:{r:0,g:0,b:0}}}).webp({lossless:true}).toBuffer();
  await page.route('**/barbershop-plates/center.webp',r=>r.fulfill({contentType:'image/webp',body:black}));
  await page.route('**/barbershop-plates/center-flash.webp',r=>r.fulfill({contentType:'image/webp',body:black}));
  const hdr=Buffer.concat([Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 4\n'),Buffer.alloc(4*2*4)]);
  await page.route('**/barbershop-plates/fan-room.hdr',r=>r.fulfill({contentType:'application/octet-stream',body:hdr}));
  await page.goto('/');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  await page.locator('#autoISO').uncheck();await input(page,'iso',0);await input(page,'aperture',8);await input(page,'flash',2);await page.waitForTimeout(400);
  const slow=await shoot(page,6),fast=await shoot(page,0);console.log('live fan HDR flash',JSON.stringify({slow,fast}));
  expect(Math.abs(Math.log2(fast.exposedPeak/slow.exposedPeak))).toBeLessThan(.015);
  expect(Math.abs(fast.mean-slow.mean)).toBeLessThan(1);
  expect(fast.meshScales.length).toBeGreaterThan(0);for(const scale of fast.meshScales)expect(Math.abs(scale-fast.scale)).toBeLessThan(1e-6);
  expect(fast.peak).toBeGreaterThan(0);expect(fast.peak).toBeLessThan(65504);
});


test('legacy Scene Color background receives pre-exposure without a flash brightness jump',async({page})=>{
  const room={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{camera:0,name:'Camera'}],cameras:[{name:'Camera',type:'perspective',perspective:{yfov:1,znear:.03,zfar:150}}]};
  await page.route('**/scenes/barbershop/scene.glb',r=>r.fulfill({json:room}));
  await page.goto('/?renderer=gltf');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  await page.locator('#autoISO').uncheck();await input(page,'iso',0);await input(page,'aperture',3);await input(page,'shutter',6);
  const mean=async()=>{await page.mouse.move(0,0);await page.waitForTimeout(150);return (await sharp(await page.locator('#image').screenshot()).stats()).channels.slice(0,3).reduce((sum,c)=>sum+c.mean,0)/3;};
  const ambient=await mean();await input(page,'flash',2);const pulse=await mean();
  console.log('legacy background pre-exposure',JSON.stringify({ambient,pulse}));expect(ambient).toBeGreaterThan(10);expect(Math.abs(pulse-ambient)).toBeLessThan(1);
});
