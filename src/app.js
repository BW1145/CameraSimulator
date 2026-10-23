import './style.css';
import {APERTURES,SHUTTERS,ISOS,DEFAULTS,clamp,ev100,resolveExposure,formatShutter,meterLinearPixels,histogram} from './camera.js';
import {SCENES} from './scenes.js';
import {Renderer} from './renderer.js';
import {PlateRenderer} from './plate-renderer.js';
import {previewSize,captureSize} from './render-size.js';
import {detailRegion} from './detail-region.js';
import {canDeliverDetail} from './detail-feedback.js';
import {installWheelControls} from './wheel-controls.js';

const $=id=>document.getElementById(id);
const canvas=$('image'),view=$('viewfinder'),loading=$('loading');
let renderer;
const usePlates=new URLSearchParams(location.search).get('renderer')!=='gltf';
try{renderer=usePlates?new PlateRenderer(canvas):new Renderer(canvas);}catch(error){loading.textContent=error.message;}
let s={...DEFAULTS},scene=SCENES[0],resolved=resolveExposure(s,8),meterEV=8;
const sourceView=new URLSearchParams(location.search).get('view')==='source';
if(sourceView||usePlates){
  $('crop').add(new Option('原始画幅','native'));
  s={...s,crop:'native',focal:18.8027323,aperture:8,shutter:1/4,iso:100,autoISO:false};
  resolved=resolveExposure(s,8);
}
let dirty=true,meterDirty=true,ready=false,histogramRequested=false,lastFrame=0,lastAnalysis=0,clock=0,lastClock=performance.now(),track=null,point={x:.5,y:.5},loadVersion=0;
let pointer=null,hover=null,capturing=false;
let frameRevision=0,displayedFrame=null,displayedSerial=0,lastMagnifierAt=0,magnifierKey=null,magnifierCommittedRegion=null;
let photographicIntent=0,magnifierGeneration=0,magnifierCommitted=null;
const tables={aperture:APERTURES,shutter:SHUTTERS,iso:ISOS};
const numeric=['wb','focal','focus','compensation','flash','x','y','z','yaw','pitch','roll'];
const selects=['mode','metering','af','crop','sensor'];
const checks={autoISO:'autoISO',motion:'motion',pause:'pause',zebra:'zebra','grid-toggle':'grid','level-toggle':'level','histogram-toggle':'histogram','magnifier-toggle':'magnifier'};
const originalBounds=Object.fromEntries(['x','y','z','yaw','pitch','roll'].map(key=>[key,{min:$(key).min,max:$(key).max,step:$(key).step}]));
const positionLabels={center:'中心',left:'左移 30 cm',right:'右移 30 cm',up:'升高 20 cm',down:'降低 20 cm',front:'前移 30 cm',back:'后退 30 cm'};
for(const button of document.querySelectorAll('button[data-position]'))button.addEventListener('click',()=>{
  if(!renderer.ready||!renderer.plateMode)return;
  const entry=renderer.pack.views.find(view=>view.id===button.dataset.position);[s.x,s.y,s.z]=[entry.offset[0],entry.offset[1],-entry.offset[2]];track=null;sync();changePosition();
});
let positionVersion=0;
async function changePosition(){
  if(!renderer.plateMode||!renderer.ready)return;
  const version=++positionVersion;discardDisplayedFrame();ready=false;canvas.dataset.ready='false';loading.hidden=false;loading.textContent='正在加载选定的拍摄机位…';$('capture').disabled=true;
  try{
    await renderer.setPosition(s);if(version!==positionVersion)return;
    track=null;ready=true;loading.hidden=true;$('capture').disabled=false;$('hint').textContent='点击对焦 · 拖动取景 · 滚轮变焦';invalidate();
  }catch(error){
    if(version!==positionVersion)return;loading.textContent=`机位加载失败：${error.message} `;
    const retry=document.createElement('button');retry.textContent='重新加载';retry.onclick=changePosition;loading.append(retry);
  }
}
for(const item of SCENES)$('scene').add(new Option(item.name,item.id));

