import sharp from 'sharp';
import assert from 'node:assert/strict';

export async function capturePhotographicPage(page,options={}){
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForFunction(()=>document.querySelector('#image').dataset.ready==='true');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  // ResizeObserver can invalidate the old frame during those layout ticks.
  // Wait for its replacement before sampling the actual page photograph.
  await page.waitForFunction(()=>document.querySelector('#image').dataset.ready==='true');
  const canvas=page.locator('#image'),box=await canvas.boundingBox(),scrollY=await page.evaluate(()=>window.scrollY);
  const png=await page.screenshot({fullPage:true,...options});
  const crop=await sharp(png).extract({left:Math.round(box.x),top:Math.round(box.y+scrollY),width:Math.floor(box.width),height:Math.floor(box.height)}).png().toBuffer();
  const pixels=await sharp(crop).removeAlpha().raw().toBuffer(),stats=await sharp(crop).stats();
  const channels=stats.channels.slice(0,3),mean=channels.reduce((n,c)=>n+c.mean,0)/3,deviation=channels.reduce((n,c)=>n+c.stdev,0)/3;
  let visible=0;for(let i=0;i<pixels.length;i+=3)if(.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2]>35)visible++;
  const contentFraction=visible/(pixels.length/3);
  assert.ok(mean>12&&deviation>8&&contentFraction>.05,`Photograph is empty/flat: mean=${mean}, deviation=${deviation}, visible=${contentFraction}`);
  return {png,metrics:{mean,deviation,contentFraction,box}};
}
