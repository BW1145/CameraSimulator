import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import piexif from 'piexifjs';
import {MONK_DISPLAY_TRANSFORM} from '../../src/display-profile.js';
import {waitInitialFrame,waitFrame,waitLayers,setRanges} from './controls.js';
import {captureAndDownload} from './photo-controls.js';

const profileDirectory='public/color-profiles/blender-4.5.14-agx-medium-high-v1';
const referenceDirectory='tests/fixtures/display-profile';

test('pinned OCIO GPU shader matches the independent CPU processor across HDR colors',async({page},testInfo)=>{
  const profile=JSON.parse(await readFile(`${profileDirectory}/profile.json`,'utf8'));
  const vectors=JSON.parse(await readFile(`${referenceDirectory}/cpu-vectors.json`,'utf8'));
  const shader=await readFile(`${profileDirectory}/${profile.shader.file}`,'utf8');
  const luts=await Promise.all(profile.luts.map(async lut=>({...lut,data:(await readFile(`${profileDirectory}/${lut.file}`)).toString('base64')})));
  await page.setContent('<canvas id="probe"></canvas>');
  const actual=await page.evaluate(({shader,luts,cases})=>{
    const canvas=document.getElementById('probe');canvas.width=cases.length;canvas.height=1;
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:false});
    if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('Float WebGL2 color-buffer support required');
    const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const program=gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}'));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;uniform highp sampler2D inputs;out vec4 fragColor;\n'+shader+'\nvoid main(){fragColor=monkAgxDisplay(texelFetch(inputs,ivec2(gl_FragCoord.xy),0));}'));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    const texture=(target,unit)=>{const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(target,t);gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(target,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(target,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
    texture(gl.TEXTURE_2D,0);const input=Float32Array.from(cases.flatMap(c=>[...c.input,1]));
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,cases.length,1,0,gl.RGBA,gl.FLOAT,input);gl.uniform1i(gl.getUniformLocation(program,'inputs'),0);
    for(const [index,lut]of luts.entries()){
      texture(gl.TEXTURE_3D,index+1);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
      const bytes=Uint8Array.from(atob(lut.data),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),data=new Float32Array(lut.edge**3*4);
      for(let i=0;i<lut.edge**3;i++){for(let c=0;c<3;c++)data[i*4+c]=view.getFloat32((i*3+c)*4,true);data[i*4+3]=1;}
      gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA32F,lut.edge,lut.edge,lut.edge,0,gl.RGBA,gl.FLOAT,data);gl.uniform1i(gl.getUniformLocation(program,lut.sampler),index+1);
    }
    const output=texture(gl.TEXTURE_2D,luts.length+1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,cases.length,1,0,gl.RGBA,gl.FLOAT,null);
    const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,output,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete float framebuffer');
    gl.viewport(0,0,cases.length,1);gl.drawArrays(gl.TRIANGLES,0,3);
    const pixels=new Float32Array(cases.length*4);gl.readPixels(0,0,cases.length,1,gl.RGBA,gl.FLOAT,pixels);
    if(gl.getError()!==gl.NO_ERROR)throw Error('OCIO GPU probe WebGL error');
    return Array.from({length:cases.length},(_,i)=>[...pixels.slice(i*4,i*4+3)]);
  },{shader,luts,cases:vectors.cases});
  let maxLinearError=0,maxSRGBError=0;const mismatches=[];
  const srgb=n=>n<=.0031308?n*12.92:1.055*Math.max(0,n)**(1/2.4)-.055;
  for(const [i,c]of vectors.cases.entries())for(let channel=0;channel<3;channel++){
    const value=actual[i][channel],error=Math.abs(value-c.expectedLinear[channel]);
    expect(Number.isFinite(value)).toBe(true);maxLinearError=Math.max(maxLinearError,error);
    const sError=Math.abs(srgb(value)-srgb(c.expectedLinear[channel]));maxSRGBError=Math.max(maxSRGBError,sError);
    if(error>2e-4||sError>2e-4)mismatches.push({name:c.name,channel,actual:value,expected:c.expectedLinear[channel],error,sError});
  }
  await writeFile(testInfo.outputPath('ocio-gpu-cpu-comparison.json'),JSON.stringify({cases:vectors.cases.length,maxLinearError,maxSRGBError,mismatches},null,2));
  expect(mismatches).toEqual([]);
});

