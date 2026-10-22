import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FrameDiagnostics} from '../src/frame-diagnostics.js';

test('diagnostics measure complete meter/photo/detail stages and count each API pass',()=>{
  const renderer={info:{render:{calls:0,triangles:0}},render(calls){this.info.render={calls,triangles:calls*10};}};
  const diagnostics=new FrameDiagnostics(renderer,true);diagnostics.begin('preview',7);
  for(const [name,calls]of [['meter',2],['photograph',3],['magnifier',4]])diagnostics.measure(name,()=>renderer.render(calls));
  diagnostics.end();const frame=diagnostics.snapshot().frames[0];
  assert.equal(frame.revision,7);assert.equal(frame.renderCalls,undefined);assert.equal(frame.triangles,undefined);assert.equal(frame.passes,3);
  assert.deepEqual(Object.keys(frame.stages),['meter','photograph','magnifier']);
  assert.ok(frame.cpuSubmissionMs>=0);assert.equal(frame.gpuMs,undefined);
  frame.stages.meter=-1;assert.notEqual(diagnostics.snapshot().frames[0].stages.meter,-1);
  assert.equal(diagnostics.snapshot().counts.preview,1);
});

test('monotonic per-kind counters keep increasing after bounded history fills',()=>{
  const diagnostics=new FrameDiagnostics({render(){}},true);
  for(let i=0;i<350;i++){diagnostics.begin('preview',i);diagnostics.end();}
  assert.equal(diagnostics.snapshot().frames.length,300);assert.equal(diagnostics.snapshot().counts.preview,350);
});

test('nested reflection passes are counted without pretending renderer.info is a draw total',()=>{
  const renderer={render(depth){if(depth)this.render(depth-1);}},diagnostics=new FrameDiagnostics(renderer,true);
  diagnostics.begin('preview',1);renderer.render(2);diagnostics.end();
  const frame=diagnostics.snapshot().frames[0];assert.equal(frame.passes,3);assert.equal(frame.renderCalls,undefined);
});

test('disabled diagnostics do not wrap renderer or retain frames',()=>{
  const renderer={render(){}};const render=renderer.render,diagnostics=new FrameDiagnostics(renderer);
  diagnostics.begin('preview',1);let called=false;diagnostics.measure('photograph',()=>{called=true;});diagnostics.end();
  assert.equal(renderer.render,render);assert.equal(called,true);assert.deepEqual(diagnostics.frames,[]);
});
