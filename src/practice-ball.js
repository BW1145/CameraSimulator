import * as T from 'three';

// The practice ball uses actual instantaneous opaque frames, sharing the fan's
// depth/temporal/flash pipeline. Its path need not be a periodic rotor.
export function createBallSubject(owner){
  return {
    samples:[{time:0,weight:1}],
    exposure(time,shutter){
      let length=0,last;
      for(let i=0;i<=24;i++){
        const p=owner.ballWorld(time-shutter*i/24).project(owner.camera);
        if(last)length+=Math.hypot((p.x-last.x)*owner.target.width/2,(p.y-last.y)*owner.target.height/2);last=p;
      }
      const count=Math.min(24,Math.max(1,Math.ceil(length/1.5)));
      this.samples=Array.from({length:count},(_,i)=>({time:time-shutter*(i+.5)/count,weight:1/count}));
      return this.samples;
    },
    setTime(time){
      for(let i=0;i<owner.balls.length;i++)owner.balls[i].visible=i===0;
      const ball=owner.balls[0];ball.position.copy(owner.ballWorld(time));ball.scale.setScalar(owner.scene.ballDistance*.055/.12);ball.material.opacity=1;ball.material.transparent=false;ball.material.depthWrite=true;
    },
    bounds(camera,width,height){
      if(!owner.ballGroup.visible)return null;
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      const radius=owner.scene.ballDistance*.055;
      for(const sample of this.samples){const center=owner.ballWorld(sample.time);
        for(const x of [-radius,radius])for(const y of [-radius,radius])for(const z of [-radius,radius]){
          const p=new T.Vector3(x,y,z).add(center).project(camera);minX=Math.min(minX,(p.x*.5+.5)*width);maxX=Math.max(maxX,(p.x*.5+.5)*width);minY=Math.min(minY,(p.y*.5+.5)*height);maxY=Math.max(maxY,(p.y*.5+.5)*height);
        }
      }
      const x=Math.max(0,Math.floor(minX)-3),y=Math.max(0,Math.floor(minY)-3),right=Math.min(width,Math.ceil(maxX)+3),top=Math.min(height,Math.ceil(maxY)+3);
      return right>x&&top>y?{x,y,width:right-x,height:top-y}:null;
    }
  };
}