test('real photographic pipeline preserves OCIO colors, camera exposure, white balance and capture metadata',async({page},testInfo)=>{
  const references=JSON.parse(await readFile(`${referenceDirectory}/cpu-vectors.json`,'utf8'));
  const cases=references.transportCases,columns=cases.length+16,tile=32,width=columns*tile,height=16;
  const pixels=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=Math.min(cases.length-1,Math.max(0,Math.floor(x/tile)-8));
    pixels.set(cases[index].code,(y*width+x)*3);
  }
  const atlas=await sharp(pixels,{raw:{width,height,channels:3}}).webp({lossless:true}).toBuffer();
  const pack=JSON.parse(await readFile('public/scenes/barbershop-plates/manifest.json','utf8'));
  pack.encoding={type:'log2-rgb',min:-16,max:6};delete pack.subjects;delete pack.optics;
  for(const view of pack.views){delete view.detailFile;delete view.detailDepth;delete view.opticalDepth;view.file='color-probe.webp';}
  const legacy=structuredClone(pack);pack.displayTransform=MONK_DISPLAY_TRANSFORM;
  await page.route('**/barbershop-plates/manifest.json',r=>r.fulfill({json:pack}));
  await page.route('**/classroom-plates/manifest.json',r=>r.fulfill({json:legacy}));
  await page.route('**/color-probe.webp',r=>r.fulfill({contentType:'image/webp',body:atlas}));
  let lutRequests=0;page.on('request',r=>{if(/\/lut-\d.bin$/.test(r.url()))lutRequests++;});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?subject=none&view=source');await waitInitialFrame(page);
  const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-display-profile',MONK_DISPLAY_TRANSFORM.profile);
  const nativeToCapture=pack.referenceFocal/(pack.captureLens/pack.camera.sensorWidth*36),results=[];
  for(let variant=0;variant<5;variant++){
    const settings=cases[0].variants[variant],aperture=settings.cameraEVOffset===2?3:settings.cameraEVOffset===-2?7:5;
    await setRanges(page,{aperture,shutter:11,wb:settings.wb});await page.mouse.move(0,0);await waitFrame(page);
    const image=await sharp(await canvas.screenshot()).raw().toBuffer({resolveWithObject:true});
    for(const [i,c]of cases.entries()){
      const u=((i+8+.5)/columns-.5)*nativeToCapture+.5;
      expect(u).toBeGreaterThan(0);expect(u).toBeLessThan(1);
      const x=Math.floor(u*image.info.width),y=Math.floor(image.info.height/2),index=(y*image.info.width+x)*image.info.channels;
      const actual=[...image.data.slice(index,index+3)],expected=c.variants[variant].expectedRGB8;
      results.push({name:c.name,variant:settings,actual,expected});
      for(let channel=0;channel<3;channel++)expect(Math.abs(actual[channel]-expected[channel]),`${c.name}, variant ${variant}, channel ${channel}`).toBeLessThanOrEqual(2);
    }
  }
  await writeFile(testInfo.outputPath('ocio-real-pipeline-rgb8.json'),JSON.stringify(results,null,2));
  const downloaded=await captureAndDownload(page,{format:'jpeg'}),bytes=await readFile(await downloaded.path());
  const exif=piexif.load(bytes.toString('binary')),snapshot=JSON.parse(exif.Exif[piexif.ExifIFD.UserComment].slice(8).replace(/\0+$/,'').trim());
  expect(snapshot.rendering.displayTransform).toMatchObject(MONK_DISPLAY_TRANSFORM);
  expect(snapshot.rendering.displayTransform.profileSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(snapshot.settings.wb).toBe(9000);expect(snapshot.resolved.iso).toBe(100);expect(snapshot.resolved.aperture).toBe(8);expect(snapshot.resolved.shutter).toBe(.25);
  await page.locator('#mode').selectOption('A');await waitFrame(page);
  const meter=Number(await canvas.getAttribute('data-meter-ev')),shutter=await page.locator('#shutter').inputValue();
  await page.locator('#scene').selectOption('classroom');await waitFrame(page);await expect(canvas).toHaveAttribute('data-display-profile','legacy');
  expect(Number(await canvas.getAttribute('data-meter-ev'))).toBeCloseTo(meter,4);expect(await page.locator('#shutter').inputValue()).toBe(shutter);
  await page.locator('#scene').selectOption('barbershop');await waitFrame(page);await expect(canvas).toHaveAttribute('data-display-profile',MONK_DISPLAY_TRANSFORM.profile);
  expect(lutRequests).toBe(2);expect(errors).toEqual([]);
});

