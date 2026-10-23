import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import piexif from 'piexifjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {APERTURES,SHUTTERS,ISOS} from '../../src/camera.js';
import {waitInitialFrame,waitFrame,setRange} from './controls.js';
import {downloadRecentPhoto} from './photo-controls.js';
import {installRuntimeDiagnostics} from './runtime-diagnostics.js';
installRuntimeDiagnostics(test);
const ratio=value=>value[0]/value[1];
async function shoot(page,count){
  await page.locator('#capture').click();
  await expect(page.locator('#review-photos')).toHaveAttribute('data-count',String(count));
  await expect(page.locator('#capture')).toBeEnabled();
}
async function decoded(download){
  const bytes=await readFile(await download.path());
  return {bytes,metadata:await sharp(bytes).metadata(),exif:piexif.load(bytes.toString('binary'))};
}

// Keep real browser downloads, not reconstructed fixtures, for independent
// artifact-side ExifTool inspection after CI. Expected values come from controls
// before capture; decodedSnapshot is clearly labelled as output, not an oracle.
async function retainDownload(download,testInfo,name,evidence={}){
  const path=testInfo.outputPath(name);await download.saveAs(path);
  const bytes=await readFile(path),metadata=await sharp(bytes).metadata();
  const raw=await sharp(bytes).ensureAlpha().raw().toBuffer();
  let decodedSnapshot=null;
  if(metadata.exif){
    const exif=metadata.exif.toString('binary');
    const tags=piexif.load(exif.startsWith('Exif')?exif:'Exif\0\0'+exif);
    decodedSnapshot=JSON.parse(tags.Exif[piexif.ExifIFD.UserComment].slice(8).replace(/\0+$/,'').trim());
  }
  await writeFile(testInfo.outputPath(`${name}.evidence.json`),JSON.stringify({
    filename:name,format:metadata.format,width:metadata.width,height:metadata.height,
    fileSha256:createHash('sha256').update(bytes).digest('hex'),
    rgbaPixelSha256:createHash('sha256').update(raw).digest('hex'),decodedSnapshot,...evidence,
  },null,2)+'\n');
}

test('capture freezes actual automatic exposure and encodes JPEG only once on download',async({page},testInfo)=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.toBlob;window.__photoEncodes=[];
    HTMLCanvasElement.prototype.toBlob=function(callback,type,...rest){window.__photoEncodes.push({id:this.id,type,width:this.width,height:this.height});return original.call(this,callback,type,...rest);};
  });
  await page.goto('/?renderer=gltf');await waitInitialFrame(page);
  await page.locator('#mode').selectOption('P');await page.locator('#autoISO').check();await waitFrame(page);
  const expected=await page.evaluate(({APERTURES,SHUTTERS,ISOS})=>({
    aperture:APERTURES[Number(document.getElementById('aperture').value)],shutter:SHUTTERS[Number(document.getElementById('shutter').value)],iso:ISOS[Number(document.getElementById('iso').value)],
  }),{APERTURES,SHUTTERS,ISOS});
  const before=Date.now();await shoot(page,1);const after=Date.now();
  expect(await page.evaluate(()=>window.__photoEncodes.filter(item=>item.type==='image/jpeg'))).toHaveLength(0);
  // Later slider edits must not leak into either the saved pixels or metadata.
  await page.locator('#mode').selectOption('M');await page.locator('#autoISO').uncheck();await setRange(page,'iso',0);await setRange(page,'wb',8000);
  const download=await downloadRecentPhoto(page,{format:'jpeg'});
  await retainDownload(download,testInfo,'automatic-photo.jpg',{expected:{resolved:expected,mode:'P',autoISO:true,whiteBalanceKelvin:5000,sceneId:'barbershop',captureTimeWindow:[before,after]},encodeLog:await page.evaluate(()=>window.__photoEncodes)});
  const result=await decoded(download);
  expect(result.metadata.format).toBe('jpeg');expect(Math.max(result.metadata.width,result.metadata.height)).toBe(2048);
  expect(ratio(result.exif.Exif[piexif.ExifIFD.FNumber])).toBeCloseTo(expected.aperture,5);
  expect(ratio(result.exif.Exif[piexif.ExifIFD.ExposureTime])).toBeCloseTo(expected.shutter,7);
  expect(result.exif.Exif[piexif.ExifIFD.ISOSpeedRatings]).toBe(expected.iso);
  expect(result.exif['0th'][piexif.ImageIFD.Software]).toBe('CameraSimulator');
  expect(result.exif['0th'][piexif.ImageIFD.Model]).toBeUndefined();expect(Object.keys(result.exif.GPS)).toHaveLength(0);
  const comment=result.exif.Exif[piexif.ExifIFD.UserComment];
  const snapshot=JSON.parse(comment.slice(8).replace(/\0+$/,'').trim());
  expect(snapshot.settings.wb).toBe(5000);expect(snapshot.settings.mode).toBe('P');expect(snapshot.settings.autoISO).toBe(true);
  expect(snapshot.resolved.iso).toBe(expected.iso);expect(snapshot.simulated).toBe(true);expect(snapshot.scene.id).toBe('barbershop');
  expect(Date.parse(snapshot.capturedAt)).toBeGreaterThanOrEqual(before);expect(Date.parse(snapshot.capturedAt)).toBeLessThanOrEqual(after);
  const captured=result.exif.Exif[piexif.ExifIFD.DateTimeOriginal];
  const date=Date.parse(captured.replace(/^(\d{4}):(\d{2}):(\d{2}) /,'$1-$2-$3T')+'Z');
  expect(date).toBeGreaterThanOrEqual(before-1000);expect(date).toBeLessThanOrEqual(after);
  const encodes=await page.evaluate(()=>window.__photoEncodes);
  expect(encodes.filter(item=>item.id==='image'&&item.type==='image/png')).toHaveLength(1);
  expect(encodes.filter(item=>item.type==='image/jpeg')).toHaveLength(1);
});

