import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AsyncReadback} from '../src/async-readback.js';
import {Renderer} from '../src/renderer.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('async readback reserves one slot, drops canceled delivery, and reopens after completion',async()=>{
  const gate=new AsyncReadback(),first=deferred(),writes=[];
  assert.equal(gate.start(()=>first.promise,p=>writes.push(p)),true);
  const done=gate.pending.promise;
  assert.equal(gate.start(()=>{throw Error('must not execute');},()=>{}),false);
  gate.invalidate();first.resolve('old scene');await done;
  assert.deepEqual(writes,[]);assert.equal(gate.available,true);
  gate.start(()=>Promise.resolve('new scene'),p=>writes.push(p));await gate.pending.promise;
  assert.deepEqual(writes,['new scene']);
});

test('frame/hover guard and disposal discard results without invoking UI completion',async()=>{
  for(const dispose of [false,true]){
    const gate=new AsyncReadback(),read=deferred();let current=true,writes=0;
    gate.start(()=>read.promise,()=>writes++,()=>current);
    const done=gate.pending.promise;
    if(dispose)gate.dispose();else current=false;
    read.resolve(new Uint8Array(4));await done;
    assert.equal(writes,0);assert.equal(gate.available,!dispose);
  }
});

test('rejected readback is handled once and does not strand the bounded slot',async()=>{
  const gate=new AsyncReadback();let errors=0;
  gate.start(()=>Promise.reject(Error('context lost')),()=>assert.fail(),()=>true,()=>errors++);
  await gate.pending.promise;
  assert.equal(errors,1);assert.equal(gate.available,true);
});

test('histogram coalesces to newest frame after a slow read, without redrawing the photograph',async()=>{
  const reads=[],writes=[];let serial=1;
  const owner={analysisReadback:new AsyncReadback(),analysisTarget:{},renderer:{readRenderTargetPixelsAsync(target,x,y,w,h,pixels){
    const read=deferred();reads.push({read,pixels,serial});return read.promise.then(()=>pixels);
  }},flushAnalysis:Renderer.prototype.flushAnalysis};
  const request=id=>({version:owner.analysisReadback.version,width:2,height:1,request:{isCurrent:()=>serial===id,onPixels:()=>writes.push(id)}});
  owner.latestAnalysis=request(1);owner.flushAnalysis();const firstDone=owner.analysisReadback.pending.promise;
  serial=2;owner.latestAnalysis=request(2);owner.flushAnalysis();
  serial=3;owner.latestAnalysis=request(3);owner.flushAnalysis();
  assert.equal(reads.length,1);
  reads[0].read.resolve();await firstDone;
  assert.equal(reads.length,2);assert.equal(reads[1].serial,3);assert.deepEqual(writes,[]);
  const lastDone=owner.analysisReadback.pending.promise;reads[1].read.resolve();await lastDone;
  assert.deepEqual(writes,[3]);assert.equal(owner.latestAnalysis,null);assert.equal(owner.analysisReadback.available,true);
  // No timer, invalidate, render or whole-photo completion callback is needed.
  assert.equal(reads.length,2);
});

test('scene/size invalidation discards queued histogram as well as in-flight delivery',async()=>{
  const read=deferred();let calls=0,writes=0;
  const owner={analysisReadback:new AsyncReadback(),analysisTarget:{},renderer:{readRenderTargetPixelsAsync(){calls++;return read.promise;}},flushAnalysis:Renderer.prototype.flushAnalysis};
  const request={version:0,width:1,height:1,request:{isCurrent:()=>true,onPixels:()=>writes++}};
  owner.latestAnalysis=request;owner.flushAnalysis();const done=owner.analysisReadback.pending.promise;
  owner.latestAnalysis=request;owner.analysisReadback.invalidate();read.resolve(new Uint8Array(4));await done;
  assert.equal(calls,1);assert.equal(writes,0);assert.equal(owner.latestAnalysis,null);
});