function discardDisplayedFrame(promotion=false){
  renderer?.analysisReadback.invalidate();
  if(promotion)return; // keep the last valid same-intent snapshot while upgrading
  photographicIntent++;displayedFrame=null;magnifierKey=null;magnifierCommittedRegion=null;magnifierCommitted=null;
  $('magnifier').hidden=true;$('magnifier-status').hidden=true;renderer?.detailPass?.readback.invalidate();
}
function invalidate(geometry=true,promotion=false){discardDisplayedFrame(promotion);dirty=true;canvas.dataset.ready='false';canvas.dataset.requestedFrame=String(++frameRevision);if(geometry)meterDirty=true;}
if(renderer){renderer.onTextureUpdate=event=>{
  const promotion=event?.kind==='detail-resolution'&&event.resource===renderer.plate&&event.viewId===renderer.entry?.id&&Boolean(event.sourceSha256)&&event.sourceSha256===renderer.pack?.sourceSha256&&event.toWidth>event.fromWidth;
  canvas.dataset.ready='false';invalidate(true,promotion);$('hint').textContent=renderer.plateMode?'点击对焦 · 拖动取景 · 滚轮变焦':'点击对焦 · 拖动转向 · 滚轮变焦 · WASD 移动';
};renderer.onContextLost=()=>{discardDisplayedFrame();canvas.dataset.ready='false';};renderer.onLayerError=(name,retry)=>{$('hint').textContent=`${name}加载失败 `;const button=document.createElement('button');button.textContent='重试';button.onclick=retry;$('hint').append(button);};}
if(renderer)renderer.onFrameError=()=>{$('hint').textContent='GPU 同步失败，请重新加载页面。';canvas.dataset.frameFenceError='true';};
function resetView(){for(const key of ['x','y','z','yaw','pitch','roll'])s[key]=0;track=null;point={x:.5,y:.5};invalidate();sync();if(ready&&renderer.plateMode)changePosition();}
function sync(){
  const position=s.x<0?'left':s.x>0?'right':s.y<0?'down':s.y>0?'up':s.z<0?'back':s.z>0?'front':'center';
  $('position-status').textContent=positionLabels[position];
  for(const button of document.querySelectorAll('button[data-position]'))button.setAttribute('aria-pressed',String(button.dataset.position===position));
  for(const key of selects)$(key).value=s[key];
  for(const [id,key]of Object.entries(checks))$(id).checked=s[key];
  for(const key of numeric)$(key).value=key==='compensation'?Math.round(s[key]*3):s[key];
  for(const [key,table]of Object.entries(tables)){
    const value=resolved[key];$(key).value=Math.max(0,table.indexOf(value));
    $(`${key}-value`).textContent=key==='aperture'?`f/${value}`:key==='shutter'?formatShutter(value):`${value}${s.autoISO?' 自动':''}`;
  }
  $('aperture').disabled=s.mode==='S'||s.mode==='P';$('shutter').disabled=s.mode==='A'||s.mode==='P';$('iso').disabled=s.autoISO;
  $('compensation').disabled=s.mode==='M'&&!s.autoISO;
  $('wb-value').textContent=`${s.wb} K`;$('focal-value').textContent=`${Number(s.focal.toFixed(1))} mm`;
  $('focus-value').textContent=`${s.focus.toFixed(2)} m`;
  $('compensation-value').textContent=`${s.compensation>=0?'+':''}${s.compensation.toFixed(1)} EV`;
  $('flash-value').textContent=s.flash===0?'关闭':s.flash.toFixed(1);
  for(const key of ['x','y','z'])$(`${key}-value`).textContent=`${s[key].toFixed(2)} m`;
  for(const key of ['yaw','pitch','roll'])$(`${key}-value`).textContent=`${Math.round(s[key])}°`;
  $('grid').hidden=!s.grid;$('level').hidden=!s.level;$('histogram-view').hidden=!s.histogram;
  $('level').firstElementChild.style.transform=`rotate(${-s.roll}deg)`;
  $('meter').textContent=`${resolved.deviation>=0?'+':''}${resolved.deviation.toFixed(1)} EV${resolved.limited?' · 已到参数极限':''}`;
  const messages={M:s.autoISO?'你决定光圈和快门，自动 ISO 配合测光。':'手动曝光：光圈、快门和 ISO 共同决定亮度。',A:'你决定光圈，相机配合快门与 ISO。',S:'你决定快门，相机配合光圈与 ISO。',P:'相机配合光圈、快门与 ISO；曝光补偿决定拍亮或拍暗。'};
  $('lesson').textContent=messages[s.mode];
  canvas.dataset.focus=s.focus.toFixed(3);canvas.dataset.iso=resolved.iso;canvas.dataset.ev=ev100(resolved.aperture,resolved.shutter,resolved.iso).toFixed(3);
}
function resize(){
  const [w,h]=s.crop.split(':').map(Number),aspect=s.crop==='native'?(renderer?.pack?.camera.aspect||renderer?.nativeCamera?.aspect||2048/858):w/h;
  view.style.setProperty('--aspect',aspect);
  // Transient hidden layouts have no drawable size. Preserve the last valid
  // frame instead of clearing it to 1x1 while the compositor takes a snapshot.
  if(!view.clientWidth)return;
  const size=previewSize(view.clientWidth,aspect,window.devicePixelRatio);
  if(canvas.width!==size[0]||canvas.height!==size[1])canvas.dataset.ready='false';
  renderer?.resize(...size);invalidate();
}
for(const [key,table]of Object.entries(tables))$(key).addEventListener('input',()=>{s[key]=table[Number($(key).value)];invalidate(false);});
for(const key of numeric)$(key).addEventListener('input',()=>{
  s[key]=Number($(key).value)/(key==='compensation'?3:1);
  renderer.constrain?.(s,key);
  if(key==='focus'){s.af='MF';track=null;}
  invalidate(['x','y','z','yaw','pitch','roll','focal'].includes(key));sync();
  if(['x','y','z'].includes(key))changePosition();
});
for(const key of selects)$(key).addEventListener('change',()=>{
  // Keep the current resolved exposure when moving into manual control.
  if(key==='mode'){s.aperture=resolved.aperture;s.shutter=resolved.shutter;s.iso=resolved.iso;}
  s[key]=$(key).value;if(key==='crop')resize();renderer.constrain?.(s,key);invalidate();sync();
});
for(const [id,key]of Object.entries(checks))$(id).addEventListener('change',()=>{
  s[key]=$(id).checked;
  // Showing/hiding an aid changes no photographic setting. Reuse the current
  // photograph instead of queuing an otherwise identical expensive new one.
  if(key==='histogram'){renderer.analysisReadback.invalidate();histogramRequested=s.histogram;sync();return;}
  if(key==='magnifier'){renderer.detailPass?.readback.invalidate();magnifierKey=null;$('magnifier').hidden=!s.magnifier;if(!s.magnifier)$('magnifier-status').hidden=true;sync();return;}
  if(key==='motion')track=null;invalidate(key==='motion');sync();
});
$('reset').addEventListener('click',()=>{
  s={...DEFAULTS,focus:scene.focus,focal:scene.focal};
  if(renderer.plateMode)s={...s,crop:'native',focal:Math.max(renderer.pack.referenceFocal,renderer.pack.minimumFocal||0),aperture:8,shutter:1/4,iso:100,autoISO:false};
  resolved=resolveExposure(s,meterEV);track=null;clock=0;resize();sync();changePosition();
});
$('reset-view').addEventListener('click',resetView);
installWheelControls({root:document.querySelector('main'),image:canvas,focal:$('focal'),enabled:()=>ready&&!capturing});
new ResizeObserver(resize).observe(view);

