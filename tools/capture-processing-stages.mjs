#!/usr/bin/env node
/** Same-source pipeline measurement. Requires supported CI browser execution. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';

const HERE=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(HERE,'..');
export const SYNTHETIC_CASES=[{id:'synthetic-white-left',whiteSide:'left'},{id:'synthetic-white-right',whiteSide:'right'}];
export function parseArgs(argv){
  const c={candidateRoot:ROOT,out:join(ROOT,'processing-stage-evidence'),url:'http://127.0.0.1:8014/',serve:false,plan:false,validate:false};
  const fields={'--candidate-root':'candidateRoot','--out':'out','--url':'url'};
  for(let i=0;i<argv.length;i++){if(fields[argv[i]]){assert.ok(argv[i+1]&&!argv[i+1].startsWith('--'),`Missing ${argv[i]} value`);c[fields[argv[i]]]=argv[++i];}else if(['--serve','--plan','--validate'].includes(argv[i]))c[argv[i].slice(2)]=true;else throw Error(`Unknown argument ${argv[i]}`);}
  c.candidateRoot=resolve(c.candidateRoot);c.out=resolve(c.out);c.url=new URL(c.url).href;
  if(c.serve){const u=new URL(c.url);assert.ok(['127.0.0.1','localhost'].includes(u.hostname)&&u.port==='8014'&&u.pathname==='/', '--serve requires localhost:8014/');}return c;
}
export function plan(baseEV=8){
  const photoEV=baseEV-Math.log2(1.4*1.4/(1/125)*100/200);
  return [
    {id:'neutral',exposureEV:0,wb:5000,lens:false,aperture:1.4,linear:true},
    {id:'ev-minus2',exposureEV:-2,wb:5000,lens:false,aperture:1.4},
    {id:'ev-plus2',exposureEV:2,wb:5000,lens:false,aperture:1.4},
    {id:'wb3500',exposureEV:0,wb:3500,lens:false,aperture:1.4},
    {id:'wb6500',exposureEV:0,wb:6500,lens:false,aperture:1.4},
    {id:'dof-f14-neutral',exposureEV:0,wb:5000,lens:true,aperture:1.4,linear:true},
    {id:'dof-f56-neutral',exposureEV:0,wb:5000,lens:true,aperture:5.6,linear:true},
    {id:'photo-f14-iso200',exposureEV:photoEV,wb:5000,lens:true,aperture:1.4,photographicControls:{aperture:1.4,shutter:1/125,iso:200,baseEV},noiseOverrideISO:0},
    {id:'photo-f56-iso3200',exposureEV:baseEV-Math.log2(5.6*5.6/(1/125)*100/3200),wb:5000,lens:true,aperture:5.6,photographicControls:{aperture:5.6,shutter:1/125,iso:3200,baseEV},noiseOverrideISO:0},
  ];
}
async function json(path,value){await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');}
async function sha(path){const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');}
async function list(root,sub=''){const result=[];for(const name of (await readdir(join(root,sub))).sort()){const rel=join(sub,name),s=await stat(join(root,rel));if(s.isDirectory())result.push(...await list(root,rel));else if(s.isFile())result.push(rel);}return result;}
async function hashFiles(root,paths){const files=[];for(const path of [...new Set(paths)].sort()){files.push({path,bytes:(await stat(join(root,path))).size,sha256:await sha(join(root,path))});}return {sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};}
function git(root,args){try{return execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();}catch{return null;}}
async function provenance(root){const paths=[...(await list(join(root,'src'))).map(p=>'src/'+p),'package-lock.json','tools/stage-diagnostic.html','tools/stage-diagnostic-browser.js','tools/capture-processing-stages.mjs',...(await list(join(root,'diagnostics/matched-reference'))).map(p=>'diagnostics/matched-reference/'+p)];return {commit:git(root,['rev-parse','HEAD']),status:git(root,['status','--short']),...(await hashFiles(root,paths))};}
async function startServer(c){
  const p=spawn(process.execPath,[join(c.candidateRoot,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','8014','--strictPort'],{cwd:c.candidateRoot,stdio:['ignore','pipe','pipe']});let log='',spawnError;p.stdout.on('data',b=>log+=b);p.stderr.on('data',b=>log+=b);p.on('error',e=>spawnError=e);
  const stop=async()=>{p.kill('SIGTERM');await writeFile(join(c.out,'server.log'),log);};
  try{const until=Date.now()+45000;while(Date.now()<until){if(spawnError)throw spawnError;if(p.exitCode!==null)throw Error(`Vite exited ${p.exitCode}`);try{if((await fetch(c.url,{signal:AbortSignal.timeout(1500)})).ok)return stop;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Diagnostic Vite server did not become ready');}catch(e){await stop();throw e;}
}
async function artifact(c,name,encoded,expectedBytes,metadata={}){const data=Buffer.from(encoded,'base64');assert.equal(data.length,expectedBytes,`Unexpected bytes for ${name}`);const path=join(c.out,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,data);return {path:name,bytes:data.length,sha256:await sha(path),...metadata};}
export async function main(argv=process.argv.slice(2)){
  const c=parseArgs(argv),manifest=JSON.parse(await readFile(join(c.candidateRoot,'diagnostics/matched-reference/manifest.json'),'utf8'));
  assert.equal(manifest.views.length,1);assert.deepEqual(manifest.camera.nativeResolution,[2048,858]);assert.equal(manifest.subjects,undefined);assert.equal(manifest.flash,undefined);assert.equal(manifest.views[0].opticalDepth,undefined);
  const {SCENES}=await import(pathToFileURL(join(c.candidateRoot,'src/scenes.js'))),{ev100}=await import(pathToFileURL(join(c.candidateRoot,'src/camera.js')));
  const cases=plan(SCENES[0].baseEV);assert.ok(Math.abs(cases[7].exposureEV-(SCENES[0].baseEV-ev100(1.4,1/125,200)))<1e-12);
  if(c.plan){console.log(JSON.stringify({config:c,cases,syntheticCases:SYNTHETIC_CASES,manifest,width:2048,height:858},null,2));return;}
  const source=await provenance(c.candidateRoot);if(c.validate){console.log(JSON.stringify({status:'validated-no-browser-launched',source,cases,syntheticCases:SYNTHETIC_CASES},null,2));return;}
  await mkdir(c.out,{recursive:true});const run={schemaVersion:1,status:'running',startedAt:new Date().toISOString(),scope:'Same-source production-class stage diagnosis, no original JPEG and no aesthetic matching.',config:c,source,cases,captures:[],artifacts:[],errors:[],consoleErrors:[],requestFailures:[],httpErrors:[],binarySchema:{origin:'top-left',order:'row-major RGBA',byteOrder:'little-endian',rgba16f:'IEEE 754 binary16 per channel',rgba32f:'IEEE 754 binary32 per channel',rgba8:'unsigned byte per channel; display is sRGB-encoded, transport is log code'}},timeout=Number(process.env.PARITY_TIMEOUT_MS||180000);let stop,browser,context,page;
  try{
    if(c.serve)stop=await startServer(c);
    const require=createRequire(join(c.candidateRoot,'package.json')),{chromium}=require('@playwright/test'),sharp=require('sharp');
    const executablePath=process.env.PW_EXECUTABLE_PATH||process.env.CHROMIUM_EXECUTABLE_PATH||undefined,channel=executablePath?undefined:process.env.PW_CHANNEL||undefined;
    run.browser={executablePath:executablePath??null,channel:channel??null,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--force-color-profile=srgb']};
    browser=await chromium.launch({headless:true,executablePath,channel,args:run.browser.args,timeout});run.browser.version=browser.version();
    context=await browser.newContext({viewport:{width:2048,height:900},deviceScaleFactor:1,colorScheme:'dark',locale:'en-US',timezoneId:'UTC',reducedMotion:'reduce',serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(timeout);page.setDefaultNavigationTimeout(timeout);
    page.on('pageerror',e=>run.errors.push({message:e.message,stack:e.stack}));page.on('console',m=>{if(m.type()==='error')run.consoleErrors.push(m.text());});page.on('requestfailed',r=>run.requestFailures.push({url:r.url(),failure:r.failure()}));page.on('response',r=>{if(r.status()>=400)run.httpErrors.push({url:r.url(),status:r.status()});});
    const url=new URL('tools/stage-diagnostic.html',c.url);url.searchParams.set('subject','none');await page.goto(url.href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.stageAuditReady);
    run.initial=await page.evaluate(()=>window.stageAudit.initialize());assert.equal(run.initial.sourceView,false);assert.equal(run.initial.subjectPresent,false);assert.equal(run.initial.opticalDepthPresent,false);assert.deepEqual([run.initial.width,run.initial.height],[2048,858]);
    const pixels=run.initial.width*run.initial.height,transport=await page.evaluate(()=>window.stageAudit.transport());
    run.artifacts.push(await artifact(c,'transport-canvas.rgba8',transport.encoded,pixels*4,{stage:'browser Image/canvas log code'}),await artifact(c,'decoded-texture.rgba16f',transport.decoded,pixels*8,{stage:'production decodeRadianceTexture CPU output'}),await artifact(c,'packed-depth.rgba8',transport.packedDepth,pixels*4,{stage:'browser decoded RG uint16 source Z'}));
    for(const entry of cases){
      const result=await page.evaluate(entry=>window.stageAudit.capture(entry),entry),{display,radiance,...metadata}=result;metadata.plan=entry;metadata.artifacts=[];
      assert.equal(metadata.uniforms.iso,0);assert.equal(metadata.uniforms.skipLens,!entry.lens);assert.equal(metadata.uniforms.wb,entry.wb);assert.ok(Math.abs(metadata.uniforms.exposure-entry.exposureEV)<1e-12);assert.equal(metadata.uniforms.radianceScale,1);assert.equal(metadata.uniforms.agx,true);
      metadata.artifacts.push(await artifact(c,`${entry.id}/display.rgba8`,display,pixels*4,{stage:'production post-shader framebuffer'}));
      const png=join(c.out,entry.id,'display.png');await sharp(Buffer.from(display,'base64'),{raw:{width:run.initial.width,height:run.initial.height,channels:4}}).png().toFile(png);metadata.artifacts.push({path:`${entry.id}/display.png`,bytes:(await stat(png)).size,sha256:await sha(png)});
      if(radiance)metadata.artifacts.push(await artifact(c,`${entry.id}/linear.rgba16f`,radiance,pixels*8,{stage:'production post-shader lensOnly linear, no exposure or display transform'}));
      if(entry.id==='neutral'){const frame=await page.evaluate(()=>window.stageAudit.rawFrame());run.artifacts.push(await artifact(c,'pre-display-framebuffer.rgba16f',frame.raw,pixels*8,{stage:'production plate color target'}),await artifact(c,'rendered-depth.rgba32f',frame.depth,pixels*16,{stage:'read-only axial decode of production projected depth'}));}
      await json(join(c.out,entry.id,'case.json'),metadata);run.captures.push(metadata);await json(join(c.out,'run.json'),run);console.log(`CAPTURED processing-stage/${entry.id}`);
    }
    run.syntheticCaptures=[];
    for(const entry of SYNTHETIC_CASES){
      const result=await page.evaluate(entry=>window.stageAudit.synthetic(entry),entry),{display,radiance,...metadata}=result;metadata.artifacts=[];
      metadata.artifacts.push(await artifact(c,`${entry.id}/display.rgba8`,display,pixels*4,{stage:'synthetic input, production display+DOF shader'}),await artifact(c,`${entry.id}/linear.rgba16f`,radiance,pixels*8,{stage:'synthetic input, production DOF shader lensOnly'}));
      const png=join(c.out,entry.id,'display.png');await sharp(Buffer.from(display,'base64'),{raw:{width:run.initial.width,height:run.initial.height,channels:4}}).png().toFile(png);metadata.artifacts.push({path:`${entry.id}/display.png`,bytes:(await stat(png)).size,sha256:await sha(png)});
      await json(join(c.out,entry.id,'case.json'),metadata);run.syntheticCaptures.push(metadata);await json(join(c.out,'run.json'),run);console.log(`CAPTURED processing-stage/${entry.id}`);
    }
    run.sourceAfter=await provenance(c.candidateRoot);assert.equal(run.sourceAfter.sha256,run.source.sha256,'Diagnostic source changed during capture');
    for(const [name,errors] of Object.entries({pageErrors:run.errors,consoleErrors:run.consoleErrors,requestFailures:run.requestFailures,httpErrors:run.httpErrors}))assert.equal(errors.length,0,`Browser ${name}`);
    run.status='passed';
  }catch(e){run.status='failed';run.error={message:e.message,stack:e.stack};process.exitCode=1;console.error(e.stack??e);if(page)try{await page.screenshot({path:join(c.out,'failure.png'),timeout:10000});}catch{}}
  finally{if(context)await context.close();if(browser)await browser.close();if(stop)await stop();run.finishedAt=new Date().toISOString();await json(join(c.out,'run.json'),run);}
  console.log(`Processing stage evidence: ${join(c.out,'run.json')} (${run.status})`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
