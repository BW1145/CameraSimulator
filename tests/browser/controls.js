import {expect} from '@playwright/test';

export async function openControl(page,id){
  const details=await page.locator('#'+id).evaluate(element=>{const d=element.closest('details');return d?{id:d.id,open:d.open}:null;});
  if(details){
    const panel=page.locator('#'+details.id);
    if(!details.open)await panel.locator(':scope > summary').click();
    await expect(panel).toHaveJSProperty('open',true);
  }
  await expect(page.locator('#'+id)).toBeVisible();
}

// Read one rendered frame atomically: separate protocol reads can span several
// slow SwiftShader frames and accidentally compare different orbital phases.
export const motionSample=page=>page.locator('#image').evaluate(canvas=>({
  focus:Number(canvas.dataset.focus),x:Number(canvas.dataset.ballX),y:Number(canvas.dataset.ballY),
}));

export async function waitForMotion(page,initial){
  await expect.poll(async()=>{
    const sample=await motionSample(page);return Math.hypot(sample.x-initial.x,sample.y-initial.y);
  },{message:'the rendered moving subject must advance before checking autofocus',timeout:45000}).toBeGreaterThan(.025);
}
