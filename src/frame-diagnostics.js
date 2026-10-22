// Opt-in CPU submission timings, not GPU completion times or device FPS.
// The external Playwright benchmark supplies comparable whole-RAF, long-task,
// readback and hardware timer-query evidence for baseline AND candidate.
export class FrameDiagnostics {
  constructor(renderer,enabled=false){
    this.enabled=enabled;this.frames=[];this.current=null;this.sequence=0;this.counts={};
    if(!enabled)return;
    const render=renderer.render.bind(renderer);
    renderer.render=(...args)=>{
      const result=render(...args),frame=this.current;
      // Count API pass invocations only. renderer.info counters can reset in a
      // nested Reflector render and cannot be added into a reliable draw total.
      // The external harness counts actual native WebGL draw calls instead.
      if(frame)frame.passes++;
      return result;
    };
  }
  begin(kind,revision){
    if(!this.enabled)return;
    this.counts[kind]=(this.counts[kind]||0)+1;
    this.current={id:++this.sequence,kind,revision,started:performance.now(),stages:{},passes:0};
  }
  measure(name,run){
    if(!this.enabled||!this.current)return run();
    const frame=this.current,start=performance.now();
    try{return run();}finally{frame.stages[name]=(frame.stages[name]||0)+performance.now()-start;}
  }
  end(){
    if(!this.current)return;
    this.current.cpuSubmissionMs=performance.now()-this.current.started;
    this.frames.push(this.current);if(this.frames.length>300)this.frames.shift();this.current=null;
  }
  snapshot(){return {timing:'CPU submission only; no GPU completion or FPS claim',counts:{...this.counts},frames:this.frames.map(frame=>({...frame,stages:{...frame.stages}}))};}
}
