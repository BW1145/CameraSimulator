import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FramePacer} from '../src/frame-pacer.js';

function setup(){let lost=false,next=0,status=1;const calls={created:0,deleted:0,flush:0,polls:[]},gl={TIMEOUT_EXPIRED:1,WAIT_FAILED:2,CONDITION_SATISFIED:3,ALREADY_SIGNALED:4,SYNC_GPU_COMMANDS_COMPLETE:5,
  isContextLost:()=>lost,fenceSync(condition,flags){assert.equal(condition,5);assert.equal(flags,0);calls.created++;return {id:++next};},deleteSync(){calls.deleted++;},flush(){calls.flush++;},clientWaitSync(sync,flags,timeout){calls.polls.push({flags,timeout});return status;},
};return {gl,calls,setStatus:v=>status=v,setLost:v=>lost=v};}

test('one GPU batch stays in flight; zero-timeout polling never blocks and completion releases latest work',()=>{
  const t=setup(),pacer=new FramePacer(t.gl);let completed=0;
  assert.equal(pacer.available,true);assert.equal(pacer.submit(()=>completed++),true);
  assert.equal(pacer.submit(()=>assert.fail()),false);assert.equal(t.calls.created,1);
  for(let i=0;i<20;i++)assert.equal(pacer.available,false);
  assert.equal(completed,0);assert.ok(t.calls.polls.every(call=>call.timeout===0&&call.flags===0));
  t.setStatus(t.gl.CONDITION_SATISFIED);assert.equal(pacer.available,true);assert.equal(completed,1);assert.equal(t.calls.deleted,1);
  assert.equal(pacer.available,true);assert.equal(completed,1);assert.equal(pacer.submit(),true);
});

test('lost context and disposal discard old completion and release owned syncs',()=>{
  const t=setup(),pacer=new FramePacer(t.gl);pacer.submit(()=>assert.fail());t.setLost(true);
  assert.equal(pacer.available,false);assert.equal(t.calls.deleted,1);t.setLost(false);pacer.reset();assert.equal(pacer.available,true);
  pacer.submit(()=>assert.fail());pacer.dispose();assert.equal(t.calls.deleted,2);assert.equal(pacer.available,false);assert.equal(pacer.submit(),false);
  pacer.reset();assert.equal(pacer.available,true);
});

test('failed fence polls get one bounded replacement, then fail closed instead of queueing work',()=>{
  const t=setup();let errors=0,completed=0;const pacer=new FramePacer(t.gl,()=>errors++);pacer.submit(()=>completed++);t.setStatus(t.gl.WAIT_FAILED);
  assert.equal(pacer.available,false);assert.equal(t.calls.created,2);assert.equal(errors,0);
  assert.equal(pacer.available,false);assert.equal(errors,1);assert.equal(pacer.submit(),false);assert.equal(completed,0);
  assert.equal(t.calls.created,2);pacer.reset();t.setStatus(t.gl.ALREADY_SIGNALED);pacer.submit(()=>completed++);assert.equal(pacer.available,true);assert.equal(completed,1);
});

test('a failed fence creation cannot silently disable backpressure',()=>{
  const t=setup();let errors=0;t.gl.fenceSync=()=>null;const pacer=new FramePacer(t.gl,()=>errors++);
  assert.equal(pacer.submit(),false);assert.equal(errors,1);assert.equal(pacer.available,false);
});

test('a hidden or superseded capture stops waiting without polling or releasing queued work',async()=>{
  const t=setup(),pacer=new FramePacer(t.gl);pacer.submit(()=>assert.fail());
  assert.equal(await pacer.wait(()=>false),false);assert.equal(t.calls.polls.length,0);assert.equal(t.calls.deleted,0);
  pacer.dispose();assert.equal(t.calls.deleted,1);
});
