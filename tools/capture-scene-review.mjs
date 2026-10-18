import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {capturePhotographicPage} from '../tests/browser/photo-evidence.js';

const out=process.argv[2]||'docs/visual-review';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.PW_CHANNEL||undefined,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),records=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.PW_BASE_URL||'http://127.0.0.1:8002/');
const buildEntry=await page.locator('script[src]').first().getAttribute('src');
const ready=()=>page.waitForFunction(()=>document.querySelector('#image').dataset.ready==='true');
await ready();
for(const [id,n]of [['classroom',25],['kitchen',26],['apartment',27]]){
  await page.locator('#scene').selectOption(id);await page.waitForFunction(id=>document.querySelector('#image').dataset.scene===id,id);await ready();await page.locator('#reset').click();await ready();await page.mouse.move(0,0);
  const desktop=await capturePhotographicPage(page,{path:join(out,`${n}-final-${id}.png`)});
  records.push({scene:id,viewport:1440,...desktop.metrics,data:await page.locator('#image').evaluate(e=>({...e.dataset}))});
  await page.setViewportSize({width:390,height:844});await ready();
  const mobile=await capturePhotographicPage(page,{path:join(out,`${n}-final-${id}-mobile.png`)});
  records.push({scene:id,viewport:390,...mobile.metrics,data:await page.locator('#image').evaluate(e=>({...e.dataset}))});
  await page.setViewportSize({width:1440,height:1000});await ready();
}
await writeFile(join(out,'final-page-pixel-evidence.json'),JSON.stringify({capturedAt:new Date().toISOString(),buildEntry,errors,records},null,2));await browser.close();
if(errors.length)throw Error(errors.join('\n'));
