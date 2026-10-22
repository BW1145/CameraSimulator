import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {softDiscArea,createForegroundDirections,minimumPackedDepth,projectedMinimumDepth,minimumWorldBoxDepth,minimumSphereDepth,foregroundSupportRadius} from '../src/lens-support.js';
import {PlateRenderer} from '../src/plate-renderer.js';

const parameters={focus:1.4,focal:24.9136037681,aperture:1.4,sensorWidth:36,width:2048,limit:2048*.08,nearClip:.05};
const close=(a,b,epsilon=1e-10)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const axialMatrix=new T.PerspectiveCamera(50,1,.05,100).projectionMatrix;

function ownerFixture(){
  const camera=new T.PerspectiveCamera(50,1,.05,100);camera.updateMatrixWorld(true);
  return Object.assign(Object.create(PlateRenderer.prototype),{
    camera,plate:{minimumDepth:.9},filmWidth:36,ballGroup:{visible:false},scene:{ballDistance:1},
    plateUniforms:{rayToCapture:{value:axialMatrix},tanHalfFov:{value:new T.Vector2(.6,.4)},viewShift:{value:new T.Vector2()}},
    uniforms:Object.fromEntries(Object.entries({focus:1.4,focal:parameters.focal,aperture:1.4,resolution:new T.Vector2(2048,858),lensRadiusLimit:163.84,foregroundSupportRadius:-1}).map(([key,value])=>[key,{value}]))
  });
}

test('packed depth minimum includes zero, rejects invalid arrays, and filters only explicit optical masks',()=>{
  const data=new Uint8Array([8,128,0,255,1,3,255,255,0,0,0,255]);
  assert.equal(minimumPackedDepth(data),0);
  close(minimumPackedDepth(data.subarray(0,8)),259/65535*64);
  close(minimumPackedDepth(data,64,2),259/65535*64);
  assert.equal(minimumPackedDepth(new Uint8Array([0,0,0,255]),64,2),Infinity);
  assert.equal(minimumPackedDepth([]),null);assert.equal(minimumPackedDepth([0,1]),null);
  assert.equal(minimumPackedDepth([NaN,1,0,255]),null);
});

test('four viewport corners conservatively bound source axial depths after rotation and detail shifts',()=>{
  for(const yaw of [-.3,0,.25])for(const pitch of [-.2,.1])for(const detail of [false,true]){
    const rotation=new T.Matrix4().makeRotationFromEuler(new T.Euler(pitch,yaw,.05,'YXZ'));
    const transform=axialMatrix.clone().multiply(rotation);
    const tan=new T.Vector2(detail?.17:.6,detail?.12:.4),shift=new T.Vector2(detail?1.4:.1,detail?-.8:0);
    const minimum=projectedMinimumDepth(.8,transform,tan,shift,.05);
    assert.ok(minimum>0);
    for(let ix=0;ix<=20;ix++)for(let iy=0;iy<=20;iy++){
      const ray=new T.Vector4((ix/10-1+shift.x)*tan.x,(iy/10-1+shift.y)*tan.y,-1,0).applyMatrix4(transform);
      assert.ok(minimum<=.8/ray.w+1e-12);
    }
  }
  assert.equal(projectedMinimumDepth(0,axialMatrix,new T.Vector2(.6,.4),new T.Vector2(),.05),.05);
  assert.equal(projectedMinimumDepth(.8,new T.Matrix4(),new T.Vector2(.6,.4),new T.Vector2(),.05),null);
  assert.equal(projectedMinimumDepth(undefined,axialMatrix,new T.Vector2(.6,.4),new T.Vector2(),.05),null);
});

test('world bounds cover transformed box corners and spheres, including scaled camera transforms',()=>{
  const box=new T.Box3(new T.Vector3(-1,-.5,-3),new T.Vector3(1,.5,-2));
  const view=new T.Matrix4().makeRotationY(.4).multiply(new T.Matrix4().makeTranslation(0,0,-.1));
  const minimum=minimumWorldBoxDepth(box,view);
  for(let i=0;i<=10;i++)for(let j=0;j<=10;j++)for(let k=0;k<=10;k++){
    const point=new T.Vector3(-1+i/5,-.5+j/10,-3+k/10).applyMatrix4(view);
    assert.ok(minimum<=-point.z+1e-12);
  }
  const center=new T.Vector3(0,0,-2),scaled=new T.Matrix4().makeScale(2,3,4);
  close(minimumSphereDepth(center,.2,scaled),7.2);
  assert.equal(minimumWorldBoxDepth(new T.Box3(),view),null);
});

