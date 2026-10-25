import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import piexif from 'piexifjs';
import {DERIVED_VIEWPOINTS,SCENES} from '../../src/scenes.js';
import {openControl,waitFrame} from './controls.js';
import {capturePhotographicPage} from './photo-evidence.js';
import {captureAndDownload} from './photo-controls.js';

// Run only against the complete delivered packs. There are no route-provided
// picture fixtures and no reduced-resolution substitutes in this acceptance.
for(const scene of DERIVED_VIEWPOINTS)test(`${scene.name}: real seven-view rig, defaults, autofocus and captured metadata`,async({page},testInfo)=>{
  const pack=JSON.parse(await readFile(`public/${scene.platePack}/manifest.json`,'utf8'));
  const requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?subject=none');const image=page.locator('#image');await expect(image).toHaveAttribute('data-ready','true');
  expect(requests.some(url=>DERIVED_VIEWPOINTS.some(s=>url.includes(s.platePack)))).toBe(false);
  await expect(page.locator('#scene option')).toHaveText(SCENES.map(scene=>scene.name));
  await page.locator('#scene').selectOption(scene.id);await expect(image).toHaveAttribute('data-scene',scene.id);await expect(image).toHaveAttribute('data-ready','true');
  await expect(image).toHaveAttribute('data-view','prerender');await expect(image).toHaveAttribute('data-focus',pack.defaults.focus.toFixed(3));
  await expect(page.locator('#focal-value')).toHaveText(`${Number(pack.referenceFocal.toFixed(1))} mm`);
  expect(Number(await image.getAttribute('data-ev'))).toBeCloseTo(8,3);
  await expect(image).toHaveAttribute('data-display-profile',pack.displayTransform?.profile??'legacy');
  await expect(image).toHaveAttribute('data-display-exposure',String(pack.displayTransform?.exposure??0));
  // Persist the actual browser output, not just a nonempty-pixel assertion.
  // Native defaults and every real capture direction remain reviewable in CI.
  const initial=await capturePhotographicPage(page);
  await writeFile(testInfo.outputPath(`${scene.id}-default.png`),initial.png);
  await writeFile(testInfo.outputPath(`${scene.id}-default-metrics.json`),JSON.stringify(initial.metrics,null,2));
  for(const [axis,index]of [['x',0],['y',1],['z',2]]){
    const values=pack.views.map(v=>v.offset[index]*(axis==='z'?-1:1));
    expect(Number(await page.locator(`#${axis}`).getAttribute('min'))).toBeCloseTo(Math.min(...values),4);
    expect(Number(await page.locator(`#${axis}`).getAttribute('max'))).toBeCloseTo(Math.max(...values),4);
  }
  const positions=[];
  for(const entry of pack.views){
    await openControl(page,'position-controls');await page.locator(`button[data-position=${entry.id}]`).click();
    await expect(image).toHaveAttribute('data-position',entry.id);await expect(image).toHaveAttribute('data-ready','true');
    const position=JSON.parse(await image.getAttribute('data-camera-position'));expect(position).toEqual(entry.position);positions.push(position.join(','));
    const evidence=await capturePhotographicPage(page);
    await writeFile(testInfo.outputPath(`${scene.id}-${entry.id}.png`),evidence.png);
  }
  expect(new Set(positions).size).toBe(7);
  await page.locator('#reset').click();await expect(image).toHaveAttribute('data-position','center');await expect(image).toHaveAttribute('data-ready','true');
  await expect(image).toHaveAttribute('data-focus',pack.defaults.focus.toFixed(3));
  // Compare autofocus to actual source pixels, not merely to the UI clamp.
  const center=pack.views.find(v=>v.id==='center'),depthWidth=Number(await image.getAttribute('data-detail-depth-width'));
  const depthFile=depthWidth===center.detailDepthWidth?center.detailDepth:center.depth;
  const depth=await sharp(`public/${scene.platePack}/${depthFile}`).raw().toBuffer({resolveWithObject:true}),expectedDepth=[];
  const cx=Math.floor(depth.info.width/2),cy=Math.floor(depth.info.height/2);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const i=((cy+dy)*depth.info.width+cx+dx)*depth.info.channels;
    expectedDepth.push(Math.max(.2,Math.min(50,(depth.data[i]*256+depth.data[i+1])/65535*64)));
  }
  await expect(page.locator('#focus-mark')).toBeHidden();
  const box=await image.boundingBox();await image.click({position:{x:box.width*.5,y:box.height*.5}});await waitFrame(page);
  await expect(page.locator('#focus-mark')).toBeVisible();
  const focused=Number(await image.getAttribute('data-focus'));
  expect(focused).toBeGreaterThanOrEqual(Math.min(...expectedDepth)-.02);expect(focused).toBeLessThanOrEqual(Math.max(...expectedDepth)+.02);
  await page.locator('#reset').click();await expect(image).toHaveAttribute('data-ready','true');
  await openControl(page,'flash');await page.locator('#flash').fill('1');await waitFrame(page);
  const downloaded=await captureAndDownload(page,{format:'jpeg'}),bytes=await readFile(await downloaded.path());
  const metadata=await sharp(bytes).metadata(),exif=piexif.load(bytes.toString('binary'));
  expect([metadata.width,metadata.height]).toEqual([2048,1152]);
  const snapshot=JSON.parse(exif.Exif[piexif.ExifIFD.UserComment].slice(8).replace(/\0+$/,'').trim());
  expect(snapshot.scene).toEqual({id:scene.id,name:scene.name});expect(snapshot.source.sourceSha256).toBe(pack.sourceSha256);
  expect(snapshot.source.viewId).toBe('center');expect(snapshot.source.flashLayerLoaded).toBe(true);
  if(pack.displayTransform){
    expect(snapshot.rendering.displayTransform).toMatchObject(pack.displayTransform);
    expect(snapshot.rendering.displayTransform.profileSha256).toBe(pack.displayTransformProfile.profileSha256);
  }else expect(snapshot.rendering.displayTransform).toBeUndefined();
  expect(snapshot.settings.focus).toBe(pack.defaults.focus);expect(snapshot.settings.focal).toBeCloseTo(pack.referenceFocal,3);
  await downloaded.saveAs(testInfo.outputPath(`${scene.id}.jpg`));
  expect(requests.some(url=>url.endsWith('.glb'))).toBe(false);expect(errors).toEqual([]);
});

