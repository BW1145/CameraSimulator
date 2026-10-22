// Preserve exception and native-fence evidence even if an earlier wait fails.
// Observational only: no changed return values, delays or relaxed assertions.
export function installRuntimeDiagnostics(test){
  const states=new WeakMap();
  test.beforeEach(async({page})=>{
    const errors=[];states.set(page,errors);
    page.on('pageerror',error=>errors.push({kind:'pageerror',message:error.message,stack:error.stack}));
    page.on('console',message=>{if(message.type()==='error')errors.push({kind:'console',message:message.text()});});
    await page.addInitScript(()=>{
      const events=window.__cameraRuntimeEvents=[],ids=new WeakMap(),statuses=new WeakMap(),pbo=new WeakSet();let serial=0;
      const log=(kind,data={})=>{if(events.length<1000)events.push({kind,at:performance.now(),...data});};
      const read=WebGL2RenderingContext.prototype.readPixels,fence=WebGL2RenderingContext.prototype.fenceSync,wait=WebGL2RenderingContext.prototype.clientWaitSync,copy=WebGL2RenderingContext.prototype.getBufferSubData;
      WebGL2RenderingContext.prototype.readPixels=function(...args){const start=performance.now(),async=typeof args[6]==='number';if(async)pbo.add(this);try{return read.apply(this,args);}finally{log('readPixels',{async,width:args[2],height:args[3],cpuMs:performance.now()-start});}};
      WebGL2RenderingContext.prototype.fenceSync=function(...args){const sync=fence.apply(this,args);if(sync){ids.set(sync,++serial);log('fence',{id:serial,readback:pbo.has(this)});pbo.delete(this);}else log('fence-null');return sync;};
      WebGL2RenderingContext.prototype.clientWaitSync=function(...args){const result=wait.apply(this,args);if(statuses.get(args[0])!==result){statuses.set(args[0],result);log('wait',{id:ids.get(args[0]),status:result});}return result;};
      WebGL2RenderingContext.prototype.getBufferSubData=function(...args){const start=performance.now();try{return copy.apply(this,args);}finally{log('buffer-copy',{bytes:args[2]?.byteLength,cpuMs:performance.now()-start});}};
      document.addEventListener('DOMContentLoaded',()=>{
        const image=document.getElementById('image');
        for(const kind of ['pointerenter','pointerleave','webglcontextlost','webglcontextrestored'])image?.addEventListener(kind,event=>log(kind,{x:event.clientX,y:event.clientY}));
      });
    });
  });
  test.afterEach(async({page},info)=>{
    let snapshot;
    try{snapshot=await page.evaluate(()=>({events:window.__cameraRuntimeEvents,magnifier:document.getElementById('magnifier')?{dataset:{...document.getElementById('magnifier').dataset},hidden:document.getElementById('magnifier').hidden,visibility:getComputedStyle(document.getElementById('magnifier')).visibility}:null,image:{...document.getElementById('image')?.dataset}}));}catch(error){snapshot={captureError:String(error)};}
    await info.attach('runtime-and-fence-evidence.json',{body:JSON.stringify({errors:states.get(page),...snapshot},null,2),contentType:'application/json'});
  });
}
