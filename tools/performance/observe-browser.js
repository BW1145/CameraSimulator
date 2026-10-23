/* Injected identically before baseline and candidate startup; not shipped in app. */
(()=>{
  const evidence=window.__reusePerformance={schema:3,label:'first-scene',frames:[],reads:[],longTasks:[],commits:[],completions:[],marks:[],gpu:{available:false,reason:'WebGL2 context not created'}};
  const push=(key,value)=>{if(evidence[key].length<10000)evidence[key].push(value);};
  let current=null,context=null,extension=null,pending=null,gpuBusy=false,serial=0,drawFramebuffer=null;
  const submissions=new WeakMap();
  const clock=()=>performance.now();
  let hoverIntent=null;
  document.addEventListener('pointermove',event=>{
    const image=document.getElementById('image');if(event.target!==image)return;
    const box=image.getBoundingClientRect();hoverIntent={x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height,at:clock()};
  },true);
  const get=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){
    const gl=get.call(this,type,...args);
    if(this.id==='image'&&type==='webgl2'&&gl&&!context){
      context=gl;extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const debug=gl.getExtension('WEBGL_debug_renderer_info');
      evidence.gpu={available:!!extension,reason:extension?null:'EXT_disjoint_timer_query_webgl2 unavailable',vendor:gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL??gl.VENDOR),renderer:gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),version:gl.getParameter(gl.VERSION)};
    }
    return gl;
  };
  const bind=WebGL2RenderingContext.prototype.bindFramebuffer;
  WebGL2RenderingContext.prototype.bindFramebuffer=function(target,buffer){
    if(this===context&&(target===this.FRAMEBUFFER||target===this.DRAW_FRAMEBUFFER))drawFramebuffer=buffer;
    return bind.call(this,target,buffer);
  };
  for(const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
    const original=WebGL2RenderingContext.prototype[method];
    WebGL2RenderingContext.prototype[method]=function(...args){if(current&&this===context){current.drawCalls++;if(drawFramebuffer===null)current.photo=true;}return original.apply(this,args);};
  }
  for(const method of ['readPixels','getBufferSubData']){
    const original=WebGL2RenderingContext.prototype[method];
    WebGL2RenderingContext.prototype[method]=function(...args){
      const start=clock();try{return original.apply(this,args);}finally{
        if(this===context){
          const cpuMs=clock()-start,buffer=this.getParameter(this.PIXEL_PACK_BUFFER_BINDING),submission=buffer&&submissions.get(buffer);
          if(method==='readPixels'&&typeof args[6]==='number'&&buffer)submissions.set(buffer,{label:evidence.label,frame:current?.serial??null,start});
          const row={label:method==='getBufferSubData'?submission?.label??evidence.label:evidence.label,completionLabel:evidence.label,frame:method==='getBufferSubData'?submission?.frame??null:current?.serial??null,method,start,cpuMs,mode:method==='getBufferSubData'?'async-buffer-copy':typeof args[6]==='number'?'pixel-pack-buffer':'synchronous-array'};
          push('reads',row);if(current){current.readCalls++;current.readCpuMs+=row.cpuMs;}
        }
      }
    };
  }
  function poll(){
    if(!pending)return;
    const {gl,query,frame}=pending;
    try{
      if(gl.isContextLost()){frame.gpuUnavailable='context lost';gl.deleteQuery(query);pending=null;return;}
      if(gl.getParameter(extension.GPU_DISJOINT_EXT)){frame.gpuUnavailable='GPU disjoint';gl.deleteQuery(query);pending=null;return;}
      if(gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){
        frame.gpuMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(query);pending=null;return;
      }
      setTimeout(poll,10);
    }catch(error){frame.gpuUnavailable=String(error);pending=null;}
  }
  function completion(gl,sync,frame){
    if(!sync){frame.completionUnavailable='fence creation failed';return;}
    const poll=()=>{
      if(gl.isContextLost()){frame.completionUnavailable='context lost';gl.deleteSync(sync);return;}
      const status=gl.clientWaitSync(sync,0,0);
      if(status===gl.TIMEOUT_EXPIRED){setTimeout(poll,8);return;}
      gl.deleteSync(sync);
      if(status===gl.WAIT_FAILED){frame.completionUnavailable='fence wait failed';return;}
      const at=clock();frame.completedAt=at;frame.submissionToCompletionMs=at-frame.start;
      push('completions',{frame:frame.serial,revision:frame.revision,photo:frame.photo,at});
    };
    setTimeout(poll,0);
  }
  const raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>raf(now=>{
    const parent=current,frame={serial:++serial,label:evidence.label,start:clock(),rafTimestamp:now,revision:document.getElementById('image')?.dataset.requestedFrame,photo:false,drawCalls:0,readCalls:0,readCpuMs:0,gpuMs:null};
    let query=null;
    if(context&&extension&&!pending&&!gpuBusy&&!context.isContextLost()){
      try{query=context.createQuery();context.beginQuery(extension.TIME_ELAPSED_EXT,query);gpuBusy=true;}catch(error){frame.gpuUnavailable=String(error);query=null;}
    }
    current=frame;
    try{return callback(now);}finally{
      frame.cpuMs=clock()-frame.start;current=parent;
      if(query){context.endQuery(extension.TIME_ELAPSED_EXT);gpuBusy=false;pending={gl:context,query,frame};setTimeout(poll,0);}
      if(frame.drawCalls){
        push('frames',frame);
        // Identical offline observation on BOTH builds. This establishes real
        // command completion without gl.finish, blocking waits or pixel copies.
        const sync=context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE,0);context.flush();completion(context,sync,frame);
      }
    }
  });
  const put=CanvasRenderingContext2D.prototype.putImageData,clear=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.putImageData=function(...args){
    const result=put.apply(this,args);
    if(this.canvas.id==='magnifier'){
      const canvas=this.canvas,image=document.getElementById('image');
      // These are sampled AT THE WRITE, never substituted with a subsequently
      // promoted resource width. The synchronous baseline has no snapshot attrs.
      const sourceAtWrite={width:Number(image?.dataset.detailWidth)||null,depthWidth:Number(image?.dataset.detailDepthWidth)||null,pendingLayers:Number(image?.dataset.pendingLayers)||0,scene:image?.dataset.scene??null,position:image?.dataset.position??null,requestedFrame:image?.dataset.requestedFrame??null};
      const controlsAtWrite=Object.fromEntries([...document.querySelectorAll('input[id],select[id]')].map(e=>[e.id,e.type==='checkbox'?e.checked:e.value]));
      const row={kind:'magnifier',label:evidence.label,at:clock(),width:canvas.width,height:canvas.height,frame:image?.dataset.frame,sourceAtWrite,controlsAtWrite,hoverIntent:hoverIntent?{...hoverIntent}:null};push('commits',row);
      // onCommit annotates the exact rendered snapshot just after putImageData.
      // Hydrate after that callback but retain the native pixel-write timestamp.
      queueMicrotask(()=>{
        row.sourceFrame=canvas.dataset.sourceFrame??null;row.sourceTime=canvas.dataset.sourceTime??(controlsAtWrite.motion?null:'0');
        row.sourceWidth=Number(canvas.dataset.sourceWidth)||sourceAtWrite.width;row.sourceDepthWidth=Number(canvas.dataset.sourceDepthWidth)||sourceAtWrite.depthWidth;
        row.state=canvas.dataset.state??null;row.quality=canvas.dataset.quality??null;
        row.metadataOrigin=canvas.dataset.sourceWidth?'committed-snapshot':'synchronous-resource-at-write';
      });
    }
    return result;
  };
  CanvasRenderingContext2D.prototype.clearRect=function(...args){
    const result=clear.apply(this,args);
    if(this.canvas.id==='histogram-view'){
      const canvas=this.canvas,row={kind:'histogram',label:evidence.label,at:clock(),frame:document.getElementById('image')?.dataset.frame};push('commits',row);
      queueMicrotask(()=>{row.sourceFrame=canvas.dataset.sourceFrame??null;row.sourceTime=canvas.dataset.sourceTime??null;});
    }
    return result;
  };
  try{new PerformanceObserver(list=>{for(const entry of list.getEntries())push('longTasks',{label:[...evidence.marks].reverse().find(m=>m.at<=entry.startTime)?.label??'first-scene',start:entry.startTime,duration:entry.duration});}).observe({type:'longtask',buffered:true});}catch(error){evidence.longTaskUnavailable=String(error);}
  evidence.mark=label=>{evidence.label=label;const mark={label,at:clock(),frame:document.getElementById('image')?.dataset.frame};push('marks',mark);return mark;};
})();
