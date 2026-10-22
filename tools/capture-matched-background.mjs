#!/usr/bin/env node
/** OPTIONAL background-only inferred-camera diagnostic. Does not edit app or canonical packs. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access,copyFile,mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';

const HERE=dirname(fileURLToPath(import.meta.url)),WORK=resolve(HERE,'..'),VIEWPORT={width:1440,height:1000};
const PREFIX='/scenes/barbershop-plates/';
const REFERENCES=[{id:'f14-iso200',file:'F14-S120-ISO200-1.jpg',aperture:1.4,shutter:1/125,iso:200},{id:'f56-iso3200',file:'F56-S120-ISO3200-1.jpg',aperture:5.6,shutter:1/125,iso:3200}];
const HELP=`Optional real-app inferred-camera BACKGROUND-ONLY diagnostic (not a before/after claim).
node tools/capture-matched-background.mjs [--candidate-root PATH] [--pack-dir PATH]
  [--url http://127.0.0.1:8013/] [--out PATH] [--focus 1.4] [--build] [--serve]
  [--plan] [--validate]
--plan prints settings only; --validate hashes/validates local pack without a browser.
Default paths: repository root, diagnostics/matched-reference, matched-diagnostic-evidence.
Optional PW_EXECUTABLE_PATH / CHROMIUM_EXECUTABLE_PATH or PW_CHANNEL; otherwise
installed Playwright Chromium. SwiftShader always enabled. No local launch required.\n`;

export function parseArgs(argv){
  const c={candidateRoot:WORK,packDir:join(WORK,'diagnostics/matched-reference'),url:'http://127.0.0.1:8013/',out:join(WORK,'matched-diagnostic-evidence'),focus:1.4,build:false,serve:false,plan:false,validate:false,help:false};
  const fields={'--candidate-root':'candidateRoot','--pack-dir':'packDir','--url':'url','--out':'out','--focus':'focus'};
  for(let i=0;i<argv.length;i++){if(fields[argv[i]]){const key=fields[argv[i]];assert.ok(argv[i+1]&&!argv[i+1].startsWith('--'),`${argv[i]} requires a value`);c[key]=argv[++i];}else if(['--build','--serve','--plan','--validate','--help'].includes(argv[i]))c[argv[i].slice(2)]=true;else throw Error(`Unknown argument ${argv[i]}`);}
  for(const key of ['candidateRoot','packDir','out'])c[key]=resolve(c[key]);c.url=new URL(c.url).href;c.focus=Number(c.focus);assert.ok(Number.isFinite(c.focus)&&c.focus>=.2&&c.focus<=50,'Focus must be .2–50 m');
  if(c.serve){const u=new URL(c.url);assert.ok(['127.0.0.1','localhost'].includes(u.hostname)&&u.port==='8013'&&u.pathname==='/', '--serve requires localhost:8013/');}
  return c;
}
export function plan(focus=1.4){return REFERENCES.map(reference=>({reference,requested:{mode:'M',autoISO:false,...reference,wb:5000,focus,af:'MF',motion:false,pause:false,flash:0,crop:'native',sensor:'full'},compositionPolicy:'Preserve pack-derived startup focal and baked camera pose. NO focal, yaw, pitch, roll, x, y or z input events.',scope:'Background only: subject=none. Original JPEG includes a fan that is deliberately absent here; no before/after quality claim.'}));}
async function exists(path){try{await access(path);return true;}catch{return false;}}
async function json(path,value){await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');}
async function sha(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
async function list(root,sub='',out=[]){for(const name of (await readdir(join(root,sub))).sort()){const rel=join(sub,name),s=await stat(join(root,rel));if(s.isDirectory())await list(root,rel,out);else if(s.isFile())out.push(rel.split(sep).join('/'));}return out;}
async function hashes(root,paths){const files=[];for(const path of [...new Set(paths)].sort())files.push({path,bytes:(await stat(join(root,path))).size,sha256:await sha(join(root,path))});return {root,sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};}
function git(root,args){try{return execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:16*1024*1024}).trimEnd();}catch{return null;}}
async function appHashes(root){const files=(git(root,['ls-files','-z'])??'').split('\0').filter(Boolean);for(const sub of ['src','public'])if(await exists(join(root,sub)))files.push(...(await list(join(root,sub))).map(p=>sub+'/'+p));const source=await hashes(root,files);return {commit:git(root,['rev-parse','HEAD']),status:git(root,['status','--short']),source,build:await exists(join(root,'dist'))?await hashes(root,(await list(join(root,'dist'))).map(p=>'dist/'+p)):null};}

export function validateManifest(manifest){
  assert.equal(manifest.views.length,1,'Diagnostic must remain an isolated single view');const v=manifest.views[0];assert.equal(v.id,'center');assert.deepEqual(v.offset,[0,0,0]);assert.ok(v.file&&v.depth);assert.equal(manifest.flash,undefined,'No diagnostic flash allowed');assert.equal(manifest.subjects,undefined,'Background-only manifest must not attach live subjects');assert.equal(v.opticalDepth,undefined,'This diagnostic explicitly lacks mirror optical distances');assert.equal(manifest.samples,64,'Record the actual lower 64-spp diagnostic quality');assert.equal(v.samples,64);assert.deepEqual(manifest.camera.nativeResolution,[2048,858]);assert.ok(manifest.camera.near>.049&&manifest.camera.near<.051);assert.equal(manifest.referenceFocal,manifest.minimumFocal);assert.ok(manifest.referenceFocal>24&&manifest.referenceFocal<26);
  for(const key of ['x','y','z','yaw','pitch','roll'])assert.deepEqual(manifest.bounds[key],[0,0]);
  for(const key of ['file','depth']){assert.ok(!v[key].startsWith('/')&&!v[key].split(/[\\/]/).includes('..'),`Unsafe diagnostic asset ${v[key]}`);}
  return manifest;
}
async function loadPack(dir){const manifest=validateManifest(JSON.parse(await readFile(join(dir,'manifest.json'),'utf8')));const packHashes=await hashes(dir,await list(dir));for(const key of ['file','depth'])assert.ok(await exists(join(dir,manifest.views[0][key])),`Missing pack ${key}`);return {manifest,hashes:packHashes};}
async function command(cmd,args,cwd){await new Promise((res,rej)=>{const p=spawn(cmd,args,{cwd,stdio:'inherit'});p.on('error',rej);p.on('exit',code=>code===0?res():rej(Error(`${cmd} exited ${code}`)));});}
async function server(root,url,out){
  const p=spawn(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','8013','--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});let logs='',spawnError=null;p.stdout.on('data',b=>logs+=b);p.stderr.on('data',b=>logs+=b);p.on('error',e=>spawnError=e);
  const stop=async()=>{p.kill('SIGTERM');await writeFile(join(out,'candidate-server.log'),logs);};
  try{const until=Date.now()+45000;while(Date.now()<until){if(spawnError)throw spawnError;if(p.exitCode!==null)throw Error(`Preview exited ${p.exitCode}`);try{if((await fetch(url,{signal:AbortSignal.timeout(2000)})).ok)return stop;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error(`Preview not ready ${url}`);}catch(e){await stop();throw e;}
}
async function ready(page,timeout){const wait=()=>page.waitForFunction(()=>{const c=document.querySelector('#image');return c?.dataset.ready==='true'&&c.dataset.frame===c.dataset.requestedFrame&&c.dataset.pendingLayers==='0'&&!document.querySelector('#capture')?.disabled;},null,{timeout});await wait();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await wait();}
async function state(page){return page.evaluate(()=>{const canvas=document.querySelector('#image'),b=canvas.getBoundingClientRect(),gl=canvas.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return {url:location.href,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},canvas:{width:canvas.width,height:canvas.height,box:{x:b.x,y:b.y,width:b.width,height:b.height},dataset:{...canvas.dataset}},controls:Object.fromEntries([...document.querySelectorAll('input[id],select[id]')].map(e=>[e.id,{type:e.type,value:e.value,checked:e.type==='checkbox'?e.checked:undefined,disabled:e.disabled,min:e.min??null,max:e.max??null,step:e.step??null,label:document.getElementById(e.id+'-value')?.textContent??null}])),gpu:gl?{vendor:gl.getParameter(ext?.UNMASKED_VENDOR_WEBGL??gl.VENDOR),renderer:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),version:gl.getParameter(gl.VERSION)}:null,userAgent:navigator.userAgent};});}
async function settings(page,requested,tables){return page.evaluate(({requested,tables})=>{
  const set=(id,value,event)=>{const e=document.getElementById(id);if(!e)throw Error(`Missing control ${id}`);if(e.disabled){if(e.type!=='checkbox'&&Number(e.value)===Number(value))return;throw Error(`Disabled control ${id}`);}if(e.type==='checkbox')e.checked=value;else e.value=String(value);e.dispatchEvent(new Event(event,{bubbles:true}));};
  set('mode','M','change');set('autoISO',false,'change');for(const id of ['crop','sensor'])if(document.getElementById(id).value!==requested[id])set(id,requested[id],'change');
  for(const id of ['motion','pause','zebra','grid-toggle','level-toggle','histogram-toggle','magnifier-toggle'])set(id,false,'change');
  for(const id of ['aperture','shutter','iso']){const index=tables[id].indexOf(requested[id]);if(index<0)throw Error(`Unsupported ${id}`);set(id,index,'input');}
  for(const id of ['wb','focus'])set(id,requested[id],'input');set('flash',0,'input');set('af','MF','change');
  for(const d of document.querySelectorAll('details[open]'))d.open=false;scrollTo(0,0);
},{requested,tables});}
function opticalState(snapshot,tables){const c=snapshot.controls,result=Object.fromEntries(Object.entries(c).map(([id,e])=>[id,e.type==='checkbox'?e.checked:e.value]));for(const id of ['aperture','shutter','iso'])result[id]=tables[id][Number(result[id])];for(const id of ['wb','focus','flash','focal','yaw','pitch','roll','x','y','z'])result[id]=Number(result[id]);return result;}
async function imageInfo(sharp,path){const m=await sharp(path).metadata(),s=await sharp(path).stats();return {path,sha256:await sha(path),bytes:(await stat(path)).size,width:m.width,height:m.height,format:m.format,meanRGB:s.channels.slice(0,3).map(c=>c.mean),stdevRGB:s.channels.slice(0,3).map(c=>c.stdev)};}

async function capture(browser,sharp,c,run,entry,tables){
  const dir=join(c.out,entry.reference.id);await mkdir(dir,{recursive:true});const r={status:'running',scope:entry.scope,requested:entry.requested,startedAt:new Date().toISOString(),errors:[],console:[],requestFailures:[],httpErrors:[],packRequests:[],artifacts:{},states:{}};
  const context=await browser.newContext({viewport:VIEWPORT,deviceScaleFactor:1,acceptDownloads:true,locale:'zh-CN',timezoneId:'UTC',colorScheme:'dark',reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(run.timeout);page.setDefaultNavigationTimeout(run.timeout);
  page.on('pageerror',e=>r.errors.push({message:e.message,stack:e.stack}));page.on('console',m=>r.console.push({type:m.type(),text:m.text(),location:m.location()}));page.on('requestfailed',q=>r.requestFailures.push({url:q.url(),failure:q.failure()}));page.on('response',s=>{if(s.status()>=400)r.httpErrors.push({url:s.url(),status:s.status()});});
  const allowed=new Set(['manifest.json',run.pack.manifest.views[0].file,run.pack.manifest.views[0].depth]);
  await page.route('**/scenes/barbershop-plates/**',async route=>{const pathname=decodeURIComponent(new URL(route.request().url()).pathname),part=pathname.split(PREFIX)[1];if(!allowed.has(part)){r.packRequests.push({url:route.request().url(),path:part,status:'rejected-unexpected-canonical-asset'});await route.abort('blockedbyclient');return;}r.packRequests.push({url:route.request().url(),path:part,local:join(c.packDir,part),sha256:run.pack.hashes.files.find(f=>f.path===part)?.sha256,status:'served-isolated-diagnostic'});await route.fulfill({path:join(c.packDir,part),contentType:part.endsWith('.json')?'application/json':part.endsWith('.webp')?'image/webp':'image/png'});});
  try{
    const url=new URL(c.url);url.searchParams.set('renderer','plates');url.searchParams.set('subject','none');await page.goto(url.href,{waitUntil:'domcontentloaded'});await ready(page,run.timeout);r.states.initial=await state(page);
    await settings(page,entry.requested,tables);await page.mouse.move(0,0);await ready(page,run.timeout);r.states.beforeScreenshots=await state(page);r.actualDOM=opticalState(r.states.beforeScreenshots,tables);
    for(const id of ['focal','yaw','pitch','roll','x','y','z'])assert.deepEqual(r.states.beforeScreenshots.controls[id],r.states.initial.controls[id],`${id} did not preserve startup baked camera`);
    for(const id of ['aperture','shutter','iso','focus','wb','flash','crop','sensor','motion','pause','autoISO','mode','af'])assert.equal(r.actualDOM[id],entry.requested[id],`${id} did not settle`);
    assert.equal(r.states.beforeScreenshots.viewport.dpr,1);assert.equal(r.actualDOM.motion,false);assert.equal(r.actualDOM.flash,0);assert.equal(r.states.beforeScreenshots.canvas.dataset.position,'center');
    r.cameraEvidence={manifestCamera:run.pack.manifest.camera,view:run.pack.manifest.views[0],sourceDerivedStartupInternalFocal:Math.max(run.pack.manifest.referenceFocal,run.pack.manifest.minimumFocal||0),startupInternalOrientation:{yaw:0,pitch:0,roll:0},startupXYZ:{x:0,y:0,z:0},precisionNote:'Camera pose/focal are source-derived from app load path. Raw DOM values/labels can sanitize fractional ranges; no private-state hook or extra reframe was injected.'};
    await page.screenshot({path:join(dir,'background-only-page.png'),fullPage:true,animations:'disabled',caret:'hide'});await ready(page,run.timeout);await page.locator('#image').screenshot({path:join(dir,'background-only-canvas.png'),animations:'disabled'});r.states.afterScreenshots=await state(page);
    const pending=page.waitForEvent('download',{timeout:run.timeout});await page.locator('#capture').click();const download=await pending;assert.equal(await download.failure(),null);await download.saveAs(join(dir,'background-only-export-2048.png'));await ready(page,run.timeout);r.states.afterExport=await state(page);
    for(const state of [r.states.afterScreenshots,r.states.afterExport])assert.deepEqual(opticalState(state,tables),r.actualDOM,'Controls changed during capture');
    for(const [id,name]of [['page','background-only-page.png'],['canvas','background-only-canvas.png'],['export','background-only-export-2048.png']])r.artifacts[id]=await imageInfo(sharp,join(dir,name));assert.equal(r.artifacts.export.width,2048);assert.equal(r.artifacts.export.height,858);assert.ok(r.artifacts.canvas.stdevRGB.some(v=>v>8),'Flat/empty frame');
    for(const list of [r.errors,r.requestFailures,r.httpErrors,r.console.filter(m=>m.type==='error')])assert.equal(list.length,0,'Browser/asset errors');for(const name of allowed)assert.ok(r.packRequests.some(q=>q.path===name&&q.status==='served-isolated-diagnostic'),`Diagnostic asset not requested: ${name}`);
    r.status='passed';
  }catch(error){r.status='failed';r.error={message:error.message,stack:error.stack};try{r.states.failure=await state(page);await page.screenshot({path:join(dir,'failure.png'),fullPage:true,timeout:10000});}catch{}}
  finally{r.finishedAt=new Date().toISOString();await json(join(dir,'capture.json'),r);await context.close();}console.log(`${r.status.toUpperCase()} background-only/${entry.reference.id}`);return r;
}

export async function main(argv=process.argv.slice(2)){
  const c=parseArgs(argv),cases=plan(c.focus);if(c.help){console.log(HELP);return;}if(c.plan){console.log(JSON.stringify({config:c,viewport:VIEWPORT,dpr:1,cases},null,2));return;}
  const pack=await loadPack(c.packDir);if(c.validate){console.log(JSON.stringify({status:'validated-without-browser',pack,cases},null,2));return;}
  await mkdir(c.out,{recursive:true});const run={schemaVersion:1,status:'running',scope:'Inferred-camera BACKGROUND-ONLY real-app diagnostic; not a production change or baseline/candidate improvement proof.',startedAt:new Date().toISOString(),config:c,pack,cases,timeout:Number(process.env.PARITY_TIMEOUT_MS||180000),captures:[],limitations:[
    'Original JPEGs include their original fan. This real-app diagnostic deliberately contains no fan or practice ball (subject=none, motion=false). Do not describe it as fan fidelity or fake before/after evidence.',
    'The camera is manually landmark-inferred, not an exactly recovered original camera; full manifest matrices and inference metadata are recorded.',
    'The source render is 64 spp at 2048x858, lower quality than 256-spp canonical center. Noise/denoising differ; no high-resolution detail layer.',
    'Near clip intentionally changes from source1.1m to0.05m to preserve nearby cabinet; no flash, no mirror optical-distance map, no subject probe, no canonical pack modifications.',
    `Focus ${c.focus} m is an explicit assumption; original focus distance is unknown. WB5000K is also a comparison assumption.`,
    'Original shutter1/120 is unsupported; actual1/125 is0.058894EV darker. Original JPEG color pipeline is unknown. Original JPEG pixels are never used in renderer inputs.',
    'Single-view bounds may yield invalid Infinity UI step attributes for XYZ; no scene-position controls are touched. Startup source-derived focal is preserved without dispatching range input.'
  ]};await json(join(c.out,'run.json'),run);let browser,stop;
  try{
    assert.ok(Number.isFinite(run.timeout)&&run.timeout>=1000);if(c.build)await command('npm',['run','build'],c.candidateRoot);run.application=await appHashes(c.candidateRoot);run.runner={path:fileURLToPath(import.meta.url),sha256:await sha(fileURLToPath(import.meta.url))};
    const require=createRequire(join(c.candidateRoot,'package.json')),{chromium}=require('@playwright/test'),sharp=require('sharp'),{APERTURES,SHUTTERS,ISOS}=await import(pathToFileURL(join(c.candidateRoot,'src/camera.js'))),tables={aperture:APERTURES,shutter:SHUTTERS,iso:ISOS};run.controlTables=tables;
    run.references=[];for(const reference of REFERENCES){const from=join(c.candidateRoot,'Images/Original Renders',reference.file),dest=join(c.out,'originals',reference.file);await mkdir(dirname(dest),{recursive:true});await copyFile(from,dest);run.references.push({...reference,...await imageInfo(sharp,dest),originalShutter:1/120,actualShutter:1/125,shutterDifferenceEV:Math.log2(125/120),usage:'Comparison-only unmodified original; includes fan absent from this diagnostic.'});}
    if(c.serve)stop=await server(c.candidateRoot,c.url,c.out);const executablePath=process.env.PW_EXECUTABLE_PATH||process.env.CHROMIUM_EXECUTABLE_PATH||undefined,channel=executablePath?undefined:process.env.PW_CHANNEL||undefined;run.browser={executablePath:executablePath??null,channel:channel??null,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--force-color-profile=srgb']};browser=await chromium.launch({headless:true,executablePath,channel,args:run.browser.args,timeout:run.timeout});run.browser.version=browser.version();
    for(const entry of cases){run.captures.push(await capture(browser,sharp,c,run,entry,tables));await json(join(c.out,'run.json'),run);}
    run.packAfter=await loadPack(c.packDir);assert.equal(run.packAfter.hashes.sha256,run.pack.hashes.sha256,'Diagnostic pack changed during capture');run.applicationAfter=await appHashes(c.candidateRoot);assert.equal(run.applicationAfter.source.sha256,run.application.source.sha256,'App source changed during diagnostic');assert.ok(run.captures.every(r=>r.status==='passed'),'Diagnostic capture failed; inspect per-case JSON');run.status='passed';
  }catch(e){run.status='failed';run.error={message:e.message,stack:e.stack};process.exitCode=1;console.error(e.stack??e);}
  finally{if(browser)await browser.close();if(stop)await stop();run.finishedAt=new Date().toISOString();await json(join(c.out,'run.json'),run);}console.log(`Diagnostic evidence: ${join(c.out,'run.json')} (${run.status})`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
