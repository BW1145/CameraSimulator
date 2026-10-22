#!/usr/bin/env node
/** Reproducible real-renderer evidence; deliberately lives outside application sources. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream,existsSync} from 'node:fs';
import {access,copyFile,mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,resolve,sep} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url));
const WORK=resolve(HERE,'..');
const CANDIDATE_DEFAULT=existsSync(join(WORK,'package.json'))?WORK:join(WORK,'prototype');
const WORKSPACE_DEFAULT=CANDIDATE_DEFAULT===WORK?resolve(WORK,'..'):WORK;
const VIEWPORT={width:1440,height:1000};
const TRANSFORM_KEYS=['position','yawOffset','headTilt','headHeight','headScale'];
const BASELINE_TRANSFORM_DEFAULTS={yawOffset:0,headTilt:-.09,headHeight:.435,headScale:1};
const REFERENCES=[
  {id:'f14-iso200',file:'Images/Original Renders/F14-S120-ISO200-1.jpg',aperture:1.4,iso:200},
  {id:'f56-iso3200',file:'Images/Original Renders/F56-S120-ISO3200-1.jpg',aperture:5.6,iso:3200},
];
const HELP=`Usage: node runner/capture-parity.mjs [options]
  --baseline-root PATH       Baseline checkout (default: ../../repos/camera-simulator)
  --candidate-root PATH      Candidate checkout (default: ../prototype)
  --baseline-url URL         Default http://127.0.0.1:8012/
  --candidate-url URL        Default http://127.0.0.1:8013/
  --out PATH                 Evidence directory (default: ../evidence)
  --build                    Run npm run build in both checkouts before capture
  --serve                    Start/stop production Vite preview servers on 8012/8013
  --include-aligned          Add both approximate constrained-reframing pairs
  --plan                     Print the capture plan; no build, server or browser
  --help                     This message
Environment: PW_EXECUTABLE_PATH or CHROMIUM_EXECUTABLE_PATH (optional), PW_CHANNEL
(optional; omit all three for Playwright Chromium), PARITY_TIMEOUT_MS (default 180000).
The runner never launches a browser for --plan/--help. Use it in authorized CI;
local browser execution is intentionally not required by its validation workflow.\n`;

export function parseArgs(argv){
  const config={baselineRoot:resolve(WORKSPACE_DEFAULT,'../repos/camera-simulator'),candidateRoot:CANDIDATE_DEFAULT,baselineURL:'http://127.0.0.1:8012/',candidateURL:'http://127.0.0.1:8013/',out:join(WORKSPACE_DEFAULT,'evidence'),build:false,serve:false,includeAligned:false,plan:false,help:false};
  const fields={'--baseline-root':'baselineRoot','--candidate-root':'candidateRoot','--baseline-url':'baselineURL','--candidate-url':'candidateURL','--out':'out'};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(fields[arg]){assert.ok(argv[i+1]&&!argv[i+1].startsWith('--'),`${arg} requires a value`);config[fields[arg]]=argv[++i];}
    else if(arg==='--include-aligned')config.includeAligned=true;
    else if(['--build','--serve','--plan','--help'].includes(arg))config[arg.slice(2)]=true;
    else throw Error(`Unknown argument: ${arg}`);
  }
  for(const key of ['baselineRoot','candidateRoot','out'])config[key]=resolve(config[key]);
  for(const key of ['baselineURL','candidateURL'])config[key]=new URL(config[key]).href;
  if(config.serve){
    for(const [key,port]of [['baselineURL','8012'],['candidateURL','8013']]){
      const url=new URL(config[key]);assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.port===port&&url.pathname==='/',`--serve requires ${key} at localhost:${port}/`);
    }
  }
  return config;
}

export function makePlan(includeAligned=false){
  const common={mode:'M',autoISO:false,wb:5000,focus:3,af:'MF',crop:'native',sensor:'full',motion:false,pause:false,flash:0,zebra:false,'grid-toggle':false,'level-toggle':false,'histogram-toggle':false,'magnifier-toggle':false};
  const defaultExposure={aperture:8,shutter:1/4,iso:100};
  // Do not dispatch composition range input events for the startup frame.
  // A range's DOM value may sanitize a fractional internal focal length.
  const wide={};
  const cases=[
    {variant:{id:'current-default',description:'Unchanged startup optical settings: f/8, 1/4 s, ISO100, WB5000, 3 m focus and current wide composition.',baselineTransform:false},reference:{id:'default',file:null},requested:{...common,...defaultExposure,...wide}},
    {variant:{id:'baseline-transform-default',description:'Default optics. Candidate geometry/materials retained; only subject placement/head transform keys come from baseline. Not a pure material-only ablation.',baselineTransform:true},reference:{id:'default',file:null},requested:{...common,...defaultExposure,...wide}},
    ...REFERENCES.map(reference=>({variant:{id:'reference-wide',description:'Wide composition, common photographic reference exposure, MF focus 3 m.',baselineTransform:false},reference,requested:{...common,aperture:reference.aperture,shutter:1/125,iso:reference.iso,...wide}})),
  ];
  if(includeAligned)cases.push(...REFERENCES.map(reference=>({variant:{id:'original-aligned',description:'Requested approximate original composition; safe-coverage constraints remain active. Actual settled values are authoritative.',baselineTransform:false},reference,requested:{...common,focus:1.4,aperture:reference.aperture,shutter:1/125,iso:reference.iso,focal:31.2,yaw:31.1,pitch:-1.5,roll:1.5}})));
  return cases;
}

async function sha256(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
async function json(path,value){await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');}
async function exists(path){try{await access(path);return true;}catch{return false;}}
function git(root,args){try{return execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:16*1024*1024}).trimEnd();}catch{return null;}}
async function filesBelow(root,path,output){
  if(!await exists(join(root,path)))return;
  const entry=await stat(join(root,path));
  if(entry.isDirectory()){for(const child of (await readdir(join(root,path))).sort())await filesBelow(root,join(path,child),output);}
  else if(entry.isFile())output.add(path.split(sep).join('/'));
}
async function hashFiles(root,files){
  const records=[];for(const path of [...files].sort()){const full=join(root,path);if(await exists(full))records.push({path,bytes:(await stat(full)).size,sha256:await sha256(full)});else records.push({path,missing:true});}
  return {sha256:createHash('sha256').update(JSON.stringify(records)).digest('hex'),files:records};
}
async function sourceSnapshot(root){
  // Hash tracked source + assets, and include untracked app edits. Never recurse .git,
  // node_modules, private session directories, or arbitrary home directories.
  const tracked=git(root,['ls-files','-z']);const paths=new Set((tracked??'').split('\0').filter(Boolean));
  for(const path of ['src','public','index.html','package.json','package-lock.json','vite.config.js','vite.config.mjs'])await filesBelow(root,path,paths);
  const sources=await hashFiles(root,paths),distFiles=new Set();await filesBelow(root,'dist',distFiles);
  return {root,commit:git(root,['rev-parse','HEAD']),status:git(root,['status','--short']),...sources,build:await hashFiles(root,distFiles)};
}
async function command(cmd,args,cwd){
  await new Promise((resolvePromise,reject)=>{const child=spawn(cmd,args,{cwd,stdio:'inherit'});child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolvePromise():reject(Error(`${cmd} ${args.join(' ')} failed: ${code??signal}`)));});
}
async function waitHTTP(url,child){
  const deadline=Date.now()+45000;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw Error(`Preview server exited with code ${child.exitCode}`);
    try{const response=await fetch(url,{signal:AbortSignal.timeout(2000)});if(response.ok)return;}catch{}
    await new Promise(r=>setTimeout(r,250));
  }
  throw Error(`Preview server did not become available: ${url}`);
}
async function startServer(root,url,out,name){
  // Exact port, no silent fallback; this process owns the server it later stops.
  const port=new URL(url).port;
  const child=spawn(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',port,'--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
  child.on('error',error=>logs+=String(error)+'\n');
  try{await waitHTTP(url,child);}catch(error){child.kill('SIGTERM');await writeFile(join(out,`${name}-server.log`),logs);throw error;}
  return async()=>{child.kill('SIGTERM');await writeFile(join(out,`${name}-server.log`),logs);};
}

async function waitLayers(page,timeout){
  // Same readiness contract as tests/browser/controls.js. A ready old frame is
  // insufficient: the displayed revision must match the latest requested one.
  const ready=()=>page.waitForFunction(()=>{const e=document.querySelector('#image');return e?.dataset.ready==='true'&&e.dataset.frame===e.dataset.requestedFrame&&e.dataset.pendingLayers==='0'&&!document.querySelector('#capture')?.disabled;},null,{timeout});
  await ready();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await ready();
}
async function state(page){
  return page.evaluate(()=>{
    const canvas=document.querySelector('#image');
    const controls=Object.fromEntries([...document.querySelectorAll('input[id],select[id]')].map(e=>[e.id,{type:e.type,value:e.value,...(e.type==='checkbox'?{checked:e.checked}:{}),disabled:e.disabled,min:e.min??null,max:e.max??null,step:e.step??null,label:document.getElementById(e.id+'-value')?.textContent??null}]));
    const box=canvas.getBoundingClientRect(),gl=canvas.getContext('webgl2');let gpu=null;
    if(gl){const ext=gl.getExtension('WEBGL_debug_renderer_info');gpu={vendor:gl.getParameter(ext?.UNMASKED_VENDOR_WEBGL??gl.VENDOR),renderer:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),version:gl.getParameter(gl.VERSION),shadingLanguage:gl.getParameter(gl.SHADING_LANGUAGE_VERSION)};}
    return {url:location.href,viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},canvas:{width:canvas.width,height:canvas.height,box:{x:box.x,y:box.y,width:box.width,height:box.height},dataset:{...canvas.dataset}},controls,outputs:Object.fromEntries([...document.querySelectorAll('output[id]')].map(e=>[e.id,e.textContent])),loading:{hidden:document.querySelector('#loading').hidden,text:document.querySelector('#loading').textContent},details:[...document.querySelectorAll('details')].map(e=>({id:e.id,open:e.open})),gpu,userAgent:navigator.userAgent};
  });
}
async function applySettings(page,requested,tables){
  await page.evaluate(({requested,tables})=>{
    const set=(id,value,event)=>{const input=document.getElementById(id);if(!input)throw Error(`Missing control ${id}`);if(input.disabled)throw Error(`Disabled control ${id}`);if(input.type==='checkbox')input.checked=value;else input.value=String(value);input.dispatchEvent(new Event(event,{bubbles:true}));};
    // Use the app's actual event handlers, including constrain(). Do not patch
    // shader code, renderer state, range bounds, input step, or captured pixels.
    set('mode','M','change');set('autoISO',false,'change');
    for(const id of ['crop','sensor'])set(id,requested[id],'change');
    for(const id of ['motion','pause','zebra','grid-toggle','level-toggle','histogram-toggle','magnifier-toggle'])set(id,requested[id],'change');
    for(const id of ['aperture','shutter','iso']){const index=tables[id].indexOf(requested[id]);if(index<0)throw Error(`Unsupported ${id}: ${requested[id]}`);set(id,index,'input');}
    for(const id of ['wb','flash','focus','focal','yaw','pitch','roll'])if(requested[id]!==undefined)set(id,requested[id],'input');
    set('af',requested.af,'change');
    for(const details of document.querySelectorAll('details[open]'))details.open=false;
    scrollTo(0,0);
  },{requested,tables});
}
function assertSettings(snapshot,requested,tables){
  const control=id=>snapshot.controls[id];
  for(const id of ['aperture','shutter','iso'])assert.equal(tables[id][Number(control(id).value)],requested[id],`${id} did not settle to the required exposure`);
  for(const id of ['wb','focus','flash'])assert.equal(Number(control(id).value),requested[id],`${id} did not settle`);
  for(const id of ['crop','sensor','mode','af'])assert.equal(control(id).value,requested[id],`${id} did not settle`);
  for(const id of ['autoISO','motion','pause','zebra','grid-toggle','level-toggle','histogram-toggle','magnifier-toggle'])assert.equal(control(id).checked,requested[id],`${id} did not settle`);
  assert.equal(snapshot.viewport.devicePixelRatio,1);assert.equal(snapshot.canvas.dataset.scene,'barbershop');assert.equal(snapshot.canvas.dataset.position,'center');
}
function actualSettings(snapshot,tables){
  const values=Object.fromEntries(Object.entries(snapshot.controls).map(([id,v])=>[id,v.type==='checkbox'?v.checked:v.value]));
  for(const id of ['aperture','shutter','iso'])values[id]=tables[id][Number(values[id])];
  for(const id of ['focus','focal','yaw','pitch','roll','x','y','z','wb','flash'])values[id]=Number(values[id]);
  return values;
}
async function imageRecord(sharp,path){const metadata=await sharp(path).metadata(),stats=await sharp(path).stats();return {path,bytes:(await stat(path)).size,sha256:await sha256(path),width:metadata.width,height:metadata.height,format:metadata.format,channels:metadata.channels,meanRGB:stats.channels.slice(0,3).map(c=>c.mean),stdevRGB:stats.channels.slice(0,3).map(c=>c.stdev)};}

async function capture(browser,sharp,config,run,side,entry,tables,baselineFan){
  const dir=join(config.out,entry.variant.id,entry.reference.id,side);await mkdir(dir,{recursive:true});
  const record={side,variant:entry.variant.id,reference:entry.reference.file,requested:entry.requested,status:'running',startedAt:new Date().toISOString(),pageErrors:[],console:[],requestFailures:[],httpErrors:[],subjectResponses:[],artifacts:{},states:{}};
  const context=await browser.newContext({viewport:VIEWPORT,deviceScaleFactor:1,acceptDownloads:true,locale:'zh-CN',timezoneId:'UTC',colorScheme:'dark',reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(run.timeout);page.setDefaultNavigationTimeout(run.timeout);
  page.on('pageerror',error=>record.pageErrors.push({message:error.message,stack:error.stack}));
  page.on('console',message=>record.console.push({type:message.type(),text:message.text(),location:message.location()}));
  page.on('requestfailed',request=>record.requestFailures.push({url:request.url(),method:request.method(),failure:request.failure()}));
  page.on('response',response=>{if(response.status()>=400)record.httpErrors.push({url:response.url(),status:response.status()});});
  // Route only the JSON subject manifest. This explicit ablation changes neither
  // the room plate nor candidate geometry/materials, and is recorded verbatim.
  await page.route('**/scenes/barbershop-plates/subjects.json',async route=>{
    const response=await route.fetch(),subjects=await response.json(),original=structuredClone(subjects),fan=subjects.find(s=>s.type==='desk-fan');assert.ok(fan,'Missing desk-fan config');
    if(entry.variant.baselineTransform&&side==='candidate'){
      for(const key of TRANSFORM_KEYS)fan[key]=structuredClone(baselineFan[key]??BASELINE_TRANSFORM_DEFAULTS[key]);
    }
    record.subjectResponses.push({url:route.request().url(),original,served:subjects,overriddenKeys:entry.variant.baselineTransform&&side==='candidate'?TRANSFORM_KEYS:[]});
    await route.fulfill({response,json:subjects});
  });
  try{
    const base=side==='baseline'?config.baselineURL:config.candidateURL;
    const url=new URL(base);url.searchParams.set('renderer','plates');
    // Never use view=source: that diagnostic intentionally disables blur/noise.
    await page.goto(url.href,{waitUntil:'domcontentloaded'});await waitLayers(page,run.timeout);
    record.states.initial=await state(page);
    await applySettings(page,entry.requested,tables);await page.mouse.move(0,0);await waitLayers(page,run.timeout);
    record.states.beforeScreenshots=await state(page);
    record.statePrecision={controls:'Settled DOM controls and labels, not an injected internal app-state hook. Range sanitization may round fractional internal values.',untouchedStartupComposition:entry.variant.id!=='original-aligned',packReferenceFocal:run.plateManifests[side].referenceFocal,packMinimumFocal:run.plateManifests[side].minimumFocal??null};
    if(record.statePrecision.untouchedStartupComposition){for(const id of ['focal','yaw','pitch','roll']){assert.deepEqual(record.states.beforeScreenshots.controls[id],record.states.initial.controls[id],`${id} changed from startup`);}}
    assertSettings(record.states.beforeScreenshots,entry.requested,tables);
    record.actual=actualSettings(record.states.beforeScreenshots,tables);
    if(record.statePrecision.untouchedStartupComposition)record.startupComposition={sourceReferenceFocal:run.plateManifests[side].referenceFocal,sourceMinimumFocal:run.plateManifests[side].minimumFocal??null,internalFocalFromDocumentedLoadPath:Math.max(run.plateManifests[side].referenceFocal,run.plateManifests[side].minimumFocal||0),internalOrientationFromDocumentedLoadPath:{yaw:0,pitch:0,roll:0},precisionNote:'Source-derived app initialization, not direct internal-state observation. DOM values and displayed labels are separately retained.'};
    record.compositionDifferences=Object.fromEntries(['focal','yaw','pitch','roll'].filter(key=>entry.requested[key]!==undefined&&record.actual[key]!==entry.requested[key]).map(key=>[key,{requested:entry.requested[key],actual:record.actual[key],reason:'app safe-coverage/range constraint; requested values are not claimed as rendered'}]));
    await page.screenshot({path:join(dir,'page.png'),fullPage:true,animations:'disabled',caret:'hide'});
    await waitLayers(page,run.timeout);await page.locator('#image').screenshot({path:join(dir,'canvas.png'),animations:'disabled'});
    record.states.afterScreenshots=await state(page);
    assert.deepEqual(actualSettings(record.states.afterScreenshots,tables),record.actual,'Settings changed during screenshots');
    const pendingDownload=page.waitForEvent('download',{timeout:run.timeout});await page.locator('#capture').click();const download=await pendingDownload;
    record.export={suggestedFilename:download.suggestedFilename(),failure:await download.failure()};assert.equal(record.export.failure,null,'PNG export failed');
    await download.saveAs(join(dir,'export-2048.png'));await waitLayers(page,run.timeout);record.states.afterExport=await state(page);
    assert.deepEqual(actualSettings(record.states.afterExport,tables),record.actual,'Settings changed during export');
    for(const [id,file]of [['page','page.png'],['canvas','canvas.png'],['export','export-2048.png']])record.artifacts[id]=await imageRecord(sharp,join(dir,file));
    assert.equal(Math.max(record.artifacts.export.width,record.artifacts.export.height),2048,'Export must be a fresh 2048-long-edge PNG');
    assert.ok(record.artifacts.canvas.stdevRGB.some(s=>s>8),'Canvas is empty or flat');
    assert.equal(record.pageErrors.length,0,'Browser page errors');assert.equal(record.requestFailures.length,0,'Browser request failures');assert.equal(record.httpErrors.length,0,'HTTP asset errors');assert.equal(record.console.filter(c=>c.type==='error').length,0,'Browser console errors');
    record.status='passed';
  }catch(error){record.status='failed';record.error={message:error.message,stack:error.stack};try{record.states.failure=await state(page);await page.screenshot({path:join(dir,'failure.png'),fullPage:true,timeout:10000});}catch{};}
  finally{record.finishedAt=new Date().toISOString();await json(join(dir,'capture.json'),record);await context.close();}
  console.log(`${record.status.toUpperCase()} ${entry.variant.id}/${entry.reference.id}/${side}`);
  return record;
}

