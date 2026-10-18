import test from 'node:test';
import assert from 'node:assert/strict';
import {periodicExposureSamples} from '../src/temporal-exposure.js';

test('short shutters resolve projected rotor travel at telephoto scale',()=>{
  const screenArc=120*2*Math.PI/3;
  const samples=periodicExposureSamples(1,1/500,1/12,24,screenArc);
  assert.ok(samples.length>=4);assert.ok(samples.length<=24);
  assert.ok(Math.abs(samples.reduce((sum,s)=>sum+s.weight,0)-1)<1e-12);
});

test('temporal exposure preserves constant radiance through 30 seconds with a bounded sample budget',()=>{
  for(const shutter of [1/8000,1/125,1/30,.1,.125,.25,1,2,4,8,15,30]){
    const samples=periodicExposureSamples(123.456,shutter,1/12);
    assert.ok(samples.length<=24);assert.ok(samples.every(s=>s.weight>0&&s.time<=123.456));
    assert.ok(Math.abs(samples.reduce((sum,s)=>sum+s.weight*.18,0)-.18)<1e-12);
  }
});

test('partial-cycle and long-shutter integration follows the analytic periodic signal',()=>{
  const period=1/12,omega=2*Math.PI/period;
  for(const time of [.001,.071,.5,17.3])for(const shutter of [1/8000,.007,.03,.07,.1,.125,.193,1.07,30.003]){
    const samples=periodicExposureSamples(time,shutter,period);
    const actual=samples.reduce((sum,s)=>sum+s.weight*Math.sin(omega*s.time),0);
    const expected=(Math.cos(omega*(time-shutter))-Math.cos(omega*time))/(omega*shutter);
    assert.ok(Math.abs(actual-expected)<.012,`shutter=${shutter}, actual=${actual}, expected=${expected}`);
  }
});
