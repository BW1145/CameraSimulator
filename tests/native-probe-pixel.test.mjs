import test from 'node:test';import assert from 'node:assert/strict';
import {nativeProbePixelCenter} from '../tools/native-probe-pixel.mjs';
test('formal far point maps each resolution to its own texel center',()=>{
 for(const [w,h,p]of [[2048,1152,[1264,336]],[1280,720,[790,210]]]){
  const r=nativeProbePixelCenter([.640625,.25],w,h);assert.deepEqual(r.pixel,p);
  for(const epsilon of [-3e-8,0,3e-8])assert.deepEqual(r.nativeNormalized.map((v,i)=>Math.floor(((.5+(v-.5)/1.2)+epsilon)*[w,h][i])),p);
 }
});
test('tiny near-boundary input perturbation preserves formally nearest pixel',()=>{
 for(const epsilon of [-1e-10,0,1e-10])assert.deepEqual(nativeProbePixelCenter([.640625+epsilon,.25+epsilon],2048,1152).pixel,[1264,336]);
});
test('half ties follow Python nearest-even rather than JavaScript half-up',()=>{
 assert.deepEqual(nativeProbePixelCenter([.5,.5],5,5).pixel,[2,2]);
 assert.deepEqual(nativeProbePixelCenter([.5,.5],7,7).pixel,[4,4]);
});
test('invalid coordinates and dimensions reject; input remains unchanged',()=>{
 for(const v of [[NaN,.5],[-.1,.5],[.5,1.1]])assert.throws(()=>nativeProbePixelCenter(v,1280,720));
 for(const size of [0,2.2,Infinity])assert.throws(()=>nativeProbePixelCenter([.5,.5],size,720));
 const v=Object.freeze([.640625,.25]);nativeProbePixelCenter(v,1280,720);assert.deepEqual(v,[.640625,.25]);
});
