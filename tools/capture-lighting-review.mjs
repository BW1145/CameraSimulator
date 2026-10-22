import {chromium} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {openControl} from '../tests/browser/controls.js';

const out=process.argv[2]||'test-results/lighting';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.PW_CHANNEL||undefined,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],records=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const base=process.env.PW_BASE_URL||'http://127.0.0.1:8000';
const input=async(id,value)=>{await openControl(page,id);await page.locator('#'+id).fill(String(value));await page.locator('#'+id).dispatchEvent('input');};
for(const enabled of [false,true]){
  const subjects=JSON.parse(await readFile('public/scenes/barbershop-plates/subjects.json','utf8'));subjects[0].tabletopLighting=enabled;
  await page.route('**/subjects.json',r=>r.fulfill({json:subjects}));
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#image').dataset.ready==='true');
  await input('focal',50);await input('focus',6);
  await page.locator('#image').scrollIntoViewIfNeeded();const box=await page.locator('#image').boundingBox();
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.6-156.25,box.y+box.height*.4+31.25,{steps:8});await page.mouse.up();
  await page.mouse.move(0,0);await page.waitForTimeout(500);
  await page.locator('#image').screenshot({path:`${out}/table-${enabled?'lit':'baseline'}.png`});
  records.push({enabled,data:await page.locator('#image').evaluate(e=>({...e.dataset}))});
  await page.unroute('**/subjects.json');
}
await page.goto(base+'/?renderer=gltf');await page.waitForFunction(()=>document.querySelector('#image').dataset.ready==='true');
await page.mouse.move(0,0);await page.screenshot({path:`${out}/free-camera.png`,fullPage:true});
await page.goto(base);await page.waitForFunction(()=>document.querySelector('#image').dataset.ready==='true');await page.mouse.move(0,0);await page.screenshot({path:`${out}/default.png`,fullPage:true});
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await page.screenshot({path:`${out}/mobile.png`,fullPage:true});
await writeFile(`${out}/review.json`,JSON.stringify({errors,records},null,2));await browser.close();if(errors.length)throw Error(errors.join('\n'));
