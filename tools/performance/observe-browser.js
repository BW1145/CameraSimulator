/* Injected identically before baseline and candidate startup; not shipped in app. */
(()=>{
  const evidence=window.__reusePerformance={schema:1,label:'first-scene',frames:[],reads:[],longTasks:[],commits:[],marks:[],gpu:{available:false,reason:'WebGL2 context not created'}};
  const push=(key,value)=>{if(evidence[key].length<10000)evidence[key].push(value);};
  let current=null,context=null,extension=null,pending=null,gpuBusy=false,serial=0;
  const submissions=new WeakMap();
  const clock=()=>performance.now();
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
  for(const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
    const original=WebGL2RenderingContext.prototype[method];
    WebGL2RenderingContext.prototype[method]=function(...args){if(current&&this===context)current.drawCalls++;return original.apply(this,args);};
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
  const raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>raf(now=>{
    const parent=current,frame={serial:++serial,label:evidence.label,start:clock(),rafTimestamp:now,drawCalls:0,readCalls:0,readCpuMs:0,gpuMs:null};
    let query=null;
    if(context&&extension&&!pending&&!gpuBusy&&!context.isContextLost()){
      try{query=context.createQuery();context.beginQuery(extension.TIME_ELAPSED_EXT,query);gpuBusy=true;}catch(error){frame.gpuUnavailable=String(error);query=null;}
    }
    current=frame;
    try{return callback(now);}finally{
      frame.cpuMs=clock()-frame.start;current=parent;
      if(query){context.endQuery(extension.TIME_ELAPSED_EXT);gpuBusy=false;pending={gl:context,query,frame};setTimeout(poll,0);}
      if(frame.drawCalls)push('frames',frame);
    }
  });
  const put=CanvasRenderingContext2D.prototype.putImageData,clear=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.putImageData=function(...args){
    const result=put.apply(this,args);
    if(this.canvas.id==='magnifier'){
      const canvas=this.canvas,row={kind:'magnifier',label:evidence.label,at:clock(),width:canvas.width,height:canvas.height,frame:document.getElementById('image')?.dataset.frame};push('commits',row);
      // The app annotates the committed snapshot just after writing pixels.
      // Preserve actual write time, but do not mislabel it with the old attrs.
      queueMicrotask(()=>{row.sourceFrame=canvas.dataset.sourceFrame??null;row.sourceTime=canvas.dataset.sourceTime??null;});
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
