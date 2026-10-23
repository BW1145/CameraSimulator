// Bound expensive GPU work without blocking JavaScript or reducing quality.
// WebGL2 sync objects are independent of Three's cached rendering state.
export class FramePacer {
  constructor(gl,onError=()=>{}){this.gl=gl;this.onError=onError;this.sync=null;this.disposed=false;this.failed=false;this.retry=0;this.complete=null;}
  clear(){if(this.sync)this.gl.deleteSync(this.sync);this.sync=null;this.complete=null;}
  fail(){this.clear();this.failed=true;this.onError('GPU frame fence failed');}
  get available(){
    const gl=this.gl;
    if(this.disposed||this.failed)return false;
    if(gl.isContextLost()){this.clear();return false;}
    if(!this.sync)return true;
    const status=gl.clientWaitSync(this.sync,0,0); // zero timeout: never wait on CPU
    if(status===gl.TIMEOUT_EXPIRED)return false;
    if(status===gl.WAIT_FAILED){
      gl.deleteSync(this.sync);this.sync=null;
      // One fresh fence can recover a failed poll while still covering every
      // previously submitted command. Never fall back to an unbounded queue.
      if(this.retry++===0){this.sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(this.sync){gl.flush();return false;}}
      this.fail();return false;
    }
    gl.deleteSync(this.sync);this.sync=null;this.retry=0;
    const complete=this.complete;this.complete=null;complete?.();return true;
  }
  submit(complete){
    if(this.sync||this.disposed||this.failed||this.gl.isContextLost())return false;
    this.complete=complete;this.sync=this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE,0);
    if(!this.sync){this.fail();return false;}
    // flush submits commands; only a signaled fence establishes completion.
    this.gl.flush();return true;
  }
  async wait(isCurrent=()=>true){
    while(isCurrent()){
      if(this.available)return true;
      if(this.failed||this.disposed||this.gl.isContextLost())return false;
      await new Promise(resolve=>setTimeout(resolve,8));
    }
    return false;
  }
  reset(){this.clear();this.disposed=false;this.failed=false;this.retry=0;}
  dispose(){this.clear();this.disposed=true;}
}
