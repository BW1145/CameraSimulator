// Formal depth probes use Python round; runtime hitAt selects a texel with floor.
// Test the selected texel at its center, not on an unstable raster boundary.
import assert from 'node:assert/strict';
function nearestEven(n){const lo=Math.floor(n),fraction=n-lo;return fraction<.5?lo:fraction>.5?lo+1:lo%2===0?lo:lo+1;}
export function nativeProbePixelCenter(nativeNormalized,width,height){
 assert.ok(Array.isArray(nativeNormalized)&&nativeNormalized.length===2);
 assert.ok(nativeNormalized.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 assert.ok(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0);
 const pixel=nativeNormalized.map((v,i)=>nearestEven((.5+(v-.5)/1.2)*[width,height][i]));
 assert.ok(pixel[0]>=0&&pixel[0]<width&&pixel[1]>=0&&pixel[1]<height);
 return {pixel,nativeNormalized:pixel.map((v,i)=>.5+((v+.5)/[width,height][i]-.5)*1.2)};
}