test('a delayed profile load cannot grade a newer legacy scene',async({page})=>{
  const manifest=JSON.parse(await readFile('public/scenes/barbershop-plates/manifest.json','utf8'));
  manifest.displayTransform=MONK_DISPLAY_TRANSFORM;
  await page.route('**/barbershop-plates/manifest.json',r=>r.fulfill({json:manifest}));
  let release,entered;const started=new Promise(resolve=>{entered=resolve;});
  await page.route('**/color-profiles/**/profile.json',async route=>{entered();await new Promise(resolve=>{release=resolve;});await route.continue();});
  await page.goto('/?subject=none');await started;
  await page.locator('#scene').selectOption('classroom');await waitInitialFrame(page);
  const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-scene','classroom');await expect(canvas).toHaveAttribute('data-display-profile','legacy');
  const complete=page.waitForResponse(r=>r.url().endsWith('/lut-1.bin'));release();await (await complete).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await waitFrame(page);
  await expect(canvas).toHaveAttribute('data-scene','classroom');await expect(canvas).toHaveAttribute('data-display-profile','legacy');
});

test('profile grades flash once and agrees across preview, independent magnifier and PNG capture',async({page},testInfo)=>{
  const pack=JSON.parse(await readFile('public/scenes/barbershop-plates/manifest.json','utf8'));
  delete pack.subjects;delete pack.optics;pack.displayTransform=MONK_DISPLAY_TRANSFORM;
  pack.encoding={type:'log2-rgb',min:-16,max:6};pack.flash={referenceEnergy:1000,referenceDuration:.01,encoding:{min:-16,max:6}};
  for(const view of pack.views){delete view.detailFile;delete view.detailDepth;delete view.opticalDepth;view.file='fixture-black.webp';view.flash='fixture-color-flash.webp';}
  const constant=async rgb=>sharp(Buffer.from(Array.from({length:16},()=>rgb).flat()),{raw:{width:4,height:4,channels:3}}).webp({lossless:true}).toBuffer();
  const black=await constant([0,0,0]),flash=await constant([220,200,180]);
  await page.route('**/barbershop-plates/manifest.json',r=>r.fulfill({json:pack}));
  await page.route('**/fixture-black.webp',r=>r.fulfill({contentType:'image/webp',body:black}));
  await page.route('**/fixture-color-flash.webp',r=>r.fulfill({contentType:'image/webp',body:flash}));
  await page.goto('/?subject=none&view=source');await waitInitialFrame(page);
  await setRanges(page,{flash:1,wb:9000});await page.mouse.move(0,0);await waitLayers(page);
  const center=async bytes=>{const image=await sharp(bytes).raw().toBuffer({resolveWithObject:true});const i=(Math.floor(image.info.height/2)*image.info.width+Math.floor(image.info.width/2))*image.info.channels;return [...image.data.slice(i,i+3)];};
  const image=page.locator('#image'),quarter=await center(await image.screenshot());
  expect(Math.max(...quarter)).toBeGreaterThan(40);
  await setRanges(page,{shutter:10});await waitLayers(page);const eighth=await center(await image.screenshot());
  quarter.forEach((v,i)=>expect(Math.abs(v-eighth[i])).toBeLessThanOrEqual(2));
  const box=await image.boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
  const magnifier=page.locator('#magnifier');await expect(magnifier).toBeVisible();await expect(magnifier).toHaveAttribute('data-source','detail-render');await expect(magnifier).toHaveAttribute('data-state','ready');
  const detail=await magnifier.evaluate(c=>[...c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data].slice(0,3));
  detail.forEach((v,i)=>expect(Math.abs(v-eighth[i])).toBeLessThanOrEqual(2));
  const downloaded=await captureAndDownload(page,{format:'png'}),png=await readFile(await downloaded.path()),captured=await center(png);
  captured.forEach((v,i)=>expect(Math.abs(v-eighth[i])).toBeLessThanOrEqual(2));
  await writeFile(testInfo.outputPath('ocio-flash-detail-capture-parity.json'),JSON.stringify({quarter,eighth,detail,captured},null,2));
});

test('unsupported scene display metadata is an explicit load error, not a silent default look',async({page})=>{
  const manifest=JSON.parse(await readFile('public/scenes/barbershop-plates/manifest.json','utf8'));
  manifest.displayTransform={...MONK_DISPLAY_TRANSFORM,look:'unreviewed'};
  await page.route('**/barbershop-plates/manifest.json',r=>r.fulfill({json:manifest}));
  await page.goto('/?subject=none');await expect(page.locator('#loading')).toContainText('Unsupported scene display transform');
  await expect(page.locator('#capture')).toBeDisabled();
});