export async function main(argv=process.argv.slice(2)){
  const config=parseArgs(argv),plan=makePlan(config.includeAligned);if(config.help){console.log(HELP);return;}if(config.plan){console.log(JSON.stringify({config,viewport:VIEWPORT,deviceScaleFactor:1,motion:false,rotorPhase:0,plan},null,2));return;}
  await mkdir(config.out,{recursive:true});
  const run={schemaVersion:1,status:'running',startedAt:new Date().toISOString(),config,timeout:Number(process.env.PARITY_TIMEOUT_MS||180000),viewport:VIEWPORT,deviceScaleFactor:1,plan,captures:[],notes:[
    'Original JPEGs are comparison-only; never used as app textures, replacements, screenshot pixels, or renderer input.',
    'Original shutter 1/120 s is unsupported. Required actual 1/125 s is 0.058894 EV darker (log2(125/120)); aperture and ISO are exact.',
    'current-default and baseline-transform-default use startup f/8, 1/4 s, ISO100 optics. reference-wide uses manually matched original exposure instead.',
    'Aligned composition is approximate. App coverage constraints remain active; capture.actual records settled DOM controls, which may sanitize fractional internal state. Labels and statePrecision document that limitation.',
    'motion=false causes the current renderer to call fan.setTime(0); motion was never enabled and each capture uses a fresh browser context/page.',
    'baseline-transform retains candidate geometry/materials and room source changes. Only the five documented placement/head transform keys are baseline overrides.',
  ]};
  await json(join(config.out,'run.json'),run);
  const stopServers=[];let browser;
  try{
    assert.ok(Number.isFinite(run.timeout)&&run.timeout>=1000,'Invalid PARITY_TIMEOUT_MS');
    for(const root of [config.baselineRoot,config.candidateRoot])assert.ok(await exists(join(root,'package.json')),`Missing checkout: ${root}`);
    if(config.build)for(const root of [config.baselineRoot,config.candidateRoot])await command('npm',['run','build'],root);
    run.captureScript={path:fileURLToPath(import.meta.url),sha256:await sha256(fileURLToPath(import.meta.url))};
    run.sources={baseline:await sourceSnapshot(config.baselineRoot),candidate:await sourceSnapshot(config.candidateRoot)};await json(join(config.out,'source-hashes.json'),run.sources);
    const require=createRequire(join(config.candidateRoot,'package.json')),{chromium}=require('@playwright/test'),sharp=require('sharp');
    const {APERTURES,SHUTTERS,ISOS}=await import(pathToFileURL(join(config.baselineRoot,'src/camera.js')));const tables={aperture:APERTURES,shutter:SHUTTERS,iso:ISOS};run.controlTables=tables;
    run.plateManifests={};for(const [side,root]of [['baseline',config.baselineRoot],['candidate',config.candidateRoot]])run.plateManifests[side]=JSON.parse(await readFile(join(root,'public/scenes/barbershop-plates/manifest.json'),'utf8'));
    const subjects=JSON.parse(await readFile(join(config.baselineRoot,'public/scenes/barbershop-plates/subjects.json'),'utf8')),baselineFan=subjects.find(s=>s.type==='desk-fan');assert.ok(baselineFan?.position,'Baseline subject position missing');
    run.baselineTransform=Object.fromEntries(TRANSFORM_KEYS.map(key=>[key,baselineFan[key]??BASELINE_TRANSFORM_DEFAULTS[key]]));
    run.references=[];for(const reference of REFERENCES){const source=join(config.baselineRoot,reference.file),dest=join(config.out,'originals',reference.file.split('/').pop());await mkdir(dirname(dest),{recursive:true});await copyFile(source,dest);run.references.push({...reference,source,...await imageRecord(sharp,dest),actualOriginalShutter:1/120,simulatorShutter:1/125,shutterDifferenceEV:Math.log2(125/120),whiteBalanceAssumptionKelvin:5000,originalFocusDistance:'unverified; not inferred from filename'});}
    if(config.serve){stopServers.push(await startServer(config.baselineRoot,config.baselineURL,config.out,'baseline'));stopServers.push(await startServer(config.candidateRoot,config.candidateURL,config.out,'candidate'));}
    const executablePath=process.env.PW_EXECUTABLE_PATH||process.env.CHROMIUM_EXECUTABLE_PATH||undefined,channel=executablePath?undefined:process.env.PW_CHANNEL||undefined;
    run.browser={headless:true,executablePath:executablePath??null,channel:channel??null,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--force-color-profile=srgb']};
    browser=await chromium.launch({...run.browser,executablePath,channel,timeout:run.timeout});run.browser.version=browser.version();await json(join(config.out,'run.json'),run);
    for(const entry of plan)for(const side of ['baseline','candidate']){run.captures.push(await capture(browser,sharp,config,run,side,entry,tables,baselineFan));await json(join(config.out,'run.json'),run);}
    run.sourcesAfter={baseline:await sourceSnapshot(config.baselineRoot),candidate:await sourceSnapshot(config.candidateRoot)};
    for(const side of ['baseline','candidate'])assert.equal(run.sourcesAfter[side].sha256,run.sources[side].sha256,`${side} source changed during capture`);
    run.pairs=plan.map(entry=>{const captures=run.captures.filter(c=>c.variant===entry.variant.id&&c.reference===entry.reference.file),baseline=captures.find(c=>c.side==='baseline'),candidate=captures.find(c=>c.side==='candidate');const sameOptics=JSON.stringify(baseline?.actual)===JSON.stringify(candidate?.actual)&&JSON.stringify(baseline?.startupComposition)===JSON.stringify(candidate?.startupComposition);return {variant:entry.variant.id,reference:entry.reference.file,sameActualControls:sameOptics,baselineActual:baseline?.actual,candidateActual:candidate?.actual,passed:captures.every(c=>c.status==='passed')&&sameOptics};});
    // Exact controls must match within every before/after pair. Defaults changing
    // between versions cannot silently masquerade as a material improvement.
    assert.ok(run.pairs.every(p=>p.passed),'One or more captures failed or before/after controls differ; inspect per-capture JSON');
    run.status='passed';
  }catch(error){run.status='failed';run.error={message:error.message,stack:error.stack};process.exitCode=1;console.error(error.stack??error);}
  finally{
    if(browser)await browser.close();for(const stop of stopServers.reverse())await stop();
    run.finishedAt=new Date().toISOString();await json(join(config.out,'run.json'),run);
  }
  console.log(`Evidence: ${join(config.out,'run.json')} (${run.status})`);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
