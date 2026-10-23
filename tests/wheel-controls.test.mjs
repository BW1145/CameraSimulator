import test from 'node:test';
import assert from 'node:assert/strict';
import {WheelSteps,steppedValue} from '../src/wheel-controls.js';
const event=(deltaY,extra={})=>({deltaY,deltaX:0,deltaMode:0,...extra});
test('wheel accumulates trackpad pixels and bounds large deltas',()=>{
 const w=new WheelSteps();assert.equal(w.consume(event(-10),'focal',0),0);assert.equal(w.consume(event(-30),'focal',10),1);assert.equal(w.consume(event(-10000),'focal',20),1);
 assert.equal(w.consume(event(3,{deltaMode:1}),'focal',30),-1);assert.equal(w.consume(event(-1,{deltaMode:2}),'focal',40),1);
});
test('wheel ignores zoom/horizontal/shift and resets on target, pause or direction changes',()=>{
 for(const extra of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{deltaX:80}])assert.equal(new WheelSteps().consume(event(40,extra),'a',0),null);
 const w=new WheelSteps();w.consume(event(30),'a',0);assert.equal(w.consume(event(20),'b',10),0);assert.equal(w.consume(event(20),'b',300),0);assert.equal(w.consume(event(-20),'b',310),0);
});
test('values stay on bounded native integer and fractional grids',()=>{
 assert.equal(steppedValue({min:'0',max:'8',step:'1',value:'8'},3),8);
 assert.equal(steppedValue({min:'0.2',max:'50',step:'0.1',value:'1.2'},1),1.3);
 assert.equal(steppedValue({min:'0',max:'2',step:'0.1',value:'0.1'},-3),0);
 assert.equal(steppedValue({min:'2000',max:'10000',step:'100',value:'4500'},3),4800);
});