test('support retains the photographic formula, near safety cap, and full/detail pixel scale',()=>{
  const radius=foregroundSupportRadius(.9,parameters);
  // Conservative margin adds ~0.016 px, not a change of aperture/focus controls.
  assert.ok(radius>=5.0949&&radius<5.12);
  close(foregroundSupportRadius(.9,{...parameters,aperture:5.6}),radius/4);
  close(foregroundSupportRadius(.9,{...parameters,width:512,sensorWidth:9}),radius);
  assert.equal(foregroundSupportRadius(3,parameters),0);
  assert.equal(foregroundSupportRadius(0,parameters),parameters.limit);
  assert.equal(foregroundSupportRadius(null,parameters),-1);
  assert.equal(foregroundSupportRadius(.9,{...parameters,aperture:0}),-1);
});

test('plate integration includes every practice-ball shutter sample plus the flash end position',()=>{
  const owner=ownerFixture(),visited=[];owner.plate.minimumDepth=4;owner.ballGroup.visible=true;
  owner.ballWorld=time=>{visited.push(time);return new T.Vector3(0,0,-time);};
  owner.updateForegroundSupport([{time:1.1},{time:.9}],.7);
  assert.deepEqual(visited,[1.1,.9,.7]);
  close(owner.uniforms.foregroundSupportRadius.value,foregroundSupportRadius(.7-.055,parameters));
  owner.ballGroup.visible=false;owner.updateForegroundSupport([{time:.1}],.1);
  assert.equal(owner.uniforms.foregroundSupportRadius.value,0);
});

test('plate integration includes the whole fan and a phase-independent rotor envelope',()=>{
  const owner=ownerFixture();owner.plate.minimumDepth=4;
  const group=new T.Group(),head=new T.Group();group.position.z=-1;head.rotation.y=.3;group.add(head);
  const mesh=new T.Mesh(new T.BoxGeometry(.1,.1,.1),new T.MeshBasicMaterial());
  mesh.position.set(0,-.5,.45);group.add(mesh);owner.fan={group,head};
  owner.updateForegroundSupport([{time:0}],0);
  // A nearer static base/stem is included, unlike a head-only screen bound.
  assert.ok(owner.uniforms.foregroundSupportRadius.value>=foregroundSupportRadius(.5,parameters));
  group.remove(mesh);owner.updateForegroundSupport([{time:0}],0);
  const value=owner.uniforms.foregroundSupportRadius.value;
  // Rotating blade points stay inside the full head-local radius envelope.
  for(let i=0;i<100;i++){
    const angle=i*Math.PI*2/100;
    const point=new T.Vector3(.2*Math.cos(angle),.2*Math.sin(angle),.05).applyMatrix4(head.matrixWorld);
    assert.ok(value>=foregroundSupportRadius(-point.z,parameters));
  }
  owner.fan.head=null;owner.updateForegroundSupport([{time:0}],0);
  assert.equal(owner.uniforms.foregroundSupportRadius.value,-1);
  mesh.geometry.dispose();mesh.material.dispose();
});

test('valid optical depths can enlarge support; unmasked/uncertified maps never manufacture a tight bound',()=>{
  const owner=ownerFixture();owner.plate.optical={minimumDepth:.6};owner.updateForegroundSupport([],0);
  close(owner.uniforms.foregroundSupportRadius.value,foregroundSupportRadius(.6,parameters));
  for(const unsafe of [0,.05]){owner.plate.optical.minimumDepth=unsafe;owner.updateForegroundSupport([],0);assert.equal(owner.uniforms.foregroundSupportRadius.value,-1);}
  owner.plate.optical.minimumDepth=Infinity;owner.updateForegroundSupport([],0);
  close(owner.uniforms.foregroundSupportRadius.value,foregroundSupportRadius(.9,parameters));
  owner.plate.minimumDepth=undefined;owner.updateForegroundSupport([],0);
  assert.equal(owner.uniforms.foregroundSupportRadius.value,-1);
});

test('selected depth minima are cached and replaced atomically on high-resolution depth promotion',async t=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(){
    let image;return {width:0,height:0,getContext(){return {drawImage(value){image=value;},getImageData(){return {data:image.pixels};}};}};
  }}});
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete globalThis.document;});
  const requests=[];
  t.mock.method(T.TextureLoader.prototype,'loadAsync',async url=>{
    requests.push(url);const width=url.includes('detail')?4:2,texture=new T.Texture();
    const pixels=new Uint8ClampedArray(width*4),code=url.includes('detail-depth')?700:url.includes('optical')?600:1200;
    for(let i=0;i<width;i++)pixels.set([code>>8,code&255,url.includes('optical')&&i===0?255:0,255],i*4);
    texture.image={width,height:1,pixels};return texture;
  });
  const owner=ownerFixture();
  Object.assign(owner,{
    cache:new Map(),pendingLayers:0,moveVersion:0,packBase:'/fixture/',canvas:{width:2,dataset:{}},
    renderer:{capabilities:{getMaxAnisotropy:()=>1,maxTextureSize:4096}},
    pack:{camera:{near:.05},referenceFocal:parameters.focal,encoding:{min:-16,max:8},views:[{
      id:'center',file:'base.webp',depth:'base-depth.png',opticalDepth:'optical.png',
      detailFile:'detail.webp',detailDepth:'detail-depth.png',detailWidth:4,matrix:new T.Matrix4().toArray(),position:[0,0,0]
    }]},loadSubjectEnvironment:()=>Promise.resolve(null),applySubjectLighting(){},trimDecodedCache(){}
  });
  for(const name of ['near','image','depth','flashImage','flashStrength'])owner.plateUniforms[name]={value:null};
  owner.uniforms.nearClip={value:.05};
  await owner.selectPosition('center');const resource=owner.plate;
  close(resource.minimumDepth,1200/65535*64);close(resource.optical.minimumDepth,600/65535*64);
  await owner.selectPosition('center');assert.equal(owner.plate,resource);
  assert.equal(requests.filter(url=>url.endsWith('/base-depth.png')).length,1);
  await owner.ensureDetail({focal:parameters.focal},100);
  assert.equal(owner.plate,resource);close(resource.minimumDepth,700/65535*64);
  assert.equal(owner.plateUniforms.depth.value,resource.depth);assert.equal(resource.width,4);
  resource.image.dispose();resource.depth.dispose();resource.optical.depth.dispose();
});