test('geometry diagnostic does not pretend the derived plates have matching GLB cameras',async({page})=>{
  await page.goto('/?renderer=gltf');
  await expect(page.locator('#scene option')).toHaveText(['理发店','教室全景','厨房','公寓']);
});

test('a delayed classroom scene response cannot replace a newer viewpoint choice',async({page})=>{
  await page.goto('/?subject=none');const image=page.locator('#image');await expect(image).toHaveAttribute('data-ready','true');
  let release,entered;const waiting=new Promise(resolve=>{entered=resolve;});
  await page.route('**/classroom-desk-plates/manifest.json',async route=>{entered();await new Promise(resolve=>{release=resolve;});await route.continue();});
  await page.locator('#scene').selectOption('classroom-desk');await waiting;
  await page.locator('#scene').selectOption('classroom-window');await expect(image).toHaveAttribute('data-scene','classroom-window');await expect(image).toHaveAttribute('data-ready','true');
  const lateResponse=page.waitForResponse(response=>response.url().includes('/classroom-desk-plates/manifest.json'));
  release();await (await lateResponse).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await waitFrame(page);await expect(image).toHaveAttribute('data-scene','classroom-window');
  await page.locator('#scene').selectOption('classroom');await expect(image).toHaveAttribute('data-scene','classroom');await expect(image).toHaveAttribute('data-ready','true');
});
