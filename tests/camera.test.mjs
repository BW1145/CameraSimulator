import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,ev100,resolveExposure,meterPixels,circleOfConfusion,histogram} from '../src/camera.js';
test('one stop doubles light through shutter or ISO',()=>{
  assert.equal(ev100(4,1/125,100)-ev100(4,1/125,200),1);
  assert.equal(ev100(4,1/125,100)-ev100(4,1/250,100),-1);
});
test('positive compensation brightens every automatic mode',()=>{
  for(const mode of ['M','A','S','P']) for(const autoISO of [false,true]){
    if(mode==='M'&&!autoISO)continue;
    const s={...DEFAULTS,mode,autoISO};
    const a=resolveExposure(s,9), b=resolveExposure({...s,compensation:1},9);
    assert.ok(ev100(b.aperture,b.shutter,b.iso)<ev100(a.aperture,a.shutter,a.iso),`${mode}/${autoISO}`);
  }
});
test('manual locks settings, priority modes lock the chosen parameter',()=>{
  const s={...DEFAULTS,autoISO:false};
  const m=resolveExposure(s,15);
  assert.equal(m.aperture,s.aperture); assert.equal(m.shutter,s.shutter); assert.equal(m.iso,s.iso);
  assert.equal(resolveExposure({...s,mode:'A'},9).aperture,s.aperture);
  assert.equal(resolveExposure({...s,mode:'S'},9).shutter,s.shutter);
});
test('automatic settings remain bounded at exposure limits',()=>{
  for(const mode of ['M','A','S','P'])for(const light of [-8,0,8,16,25]){
    const r=resolveExposure({...DEFAULTS,mode},light);
    assert.ok(r.iso>=50&&r.iso<=25600); assert.ok(r.aperture>=1.4&&r.aperture<=22);
    assert.ok(r.shutter>=1/8000&&r.shutter<=30);
  }
  assert.ok(resolveExposure(DEFAULTS,25).limited);
});
test('spot meter follows the selected region rather than a scene constant',()=>{
  const w=80,h=40,p=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)p.fill(x<w/2?25:230,(y*w+x)*4,(y*w+x)*4+3);
  const dark=meterPixels(p,w,h,'spot',{x:0.25,y:0.5}), light=meterPixels(p,w,h,'spot',{x:0.75,y:0.5});
  assert.ok(light>dark*20);
  const matrix=meterPixels(p,w,h,'matrix'); assert.ok(matrix>dark&&matrix<light);
});
test('depth of field depends on focus, focal length and aperture',()=>{
  assert.equal(circleOfConfusion(3,3,50,1.4),0);
  assert.ok(circleOfConfusion(8,3,85,1.4)>circleOfConfusion(8,3,35,1.4));
  assert.ok(circleOfConfusion(8,3,50,1.4)>circleOfConfusion(8,3,50,8));
});
test('histogram places black and white in the extreme bins',()=>{
  const p=new Uint8Array(32);p.fill(255,16);
  const h=histogram(p);assert.equal(h[0],1);assert.equal(h[63],1);
});
