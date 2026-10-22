import {test} from 'node:test';
import assert from 'node:assert/strict';
import {distribution,summarize,comparePixels} from './metrics.mjs';
test('measurement percentiles ignore unavailable GPU values rather than treating them as zero',()=>{
  assert.deepEqual(distribution([null,undefined,NaN]),{n:0,min:null,p50:null,p95:null,max:null,sum:0});
  assert.deepEqual(distribution([5,1,2,3,4]),{n:5,min:1,p50:3,p95:5,max:5,sum:15});
});
test('summary separates async submission from mandatory synchronous readback',()=>{
  const result=summarize({frames:[{label:'drag',cpuMs:5,gpuMs:null,drawCalls:10}],reads:[{label:'drag',cpuMs:2,mode:'pixel-pack-buffer'},{label:'drag',cpuMs:1,mode:'synchronous-array'}],longTasks:[]},[{id:'drag',latencies:[8]}]);
  assert.equal(result.drag.wholeRafGpuMs.n,0);assert.equal(result.drag.readbackCalls,2);assert.equal(result.drag.synchronousArrayReads,1);assert.equal(result.drag.pixelPackBufferReads,1);
});
test('pixel comparisons report exact equality and every differing byte',()=>{
  assert.equal(comparePixels(Uint8Array.of(1,2),Uint8Array.of(1,2)).identical,true);
  assert.deepEqual(comparePixels(Uint8Array.of(1,2),Uint8Array.of(3,2)),{bytes:2,meanAbsoluteByteDifference:1,maxAbsoluteByteDifference:2,changedByteFraction:.5,identical:false});
  assert.throws(()=>comparePixels(Uint8Array.of(1),Uint8Array.of(1,2)),/equal byte/);
});
