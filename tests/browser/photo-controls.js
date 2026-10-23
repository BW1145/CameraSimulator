import {expect} from '@playwright/test';
import {openControl} from './controls.js';

// Capture and download are deliberately separate user actions. Existing optical
// regression tests choose PNG so JPEG compression cannot hide pixel changes.
export async function downloadRecentPhoto(page,{format='png',longEdge=2048,close=true}={}){
  // Before capture/review were separated, these regressions waited for download
  // with no action timeout, bounded by the existing 180 s test deadline. Encoding
  // now precedes review: preserve that same capture budget instead of adding an
  // unrelated 30 s expect timeout on the full-resolution GPU/PNG operation.
  await page.waitForFunction(()=>!document.getElementById('capture').disabled,null,{timeout:0});
  await expect(page.locator('#capture')).toBeEnabled();
  await expect(page.locator('#review-photos')).toBeEnabled();
  await page.locator('#review-photos').click();
  await expect(page.locator('#photo-review')).toBeVisible();
  await openControl(page,'export-format');
  await page.locator('#export-format').selectOption(format);
  await page.locator('#export-size').selectOption(String(longEdge));
  const pending=page.waitForEvent('download');
  await page.locator('#download-photo').click();
  const downloaded=await pending;
  if(close)await page.locator('#close-review').click();
  return downloaded;
}
export async function captureAndDownload(page,options){
  await page.locator('#capture').click();
  return downloadRecentPhoto(page,options);
}
