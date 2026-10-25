// Portable runtime projection. Full capture/recovery evidence remains in the local importer.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const MONK_VIEWPOINT_IDS = Object.freeze(['monk-colonnade','monk-reading-table','monk-courtyard']);
export const MONK_PUBLIC_SCHEMA = 'monk-runtime-manifest-v1';
const titles = Object.freeze({
  'monk-colonnade': 'Monastery — Colonnade',
  'monk-reading-table': 'Monastery — Reading Table',
  'monk-courtyard': 'Monastery — Courtyard Pavilion',
});
// Numeric camera approval pins; no private report dependency.
const approvedCameras = {"monk-colonnade":{"lens":28.0,"matrix":[[0.9987159967422485,-0.0007331844535656273,-0.05065418779850006,10.100000381469727],[-0.05065949633717537,-0.01445415522903204,-0.9986113905906677,13.199999809265137],[2.820984112972269e-09,0.9998952746391296,-0.014472737908363342,1.5],[0.0,0.0,0.0,1.0]]},"monk-reading-table":{"lens":32.0,"matrix":[[0.942990243434906,0.05018877238035202,-0.329014390707016,19.299999237060547],[-0.3328203558921814,0.1422012895345688,-0.9322067499160767,9.100000381469727],[-4.146492216250408e-08,0.9885645508766174,0.1507982760667801,1.0499999523162842],[0.0,0.0,0.0,1.0]]},"monk-courtyard":{"lens":26.0,"matrix":[[0.7249993681907654,-0.06709069013595581,-0.685474157333374,14.5],[-0.6887495517730713,-0.0706217959523201,-0.7215515375137329,15.5],[-2.6246194551049484e-08,0.9952443838119507,-0.0974094346165657,1.25],[0.0,0.0,0.0,1.0]]}};
const sourceSHA='eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b';
const close=(actual,expected,label,tolerance=2e-5)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: approved value`);
const one = value => ({literal: value});
const arr = (item, length) => ({array: item, length});
const obj = fields => ({object: fields});
const optional = spec => ({optional: spec});
const number = 'number', positive = 'positive', integer = 'integer', hash = 'hash';
const vector = arr(number, 3), matrix = arr(arr(number, 4), 4);
const encoding = obj({type: one('log2-rgb'), min: number, max: number,
  losslessContainer: one('WebP'), maximumChannelQuantizationEV: positive, sourceMaximumRadiance: number});
const viewFields = {
  id: {enum: ['center','left','right','up','down','front','back']}, offset: vector,
  near: positive, position: vector, matrix: arr(number,16), cameraMatrix: arr(number,16), projectionMatrix: arr(number,16),
  width: integer, height: integer, samples: integer, file:'asset', bytes:integer,
  depth:'asset', depthWidth:integer, depthHeight:integer, depthBytes:integer,
  detailFile:'asset', detailBytes:integer, detailWidth:integer, detailHeight:integer,
  detailDepth:'asset', detailDepthWidth:integer, detailDepthHeight:integer, detailDepthBytes:integer,
  flash:'asset', flashBytes:integer, flashWidth:integer, flashHeight:integer,
  maximumRadiance:number, clampedChannels:number, minimumDepth:number, maximumDepth:number,
  encoding:optional(encoding), detailEncoding:optional(encoding),
};
const schema = obj({
  schema:one(MONK_PUBLIC_SCHEMA), version:one(1), id:{enum:Object.keys(titles)}, title:'title',
  attribution:one('Carlo Bergonzini / Monorender / CC-BY (current Blender demo README)'),
  sourceSha256:hash, referenceFocal:positive, captureLens:positive,
  bounds:obj(Object.fromEntries(['x','y','z','yaw','pitch','roll'].map(k=>[k,arr(number,2)]))),
  defaults:obj({focus:positive,baseEV:number}), encoding,
  depth:obj({type:one('uint16-rg'),space:one('capture-camera-z'),range:positive}),
  camera:obj({name:'cameraName',lens:positive,sensorWidth:positive,sensorHeight:positive,
    aspect:positive,nativeResolution:arr(integer,2),near:positive,far:positive,matrix,
    shiftX:number,shiftY:number,sensorFit:one('HORIZONTAL')}),
  views:arr(obj(viewFields),7),totalBytes:integer,initialBytes:integer,
  detail:obj({sourceSha256:hash,encoding}),
  flash:obj({sourceSha256:hash,encoding,referenceEnergy:positive,referenceDuration:positive,
    areaDiameter:positive,originOffsetForward:number}),
  displayTransform:obj({version:one(1),profile:one('blender-4.5.14-agx-medium-high-v1'),
    view:one('AgX'),look:one('AgX - Medium High Contrast'),exposure:one(-1.5),gamma:one(1)}),
  radianceSpace:one('scene-linear'),displayTransformAppliedToRadiance:one(false),
  displayTransformProfile:obj({profileSha256:one('a5bd43a1d7e261fc9d90a6a986af9bdf4e3e074922c62a9803948d8f65f2076e')}),
  sourceProvenance:obj({originalAuthor:one('Carlo Bergonzini / Monorender'),
    license:one('CC-BY (current official file internalREADME; version unspecified)'),
    originalUrl:one('https://download.blender.org/demo/cycles/lone-monk_cycles_and_exposure-node_demo.blend')}),
  defaultsEvidence:obj({focus:obj({samples:{samples:true}})}),
});
function walk(value, spec, strict, at='manifest') {
  if (spec.optional) return value===undefined ? undefined : walk(value,spec.optional,strict,at);
  assert.notEqual(value,undefined,`${at}: required`);
  if (typeof spec==='string') {
    if ([number,positive,integer].includes(spec)) {
      assert.equal(typeof value,'number',`${at}: number`); assert.ok(Number.isFinite(value),`${at}: finite`);
      if(spec===positive) assert.ok(value>0,`${at}: positive`);
      if(spec===integer) assert.ok(Number.isSafeInteger(value)&&value>0,`${at}: positive integer`);
    } else {
      assert.equal(typeof value,'string',`${at}: string`);
      if(spec===hash) assert.match(value,/^[a-f0-9]{64}$/,`${at}: SHA256`);
      if(spec==='asset') assert.match(value,/^[a-z0-9][a-z0-9_-]*\.(?:png|webp)$/,`${at}: relative runtime asset basename`);
      if(spec==='title') assert.ok(Object.values(titles).includes(value),`${at}: approved title`);
      if(spec==='cameraName') assert.ok(Object.keys(titles).some(id=>value===`ApprovedNative_${id}`),`${at}: approved camera`);
    }
    return value;
  }
  if('literal' in spec) { assert.equal(value,spec.literal,`${at}: approved constant`); return value; }
  if(spec.enum) { assert.ok(spec.enum.includes(value),`${at}: enum`); return value; }
  if(spec.array) {
    assert.ok(Array.isArray(value),`${at}: array`); assert.equal(value.length,spec.length,`${at}: length`);
    return value.map((v,i)=>walk(v,spec.array,strict,`${at}[${i}]`));
  }
  assert.ok(value && typeof value==='object' && !Array.isArray(value),`${at}: object`);
  if(spec.samples) {
    assert.ok(Object.keys(value).length>0 && Object.keys(value).length<=16,`${at}: sample count`);
    return Object.fromEntries(Object.entries(value).map(([name,v],i)=>{
      const publicName=`probe-${i+1}`;
      if(strict) assert.equal(name,publicName,`${at}: numbered public probe`);
      const result=walk(v,obj({nativeNormalized:arr(number,2),z:positive}),strict,`${at}.${name}`);
      assert.ok(result.nativeNormalized.every(n=>n>=0&&n<=1),`${at}: normalized coordinates`);
      return [publicName,result];
    }));
  }
  if(strict) for(const key of Object.keys(value)) assert.ok(Object.hasOwn(spec.object,key),`${at}.${key}: unknown public field`);
  return Object.fromEntries(Object.entries(spec.object).flatMap(([key,child])=>{
    const result=walk(value[key],child,strict,`${at}.${key}`);
    return result===undefined?[]:[[key,result]];
  }));
}
export function validateMonkPublicManifest(manifest) {
  walk(manifest,schema,true);
  assert.equal(manifest.title,titles[manifest.id]);
  assert.equal(manifest.camera.name,`ApprovedNative_${manifest.id}`);
  assert.deepEqual(manifest.views.map(v=>v.id),['center','left','right','up','down','front','back'],'approved capture order; renderer anchors on center');
  const assets=manifest.views.flatMap(v=>['file','depth','detailFile','detailDepth','flash'].map(k=>v[k]));
  assert.equal(new Set(assets).size,35,'35 distinct runtime assets');
  const approved=approvedCameras[manifest.id], camera=manifest.camera;
  for(const source of [manifest.sourceSha256,manifest.detail.sourceSha256,manifest.flash.sourceSha256]) assert.equal(source,sourceSHA,'approved source SHA');
  assert.equal(manifest.referenceFocal,approved.lens);assert.equal(camera.lens,approved.lens);
  close(manifest.captureLens,approved.lens/1.2,'overscan capture lens');
  assert.deepEqual(camera.matrix,approved.matrix,'approved native camera matrix');
  assert.deepEqual(camera.nativeResolution,[5120,2880]);close(camera.near,.03,'near');assert.equal(camera.far,200);
  assert.equal(camera.sensorWidth,36);assert.equal(camera.sensorHeight,24);close(camera.aspect,16/9,'aspect');
  assert.equal(camera.shiftX,0);assert.equal(camera.shiftY,0);
  assert.equal(manifest.defaults.baseEV,8);assert.equal(manifest.depth.range,64);
  const expectedCenter=[];
  // Blender world (x,y,z) -> Three world (x,z,-y), then column-major flatten.
  const rows=[camera.matrix[0],camera.matrix[2],camera.matrix[1].map(n=>-n),camera.matrix[3]];
  for(let column=0;column<4;column++) for(let row=0;row<4;row++) expectedCenter.push(rows[row][column]);
  manifest.views[0].cameraMatrix.forEach((n,i)=>close(n,expectedCenter[i],'center camera matrix'));
  const offsets=[[0,0,0],[-.08,0,0],[.08,0,0],[0,.08,0],[0,-.08,0],[0,0,-.05],[0,0,.05]];
  const dimensions={width:2560,height:1440,depthWidth:1280,depthHeight:720,detailWidth:5120,detailHeight:2880,detailDepthWidth:2048,detailDepthHeight:1152,flashWidth:1280,flashHeight:720};
  const suffixes={file:'.webp',depth:'-depth.png',detailFile:'-detail.webp',detailDepth:'-detail-depth.png',flash:'-flash.webp'};
  for(const [index,view] of manifest.views.entries()) {
    assert.deepEqual(view.offset,offsets[index],'approved offset');close(view.near,.03,'view near');
    for(const [field,value] of Object.entries(dimensions)) assert.equal(view[field],index>0&&field==='detailWidth'?4096:index>0&&field==='detailHeight'?2304:value,`${field}: approved dimensions`);
    for(const [field,suffix] of Object.entries(suffixes)) assert.equal(view[field],`${view.id}${suffix}`,'approved layer filename');
    assert.equal(view.clampedChannels,0,'no clamped radiance');
    assert.equal(view.samples,index===0?256:32,'approved samples');
  }
  assert.ok(manifest.camera.near<manifest.camera.far);
  for(const range of Object.values(manifest.bounds)) assert.ok(range[0]<=range[1]);
  for(const e of [manifest.encoding,manifest.detail.encoding,manifest.flash.encoding]) assert.ok(e.min<e.max);
  return true;
}
export function createMonkPublicManifest(full) {
  const result=walk({...full,schema:MONK_PUBLIC_SCHEMA},schema,false);
  validateMonkPublicManifest(result);
  return result;
}
function canonical(value) {
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(value && typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
// Canonical public commitment, deliberately distinct from original-manifest byte SHA.
export function monkPublicManifestSha256(manifest) {
  validateMonkPublicManifest(manifest);
  return createHash('sha256').update(canonical(manifest)).digest('hex');
}
