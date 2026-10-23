#!/usr/bin/env node
/** Identical external instrumentation and real controls, before/after production builds. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {summarize,comparePixels} from './performance/metrics.mjs';
const HERE=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(HERE,'..');
const VIEWPORT={width:1280,height:900},DPR=1;
const ids=['first-scene','first-interaction','parameter-drag','histogram','magnifier','focus','magnifier-hide-show','rapid-positions','rapid-scenes','flash','idle-after-readback'];
const HELP=`Usage: node tools/benchmark-reuse-performance.mjs --baseline-root PATH [--candidate-root PATH] [--out PATH] [--repeats 2] [--build] [--serve] [--plan]\nRequires authorized browser execution (CI). --plan never launches a browser. Both sides use production builds, viewport1280x900/DPR1 and real controls; no fidelity/resolution reduction. The CI renderer is software SwiftShader, not user-device FPS.\n`;
export function parseArgs(argv){
  const c={baselineRoot:null,candidateRoot:ROOT,out:resolve(ROOT,'../performance-evidence'),repeats:2,build:false,serve:false,plan:false};
  for(let i=0;i<argv.length;i++){
    const key={'--baseline-root':'baselineRoot','--candidate-root':'candidateRoot','--out':'out','--repeats':'repeats'}[argv[i]];
    if(key){assert.ok(argv[i+1]&&!argv[i+1].startsWith('--'),`${argv[i]} requires value`);c[key]=argv[++i];}
    else if(['--build','--serve','--plan'].includes(argv[i]))c[argv[i].slice(2)]=true;
    else if(argv[i]==='--help')c.help=true;else throw Error(`Unknown argument ${argv[i]}`);
  }
  c.repeats=Number(c.repeats);assert.ok(Number.isInteger(c.repeats)&&c.repeats>=1&&c.repeats<=4,'repeats must be 1..4');
  for(const key of ['baselineRoot','candidateRoot','out'])if(c[key])c[key]=resolve(c[key]);
  if(!c.help&&!c.plan)assert.ok(c.baselineRoot,'--baseline-root is required');return c;
}
const json=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');};
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
async function hash(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}
async function hashBuild(root,relative='dist',result=[]){
  for(const entry of await readdir(join(root,relative),{withFileTypes:true})){const path=join(relative,entry.name);if(entry.isDirectory())await hashBuild(root,path,result);else if(entry.isFile())result.push({path,sha256:await hash(join(root,path))});}
  return result.sort((a,b)=>a.path.localeCompare(b.path));
}
async function provenance(root){
  const status=git(root,'status','--porcelain');assert.equal(status,'',`Refusing dirty checkout ${root}: ${status}`);
  return {root,commit:git(root,'rev-parse','HEAD'),tree:git(root,'rev-parse','HEAD^{tree}'),status,packageLockSha256:await hash(join(root,'package-lock.json')),dist:await hashBuild(root)};
}
async function command(cmd,args,cwd){await new Promise((res,rej)=>{const child=spawn(cmd,args,{cwd,stdio:'inherit'});child.on('error',rej);child.on('exit',code=>code===0?res():rej(Error(`${cmd} ${args.join(' ')} exited ${code}`)));});}
async function startServer(root,port,out,name){
  const url=`http://127.0.0.1:${port}/`,child=spawn(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});let logs='';
  child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);child.on('error',e=>logs+=e);
  const stop=async()=>{child.kill('SIGTERM');await writeFile(join(out,`${name}-server.log`),logs);};
  try{const deadline=Date.now()+45000;while(Date.now()<deadline){if(child.exitCode!==null)throw Error(`${name} server exited ${child.exitCode}`);try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return {url,stop};}catch{}await new Promise(r=>setTimeout(r,200));}throw Error(`${name} server timeout`);}catch(e){await stop();throw e;}
}
async function ready(page,layers=false){
  await page.waitForFunction(layers=>{const c=document.getElementById('image');return c?.dataset.ready==='true'&&c.dataset.frame===c.dataset.requestedFrame&&(!layers||c.dataset.pendingLayers==='0');},layers,{polling:50,timeout:180000});
}
async function mark(page,id){return page.evaluate(id=>window.__reusePerformance.mark(id),id);}
async function countCommits(page,kind){return page.evaluate(kind=>window.__reusePerformance.commits.filter(c=>c.kind===kind).length,kind);}
async function waitCommit(page,kind,before){await page.waitForFunction(({kind,before})=>window.__reusePerformance.commits.filter(c=>c.kind===kind).length>before,{kind,before},{polling:50,timeout:180000});}
async function hoverDetailEvidence(page,x,y){
  const initial=await page.locator('#image').evaluate(c=>({sourceWidth:Number(c.dataset.detailWidth),sourceDepthWidth:Number(c.dataset.detailDepthWidth)}));
  const box=await page.locator('#image').boundingBox(),before=await countCommits(page,'magnifier'),start=await page.evaluate(()=>performance.now());
  await page.mouse.move(box.x+box.width*x,box.y+box.height*y);await waitCommit(page,'magnifier',before);
  const first=await page.evaluate(before=>window.__reusePerformance.commits.filter(c=>c.kind==='magnifier').slice(before)[0],before);
  assert.ok(first.at>=start,'first detail commit must follow this hover');
  // Wait through the selected-view promotion without moving the pointer. A
  // ready main photograph or completed download is NOT a final detail commit.
  await ready(page,true);
  const required=await page.locator('#image').evaluate(c=>({sourceWidth:Number(c.dataset.detailWidth),sourceDepthWidth:Number(c.dataset.detailDepthWidth)}));
  await page.waitForFunction(({before,start,required})=>window.__reusePerformance.commits.filter(c=>c.kind==='magnifier').slice(before).some(c=>
    c.at>=start&&c.sourceWidth>=required.sourceWidth&&c.sourceDepthWidth>=required.sourceDepthWidth&&
    (c.metadataOrigin==='committed-snapshot'?c.state==='ready':c.sourceAtWrite.pendingLayers===0)),{before,start,required},{polling:50,timeout:180000});
  const final=await page.evaluate(({before,start,required})=>window.__reusePerformance.commits.filter(c=>c.kind==='magnifier').slice(before).find(c=>
    c.at>=start&&c.sourceWidth>=required.sourceWidth&&c.sourceDepthWidth>=required.sourceDepthWidth&&
    (c.metadataOrigin==='committed-snapshot'?c.state==='ready':c.sourceAtWrite.pendingLayers===0)),{before,start,required});
  const promoted=required.sourceWidth>first.sourceWidth||required.sourceDepthWidth>first.sourceDepthWidth;
  if(promoted)assert.ok(final.at>first.at,'promotion requires a NEW actual high-resolution detail commit');
  for(const row of [first,final]){
    assert.equal(row.controlsAtWrite.motion,false,'frozen detail comparison requires motion=false');
    assert.ok(Math.abs(row.hoverIntent.x-x)<.002&&Math.abs(row.hoverIntent.y-y)<.002,'committed crop must retain requested hover intent');
  }
  assert.deepEqual(first.controlsAtWrite,final.controlsAtWrite,'promotion must retain photographic settings');
  assert.equal(first.sourceTime,final.sourceTime,'promotion must retain captured time');
  return {normalizedHover:[x,y],start,initial,required,promoted,firstFeedbackMs:first.at-start,finalReadyMs:final.at-start,firstCommit:first,finalCommit:final};
}
async function input(page,id,value,event='input'){
  return page.evaluate(({id,value,event})=>{const el=document.getElementById(id);if(!el||el.disabled)throw Error(`Missing/disabled control ${id}`);const at=performance.now();if(el.type==='checkbox')el.checked=value;else el.value=String(value);el.dispatchEvent(new Event(event,{bubbles:true}));return at;},{id,value,event});
}
async function completedPhoto(page,start=0){
  await ready(page);
  const revision=await page.locator('#image').getAttribute('data-requested-frame');
  await page.waitForFunction(({revision,start})=>window.__reusePerformance.completions.some(frame=>frame.photo&&frame.revision===revision&&frame.at>=start),{revision,start},{polling:20,timeout:180000});
  return page.evaluate(({revision,start})=>window.__reusePerformance.completions.find(frame=>frame.photo&&frame.revision===revision&&frame.at>=start).at,{revision,start});
}
async function latency(page,start){return await completedPhoto(page,start)-start;}
async function state(page){return page.evaluate(()=>{
  const c=document.getElementById('image');return {canvas:{width:c.width,height:c.height,dataset:{...c.dataset}},viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},controls:Object.fromEntries([...document.querySelectorAll('input[id],select[id]')].map(e=>[e.id,e.type==='checkbox'?e.checked:e.value])),diagnostics:window.__cameraDiagnostics?.snapshot?.()??null};
});}
async function capturePng(page,path,id='image'){const data=await page.locator('#'+id).evaluate(c=>c.toDataURL('image/png').split(',')[1]);await writeFile(path,Buffer.from(data,'base64'));return {path,sha256:await hash(path)};}
async function runSide(browser,config,side,url,repeat){
  const id=`${repeat}-${side}`,dir=join(config.out,id);await mkdir(dir,{recursive:true});
  const record={side,repeat,url,startedAt:new Date().toISOString(),scenarios:[],errors:[],httpErrors:[],failedRequests:[],status:'running'};
  const context=await browser.newContext({viewport:VIEWPORT,deviceScaleFactor:DPR,locale:'zh-CN',timezoneId:'UTC',serviceWorkers:'block'});
  await context.tracing.start({screenshots:true,snapshots:true,sources:false});
  const page=await context.newPage();page.setDefaultTimeout(180000);page.setDefaultNavigationTimeout(180000);
  page.on('pageerror',e=>record.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')record.errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)record.httpErrors.push({url:r.url(),status:r.status()});});
  page.on('requestfailed',r=>record.failedRequests.push({url:r.url(),failure:r.failure()}));
  await page.addInitScript({path:join(HERE,'performance/observe-browser.js')});
  const scenario=async(id,fn)=>{await mark(page,id);const entry={id,latencies:[]};record.scenarios.push(entry);await fn(entry);entry.state=await state(page);};
  try{
    const navStart=Date.now();await page.goto(new URL('?diagnostics=performance',url).href);const completedAt=await completedPhoto(page);
    const first={id:'first-scene',latencies:[await page.evaluate(at=>performance.timeOrigin+at,completedAt)-navStart],note:'wall-clock navigation-to-first fence-completed photograph; selected-layer settling recorded separately'};record.scenarios.push(first);await ready(page,true);first.state=await state(page);first.png=await capturePng(page,join(dir,'initial.png'));
    await scenario('first-interaction',async e=>{e.latencies.push(await latency(page,await input(page,'wb',5100)));});
    await scenario('parameter-drag',async e=>{
      // Sequential input-to-ready samples measure response; then a real timed burst
      // checks coalescing/backpressure under a user drag, not only isolated edits.
      for(const value of [3,4,5,6,7,5])e.latencies.push(await latency(page,await input(page,'aperture',value)));
      e.burst=await page.evaluate(async()=>{const el=document.getElementById('aperture'),start=performance.now();let events=0;for(const value of [3,4,5,6,7,6,5,5]){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));events++;await new Promise(r=>setTimeout(r,16));}return {start,events,duration:performance.now()-start};});
      e.latencies.push(await latency(page,e.burst.start));
    });
    await scenario('histogram',async e=>{
      let before=await countCommits(page,'histogram'),start=await input(page,'histogram-toggle',true,'change');await ready(page);await waitCommit(page,'histogram',before);e.latencies.push(await page.evaluate(start=>performance.now()-start,start));
      for(const value of [4900,5000,5100,5000]){before=await countCommits(page,'histogram');start=await input(page,'wb',value);await ready(page);await waitCommit(page,'histogram',before);e.latencies.push(await page.evaluate(start=>performance.now()-start,start));}
      await input(page,'histogram-toggle',false,'change');await ready(page);
    });
    await scenario('magnifier',async e=>{
      e.hovers=[];e.firstFeedbackLatencies=[];e.finalReadyLatencies=[];
      for(const [x,y]of [[.5,.5],[.1,.5],[.9,.5],[.5,.1],[.5,.9]]){
        const hover=await hoverDetailEvidence(page,x,y);e.hovers.push(hover);
        e.firstFeedbackLatencies.push(hover.firstFeedbackMs);e.finalReadyLatencies.push(hover.finalReadyMs);
        // Keep the generic latency field at final required quality, never the
        // lower-resolution provisional feedback that may precede promotion.
        e.latencies.push(hover.finalReadyMs);
      }
      // Frozen motion=false / time=0, same source detail layer and physical crop.
      // Re-entry requires a NEW actual detail pixel commit, not a stale attribute.
      await page.mouse.move(0,0);await ready(page,true);
      e.frozenDetailEvidence=await hoverDetailEvidence(page,.5,.5);
      e.detail=await page.locator('#magnifier').evaluate(canvas=>({normalizedHover:[.5,.5],time:0,width:canvas.width,height:canvas.height,cssWidth:canvas.clientWidth,cssHeight:canvas.clientHeight,dataset:{...canvas.dataset}}));
      e.detailPng=await capturePng(page,join(dir,'paused-detail-center.png'),'magnifier');
      e.png=await capturePng(page,join(dir,'after-magnifier.png'));
    });
    await scenario('focus',async e=>{
      const box=await page.locator('#image').boundingBox(),start=await page.evaluate(()=>performance.now());await page.locator('#image').click({position:{x:box.width*.6,y:box.height*.6}});e.latencies.push(await latency(page,start));
      const before=await countCommits(page,'magnifier');await input(page,'focus',.2);await ready(page);await waitCommit(page,'magnifier',before);e.focusDistance=(await state(page)).controls.focus;
      // Leave while an async crop can be pending, change focus, then re-enter.
      await page.mouse.move(0,0);await input(page,'focus',3);await ready(page);
    });
    await scenario('magnifier-hide-show',async e=>{
      const box=await page.locator('#image').boundingBox();await page.mouse.move(box.x+box.width*.3,box.y+box.height*.5);
      await input(page,'magnifier-toggle',false,'change');await page.mouse.move(0,0);await ready(page);await page.waitForTimeout(150);
      assert.equal(await page.locator('#magnifier').isVisible(),false,'hidden magnifier must remain hidden after async completion');
      const before=await countCommits(page,'magnifier'),start=await input(page,'magnifier-toggle',true,'change');await page.mouse.move(box.x+box.width*.7,box.y+box.height*.5);await waitCommit(page,'magnifier',before);e.latencies.push(await page.evaluate(start=>performance.now()-start,start));
      await page.mouse.move(0,0);
    });
    await scenario('rapid-positions',async e=>{
      const start=await page.evaluate(()=>{const start=performance.now();for(const id of ['left','right','up','center'])document.querySelector(`button[data-position="${id}"]`).click();return start;});e.latencies.push(await latency(page,start));await ready(page,true);assert.equal((await state(page)).canvas.dataset.position,'center');
    });
    await scenario('rapid-scenes',async e=>{
      const start=await page.evaluate(()=>{const el=document.getElementById('scene'),start=performance.now();for(const id of ['kitchen','classroom','apartment','barbershop']){el.value=id;el.dispatchEvent(new Event('change',{bubbles:true}));}return start;});e.latencies.push(await latency(page,start));await ready(page,true);assert.equal((await state(page)).canvas.dataset.scene,'barbershop');assert.equal((await state(page)).canvas.dataset.position,'center');
    });
    await scenario('flash',async e=>{
      const start=await input(page,'flash',.5);await ready(page,true);e.latencies.push(await page.evaluate(start=>performance.now()-start,start));assert.equal((await state(page)).canvas.dataset.flashReady,'true');
      e.latencies.push(await latency(page,await input(page,'flash',0)));e.png=await capturePng(page,join(dir,'final.png'));
    });
    await scenario('idle-after-readback',async e=>{
      await ready(page,true);await page.mouse.move(0,0);await page.waitForTimeout(200);
      const before=await page.evaluate(()=>window.__reusePerformance.frames.length);await page.waitForTimeout(500);const after=await page.evaluate(()=>window.__reusePerformance.frames.length);
      e.extraRenderedRafs=after-before;assert.equal(e.extraRenderedRafs,0,'async readback completion must not cause an endless whole-photo redraw loop');
    });
    await page.waitForTimeout(100);record.evidence=await page.evaluate(()=>{const e=window.__reusePerformance;return {...e,mark:undefined};});record.summary=summarize(record.evidence,record.scenarios);
    record.final=await state(page);await page.screenshot({path:join(dir,'ui.png'),fullPage:true});
    assert.deepEqual(record.errors,[],'browser errors');assert.deepEqual(record.httpErrors,[],'HTTP errors');
    record.status='passed';
  }catch(error){
    record.status='failed';record.failure={message:error.message,stack:error.stack};
    try{record.evidence=await page.evaluate(()=>{const e=window.__reusePerformance;return e?{...e,mark:undefined}:null;});if(record.evidence)record.summary=summarize(record.evidence,record.scenarios);}catch(e){record.evidenceReadError=String(e);}
    try{record.final=await state(page);}catch(e){record.stateReadError=String(e);}
    try{await page.screenshot({path:join(dir,'failure.png'),fullPage:true,timeout:10000});}catch(e){record.screenshotError=String(e);}
    throw error;
  }finally{
    try{await context.tracing.stop({path:join(dir,'trace.zip')});}catch(e){record.traceError=String(e);}
    await json(join(dir,'result.json'),record);await context.close();
  }
  return record;
}
async function compare(sharp,baseline,candidate){
  const comparisons=[];
  for(const id of ['first-scene','magnifier','flash']){
    const a=baseline.scenarios.find(s=>s.id===id),b=candidate.scenarios.find(s=>s.id===id);assert.ok(a?.png&&b?.png);
    const ar=await sharp(a.png.path).ensureAlpha().raw().toBuffer({resolveWithObject:true}),br=await sharp(b.png.path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.deepEqual(ar.info,br.info,`${id}: output format/resolution changed`);
    // Do not hard-fail tiny cross-context driver differences. Preserve exact
    // numeric error and settings for independent acceptance, not a blanket pass.
    const controlsA={...a.state.controls},controlsB={...b.state.controls};assert.deepEqual(controlsA,controlsB,`${id}: control semantics changed`);
    comparisons.push({scenario:id,baseline:a.png,candidate:b.png,settingsEqual:true,format:ar.info,...comparePixels(ar.data,br.data)});
  }
  const a=baseline.scenarios.find(s=>s.id==='magnifier'),b=candidate.scenarios.find(s=>s.id==='magnifier');
  assert.equal(a.state.controls.motion,false);assert.equal(b.state.controls.motion,false);
  for(const key of ['normalizedHover','time','width','height','cssWidth','cssHeight'])assert.deepEqual(a.detail[key],b.detail[key],`detail ${key} differs`);
  const ar=await sharp(a.detailPng.path).ensureAlpha().raw().toBuffer({resolveWithObject:true}),br=await sharp(b.detailPng.path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual(ar.info,br.info,'detail output format/resolution changed');
  comparisons.push({scenario:'paused-detail-center',baseline:a.detailPng,candidate:b.detailPng,settingsEqual:true,normalizedHover:[.5,.5],time:0,format:ar.info,...comparePixels(ar.data,br.data)});
  return comparisons;
}
export async function main(config){
  if(config.help){process.stdout.write(HELP);return;}
  if(config.plan){process.stdout.write(JSON.stringify({viewport:VIEWPORT,deviceScaleFactor:DPR,scenarios:ids,repeats:config.repeats,order:'alternating baseline/candidate, then candidate/baseline',renderer:'CI SwiftShader software only',gpu:'real EXT_disjoint_timer_query_webgl2 if available; otherwise missing',completion:'CPU submission is not GPU completion; no gl.finish timing',scope:'no deployment, same fidelity and real controls'},null,2)+'\n');return;}
  await mkdir(config.out,{recursive:true});const manifest={schema:1,startedAt:new Date().toISOString(),viewport:VIEWPORT,deviceScaleFactor:DPR,repeats:config.repeats,rendererLabel:'software SwiftShader only; not user-device FPS',metricDefinitions:{renderedRafCpuMs:'Entire callback that issued image-context draw calls; all photographic passes + same-frame metering + synchronous magnifier/UI work, CPU submission not GPU completion',wholeRafGpuMs:'Timer-query elapsed GPU command interval enclosing entire callback only when EXT is available and non-disjoint',readbackCpuMs:'Native readPixels/getBufferSubData CPU call time; async PBO submission separately labeled, not GPU time',latency:'browser clock event/input to independently fence-completed matching-revision photograph on BOTH builds, or actual overlay pixel commit; polling20/50ms, not display presentation timestamp',magnifierFirstFeedbackMs:'hover to first actual detail pixel commit, including explicitly tagged lower-source-resolution loading feedback',magnifierFinalReadyMs:'hover to NEW actual detail commit at current required settled source/depth widths, state ready for tagged candidate or synchronous baseline resource-at-write with pendingLayers0; settings/time/crop unchanged'},runs:[],comparisons:[],status:'running'};
  const servers=[];let browser;
  try{
    if(config.build)for(const root of [config.baselineRoot,config.candidateRoot])await command('npm',['run','build'],root);
    manifest.baseline=await provenance(config.baselineRoot);manifest.candidate=await provenance(config.candidateRoot);
    manifest.harness={scriptSha256:await hash(fileURLToPath(import.meta.url)),observerSha256:await hash(join(HERE,'performance/observe-browser.js'))};
    let urls={baseline:'http://127.0.0.1:8016/',candidate:'http://127.0.0.1:8017/'};
    if(config.serve)for(const [side,root,port]of [['baseline',config.baselineRoot,8016],['candidate',config.candidateRoot,8017]]){const server=await startServer(root,port,config.out,side);servers.push(server);urls[side]=server.url;}
    const require=createRequire(join(config.candidateRoot,'package.json')),{chromium}=require('@playwright/test'),sharp=require('sharp');
    browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});manifest.browserVersion=browser.version();
    for(let repeat=1;repeat<=config.repeats;repeat++){
      const pair={};for(const side of repeat%2?['baseline','candidate']:['candidate','baseline']){pair[side]=await runSide(browser,config,side,urls[side],repeat);manifest.runs.push({side,repeat,result:`${repeat}-${side}/result.json`,summary:pair[side].summary,gpu:pair[side].evidence.gpu});await json(join(config.out,'manifest.json'),manifest);}
      manifest.comparisons.push({repeat,images:await compare(sharp,pair.baseline,pair.candidate)});
    }
    manifest.status='passed';manifest.completedAt=new Date().toISOString();
  }catch(error){manifest.status='failed';manifest.failure={message:error.message,stack:error.stack};throw error;}finally{await browser?.close();for(const server of servers.reverse())await server.stop();await json(join(config.out,'manifest.json'),manifest);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(parseArgs(process.argv.slice(2))).catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