async function loadScene(id){
  if(!renderer)return;
  ++positionVersion;
  const version=++loadVersion;discardDisplayedFrame();ready=false;canvas.dataset.ready='false';loading.hidden=false;loading.textContent='正在加载完整场景…';$('capture').disabled=true;
  const next=SCENES.find(item=>item.id===id);
  try{
    const loaded=await renderer.load(next,(bytes,total)=>{if(version===loadVersion)loading.textContent=total?`正在加载${next.name} ${Math.round(bytes/total*100)}%`:`正在加载${next.name} ${(bytes/1048576).toFixed(1)} MB`;});
    if(!loaded||version!==loadVersion)return;
    scene=next;s.focus=scene.focus;s.focal=renderer.plateMode?Math.max(renderer.pack.referenceFocal,renderer.pack.minimumFocal||0):sourceView&&scene.id==='barbershop'?18.8027323:scene.focal;clock=0;resetView();resize();ready=true;loading.hidden=true;$('capture').disabled=false;
    for(const key of ['x','y','z','yaw','pitch','roll']){
      const bounds=renderer.plateMode?{min:renderer.pack.bounds[key][0],max:renderer.pack.bounds[key][1],step:key==='y'?.2:['x','z'].includes(key)?.3:1}:originalBounds[key];
      if(renderer.plateMode){const axis=['x','y','z'].indexOf(key);if(axis>=0){const values=renderer.pack.views.map(v=>v.offset[axis]*(key==='z'?-1:1));bounds.min=Math.min(...values);bounds.max=Math.max(...values);bounds.step=Math.min(...values.filter(v=>v!==0).map(Math.abs));}}
      Object.assign($(key),bounds);
    }
    $('focal').min=renderer.plateMode?Math.max(18,renderer.pack.minimumFocal??Math.ceil(renderer.pack.referenceFocal/1.199)):18;
    if(renderer.plateMode){for(const v of renderer.pack.views){const distance=Math.round(Math.hypot(...v.offset)*100),label=positionLabels[v.id].split(' ')[0];positionLabels[v.id]=distance?`${label} ${distance} cm`:label;document.querySelector(`button[data-position=${v.id}]`).setAttribute('aria-label',positionLabels[v.id]);}}
    $('flash').disabled=renderer.plateMode&&!renderer.pack.flash;$('flash').title=renderer.plateMode&&!renderer.pack.flash?'预渲染闪光照明层尚未生成':'';if(renderer.plateMode&&!renderer.pack.flash)s.flash=0;
    $('flash-control').hidden=renderer.plateMode&&!renderer.pack.flash;$('legacy-view').hidden=renderer.plateMode;$('position-controls').hidden=!renderer.plateMode;
    $('subject-controls').hidden=!renderer.fan;
    (renderer.fan?$('subject-controls'):$('assist-tools').querySelector('.tool-content')).append($('motion-controls'));
    $('hint').textContent=renderer.plateMode?'点击对焦 · 拖动取景 · 滚轮变焦':'点击对焦 · 拖动转向 · 滚轮变焦 · WASD 移动';
    $('motion').closest('label').lastChild.textContent=renderer.fan?'风扇转动':'运动练习球';
    $('pause').closest('label').lastChild.textContent=renderer.fan?'暂停播放':'暂停运动';
    $('credit').textContent=`${scene.title} — ${scene.author} · ${scene.license}。场景经过 glTF 转换、网格精简和纹理缩放。`;
    canvas.dataset.scene=scene.id;invalidate();
    if(renderer.plateMode)$('credit').textContent=`${renderer.pack.title} · ${renderer.pack.attribution}`;
  }catch(error){
    if(version!==loadVersion)return;
    loading.textContent=`场景加载失败：${error.message} `;
    const retry=document.createElement('button');retry.textContent='重新加载';retry.onclick=()=>loadScene(id);loading.append(retry);
  }
}
$('scene').addEventListener('change',()=>loadScene($('scene').value));
function focusAt(x,y){
  if(!ready)return;
  const hit=renderer.hitAt(x,y);if(!hit)return;
  s.focus=clamp(hit.z,.2,50);point={x,y};track=hit.track||(hit.ball?{ball:true}:{point:hit.point});
  $('focus-mark').hidden=false;invalidate();sync();
}
$('focus-center').addEventListener('click',()=>focusAt(.5,.5));
canvas.addEventListener('pointerdown',e=>{if(!ready)return;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);pointer={x:e.clientX,y:e.clientY,yaw:s.yaw,pitch:s.pitch,dragged:false};});
canvas.addEventListener('pointermove',e=>{
  const box=canvas.getBoundingClientRect();hover={x:(e.clientX-box.left)/box.width,y:(e.clientY-box.top)/box.height};
  if(pointer){const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.hypot(dx,dy)>4)pointer.dragged=true;
    if(pointer.dragged){s.yaw=clamp(pointer.yaw-dx*.16,-180,180);s.pitch=clamp(pointer.pitch-dy*.16,-80,80);renderer.constrain?.(s,'yaw');invalidate();sync();}
  }
});
canvas.addEventListener('pointerup',e=>{const box=canvas.getBoundingClientRect();if(pointer&&!pointer.dragged)focusAt((e.clientX-box.left)/box.width,1-(e.clientY-box.top)/box.height);pointer=null;});
canvas.addEventListener('pointercancel',()=>{pointer=null;});
canvas.addEventListener('pointerleave',()=>{hover=null;magnifierKey=null;renderer.detailPass?.readback.invalidate();$('magnifier').hidden=true;$('magnifier-status').hidden=true;});
canvas.addEventListener('keydown',e=>{
  const movements={w:['z',.15],s:['z',-.15],a:['x',-.15],d:['x',.15],q:['y',-.15],e:['y',.15],ArrowLeft:['yaw',3],ArrowRight:['yaw',-3],ArrowUp:['pitch',3],ArrowDown:['pitch',-3]};
  const move=movements[e.key];if(!move)return;e.preventDefault();const [key,amount]=move,input=$(key);s[key]=clamp(s[key]+(renderer.plateMode&&['x','y','z'].includes(key)?Math.sign(amount)*Number(input.step):amount),Number(input.min),Number(input.max));renderer.constrain?.(s,key);invalidate();sync();if(['x','y','z'].includes(key))changePosition();
});
function magnify(now=performance.now(),allowWork=true){
  const magnifier=$('magnifier'),status=$('magnifier-status');magnifier.hidden=!hover||!s.magnifier||pointer?.dragged||!ready||!displayedFrame;
  if(magnifier.hidden){magnifierKey=null;status.hidden=true;return;}
  const box=view.getBoundingClientRect(),width=magnifier.clientWidth,height=magnifier.clientHeight;
  magnifier.style.left=`${clamp(hover.x*box.width-width-10,0,Math.max(0,box.width-width-2))}px`;
  magnifier.style.top=`${clamp(hover.y*box.height-height-10,0,Math.max(0,box.height-height-2))}px`;
  status.style.left=`${parseFloat(magnifier.style.left)+4}px`;status.style.top=`${parseFloat(magnifier.style.top)+height-24}px`;status.style.maxWidth=`${width-8}px`;
  const region=detailRegion(box.width,box.height,hover.x,hover.y,width,height,2.5,window.devicePixelRatio);
  const regionKey=JSON.stringify([photographicIntent,region]);
  const key=JSON.stringify([displayedSerial,region]);
  const current={intent:photographicIntent,regionKey,frame:displayedFrame,moving:s.motion&&!s.pause,committed:magnifierCommitted};
  // A promotion may also change resolved AE. Even an already shown provisional
  // image must match a frozen photograph's actual settings, exposure and time.
  if(magnifierCommitted&&!canDeliverDetail(magnifierCommitted,current)){
    magnifierCommitted=null;magnifierCommittedRegion=null;magnifierKey=null;
  }
  // Hide an invalid/changed crop before any throttled return can expose pixels
  // retained in the canvas backing store from the previous photograph.
  if(regionKey!==magnifierCommittedRegion)magnifier.style.visibility='hidden';
  const updateStatus=()=>{
    const resource=renderer.plate;
    const loading=resource?.detailLoading||magnifierCommitted?.sourceWidth<(resource?.image.image.width??0)||magnifierCommitted?.sourceDepthWidth<(resource?.width??0);
    magnifier.dataset.quality=resource?.detailFailed?'unavailable':loading?'provisional':'final';
    magnifier.dataset.state=resource?.detailFailed?'error':loading?'loading':'ready';
    status.hidden=magnifier.dataset.state==='ready';status.textContent=resource?.detailFailed?'精细图加载失败':'精细图加载中…';
  };
  if(magnifierCommitted&&regionKey===magnifierCommittedRegion)updateStatus();
  else status.hidden=true;
  if(key===magnifierKey||now-lastMagnifierAt<1000/30)return;
  // Under motion, keep the last COMPLETED snapshot for this unchanged crop
  // visible while the next one waits. Requiring the newest animation serial
  // would starve both aids whenever a fence takes longer than one frame.
  if(!allowWork||renderer.detailPass?.readback.pending)return false;
  lastMagnifierAt=now;
  const frame=displayedFrame,intent=photographicIntent,serial=displayedSerial,resource=renderer.plate;
  const snapshot={frame,intent,regionKey,generation:++magnifierGeneration,sourceWidth:resource?.image.image.width??0,sourceDepthWidth:resource?.width??0};
  const isCurrent=()=>{
    if(!(displayedFrame&&resource===renderer.plate&&ready&&s.magnifier&&hover&&!pointer?.dragged&&!document.hidden))return false;
    // Pointer events can precede the next RAF. Compare the actual quantized
    // crop now, not a raw-coordinate generation or last RAF's hover cache.
    const box=view.getBoundingClientRect();
    return canDeliverDetail(snapshot,{intent:photographicIntent,regionKey:JSON.stringify([photographicIntent,detailRegion(box.width,box.height,hover.x,hover.y,magnifier.clientWidth,magnifier.clientHeight,2.5,window.devicePixelRatio)]),frame:displayedFrame,moving:s.motion&&!s.pause,committed:magnifierCommitted});
  };
  const handled=renderer.diagnostics.measure('magnifier',()=>renderer.drawDetail?.(frame.settings,frame.exposure,frame.time,region,magnifier,{
    isCurrent,
    onCommit:({sourceWidth,sourceDepthWidth})=>{
      magnifierCommitted={...snapshot,sourceWidth,sourceDepthWidth};magnifierKey=key;magnifierCommittedRegion=regionKey;
      magnifier.dataset.source='detail-render';magnifier.dataset.sourceFrame=String(serial);magnifier.dataset.sourceTime=String(frame.time);
      magnifier.dataset.sourceWidth=String(sourceWidth);magnifier.dataset.sourceDepthWidth=String(sourceDepthWidth);
      updateStatus();magnifier.style.visibility='visible';
    },
    onError:()=>{magnifierKey=null;magnifier.dataset.state='error';status.hidden=magnifierCommittedRegion!==regionKey;status.textContent='精细图加载失败';},
  }));
  if(handled){
    // The badge describes the displayed source, not routine same-quality
    // animation refresh work. Do not show a perpetual loader during motion.
    if(magnifierCommittedRegion!==regionKey)magnifier.dataset.state='pending';
  }else{
    magnifier.width=region.outputWidth;magnifier.height=region.outputHeight;
    const sx=(region.centerX-region.spanX+1)*.5*canvas.width+region.readX/region.fullWidth*canvas.width;
    const sy=(1-region.centerY-region.spanY)*.5*canvas.height+(region.height-region.readY-region.outputHeight)/region.fullHeight*canvas.height;
    magnifier.getContext('2d').drawImage(canvas,sx,sy,region.outputWidth/region.fullWidth*canvas.width,region.outputHeight/region.fullHeight*canvas.height,0,0,magnifier.width,magnifier.height);
    magnifier.dataset.source='preview';magnifier.style.visibility='visible';magnifierKey=key;magnifierCommittedRegion=regionKey;status.hidden=true;
  }
  return Boolean(handled);
}

