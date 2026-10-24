import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {MONK_DISPLAY_TRANSFORM,validateDisplayTransform,verifiedResource,rgbFloatLutTexture,displayProfileFragment} from '../src/display-profile.js';
import {ev100,resolveExposure} from '../src/camera.js';
import {photoSnapshot} from '../src/photo-snapshot.js';
import {Renderer} from '../src/renderer.js';
import {DISPLAY_PROFILE_ASSETS} from '../src/display-profile-assets.js';
import {DisplayProfileCache} from '../src/display-profile.js';

test('display profiles are explicit, optional and fail closed for unsupported looks',()=>{
  assert.equal(validateDisplayTransform(),null);assert.equal(validateDisplayTransform(null),null);
  assert.deepEqual(validateDisplayTransform(MONK_DISPLAY_TRANSFORM),MONK_DISPLAY_TRANSFORM);
  for(const change of [{version:2},{profile:'other'},{view:'Filmic'},{look:'None'},{gamma:2.2},{exposure:NaN},{exposure:Infinity},{exposure:17}])
    assert.throws(()=>validateDisplayTransform({...MONK_DISPLAY_TRANSFORM,...change}),/Unsupported/);
  const actual=validateDisplayTransform({...MONK_DISPLAY_TRANSFORM,shaderURL:'https://untrusted.invalid'});
  assert.equal(actual.shaderURL,undefined);assert.ok(Object.isFrozen(actual));
});

test('profile bytes are authenticated before parsing or GPU upload',async()=>{
  const bytes=new TextEncoder().encode('known profile'),sha256=createHash('sha256').update(bytes).digest('hex');
  const fetcher=async()=>new Response(bytes);
  assert.deepEqual(new Uint8Array(await verifiedResource('/profile',{bytes:bytes.length,sha256},fetcher)),bytes);
  await assert.rejects(verifiedResource('/profile',{bytes:bytes.length+1,sha256},fetcher),/size mismatch/);
  await assert.rejects(verifiedResource('/profile',{bytes:bytes.length,sha256:'0'.repeat(64)},fetcher),/hash mismatch/);
  await assert.rejects(verifiedResource('/profile',{bytes:0},async()=>new Response('',{status:404})),/404/);
});

test('OCIO RGB float lattice is preserved without transpose, filtering or color decoding',()=>{
  const rgb=Float32Array.from({length:2**3*3},(_,i)=>i/7),texture=rgbFloatLutTexture(rgb.buffer,2);
  for(let i=0;i<8;i++)assert.deepEqual([...texture.image.data.slice(i*4,i*4+4)],[...rgb.slice(i*3,i*3+3),1]);
  assert.deepEqual([texture.image.width,texture.image.height,texture.image.depth],[2,2,2]);
  assert.equal(texture.type,T.FloatType);assert.equal(texture.colorSpace,T.NoColorSpace);
  assert.equal(texture.minFilter,T.NearestFilter);assert.equal(texture.magFilter,T.NearestFilter);
  assert.equal(texture.generateMipmaps,false);assert.equal(texture.flipY,false);assert.equal(texture.wrapR,T.ClampToEdgeWrapping);
  texture.dispose();assert.throws(()=>rgbFloatLutTexture(rgb.buffer,3),/dimensions/);
  rgb[0]=NaN;assert.throws(()=>rgbFloatLutTexture(rgb.buffer,2),/Nonfinite/);
});

test('legacy fragment remains byte-identical; the new transform follows lens, exposure and white balance',async()=>{
  const source=await readFile(new URL('../src/renderer.js',import.meta.url),'utf8');
  const fragment=source.match(/const fragment=`([\s\S]*?)`;/)[1];
  assert.equal(displayProfileFragment(fragment,null),fragment);
  const generated=displayProfileFragment(fragment,{shader:'vec4 monkAgxDisplay(vec4 c){return c;}'});
  assert.ok(generated.indexOf('if(meteringPass)')<generated.indexOf('if(lensOnly)'));
  assert.ok(generated.indexOf('if(lensOnly)')<generated.indexOf('c*=exp2(exposure)/radianceScale'));
  assert.ok(generated.indexOf('float temperature=')<generated.indexOf('monkAgxDisplay(vec4(c*exp2(displayExposureEV)'));
  assert.ok(generated.indexOf('monkAgxDisplay(vec4(c*exp2(displayExposureEV)')<generated.indexOf('c=mix(c*12.92'));
  assert.throws(()=>displayProfileFragment('changed shader',{shader:''}),/insertion/);
});

