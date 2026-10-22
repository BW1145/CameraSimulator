import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {waitFrame,setRange} from './controls.js';

test('rapid slider edits invalidate the old photograph and finish on the latest visible setting',async({page})=>{
  await page.goto('/?subject=none');await waitFrame(page);const canvas=page.locator('#image');
  const ratio=async()=>{await page.mouse.move(0,0);const {channels}=await sharp(await canvas.screenshot()).stats();return channels[0].mean/channels[2].mean;};
  const neutral=await ratio();
  const pending=await page.evaluate(()=>{
    const input=document.getElementById('wb'),canvas=document.getElementById('image');
    for(const n of [3000,6000,8000]){input.value=String(n);input.dispatchEvent(new Event('input',{bubbles:true}));}
    return {ready:canvas.dataset.ready,requested:canvas.dataset.requestedFrame,completed:canvas.dataset.frame};
  });
  expect(pending.ready).toBe('false');expect(Number(pending.requested)).toBeGreaterThan(Number(pending.completed));
  await waitFrame(page);await expect(page.locator('#wb-value')).toHaveText('8000 K');
  expect(await ratio()).toBeGreaterThan(neutral*1.03);
  // A normal slider action emits one input event and reaches its own frame.
  await page.locator('#wb').evaluate(e=>{window.sliderInputs=0;e.addEventListener('input',()=>window.sliderInputs++);});
  await setRange(page,'wb',5000);expect(await page.evaluate(()=>window.sliderInputs)).toBe(1);
  expect(Math.abs(await ratio()-neutral)).toBeLessThan(.01);
});
