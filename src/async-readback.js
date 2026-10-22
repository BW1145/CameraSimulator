// Three's async readback snapshots the target into a pixel-pack buffer before
// yielding. Keep just one such buffer in flight; invalidation cancels DELIVERY,
// not the underlying GPU fence (Three owns that buffer and its cleanup).
export class AsyncReadback {
  constructor(){this.version=0;this.pending=null;this.disposed=false;}
  get available(){return !this.disposed&&!this.pending;}
  invalidate(){this.version++;}
  start(read,commit,isCurrent=()=>true,onError=()=>{},onIdle=()=>{}){
    if(!this.available)return false;
    const version=this.version;
    // Reserve the slot even when read throws or returns an already-settled promise.
    const slot={};this.pending=slot;
    try{
      slot.promise=Promise.resolve(read()).then(pixels=>{
        if(!this.disposed&&version===this.version&&isCurrent())commit(pixels);
      }).catch(error=>{
        if(!this.disposed&&version===this.version&&isCurrent())onError(error);
      }).finally(()=>{if(this.pending===slot)this.pending=null;if(!this.disposed)onIdle();});
    }catch(error){this.pending=null;throw error;}
    return true;
  }
  dispose(){this.disposed=true;this.invalidate();}
}