test('all seven shipped barber optical packs select the certified path rather than legacy fallback',async()=>{
  const root=new URL('../public/scenes/barbershop-plates/',import.meta.url),pack=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
  assert.equal(pack.views.length,7);
  for(const entry of pack.views){
    assert.ok(entry.opticalDepth,entry.id);
    const owner=ownerFixture();owner.camera.near=entry.near??pack.camera.near;
    owner.camera.matrixWorld.fromArray(entry.cameraMatrix);owner.camera.matrixWorldInverse.copy(owner.camera.matrixWorld).invert();
    owner.plateUniforms.rayToCapture.value=new T.Matrix4().fromArray(entry.matrix).multiply(owner.camera.matrixWorld);
    owner.uniforms.focus.value=3;owner.uniforms.focal.value=pack.referenceFocal;
    const pixels=async file=>sharp(new URL(file,root).pathname).ensureAlpha().raw().toBuffer();
    owner.plate.minimumDepth=minimumPackedDepth(await pixels(entry.depth));
    owner.plate.optical={minimumDepth:minimumPackedDepth(await pixels(entry.opticalDepth),64,2)};
    assert.ok(owner.plate.optical.minimumDepth>owner.camera.near,entry.id);
    owner.updateForegroundSupport([],0);
    assert.ok(Number.isFinite(owner.uniforms.foregroundSupportRadius.value)&&owner.uniforms.foregroundSupportRadius.value>=0,`${entry.id} must use the bounded path`);
  }
});


test('foreground azimuths use nested base-2 directions and exact antipodal pairs at every budget',()=>{
  const all=createForegroundDirections(),prefix=createForegroundDirections(16);
  assert.equal(all.length,48);
  const expected=[0,Math.PI/2,Math.PI/4,3*Math.PI/4,Math.PI/8,5*Math.PI/8];
  for(let i=0;i<all.length;i++){
    close(all[i].length(),1);
    const opposite=all[i].clone().negate();close(all[i].clone().add(opposite).length(),0);
    if(i<expected.length){close(all[i].x,Math.cos(expected[i]));close(all[i].y,Math.sin(expected[i]));}
    if(i<prefix.length){assert.notEqual(all[i],prefix[i]);assert.deepEqual(all[i].toArray(),prefix[i].toArray());}
  }
});


test('soft-disc radial primitive is continuous, integrates coverage, and preserves annular mass',()=>{
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  for(const R of [1.1,5.095,20]){
    const total=R*R+.05;
    close(softDiscArea(0,R),0);close(softDiscArea(R+.5,R),total);
    for(const edge of [R-.5,R+.5]){
      assert.ok(Math.abs(softDiscArea(edge-1e-8,R)-softDiscArea(edge+1e-8,R))<1e-5);
    }
    for(const r of [R-.3,R,R+.3,R+.5]){
      // Independent composite Simpson integral of the actual coverage function.
      const n=16384,h=r/n,f=x=>2*x*(1-smooth(R-.5,R+.5,x));
      let sum=f(0)+f(r);for(let i=1;i<n;i++)sum+=(i%2?4:2)*f(i*h);
      close(softDiscArea(r,R),sum*h/3,1e-7);
      if(r<R+.5){const eps=1e-6,derivative=(softDiscArea(r+eps,R)-softDiscArea(r-eps,R))/(2*eps);close(derivative,f(r),1e-6);}
    }
    for(const S of [R,Math.min(163.84,R*3),Math.min(163.84,R*8),163.84]){
      const pairs=S<16?16:S<64?32:48,search=S+.5;let mass=0;
      for(let j=0;j<pairs;j++){
        const lo=(j/pairs)**2*search,hi=((j+1)/pairs)**2*search;
        const pairedWeight=(softDiscArea(hi,R)-softDiscArea(lo,R))/total;
        assert.ok(pairedWeight>=0);mass+=pairedWeight;
      }
      close(mass,1);
    }
  }
});
