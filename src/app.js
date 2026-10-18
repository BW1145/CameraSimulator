import './style.css';
import {APERTURES,SHUTTERS,ISOS,DEFAULTS,clamp,ev100,resolveExposure,formatShutter,meterLinearPixels,histogram} from './camera.js';
import {SCENES} from './scenes.js';
import {Renderer} from './renderer.js';
import {PlateRenderer} from './plate-renderer.js';
import {previewSize,captureSize} from './render-size.js';

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
let dirty=true,meterDirty=true,ready=false,lastFrame=0,lastAnalysis=0,clock=0,lastClock=performance.now(),track=null,point={x:.5,y:.5},loadVersion=0;
let pointer=null,hover=null;
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
  const version=++positionVersion;ready=false;canvas.dataset.ready='false';loading.hidden=false;loading.textContent='正在加载选定的拍摄机位…';$('capture').disabled=true;
  try{
    await renderer.setPosition(s);if(version!==positionVersion)return;
    track=null;ready=true;loading.hidden=true;$('capture').disabled=false;invalidate();
  }catch(error){
    if(version!==positionVersion)return;loading.textContent=`机位加载失败：${error.message} `;
    const retry=document.createElement('button');retry.textContent='重新加载';retry.onclick=changePosition;loading.append(retry);
  }
}
for(const item of SCENES)$('scene').add(new Option(item.name,item.id));

function invalidate(geometry=true){dirty=true;if(geometry)meterDirty=true;}
if(renderer)renderer.onTextureUpdate=()=>invalidate();
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
  renderer?.resize(...previewSize(view.clientWidth,aspect,window.devicePixelRatio));invalidate();
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
for(const [id,key]of Object.entries(checks))$(id).addEventListener('change',()=>{s[key]=$(id).checked;if(key==='motion')track=null;invalidate(key==='motion');sync();});
$('reset').addEventListener('click',()=>{
  s={...DEFAULTS,focus:scene.focus,focal:scene.focal};
  if(renderer.plateMode)s={...s,crop:'native',focal:renderer.pack.referenceFocal,aperture:8,shutter:1/4,iso:100,autoISO:false};
  resolved=resolveExposure(s,meterEV);track=null;clock=0;resize();sync();changePosition();
});
$('reset-view').addEventListener('click',resetView);
new ResizeObserver(resize).observe(view);