test('display exposure is independent of photographic EV and metering calibration',()=>{
  const s={mode:'A',autoISO:false,aperture:8,shutter:.25,iso:100,compensation:0,focal:28};
  const r=resolveExposure(s,8);assert.equal(ev100(r.aperture,r.shutter,r.iso),8);
  const gain=2**(8-ev100(r.aperture,r.shutter,r.iso)+MONK_DISPLAY_TRANSFORM.exposure);
  assert.equal(gain,2**-1.5);
  assert.equal(2**(8-ev100(8,.5,100)-1.5)/gain,2);
  assert.deepEqual(resolveExposure(s,8),r); // The look never enters the meter.
});

test('capture records the display profile without changing camera metadata or legacy snapshots',()=>{
  const input={settings:{iso:100},resolved:{iso:100},scene:{id:'fixture',name:'Fixture'},renderer:{},simulationTime:0,width:10,height:10};
  assert.equal(photoSnapshot(input).rendering.displayTransform,undefined);
  const rendering={...MONK_DISPLAY_TRANSFORM,profileSha256:'a'.repeat(64)};
  const shot=photoSnapshot({...input,renderer:{displayTransform:rendering}});
  assert.deepEqual(shot.rendering.displayTransform,rendering);assert.equal(shot.resolved.iso,100);
  rendering.exposure=0;assert.equal(shot.rendering.displayTransform.exposure,-1.5);
});

test('legacy and same-profile scene switches retain their compiled post material',()=>{
  let disposed=0;const original={dispose(){disposed++;}};
  const owner={displayProfileResource:null,displayProfileUniformNames:[],displayTransform:null,uniforms:{},postScene:{children:[{material:original}]},canvas:{dataset:{}}};
  const bind=value=>Renderer.prototype.setDisplayProfile.call(owner,value);
  bind(null);bind(null);assert.equal(owner.postScene.children[0].material,original);assert.equal(disposed,0);
  const resource={shader:'vec4 monkAgxDisplay(vec4 c){return c;}',uniforms:{fixtureSampler:{value:null}},profileSha256:'a'.repeat(64)};
  bind({resource,transform:MONK_DISPLAY_TRANSFORM});const active=owner.postScene.children[0].material;
  assert.equal(disposed,1);assert.notEqual(active,original);
  bind({resource,transform:{...MONK_DISPLAY_TRANSFORM,exposure:-1}});
  assert.equal(owner.postScene.children[0].material,active);assert.equal(owner.uniforms.displayExposureEV.value,-1);
  bind(null);const restored=owner.postScene.children[0].material;assert.notEqual(restored,active);
  assert.equal(owner.uniforms.fixtureSampler,undefined);assert.equal(owner.uniforms.displayExposureEV,undefined);assert.equal(owner.displayTransform,null);
  bind(null);assert.equal(owner.postScene.children[0].material,restored);restored.dispose();
});

test('pinned resource cache shares valid LUTs, retries a rejected load, and validates fixtures',async()=>{
  let fail=true,requests=0;
  const fetcher=async url=>{requests++;if(fail)return new Response('',{status:503});return new Response(await readFile(new URL('../public/'+url,import.meta.url)));};
  const cache=new DisplayProfileCache('',fetcher);
  assert.equal(await cache.load(),null);assert.equal(requests,0);
  await assert.rejects(cache.load(MONK_DISPLAY_TRANSFORM),/503/);fail=false;
  const [a,b]=await Promise.all([cache.load(MONK_DISPLAY_TRANSFORM),cache.load(MONK_DISPLAY_TRANSFORM)]);
  assert.equal(a.resource,b.resource);assert.equal(requests,5); // One failed request, then profile + shader + two LUTs.
  const profile=a.resource.profile,reference=await readFile(new URL('./fixtures/display-profile/cpu-vectors.json',import.meta.url));
  assert.equal(reference.length,profile.referenceFixtures.bytes);
  assert.equal(createHash('sha256').update(reference).digest('hex'),profile.referenceFixtures.sha256);
  assert.equal(a.resource.profileSha256,DISPLAY_PROFILE_ASSETS[MONK_DISPLAY_TRANSFORM.profile].sha256);
  assert.equal(profile.displayExposureBaked,false);assert.equal(profile.inputSpace,'scene-linear Rec.709');assert.equal(profile.outputSpace,'display-linear Rec.709');
  a.resource.dispose();
});
