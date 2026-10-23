import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canDeliverDetail} from '../src/detail-feedback.js';

const frame=()=>({time:7.5,settings:{focus:3,focal:35,wb:5000,sensor:'full',crop:'native',x:0,y:0,z:0,yaw:0,pitch:0,roll:0,flash:0},exposure:{aperture:8,shutter:.01,iso:100,ev:10}});
const snapshot=()=>({frame:frame(),intent:4,regionKey:'same-crop',generation:7,sourceWidth:2560,sourceDepthWidth:2560});
const current=()=>({frame:frame(),intent:4,regionKey:'same-crop',moving:false,committed:null});

test('same-intent frozen detail remains deliverable through source-only promotion',()=>{
  const request=snapshot(),now=current();
  // The current source can already be larger; delivery describes the source
  // actually rendered, not the texture pack at callback time.
  now.sourceWidth=5120;
  assert.equal(canDeliverDetail(request,now),true);
});

test('changed user/scene intent or photographic crop always rejects old detail',()=>{
  for(const mutate of [c=>c.intent++,c=>c.regionKey='new-crop']){
    const now=current();mutate(now);assert.equal(canDeliverDetail(snapshot(),now),false);
  }
});

test('frozen delivery and already-visible feedback require exact photographic settings, exposure and time',()=>{
  for(const [group,key]of [['settings','focus'],['settings','focal'],['settings','flash'],['settings','yaw'],['settings','crop'],['exposure','aperture'],['exposure','shutter'],['exposure','iso'],['exposure','ev']]){
    const now=current();now.frame[group][key]='changed';assert.equal(canDeliverDetail(snapshot(),now),false,`${group}.${key}`);
  }
  const now=current();now.frame.time++;assert.equal(canDeliverDetail(snapshot(),now),false);
  now.frame=null;assert.equal(canDeliverDetail(snapshot(),now),false);
});

test('unchanged moving intent allows bounded snapshot lag but never an older committed generation or lower source',()=>{
  const request=snapshot(),now=current();now.moving=true;now.frame.time++;now.frame.settings.focus=4;
  assert.equal(canDeliverDetail(request,now),true);
  now.committed={...request,generation:8};assert.equal(canDeliverDetail(request,now),false);
  now.committed={...request,sourceWidth:5120};assert.equal(canDeliverDetail(request,now),false);
  now.committed={...request,sourceDepthWidth:5120};assert.equal(canDeliverDetail(request,now),false);
  now.committed={...request,generation:6};assert.equal(canDeliverDetail(request,now),true);
  now.intent++;assert.equal(canDeliverDetail(request,now),false);
});