async function loadScene(id){
  if(!renderer)return;
  ++positionVersion;
  const version=++loadVersion;ready=false;canvas.dataset.ready='false';loading.hidden=false;loading.textContent='正在加载完整场景…';$('capture').disabled=true;
  const next=SCENES.find(item=>item.id===id);
  try{
    const loaded=await renderer.load(next,(bytes,total)=>{if(version===loadVersion)loading.textContent=total?`正在加载${next.name} ${Math.round(bytes/total*100)}%`:`正在加载${next.name} ${(bytes/1048576).toFixed(1)} MB`;});
    if(!loaded||version!==loadVersion)return;
    scene=next;s.focus=scene.focus;s.focal=renderer.plateMode?renderer.pack.referenceFocal:sourceView&&scene.id==='barbershop'?18.8027323:scene.focal;clock=0;resetView();resize();ready=true;loading.hidden=true;$('capture').disabled=false;
    for(const key of ['x','y','z','yaw','pitch','roll']){
      const bounds=renderer.plateMode?{min:renderer.pack.bounds[key][0],max:renderer.pack.bounds[key][1],step:key==='y'?.2:['x','z'].includes(key)?.3:1}:originalBounds[key];
      if(renderer.plateMode){const axis=['x','y','z'].indexOf(key);if(axis>=0){const values=renderer.pack.views.map(v=>v.offset[axis]*(key==='z'?-1:1));bounds.min=Math.min(...values);bounds.max=Math.max(...values);bounds.step=Math.min(...values.filter(v=>v!==0).map(Math.abs));}}
      Object.assign($(key),bounds);
    }
    $('focal').min=renderer.plateMode?Math.max(18,Math.ceil(renderer.pack.referenceFocal/1.199)):18;
    if(renderer.plateMode){for(const v of renderer.pack.views){const distance=Math.round(Math.hypot(...v.offset)*100),label=positionLabels[v.id].split(' ')[0];positionLabels[v.id]=distance?`${label} ${distance} cm`:label;document.querySelector(`button[data-position=${v.id}]`).setAttribute('aria-label',positionLabels[v.id]);}}
    $('flash').disabled=renderer.plateMode&&!renderer.pack.flash;$('flash').title=renderer.plateMode&&!renderer.pack.flash?'预渲染闪光照明层尚未生成':'';if(renderer.plateMode&&!renderer.pack.flash)s.flash=0;
    $('flash-control').hidden=renderer.plateMode&&!renderer.pack.flash;$('legacy-view').hidden=renderer.plateMode;$('position-controls').hidden=!renderer.plateMode;
    $('subject-controls').hidden=!renderer.fan;
    (renderer.fan?$('subject-controls'):$('assist-tools').querySelector('.tool-content')).append($('motion-controls'));
    $('hint').textContent=renderer.plateMode?'点击对焦 · 拖动取景':'点击对焦 · 拖动转向 · WASD 移动';
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
  }else magnify();
});
canvas.addEventListener('pointerup',e=>{const box=canvas.getBoundingClientRect();if(pointer&&!pointer.dragged)focusAt((e.clientX-box.left)/box.width,1-(e.clientY-box.top)/box.height);pointer=null;});
canvas.addEventListener('pointercancel',()=>{pointer=null;});
canvas.addEventListener('pointerleave',()=>{hover=null;$('magnifier').hidden=true;});
canvas.addEventListener('keydown',e=>{
  const movements={w:['z',.15],s:['z',-.15],a:['x',-.15],d:['x',.15],q:['y',-.15],e:['y',.15],ArrowLeft:['yaw',3],ArrowRight:['yaw',-3],ArrowUp:['pitch',3],ArrowDown:['pitch',-3]};
  const move=movements[e.key];if(!move)return;e.preventDefault();const [key,amount]=move,input=$(key);s[key]=clamp(s[key]+(renderer.plateMode&&['x','y','z'].includes(key)?Math.sign(amount)*Number(input.step):amount),Number(input.min),Number(input.max));renderer.constrain?.(s,key);invalidate();sync();if(['x','y','z'].includes(key))changePosition();
});
function magnify(){
  const magnifier=$('magnifier');magnifier.hidden=!hover||!s.magnifier||pointer?.dragged||!ready;
  if(magnifier.hidden)return;
  const ctx=magnifier.getContext('2d'),box=view.getBoundingClientRect();
  const x=clamp(hover.x*canvas.width-40,0,canvas.width-80),y=clamp(hover.y*canvas.height-30,0,canvas.height-60);
  ctx.drawImage(canvas,x,y,80,60,0,0,200,150);
  magnifier.style.left=`${clamp(hover.x*box.width-210,0,Math.max(0,box.width-202))}px`;
  magnifier.style.top=`${clamp(hover.y*box.height-160,0,Math.max(0,box.height-152))}px`;
}
function drawHistogram(pixels){
  const bins=histogram(pixels),ctx=$('histogram-view').getContext('2d'),max=Math.max(...bins,1);
  ctx.clearRect(0,0,180,76);ctx.fillStyle='#e8eaed';
  for(let i=0;i<64;i++){const h=Math.sqrt(bins[i]/max)*68;ctx.fillRect(i*180/64,76-h,2,h);}
}
function updateFocus(){
  if(!track){$('focus-mark').hidden=true;return;}
  const projection=track.ball?renderer.ballPosition(clock):renderer.project(track.object?track.object.localToWorld(track.localPoint.clone()):track.point);
  const visible=projection.z>0&&projection.x>=0&&projection.x<=1&&projection.y>=0&&projection.y<=1;
  if(visible){point={x:projection.x,y:projection.y};if(s.af==='AF-C')s.focus=clamp(projection.z,.2,50);}
  $('focus-mark').hidden=!visible;
  $('focus-mark').style.left=`${point.x*100}%`;$('focus-mark').style.top=`${(1-point.y)*100}%`;
}
function animate(now){
  requestAnimationFrame(animate);
  const elapsed=Math.min(.1,(now-lastClock)/1000);lastClock=now;
  if(document.hidden||!ready)return;
  const moving=s.motion&&!s.pause;
  if(moving)clock+=elapsed;
  if((!dirty&&!moving)||now-lastFrame<1000/30)return;
  lastFrame=now;
  const analyse=dirty||now-lastAnalysis>300;
  resolveCurrentFrame(analyse);
  if(analyse)lastAnalysis=now;
  magnify();dirty=false;canvas.dataset.ready='true';
  canvas.dataset.triangles=renderer.frameStats.triangles;canvas.dataset.drawCalls=renderer.frameStats.calls;
  if(s.motion){const ball=renderer.ballPosition(clock);canvas.dataset.ballX=ball.x;canvas.dataset.ballY=ball.y;}
}
function resolveCurrentFrame(analyse=true){
  renderer.geometry(s);updateFocus();
  if(meterDirty||(s.motion&&analyse)){
    const p=renderer.readPlate(s,resolved,clock);
    const luminance=meterLinearPixels(p,renderer.analysisWidth,renderer.analysisHeight,s.metering,point);
    meterEV=scene.baseEV+renderer.exposureOffset+Math.log2(luminance/.18);meterDirty=false;
  }
  resolved=resolveExposure(s,meterEV);resolved.ev=ev100(resolved.aperture,resolved.shutter,resolved.iso);
  const p=renderer.draw(s,resolved,clock,analyse);
  if(analyse){if(s.histogram)drawHistogram(p);sync();}
}
$('capture').addEventListener('click',async()=>{
  if(!ready)return;
  const version=loadVersion;const aspectForCapture=canvas.width/canvas.height;
  $('capture').disabled=true;await renderer.prepareCapture?.(s,captureSize(aspectForCapture)[0]);
  if(version!==loadVersion)return;$('capture').disabled=false;
  resolveCurrentFrame();
  // Export the photographic frame, independently of on-screen guidance overlays.
  const zebra=s.zebra;s.zebra=false;
  const size=[canvas.width,canvas.height],aspect=size[0]/size[1];
  // Export a fresh full-resolution photographic frame, even on a narrow phone.
  renderer.resize(...captureSize(aspect));renderer.draw(s,resolved,clock);s.zebra=zebra;
  canvas.toBlob(blob=>{if(!blob)return;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`camera-${scene.id}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);},'image/png');
  renderer.resize(...size);
  invalidate(false);
});
sync();resize();loadScene(scene.id);requestAnimationFrame(animate);