test('two distinct retained photos compare and export their own pixels after live edits',async({page},testInfo)=>{
  await page.goto('/?renderer=gltf');await waitInitialFrame(page);await page.locator('#autoISO').uncheck();
  await setRange(page,'iso',0);await setRange(page,'wb',3000);await shoot(page,1);
  const first=await downloadRecentPhoto(page,{format:'png'}),firstBytes=await readFile(await first.path());
  await retainDownload(first,testInfo,'comparison-first.png',{expected:{iso:ISOS[0],whiteBalanceKelvin:3000}});
  await setRange(page,'iso',4);await setRange(page,'wb',8000);await shoot(page,2);
  await page.locator('#review-photos').click();
  await expect(page.locator('#review-shots .review-shot')).toHaveCount(2);
  await page.screenshot({path:testInfo.outputPath('desktop-photo-review.png'),fullPage:true});
  await page.getByRole('checkbox',{name:'对比第 1 张',exact:true}).check();
  await page.getByRole('checkbox',{name:'对比第 2 张',exact:true}).check();
  await expect(page.locator('#review-images figure')).toHaveCount(2);
  await expect(page.locator('#review-images figure').nth(0)).toContainText('3000 K');
  await expect(page.locator('#review-images figure').nth(1)).toContainText('8000 K');
  await page.screenshot({path:testInfo.outputPath('two-photo-comparison.png'),fullPage:true});
  const secondPending=page.waitForEvent('download');await page.locator('#download-photo').click();const secondDownload=await secondPending,secondBytes=await readFile(await secondDownload.path());
  await retainDownload(secondDownload,testInfo,'comparison-second.png',{expected:{iso:ISOS[4],whiteBalanceKelvin:8000}});
  expect(await sharp(secondBytes).raw().toBuffer()).not.toEqual(await sharp(firstBytes).raw().toBuffer());
  await page.getByRole('button',{name:'查看第 1 张',exact:true}).click();
  await expect(page.locator('#review-download-target')).toContainText('第 1 张');
  const pending=page.waitForEvent('download');await page.locator('#download-photo').click();const againDownload=await pending,again=await readFile(await againDownload.path());
  await retainDownload(againDownload,testInfo,'comparison-first-again.png',{expected:{iso:ISOS[0],whiteBalanceKelvin:3000},firstExportRgbaPixelSha256:createHash('sha256').update(await sharp(firstBytes).ensureAlpha().raw().toBuffer()).digest('hex')});
  expect(await sharp(again).raw().toBuffer()).toEqual(await sharp(firstBytes).raw().toBuffer());
  await page.locator('#clear-comparison').click();await expect(page.locator('#review-images figure')).toHaveCount(1);
  await page.keyboard.press('Escape');await expect(page.locator('#photo-review')).not.toBeVisible();await expect(page.locator('#review-photos')).toBeFocused();
});

