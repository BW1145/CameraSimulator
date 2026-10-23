import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {photoSnapshot,assertCaptureLayers} from '../src/photo-snapshot.js';
import {exportPhoto,exportDimensions,canvasBlob} from '../src/photo-export.js';
const settings={aperture:4,shutter:1/125,iso:200,wb:5000,mode:'A',autoISO:true,compensation:0,metering:'matrix',focal:35,focus:3};
function snapshot(){return photoSnapshot({settings,resolved:{aperture:4,shutter:1/60,iso:800},scene:{id:'room',name:'房间'},renderer:{plateMode:false},simulationTime:1,focusPoint:{x:.4,y:.6},width:16,height:8,capturedAt:'2026-10-23T01:02:03.123Z'});}
test('capture snapshot is deeply immutable and stores resolved automatic values independently',()=>{
  const state={...settings},exposure={aperture:4,shutter:1/60,iso:800},point={x:.4,y:.6};
  const shot=photoSnapshot({settings:state,resolved:exposure,scene:{id:'room',name:'room'},renderer:{plateMode:true,entry:{id:'left',detailWidth:5120},plate:{image:{image:{width:2048,height:858}}}},simulationTime:2,focusPoint:point,width:2048,height:858});
  state.iso=6400;state.focus=9;exposure.iso=1600;point.x=1;
  assert.equal(shot.resolved.iso,800);assert.equal(shot.settings.iso,200);assert.equal(shot.settings.focus,3);assert.equal(shot.focusPoint.x,.4);
  assert.equal(shot.source.imageWidth,2048);assert.equal(shot.source.detailLoaded,false);
  assert.throws(()=>{shot.settings.focus=99;},TypeError);
});
test('missing requested flash fails honestly, while detail fallback is permitted',()=>{
  assert.throws(()=>assertCaptureLayers({plateMode:true,plate:{}},{flash:1}),/补光/);
  assert.doesNotThrow(()=>assertCaptureLayers({plateMode:true,plate:{}},{flash:0}));
});
test('export size is bounded by captured pixels, including portrait',()=>{
  assert.deepEqual(exportDimensions(2048,858,1024),[1024,429]);
  assert.deepEqual(exportDimensions(1365,2048,1600),[1066,1600]);
  assert.deepEqual(exportDimensions(800,600,2048),[800,600]);
  assert.throws(()=>exportDimensions(800,600,NaN));
});
test('null or thrown encoder failures reject rather than create empty photos',async()=>{
  await assert.rejects(canvasBlob({toBlob:callback=>callback(null)}),/编码失败/);
  await assert.rejects(canvasBlob({toBlob:()=>{throw new Error('Synthetic export failure');}}),/Synthetic/);
});
test('JPEG encodes once from retained lossless source; full-size PNG never re-encodes',async()=>{
  const png=await sharp({create:{width:16,height:8,channels:3,background:'#327abc'}}).png().toBuffer();
  const jpeg=await sharp(png).jpeg().toBuffer();
  const shot={width:16,height:8,blob:new Blob([png],{type:'image/png'}),snapshot:snapshot()};
  let decodes=0,encodes=0,closed=0,draws=0;
  const originalDocument=globalThis.document,originalBitmap=globalThis.createImageBitmap;
  globalThis.createImageBitmap=async blob=>{assert.equal(blob,shot.blob);decodes++;return {close(){closed++;}};};
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {getContext(){return {drawImage(){draws++;}};},toBlob(callback,type,quality){encodes++;assert.equal(type,'image/jpeg');assert.equal(quality,.92);callback(new Blob([jpeg],{type}));}};}};
  try {
    const exported=await exportPhoto(shot);
    assert.equal(exported.type,'image/jpeg');assert.equal((await sharp(Buffer.from(await exported.arrayBuffer())).metadata()).width,16);
    assert.deepEqual([decodes,encodes,closed,draws],[1,1,1,1]);
    const lossless=await exportPhoto(shot,{format:'png'});
    const expected=await sharp(png).raw().toBuffer();const actual=await sharp(Buffer.from(await lossless.arrayBuffer())).raw().toBuffer();
    assert.deepEqual(actual,expected);assert.deepEqual([decodes,encodes,closed,draws],[1,1,1,1]);
  } finally {globalThis.document=originalDocument;globalThis.createImageBitmap=originalBitmap;}
});
