import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {setRange,setRanges,waitLayers} from './controls.js';

test('bounded shutter integration matches full-frame rendering of reflected and shadowed rotor motion',async({page})=>{
  await page.addInitScript(()=>{
    const enable=WebGL2RenderingContext.prototype.enable;
    WebGL2RenderingContext.prototype.enable=function(cap){
      if(window.fullFrameIntegration&&cap===this.SCISSOR_TEST){this.disable(cap);return;}
      return enable.call(this,cap);
    };
  });
  await page.setViewportSize({width:800,height:700});await page.goto('/?view=source');await waitLayers(page);
  await setRange(page,'focal',50);await waitLayers(page);
  const canvas=page.locator('#image');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.6-156.25,box.y+box.height*.4+18.75,{steps:8});await page.mouse.up();
  await page.locator('#pause').check();await page.locator('#motion').check();await setRanges(page,{aperture:7,shutter:10,iso:4});
  await page.mouse.move(0,0);const bounded=await canvas.screenshot();await expect(canvas).toHaveAttribute('data-temporal-samples','24');
  await page.evaluate(()=>{window.fullFrameIntegration=true;});await setRange(page,'wb',5000);const full=await canvas.screenshot();
  const a=await sharp(bounded).removeAlpha().raw().toBuffer(),b=await sharp(full).removeAlpha().raw().toBuffer();
  const difference=a.reduce((sum,n,i)=>sum+Math.abs(n-b[i]),0)/a.length;
  await test.info().attach('integration-pixel-error.json',{body:JSON.stringify({meanAbsoluteDifference:difference}),contentType:'application/json'});
  expect(difference).toBeLessThan(1);
});
