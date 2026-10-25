import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMonkPublicManifest,validateMonkPublicManifest,monkPublicManifestSha256} from '../tools/monk-public-manifest.mjs';

// Synthetic capture-shaped input: no private source/recovery fixture is needed by public CI.
function fixture() {
  const hash='eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b', matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const encoding={type:'log2-rgb',min:-16,max:8,losslessContainer:'WebP',maximumChannelQuantizationEV:24/510,sourceMaximumRadiance:10};
  return {
    version:1,id:'monk-colonnade',title:'Monastery — Colonnade',sourceSha256:hash,
    attribution:'Carlo Bergonzini / Monorender / CC-BY (current Blender demo README)',referenceFocal:28,captureLens:28/1.2,
    bounds:Object.fromEntries(['x','y','z','yaw','pitch','roll'].map(k=>[k,[-.1,.1]])),defaults:{focus:5,baseEV:8},encoding,
    depth:{type:'uint16-rg',space:'capture-camera-z',range:64},
    camera:{name:'ApprovedNative_monk-colonnade',lens:28,sensorWidth:36,sensorHeight:24,aspect:16/9,nativeResolution:[5120,2880],near:.03,far:200,matrix:[[0.9987159967422485, -0.0007331844535656273, -0.05065418779850006, 10.100000381469727], [-0.05065949633717537, -0.01445415522903204, -0.9986113905906677, 13.199999809265137], [2.820984112972269e-09, 0.9998952746391296, -0.014472737908363342, 1.5], [0.0, 0.0, 0.0, 1.0]],shiftX:0,shiftY:0,sensorFit:'HORIZONTAL'},
    views:['center','left','right','up','down','front','back'].map((id,index)=>({id,offset:[[0,0,0],[-.08,0,0],[.08,0,0],[0,.08,0],[0,-.08,0],[0,0,-.05],[0,0,.05]][index],near:.03,position:[0,0,0],matrix,cameraMatrix:[0.9987159967422485, 2.820984112972269e-09, 0.05065949633717537, 0.0, -0.0007331844535656273, 0.9998952746391296, 0.01445415522903204, 0.0, -0.05065418779850006, -0.014472737908363342, 0.9986113905906677, 0.0, 10.100000381469727, 1.5, -13.199999809265137, 1.0],projectionMatrix:matrix,width:2560,height:1440,samples:index===0?256:32,file:`${id}.webp`,bytes:100,depth:`${id}-depth.png`,depthWidth:1280,depthHeight:720,depthBytes:100,detailFile:`${id}-detail.webp`,detailBytes:100,detailWidth:index===0?5120:4096,detailHeight:index===0?2880:2304,detailDepth:`${id}-detail-depth.png`,detailDepthWidth:2048,detailDepthHeight:1152,detailDepthBytes:100,flash:`${id}-flash.webp`,flashBytes:100,flashWidth:1280,flashHeight:720,maximumRadiance:10,clampedChannels:0,minimumDepth:1,maximumDepth:20})),
    totalBytes:3500,initialBytes:200,detail:{sourceSha256:hash,encoding},flash:{sourceSha256:hash,encoding,referenceEnergy:1000,referenceDuration:.01,areaDiameter:.08,originOffsetForward:0},
    displayTransform:{version:1,profile:'blender-4.5.14-agx-medium-high-v1',view:'AgX',look:'AgX - Medium High Contrast',exposure:-1.5,gamma:1},radianceSpace:'scene-linear',displayTransformAppliedToRadiance:false,
    displayTransformProfile:{profileSha256:'a5bd43a1d7e261fc9d90a6a986af9bdf4e3e074922c62a9803948d8f65f2076e'},
    sourceProvenance:{originalAuthor:'Carlo Bergonzini / Monorender',license:'CC-BY (current official file internalREADME; version unspecified)',originalUrl:'https://download.blender.org/demo/cycles/lone-monk_cycles_and_exposure-node_demo.blend'},
    defaultsEvidence:{focus:{samples:{'foreground-column':{nativeNormalized:[.5,.5],z:5}}}},
  };
}
test('projects a complete runtime manifest without mutating any source object',()=>{
  const full=fixture(),before=JSON.stringify(full),p=createMonkPublicManifest(full);
  assert.equal(validateMonkPublicManifest(p),true);assert.equal(JSON.stringify(full),before);
  p.views[0].position[0]=9;assert.equal(full.views[0].position[0],0);
});
test('unknown internal fields are omitted at every nested level; unknown public fields fail',()=>{
  const full=fixture();full.internal='private';full.views[0].radianceCapture={secret:'private'};
  full.defaultsEvidence.focus.samples['foreground-column'].sourcePath='private';full.detail.views=['private'];
  full.defaultsEvidence.focus.samples['private-owner-name']=full.defaultsEvidence.focus.samples['foreground-column'];
  const p=createMonkPublicManifest(full);assert.ok(!JSON.stringify(p).includes('private'));
  p.views[0].secret='private';assert.throws(()=>validateMonkPublicManifest(p),/unknown public field/);
});
test('asset paths reject absolute, traversal, URL, backslash and percent-encoded paths',()=>{
  for(const path of ['/private/a.png','C:\\data\\a.png','../a.png','file:///a.png','https://example.com/a.png','a/b.png','a\\b.png','%2e%2e-a.png']) {
    const f=fixture();f.views[0].file=path;assert.throws(()=>createMonkPublicManifest(f),/basename/);
  }
});
test('missing required runtime fields and malformed matrices fail closed',()=>{
  const f=fixture();delete f.views[0].detailDepth;assert.throws(()=>createMonkPublicManifest(f),/required/);
  const g=fixture();g.camera.matrix=[];assert.throws(()=>createMonkPublicManifest(g),/length/);
});
test('arbitrary public text and source URLs are rejected',()=>{
  const f=fixture();f.title='private path';assert.throws(()=>createMonkPublicManifest(f));
  const g=fixture();g.sourceProvenance.originalUrl='file:///private';assert.throws(()=>createMonkPublicManifest(g));
});
test('public commitment is independent of omitted evidence, sensitive to runtime changes',()=>{
  const f=fixture(),p=createMonkPublicManifest(f),h=monkPublicManifestSha256(p);
  f.sourceRenderEvidence={internal:'unpublished'};assert.equal(monkPublicManifestSha256(createMonkPublicManifest(f)),h);
  assert.notEqual(h,createHash('sha256').update(JSON.stringify(f)).digest('hex'));
  f.defaults.focus=6;assert.notEqual(monkPublicManifestSha256(createMonkPublicManifest(f)),h);
});
test('duplicate asset names and nonfinite values are rejected',()=>{
  const f=fixture();f.views[0].file=f.views[1].file;assert.throws(()=>createMonkPublicManifest(f),/distinct/);
  const g=fixture();g.defaults.focus=Infinity;assert.throws(()=>createMonkPublicManifest(g),/finite/);
});

test('approved optical, source, dimensions and filename contracts reject substitutions',()=>{
  for(const mutate of [
    f=>f.sourceSha256='b'.repeat(64),f=>f.detail.sourceSha256='b'.repeat(64),
    f=>f.referenceFocal=32,f=>f.captureLens=28,f=>f.camera.matrix[0][0]=0,
    f=>f.views[0].cameraMatrix[0]=0,f=>f.camera.nativeResolution=[4096,2304],
    f=>f.views[1].offset=[1,0,0],f=>f.defaults.baseEV=7,f=>f.depth.range=32,
    f=>f.views[1].file='wrong.webp',f=>f.views[1].detailWidth=5120,
    f=>f.views[0].clampedChannels=1,f=>f.views[0].samples=32,
  ]) {const f=fixture();mutate(f);assert.throws(()=>createMonkPublicManifest(f));}
});
