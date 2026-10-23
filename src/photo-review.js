import './photo-review.css';
import {exportPhoto} from './photo-export.js';
import {planPhotoAddition} from './photo-collection.js';

const text=(tag,value,className)=>{const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
const shutter=value=>value>=1?`${Number(value.toFixed(2))} s`:`1/${Math.round(1/value)} s`;
const number=value=>Number.isFinite(value)?Number(value.toFixed(2)):'—';

/** Session-only lossless originals. Object URLs are owned here, never by a shot. */
export function installPhotoReview({button,onError=()=>{}}){
  let shots=[],active=null,compared=new Set(),returnFocus=null,exporting=false,exportShot=null,disposed=false,actualSize=false;
  const dialog=document.createElement('dialog');dialog.id='photo-review';dialog.className='photo-review';dialog.setAttribute('aria-labelledby','photo-review-title');
  dialog.innerHTML=`<div class="photo-review-heading"><h2 id="photo-review-title">照片回看</h2><button id="close-review" type="button" autofocus>返回拍摄</button></div>
    <p class="photo-review-note">仅保留本页最近 8 张（最多 64 MB）；刷新后清空。请下载需要保留的照片。</p>
    <div class="review-image-tools"><button id="review-zoom" type="button" aria-pressed="false">放大到 100%</button><span id="review-zoom-hint">适合窗口 · 不裁切</span></div>
    <div id="review-images" class="review-images"></div>
    <div class="review-selection-heading"><span>最近拍摄 · 勾选两张对比</span><button id="clear-comparison" type="button" hidden>退出对比</button></div>
    <div id="review-shots" class="review-shots" aria-label="最近拍摄的照片"></div>
    <details id="export-settings"><summary>保存设置 <span id="export-summary">JPEG · 原尺寸 · 高画质</span></summary><div class="export-options">
      <label>格式 <select id="export-format"><option value="jpeg">JPEG（推荐）</option><option value="png">PNG（无损）</option></select></label>
      <label>尺寸 <select id="export-size"><option value="2048">原尺寸</option><option value="1024">长边 1024 px</option></select></label>
      <label id="export-quality-label">JPEG 画质 <select id="export-quality"><option value="0.92">高画质</option><option value="0.8">较小文件</option><option value="1">最高画质</option></select></label>
    </div><p>不会放大原片。尺寸表示输出像素，不代表新增场景细节。JPEG 写入标准 EXIF；PNG 参数能否显示取决于查看软件。</p></details>
    <div class="review-download-row"><span id="review-download-target"></span><button id="download-photo" type="button">下载照片</button></div>
    <p id="review-status" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector(`#${id}`);
  const current=()=>shots.find(shot=>shot.id===active);
  const report=message=>{$('review-status').textContent=message;};
  function settings(){return {format:$('export-format').value,longEdge:Number($('export-size').value),quality:Number($('export-quality').value)};}
  function refreshExport(){
    const shot=current();if(!shot)return;
    const original=Math.max(shot.width,shot.height),option=$('export-size').options[0];
    option.textContent=`原尺寸 ${shot.width} × ${shot.height}`;
    $('export-size').options[1].disabled=original<=1024;
    if(original<=1024)$('export-size').value='2048';
    const options=settings(),edge=Math.min(options.longEdge,original),scale=edge/original;
    const dimensions=`${Math.round(shot.width*scale)} × ${Math.round(shot.height*scale)}`;
    $('export-quality-label').hidden=options.format==='png';
    $('export-summary').textContent=`${options.format.toUpperCase()} · ${dimensions}${options.format==='jpeg'?` · ${$('export-quality').selectedOptions[0].textContent}`:''}`;
    $('review-download-target').textContent=`下载第 ${shot.sequence} 张 · ${dimensions}`;
  }
  function figure(shot){
    const figure=document.createElement('figure');figure.dataset.shotId=shot.id;
    const image=document.createElement('img');image.src=shot.url;image.alt=`第 ${shot.sequence} 张：${shot.snapshot.scene?.name||'模拟照片'}`;image.width=shot.width;image.height=shot.height;
    const viewport=document.createElement('div');viewport.className='review-image-viewport';viewport.classList.toggle('is-actual-size',actualSize);viewport.style.setProperty('--photo-width',`${shot.width}px`);viewport.tabIndex=0;viewport.setAttribute('aria-label',actualSize?'原尺寸照片，可滚动查看':'照片预览');viewport.append(image);figure.append(viewport);
    const {snapshot}=shot,exposure=snapshot.resolved,settings=snapshot.settings;
    const caption=document.createElement('figcaption');
    caption.append(text('strong',`第 ${shot.sequence} 张 · ${snapshot.scene?.name||'模拟照片'}`));
    caption.append(text('p',`f/${number(exposure.aperture)} · ${shutter(exposure.shutter)} · ISO ${exposure.iso} · ${number(settings.focal)} mm`,'shot-exposure'));
    caption.append(text('p',`白平衡 ${settings.wb} K · 对焦 ${number(settings.focus)} m · ${settings.mode} 模式${settings.autoISO?' / 自动 ISO':''}`));
    caption.append(text('p',`${new Date(snapshot.capturedAt).toLocaleString('zh-CN',{hour12:false})} · ${shot.width} × ${shot.height}`));
    const details=document.createElement('details');details.className='shot-record';details.append(text('summary','拍摄参数与来源'));
    const viewNames={center:'中心',left:'左移',right:'右移',up:'升高',down:'降低',front:'前移',back:'后退'};
    const meterNames={matrix:'多区测光',center:'中央重点测光',spot:'点测光'};
    const source=snapshot.source||{};
    const group=(heading,pairs)=>{
      details.append(text('h3',heading));const list=document.createElement('dl');
      for(const [label,value]of pairs){list.append(text('dt',label),text('dd',String(value)));}details.append(list);
    };
    group('拍摄设置',[
      ['曝光补偿',settings.mode==='M'&&!settings.autoISO?'未启用（手动曝光）':`${settings.compensation>=0?'+':''}${number(settings.compensation)} EV`],
      ['测光方式',meterNames[settings.metering]||settings.metering||'—'],
      ['对焦方式',settings.af||'—'],['模拟补光强度',number(settings.flash)],
      ['模拟感光元件',settings.sensor==='aps-c'?'APS-C':'全画幅'],['画幅',settings.crop==='native'?'原始画幅':settings.crop||'—'],
    ]);
    const position=source.viewId?(viewNames[source.viewId]||source.viewId):'自由机位';
    const dimensions=source.imageWidth&&source.imageHeight?`${source.imageWidth} × ${source.imageHeight} px`:source.kind==='photographic-plate'?'未提供':'不适用（实时三维渲染）';
    group('画面来源',[
      ['照片类型','CameraSimulator 模拟照片'],['场景',snapshot.scene?.name||'—'],
      ['机位',position],['位置偏移',`左右 ${number(settings.x)} m / 升降 ${number(settings.y)} m / 前后 ${number(settings.z)} m`],
      ['来源方式',source.kind==='photographic-plate'?'预渲染场景图':'实时三维场景'],['本次实际源图',dimensions],
      ['原片尺寸',`${shot.width} × ${shot.height} px`],['拍摄时间',new Date(snapshot.capturedAt).toLocaleString('zh-CN',{hour12:false})],
    ]);
    details.append(text('p','这些是模拟拍摄设置，不代表实体相机或传感器记录。完整参数随下载照片保存。'));
    caption.append(details);
    figure.append(caption);return figure;
  }
  function render(){
    const selected=shots.filter(shot=>compared.has(shot.id));
    const visible=selected.length===2?selected:[current()].filter(Boolean);
    if(visible.length===2)actualSize=false;
    $('review-zoom').disabled=visible.length===2;$('review-zoom').setAttribute('aria-pressed',String(actualSize));
    $('review-zoom').textContent=actualSize?'适合窗口':'放大到 100%';
    $('review-zoom-hint').textContent=visible.length===2?'对比时适合窗口':actualSize?'100% 原片像素 · 滚动或滑动查看':'适合窗口 · 不裁切';
    $('review-images').classList.toggle('is-comparing',visible.length===2);
    $('review-images').replaceChildren(...visible.map(figure));
    $('clear-comparison').hidden=compared.size===0;
    const nodes=shots.map(shot=>{
      const tile=document.createElement('div');tile.className='review-shot';tile.dataset.shotId=shot.id;
      const select=document.createElement('button');select.type='button';select.className='review-shot-select';select.setAttribute('aria-pressed',String(active===shot.id));select.setAttribute('aria-label',`查看第 ${shot.sequence} 张`);
      select.append(text('strong',`第 ${shot.sequence} 张`),text('span',`f/${number(shot.snapshot.resolved.aperture)} · ISO ${shot.snapshot.resolved.iso}`),text('span',shutter(shot.snapshot.resolved.shutter)));
      select.addEventListener('click',()=>{active=shot.id;actualSize=false;if(compared.size===2&&!compared.has(shot.id))compared.clear();report('');render();$('review-shots').querySelector(`[data-shot-id="${CSS.escape(String(shot.id))}"] button`).focus();});
      const label=text('label','对比');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=compared.has(shot.id);checkbox.setAttribute('aria-label',`对比第 ${shot.sequence} 张`);checkbox.disabled=compared.size===2&&!checkbox.checked;
      checkbox.addEventListener('change',()=>{checkbox.checked?compared.add(shot.id):compared.delete(shot.id);if(checkbox.checked)active=shot.id;render();$('review-shots').querySelector(`[data-shot-id="${CSS.escape(String(shot.id))}"] input`).focus();report(compared.size===1?'再勾选一张即可对比。':compared.size===2?'正在对比两张照片。下载按钮保存标明的单张照片。':'');});
      label.prepend(checkbox);tile.append(select,label);return tile;
    });
    $('review-shots').replaceChildren(...nodes);refreshExport();
  }
  function open(){if(!shots.length||disposed)return;returnFocus=document.activeElement;report('');render();dialog.showModal();}
  button.addEventListener('click',open);button.disabled=true;button.textContent='回看 (0)';
  $('review-zoom').addEventListener('click',()=>{actualSize=!actualSize;render();$('review-zoom').focus();});
  $('close-review').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{actualSize=false;$('review-images').replaceChildren();$('review-shots').replaceChildren();if(returnFocus?.isConnected)returnFocus.focus();else button.focus();});
  $('clear-comparison').addEventListener('click',()=>{compared.clear();render();$('review-shots').querySelector('button')?.focus();report('');});
  for(const id of ['export-format','export-size','export-quality'])$(id).addEventListener('change',refreshExport);
  $('download-photo').addEventListener('click',async()=>{
    if(exporting||!current())return;
    const shot=current(),options=settings();exporting=true;exportShot=shot.id;$('download-photo').disabled=true;report('正在生成照片…');
    try{
      const blob=await exportPhoto(shot,options);if(disposed)return;
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;
      const scene=String(shot.snapshot.scene?.id||'photo').replace(/[^a-zA-Z0-9_-]/g,'-');
      link.download=`camera-${scene}-${shot.sequence}.${options.format==='jpeg'?'jpg':'png'}`;document.body.append(link);link.click();link.remove();
      // Allow the browser to start the download before releasing its temporary URL.
      setTimeout(()=>URL.revokeObjectURL(url),60000);report('已生成下载文件，拍摄参数来自这张照片。');
    }catch(error){report(`下载失败：${error.message}`);onError(error);}
    finally{exporting=false;exportShot=null;$('download-photo').disabled=false;}
  });
  let sequence=0;
  return {
    add(shot){
      if(disposed)throw new Error('照片回看已关闭');
      // Do not discard an original while it is displayed, compared, or exporting.
      const protectedIds=new Set([exportShot,...(dialog.open?[active,...compared]:[])]);
      const {kept,removed}=planPhotoAddition(shots,shot,{protectedIds});
      const record={...shot,sequence:++sequence,url:URL.createObjectURL(shot.blob)};
      for(const item of removed){compared.delete(item.id);URL.revokeObjectURL(item.url);}
      shots=[...kept,record];
      if(!dialog.open)active=record.id;
      button.disabled=false;button.textContent=`回看 (${shots.length})`;button.dataset.count=String(shots.length);
      if(dialog.open){render();report(removed.length?'已拍摄新照片；较早的未查看照片已从临时列表移除。':'已拍摄新照片，可在下方选择查看。');}
      return record;
    },
    dispose(){disposed=true;button.removeEventListener('click',open);for(const shot of shots)URL.revokeObjectURL(shot.url);shots=[];dialog.remove();},
  };
}
