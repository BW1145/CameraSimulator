import {expect} from '@playwright/test';

export async function waitFrame(page){
  await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  await expect.poll(()=>page.locator('#image').evaluate(e=>e.dataset.frame===e.dataset.requestedFrame)).toBe(true);
}
export async function waitLayers(page){
  await waitFrame(page);await expect(page.locator('#image')).toHaveAttribute('data-pending-layers','0');await waitFrame(page);
}

export async function setRange(page,id,value){
  await openControl(page,id);
  // Playwright fill dispatches input/change for a range itself.
  await page.locator('#'+id).fill(String(value));await waitFrame(page);
}

export async function setRanges(page,values){
  for(const id of Object.keys(values))await openControl(page,id);
  // Photographic presets are applied in one event turn, then rendered once.
  await page.evaluate(values=>{for(const [id,value]of Object.entries(values)){
    const input=document.getElementById(id);if(input.disabled)throw Error(`Disabled control: ${id}`);
    input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));
  }},values);await waitFrame(page);
}

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