test('mobile review keeps full capture size, offers smaller PNG and returns to unchanged large preview',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/?renderer=gltf');await waitInitialFrame(page);
  const bounds=await page.locator('#image').boundingBox();await shoot(page,1);
  await expect(page.locator('#photo-review')).not.toBeVisible();
  expect(await page.locator('#image').boundingBox()).toEqual(bounds);
  await page.locator('#review-photos').click();
  await expect.poll(()=>page.locator('.review-image-viewport img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  await page.locator('#photo-review').evaluate(dialog=>dialog.scrollTo(0,0));
  await expect(page.locator('#photo-review-title')).toBeInViewport();
  await expect(page.locator('#close-review')).toBeInViewport();
  await page.screenshot({path:testInfo.outputPath('mobile-review-initial-viewport.png'),fullPage:false});
  await page.locator('#close-review').click();
  const download=await downloadRecentPhoto(page,{format:'png',longEdge:1024,close:false});
  await retainDownload(download,testInfo,'mobile-smaller-photo.png',{expected:{format:'png',longEdge:1024}});
  const metadata=await sharp(await download.path()).metadata();expect(metadata.format).toBe('png');expect(Math.max(metadata.width,metadata.height)).toBe(1024);
  await expect(page.locator('#export-quality-label')).toBeHidden();
  await page.locator('#review-zoom').click();await expect(page.locator('#review-zoom')).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>page.locator('.review-image-viewport img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  const zoom=await page.locator('.review-image-viewport').evaluate(container=>{const image=container.querySelector('img');return {width:image.getBoundingClientRect().width,natural:image.naturalWidth,scroll:container.scrollWidth,client:container.clientWidth};});
  expect(zoom.width).toBe(zoom.natural);expect(zoom.scroll).toBeGreaterThan(zoom.client);
  await page.screenshot({path:testInfo.outputPath('mobile-review-100-percent.png'),fullPage:true});
  await writeFile(testInfo.outputPath('mobile-zoom.evidence.json'),JSON.stringify(zoom,null,2)+'\n');
  await page.locator('#review-zoom').click();await expect(page.locator('#review-zoom')).toHaveAttribute('aria-pressed','false');
  expect(await page.locator('#photo-review').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('mobile-review-export.png'),fullPage:true});
  await page.locator('#close-review').click();await expect(page.locator('#review-photos')).toBeFocused();
  await expect(page.locator('#more-settings')).toHaveJSProperty('open',false);
  expect(await page.locator('#image').boundingBox()).toEqual(bounds);
});

test('delayed capture callback cannot read later controls and a null encode preserves previous shots',async({page},testInfo)=>{
  await page.goto('/?renderer=gltf');await waitInitialFrame(page);
  await page.locator('#mode').selectOption('P');await page.locator('#autoISO').check();await waitFrame(page);
  const expected=await page.evaluate(({APERTURES,SHUTTERS,ISOS})=>({
    aperture:APERTURES[Number(document.getElementById('aperture').value)],shutter:SHUTTERS[Number(document.getElementById('shutter').value)],iso:ISOS[Number(document.getElementById('iso').value)],
  }),{APERTURES,SHUTTERS,ISOS});
  await page.evaluate(()=>{
    const original=HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob=function(callback,type,...rest){
      if(this.id!=='image'||type!=='image/png')return original.call(this,callback,type,...rest);
      HTMLCanvasElement.prototype.toBlob=original;
      return original.call(this,async blob=>{
        const bitmap=await createImageBitmap(blob),copy=document.createElement('canvas');copy.width=bitmap.width;copy.height=bitmap.height;
        const ctx=copy.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
        const digest=await crypto.subtle.digest('SHA-256',ctx.getImageData(0,0,copy.width,copy.height).data);
        window.__capturePixelHash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
        window.__releaseCapture=()=>callback(blob);
      },type,...rest);
    };
  });
  await page.locator('#capture').click();await expect.poll(()=>page.evaluate(()=>typeof window.__releaseCapture)).toBe('function');
  await expect(page.locator('#capture')).toBeDisabled();await expect(page.locator('#review-photos')).toBeDisabled();
  // Deliberately edit before the encoder callback returns, without waiting for
  // a new frame: capture owns GPU serialization until it restores the preview.
  await page.evaluate(()=>{
    const mode=document.getElementById('mode');mode.value='M';mode.dispatchEvent(new Event('change',{bubbles:true}));
    const auto=document.getElementById('autoISO');auto.checked=false;auto.dispatchEvent(new Event('change',{bubbles:true}));
    for(const [id,value]of [['iso','0'],['wb','9000'],['focus','12']]){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
    window.__releaseCapture();
  });
  await expect(page.locator('#review-photos')).toHaveAttribute('data-count','1');await expect(page.locator('#capture')).toBeEnabled();
  const download=await downloadRecentPhoto(page,{format:'png',close:false});
  await retainDownload(download,testInfo,'delayed-capture-photo.png',{expected:{resolved:expected,mode:'P',autoISO:true,whiteBalanceKelvin:5000,sceneId:'barbershop'},captureMasterRgbaPixelSha256:await page.evaluate(()=>window.__capturePixelHash)});
  const pngMetadata=await sharp(await download.path()).metadata();
  expect(Math.max(pngMetadata.width,pngMetadata.height)).toBe(2048);
  expect(pngMetadata.exif).toBeDefined();
  const exifBytes=pngMetadata.exif.toString('binary');
  const tags=piexif.load(exifBytes.startsWith('Exif')?exifBytes:'Exif\0\0'+exifBytes);
  const snapshot=JSON.parse(tags.Exif[piexif.ExifIFD.UserComment].slice(8).replace(/\0+$/,'').trim());
  expect(snapshot.scene.id).toBe('barbershop');expect(snapshot.settings.mode).toBe('P');expect(snapshot.settings.autoISO).toBe(true);expect(snapshot.settings.wb).toBe(5000);expect(snapshot.settings.focus).not.toBe(12);
  expect(snapshot.resolved.aperture).toBe(expected.aperture);expect(snapshot.resolved.shutter).toBe(expected.shutter);expect(snapshot.resolved.iso).toBe(expected.iso);
  const raw=await sharp(await download.path()).ensureAlpha().raw().toBuffer();
  expect(createHash('sha256').update(raw).digest('hex')).toBe(await page.evaluate(()=>window.__capturePixelHash));
  await page.locator('#close-review').click();await waitFrame(page);
  const size=await page.locator('#image').evaluate(canvas=>[canvas.width,canvas.height]);
  await page.evaluate(()=>{
    const original=HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob=function(callback,type,...rest){
      if(this.id==='image'&&type==='image/png'){
        HTMLCanvasElement.prototype.toBlob=original;
        // Fail the encoder result only after its real GPU snapshot completes.
        // Do not bypass GPU work with an immediate synthetic null callback;
        // the existing thrown-export regression covers the early-failure path.
        return original.call(this,()=>callback(null),type,...rest);
      }
      return original.call(this,callback,type,...rest);
    };
  });
  await page.locator('#capture').click();await expect(page.locator('#image')).toHaveAttribute('data-capture-error',/编码失败/);
  await expect(page.locator('#capture')).toBeEnabled();await expect(page.locator('#review-photos')).toHaveAttribute('data-count','1');await waitFrame(page);
  const restoredSize=await page.locator('#image').evaluate(canvas=>[canvas.width,canvas.height]);
  expect(restoredSize).toEqual(size);
  await writeFile(testInfo.outputPath('null-encode-restoration.evidence.json'),JSON.stringify({viewport:page.viewportSize(),previewBefore:size,previewAfter:restoredSize,captureDimensions:[pngMetadata.width,pngMetadata.height],retainedCount:1,ready:await page.locator('#image').getAttribute('data-ready')},null,2)+'\n');
});