function analysisRequest(revision,serial,time){return {
  isCurrent:()=>ready&&s.histogram&&!document.hidden&&revision===frameRevision,
  onPixels:pixels=>{drawHistogram(pixels);$('histogram-view').dataset.frame=String(revision);$('histogram-view').dataset.sourceFrame=String(serial);$('histogram-view').dataset.sourceTime=String(time);},
};}
function renderAids(now,insideFrame=false){
  if(!renderer.framePacer.available){magnify(now,false);return;}
  if(!insideFrame)renderer.diagnostics.begin('aids',frameRevision);
  let work=false;
  try{
    if(histogramRequested&&!dirty&&displayedFrame&&s.histogram){
      renderer.diagnostics.measure('histogram',()=>renderer.analyseCurrent(analysisRequest(frameRevision,displayedSerial,displayedFrame.time)));
      histogramRequested=false;work=true;
    }
    work=magnify(now)||work;
  }finally{
    if(!insideFrame){if(work)renderer.framePacer.submit();renderer.diagnostics.end();}
  }
}

function drawHistogram(pixels){
  const bins=histogram(pixels),ctx=$('histogram-view').getContext('2d'),max=Math.max(...bins,1);
  ctx.clearRect(0,0,180,76);ctx.fillStyle='#e8eaed';
  for(let i=0;i<64;i++){const h=Math.sqrt(bins[i]/max)*68;ctx.fillRect(i*180/64,76-h,2,h);}
}
function updateFocus(){
  if(!track){$('focus-mark').hidden=true;return;}
  const projection=renderer.projectTrack(track,clock);
  const visible=projection.z>0&&projection.x>=0&&projection.x<=1&&projection.y>=0&&projection.y<=1;
  if(visible){point={x:projection.x,y:projection.y};if(s.af==='AF-C')s.focus=clamp(projection.z,.2,50);}
  $('focus-mark').hidden=!visible;
  $('focus-mark').style.left=`${point.x*100}%`;$('focus-mark').style.top=`${(1-point.y)*100}%`;
}
function animate(now){
  requestAnimationFrame(animate);
  const elapsed=Math.min(.1,(now-lastClock)/1000);lastClock=now;
  if(document.hidden||!ready||capturing)return;
  const moving=s.motion&&!s.pause;
  if(moving)clock+=elapsed;
  if((!dirty&&!moving)||now-lastFrame<1000/30){renderAids(now);return;}
  if(!renderer.framePacer.available){magnify(now,false);return;}
  lastFrame=now;
  renderer.diagnostics.begin('preview',frameRevision);
  try{
  const analyse=dirty||now-lastAnalysis>300;
  resolveCurrentFrame(analyse);
  if(analyse)lastAnalysis=now;
  renderAids(now,true);dirty=false;
  canvas.dataset.submittedFrame=String(frameRevision);canvas.dataset.submittedSerial=String(displayedSerial);
  canvas.dataset.triangles=renderer.frameStats.triangles;canvas.dataset.drawCalls=renderer.frameStats.calls;
  if(s.motion){const ball=renderer.ballPosition(clock);canvas.dataset.ballX=ball.x;canvas.dataset.ballY=ball.y;}
  }finally{
    const revision=frameRevision,serial=displayedSerial;
    renderer.framePacer.submit(()=>{
      canvas.dataset.completedFrame=String(revision);canvas.dataset.completedSerial=String(serial);
      if(revision===frameRevision&&ready&&!dirty){canvas.dataset.frame=String(revision);canvas.dataset.ready='true';}
    });
    renderer.diagnostics.end();
  }
}
function resolveCurrentFrame(analyse=true){
  renderer.geometry(s);updateFocus();
  if(meterDirty||(s.motion&&analyse)){
    const p=renderer.diagnostics.measure('meter',()=>renderer.readPlate(s,resolved,clock));
    const luminance=meterLinearPixels(p,renderer.analysisWidth,renderer.analysisHeight,s.metering,point);
    meterEV=scene.baseEV+renderer.exposureOffset+Math.log2(luminance/.18);meterDirty=false;
    canvas.dataset.meterEv=meterEV.toFixed(5);
  }
  resolved=resolveExposure(s,meterEV);resolved.ev=ev100(resolved.aperture,resolved.shutter,resolved.iso);
  const analysis=analyse&&s.histogram?analysisRequest(frameRevision,displayedSerial+1,clock):false;
  renderer.diagnostics.measure('photograph',()=>renderer.draw(s,resolved,clock,analysis));
  displayedFrame={settings:{...s},exposure:{...resolved},time:clock};displayedSerial++;
  if(analysis)histogramRequested=false;
  // Async aid completion updates only its own canvas, never dirty/meterDirty.
  if(analyse)sync();
}
$('capture').addEventListener('click',async()=>{
  if(!ready||capturing)return;
  const version=loadVersion,viewVersion=positionVersion;let workStarted=false;
  capturing=true;$('capture').disabled=true;
  try{
  // Controls remain live while layers load. A newer photographic revision
  // must reprepare its OWN focal/flash requirements before it may export.
  for(;;){
    const revision=frameRevision;
    await renderer.prepareCapture?.({...s},captureSize(canvas.width/canvas.height)[0]);
    if(!(await renderer.framePacer.wait(()=>!document.hidden&&ready&&version===loadVersion&&viewVersion===positionVersion)))return;
    if(revision===frameRevision)break;
  }
  workStarted=true;resolveCurrentFrame();
  // Export the photographic frame, independently of on-screen guidance overlays.
  const zebra=s.zebra;
  const size=[canvas.width,canvas.height],aspect=size[0]/size[1];
  try{
  s.zebra=false;
  // Export a fresh full-resolution photographic frame, even on a narrow phone.
  renderer.resize(...captureSize(aspect));renderer.draw(s,resolved,clock);
  canvas.toBlob(blob=>{if(!blob)return;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`camera-${scene.id}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);},'image/png');
  }finally{s.zebra=zebra;renderer.resize(...size);}
  }catch(error){$('hint').textContent=`保存失败：${error.message}`;canvas.dataset.captureError=error.message;
  }finally{
    try{if(workStarted){invalidate(false);renderer.framePacer.submit();}}
    finally{capturing=false;if(ready)$('capture').disabled=false;}
  }
});
if(renderer?.diagnostics.enabled)window.__cameraDiagnostics={snapshot:()=>renderer.diagnostics.snapshot()};
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){renderer?.analysisReadback.invalidate();renderer?.detailPass?.readback.invalidate();magnifierKey=null;}
  else if(s.histogram)invalidate(false);
});
window.addEventListener('pagehide',()=>renderer?.framePacer.dispose());
window.addEventListener('pageshow',event=>{if(event.persisted){renderer?.framePacer.reset();invalidate();}});
sync();resize();loadScene(scene.id);requestAnimationFrame(animate);
