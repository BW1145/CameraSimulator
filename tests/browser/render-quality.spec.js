import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {SCENES} from '../../src/scenes.js';

function constantPlate(luminance){
  const positions=new Float32Array([-100,-100,-5,100,-100,-5,100,100,-5,-100,-100,-5,100,100,-5,-100,100,-5]);
  const json={asset:{version:'2.0'},extensionsUsed:['KHR_materials_unlit'],scene:0,scenes:[{nodes:[0,1]}],nodes:[{camera:0,name:'Camera'},{mesh:0}],cameras:[{name:'Camera',type:'perspective',perspective:{yfov:1,znear:.03,zfar:150}}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[luminance,luminance,luminance,1]},extensions:{KHR_materials_unlit:{}}}],buffers:[{byteLength:positions.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.byteLength}],accessors:[{bufferView:0,componentType:5126,count:6,type:'VEC3',min:[-100,-100,-5],max:[100,100,-5]}]};
  const encoded=Buffer.from(JSON.stringify(json));const padded=Buffer.alloc(Math.ceil(encoded.length/4)*4,32);encoded.copy(padded);const bin=Buffer.from(positions.buffer);const result=Buffer.alloc(12+8+padded.length+8+bin.length);result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(padded.length,12);result.writeUInt32LE(0x4e4f534a,16);padded.copy(result,20);const start=20+padded.length;result.writeUInt32LE(bin.length,start);result.writeUInt32LE(0x004e4942,start+4);bin.copy(result,start+8);return result;
}

test('GPU meter reads linear dark values without a display-gamma roundtrip',async({page})=>{
  const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  for(const luminance of [.001,.01,.18]){
    await page.route('**/scenes/barbershop/scene.glb',r=>r.fulfill({contentType:'model/gltf-binary',body:constantPlate(luminance)}));
    await page.goto('/');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
    const actual=Number(await page.locator('#image').getAttribute('data-ev'))+parseFloat(await page.locator('#meter').textContent());
    expect(Math.abs(actual-(SCENES[0].baseEV+Math.log2(luminance/.18)))).toBeLessThan(.06);
    await page.unroute('**/scenes/barbershop/scene.glb');
  }
  expect(errors).toEqual([]);
});

test('dense displays receive scene pixels and mobile capture is independent of preview size',async({browser})=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2});const page=await context.newPage();
  await page.goto('/');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  const size=await page.locator('#image').evaluate(e=>({w:e.width,css:e.clientWidth,samples:Number(e.dataset.samples)}));
  expect(size.w).toBeGreaterThan(size.css*1.9);expect(size.samples).toBeGreaterThan(0);
  await page.setViewportSize({width:390,height:844});await page.locator('#more summary').click();await page.locator('#crop').selectOption('2:3');
  const pending=page.waitForEvent('download');await page.locator('#capture').click();const downloaded=await pending;const meta=await sharp(await downloaded.path()).metadata();
  expect(meta.height).toBe(2048);expect(meta.width).toBe(1365);await context.close();
});

test('capture resolves an exposure edit made in the same event turn',async({page})=>{
  await page.goto('/');await expect(page.locator('#image')).toHaveAttribute('data-ready','true');
  await page.locator('#autoISO').uncheck();
  const shoot=async iso=>{
    const pending=page.waitForEvent('download');
    await page.evaluate(iso=>{const input=document.getElementById('iso');input.value=String(iso);input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('capture').click();},iso);
    const meta=await sharp(await (await pending).path()).stats();return meta.channels.slice(0,3).reduce((s,c)=>s+c.mean,0)/3;
  };
  const dark=await shoot(0),bright=await shoot(4);
  expect(bright).toBeGreaterThan(dark*1.3);
});
