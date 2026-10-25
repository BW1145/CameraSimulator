import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {SCENES} from '../../src/scenes.js';
import {openControl,setRange,waitInitialFrame,waitFrame,waitLayers} from './controls.js';
import {capturePhotographicPage} from './photo-evidence.js';
import {captureAndDownload} from './photo-controls.js';

// Real delivered packs only: no response fixtures, altered manifests or reduced
// assets. The separate display-profile suite owns the 73-vector color comparison.
const sceneIds=['monk-colonnade','monk-reading-table','monk-courtyard'];
test.describe.configure({mode:'serial',timeout:300000});

function pngSnapshot(bytes){
  expect([...bytes.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
  for(let offset=8;offset+12<=bytes.length;){
    const length=bytes.readUInt32BE(offset),end=offset+12+length;
    expect(end).toBeLessThanOrEqual(bytes.length);
    const kind=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);
    if(kind==='iTXt'){
      const separator=data.indexOf(0);
      if(separator>=0&&data.toString('utf8',0,separator)==='CameraSimulator'){
        // Own exported uncompressed iTXt: compression flag/method, empty language
        // and translated keyword. Do not parse source-image metadata.
        expect([...data.subarray(separator,separator+5)]).toEqual([0,0,0,0,0]);
        return JSON.parse(data.toString('utf8',separator+5));
      }
    }
    offset=end;
  }
  throw Error('Exported PNG omitted CameraSimulator snapshot');
}

for(const id of sceneIds)test(`${id}: real seven-view photograph, native defaults, detail, flash and PNG`,async({page},testInfo)=>{
  const scene=SCENES.find(candidate=>candidate.id===id);
  expect(scene,`${id} must be in the final 13-scene selector`).toBeTruthy();
  expect(SCENES).toHaveLength(13);
  const pack=JSON.parse(await readFile(`public/${scene.platePack}/manifest.json`,'utf8'));
  const requests=[],errors=[];
  page.on('request',request=>requests.push(request.url()));
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?subject=none');await waitInitialFrame(page);
  const image=page.locator('#image');
  await expect(page.locator('#scene option')).toHaveText(SCENES.map(candidate=>candidate.name));
  expect(requests.some(url=>sceneIds.some(sceneId=>url.includes(`/${sceneId}-plates/`)))).toBe(false);
  await page.locator('#scene').selectOption(id);
  await expect(image).toHaveAttribute('data-scene',id);await waitFrame(page);
  await expect(image).toHaveAttribute('data-view','prerender');
  await expect(image).toHaveAttribute('data-focus',pack.defaults.focus.toFixed(3));
  await expect(page.locator('#focal-value')).toHaveText(`${Number(pack.referenceFocal.toFixed(1))} mm`);
  expect(Number(await image.getAttribute('data-ev'))).toBeCloseTo(8,3);
  await expect(image).toHaveAttribute('data-display-profile',pack.displayTransform.profile);
  await expect(image).toHaveAttribute('data-display-exposure',String(pack.displayTransform.exposure));
  const profilePath=`color-profiles/${pack.displayTransform.profile}`;
  const profile=JSON.parse(await readFile(`public/${profilePath}/profile.json`,'utf8'));
  for(const file of ['profile.json',profile.shader.file,...profile.luts.map(lut=>lut.file)]){
    expect(requests.some(url=>new URL(url).pathname.endsWith(`/${profilePath}/${file}`)),`actual display resource ${file}`).toBe(true);
  }

  const positions=[],metrics=[];
  for(const entry of pack.views){
    await openControl(page,'position-controls');await page.locator(`button[data-position=${entry.id}]`).click();
    await expect(image).toHaveAttribute('data-position',entry.id);await waitFrame(page);
    const position=JSON.parse(await image.getAttribute('data-camera-position'));
    expect(position).toEqual(entry.position);positions.push(position.join(','));
    await page.mouse.move(0,0);
    const evidence=await capturePhotographicPage(page);
    await writeFile(testInfo.outputPath(`${id}-${entry.id}.png`),evidence.png);
    metrics.push({view:entry.id,position,...evidence.metrics});
  }
  expect(new Set(positions).size).toBe(7);
  await page.locator('#reset').click();await expect(image).toHaveAttribute('data-position','center');await waitFrame(page);
  const center=pack.views.find(view=>view.id==='center');
  // Zoom through the real control to trigger progressive native detail. Restore
  // native framing afterward, retaining the same loaded center capture.
  await setRange(page,'focal',pack.referenceFocal*4);await waitLayers(page);
  await expect(image).toHaveAttribute('data-detail-width',String(center.detailWidth));
  await expect(image).toHaveAttribute('data-detail-depth-width',String(center.detailDepthWidth));
  for(const file of [center.detailFile,center.detailDepth])expect(requests.some(url=>new URL(url).pathname.endsWith(`/${scene.platePack}/${file}`))).toBe(true);
  await page.locator('#reset').click();await waitFrame(page);
  await expect(image).toHaveAttribute('data-focus',pack.defaults.focus.toFixed(3));
  await expect(page.locator('#focal-value')).toHaveText(`${Number(pack.referenceFocal.toFixed(1))} mm`);
  await setRange(page,'flash',1);await waitLayers(page);
  await expect(image).toHaveAttribute('data-flash-ready','true');
  expect(requests.some(url=>new URL(url).pathname.endsWith(`/${scene.platePack}/${center.flash}`))).toBe(true);

  const download=await captureAndDownload(page,{format:'png',longEdge:2048});
  const bytes=await readFile(await download.path()),metadata=await sharp(bytes).metadata(),snapshot=pngSnapshot(bytes);
  expect(metadata.format).toBe('png');expect([metadata.width,metadata.height]).toEqual([2048,1152]);
  const stats=await sharp(bytes).stats();
  expect(stats.channels.slice(0,3).reduce((sum,c)=>sum+c.stdev,0)/3).toBeGreaterThan(8);
  expect(snapshot.scene).toEqual({id,name:scene.name});expect(snapshot.source.sourceSha256).toBe(pack.sourceSha256);
  expect(snapshot.source.viewId).toBe('center');expect(snapshot.source.detailLoaded).toBe(true);expect(snapshot.source.flashLayerLoaded).toBe(true);
  expect(snapshot.settings.focus).toBe(pack.defaults.focus);expect(snapshot.settings.focal).toBeCloseTo(pack.referenceFocal,3);
  expect(snapshot.rendering.displayTransform).toMatchObject(pack.displayTransform);
  expect(snapshot.rendering.displayTransform.profileSha256).toBe(pack.displayTransformProfile.profileSha256);
  await download.saveAs(testInfo.outputPath(`${id}-export.png`));
  await writeFile(testInfo.outputPath(`${id}-runtime-evidence.json`),JSON.stringify({metrics,snapshot},null,2));
  expect(requests.some(url=>/\.glb(?:[?#]|$)/i.test(url))).toBe(false);
  expect(errors).toEqual([]);
});
