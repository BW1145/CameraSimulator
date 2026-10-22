import * as T from 'three';

// The transport is an unsigned16 axial camera-Z packed into R/G. Zero is kept:
// silently discarding it would turn an uncertain near surface into a far one.
export function minimumPackedDepth(pixels,range=64,validityChannel=null){
  if(!pixels?.length||pixels.length%4||!(range>0))return null;
  let minimum=Infinity;
  for(let i=0;i<pixels.length;i+=4){
    if(validityChannel!==null&&pixels[i+validityChannel]<=127)continue;
    const hi=pixels[i],lo=pixels[i+1];
    if(!Number.isFinite(hi)||!Number.isFinite(lo)||hi<0||hi>255||lo<0||lo>255)return null;
    minimum=Math.min(minimum,hi*256+lo);
  }
  return minimum/65535*range;
}

// projected.w = source-camera Z / current-camera Z. It is affine in viewport
// ray x/y, so its maximum is attained at a corner, including shifted/detail views.
export function projectedMinimumDepth(sourceMinimum,rayToCapture,tanHalfFov,viewShift,nearClip){
  if(!Number.isFinite(sourceMinimum)||sourceMinimum<0||!Number.isFinite(nearClip)||nearClip<0)return null;
  const e=rayToCapture?.elements;
  if(!e||![...e,tanHalfFov?.x,tanHalfFov?.y,viewShift?.x,viewShift?.y].every(Number.isFinite))return null;
  let maximumW=0;
  for(const x of [-1,1])for(const y of [-1,1]){
    const w=e[3]*(x+viewShift.x)*tanHalfFov.x+e[7]*(y+viewShift.y)*tanHalfFov.y-e[11];
    if(!(w>0))return null;
    maximumW=Math.max(maximumW,w);
  }
  return Math.max(nearClip,sourceMinimum/maximumW);
}

export function minimumWorldBoxDepth(box,viewMatrix){
  if(!box||box.isEmpty()||![...box.min.toArray(),...box.max.toArray(),...viewMatrix.elements].every(Number.isFinite))return null;
  let minimum=Infinity;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new T.Vector3(x,y,z).applyMatrix4(viewMatrix);minimum=Math.min(minimum,-p.z);
  }
  return Number.isFinite(minimum)?minimum:null;
}

export function minimumSphereDepth(center,radius,viewMatrix){
  if(!(radius>=0)||![...center.toArray(),...viewMatrix.elements,radius].every(Number.isFinite))return null;
  const p=center.clone().applyMatrix4(viewMatrix),e=viewMatrix.elements;
  // Also conservative if a caller supplies a scaled view transform.
  return -p.z-radius*Math.hypot(e[2],e[6],e[10]);
}

export function foregroundSupportRadius(minimumDepth,{focus,focal,aperture,sensorWidth,width,limit,nearClip}){
  if(!Number.isFinite(minimumDepth)||![focus,focal,aperture,sensorWidth,width,limit,nearClip].every(Number.isFinite)||focus<=0||focal<=0||aperture<=0||sensorWidth<=0||width<=0||limit<0||nearClip<=0)return -1;
  // Cover projection roundoff and the HalfFloat optical-depth intermediate
  // without tightening the bound. This does not change the physical CoC formula.
  const z=Math.max(nearClip,minimumDepth-Math.max(.001,Math.abs(minimumDepth)/1024));
  if(z>=focus)return 0;
  const f=focal/1000;
  return Math.min(limit,Math.abs(f*f*(z-focus)/(aperture*Math.max(.05,z)*Math.max(.01,focus-f)))*1000/sensorWidth*width*.5);
}
