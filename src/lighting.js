import * as T from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {createRoomMirrors,MirrorOptics} from './mirror-optics.js';

// Reflections stay in linear, pre-exposed scene units. The camera's lens and
// display curve are applied once, after reflection and temporal integration.
export const mirrorShader={
  uniforms:{tDiffuse:{value:null},color:{value:new T.Color(1,1,1)},textureMatrix:{value:new T.Matrix4()}},
  vertexShader:'uniform mat4 textureMatrix;varying vec4 reflectedUV;void main(){reflectedUV=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform sampler2D tDiffuse;varying vec4 reflectedUV;void main(){gl_FragColor=vec4(texture2DProj(tDiffuse,reflectedUV).rgb*.92,1.);}',
};

export function roomLighting(owner,source){
  const {world,renderer,anchor}=owner;
  const materials=new Set();
  source.traverse(o=>{
    if(!o.isMesh)return;
    o.castShadow=true;o.receiveShadow=true;
    for(const m of [o.material].flat()){
      if(!m.isMeshStandardMaterial)continue;
      materials.add(m);
      // Legacy Cycles glossy shaders were exported as diffuse materials.
      if(m.name.endsWith('-web')&&/metal|silver|brass|chrome|steel|copper/i.test(m.name)){m.metalness=.8;m.roughness=.3;}
      if(m.transparent)o.castShadow=false;
    }
  });
  // Capture diffuse room radiance separately from view-dependent glossy lobes.
  // This keeps imported physical shaders out of the probe's six camera passes.
  const captureMaterials=new Map(),restore=[];
  source.traverse(o=>{
    if(!o.isMesh)return;
    const capture=m=>{
      if(!captureMaterials.has(m))captureMaterials.set(m,new T.MeshLambertMaterial({color:m.color,map:m.map,lightMap:m.lightMap,lightMapIntensity:m.lightMapIntensity,emissive:m.emissive,emissiveMap:m.emissiveMap,emissiveIntensity:m.emissiveIntensity,side:m.side,transparent:m.transparent||m.transmission>0,opacity:m.transmission>0?.12:m.opacity,alphaTest:m.alphaTest,depthWrite:m.transmission>0?false:m.depthWrite}));
      return captureMaterials.get(m);
    };
    restore.push([o,o.material]);o.material=Array.isArray(o.material)?o.material.map(capture):capture(o.material);
  });
  const pmrem=new T.PMREMGenerator(renderer);
  owner.environmentTarget=pmrem.fromScene(world,0,.05,150,{size:128,position:anchor});
  for(const [mesh,material]of restore)mesh.material=material;
  for(const material of captureMaterials.values())material.dispose();
  world.environment=owner.environmentTarget.texture;pmrem.dispose();
  for(const m of materials)m.envMapIntensity=owner.sourceDiffuse?1:.45;
  owner.reflections=createRoomMirrors(owner,source);
  if(owner.reflections.length)owner.mirrorOptics=new MirrorOptics(owner.reflections);
  owner.canvas.dataset.reflections=String(owner.reflections.length);
  owner.canvas.dataset.environment='room-probe';
}

// A depth-matched receiver sits on the source tabletop. Pixels outside that
// surface are rejected, including parts of the plane beyond the table edge.
const receiverVertex='varying float tableZ;varying vec3 tableWorld;void main(){vec4 p=modelViewMatrix*vec4(position,1.);tableZ=-p.z;tableWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*p;}';
const receiverDepth=`
  uniform sampler2D tableDepth;uniform mat4 rayToCapture;uniform vec2 tanHalfFov;uniform vec2 viewShift;uniform vec2 resolution;
  varying float tableZ;varying vec3 tableWorld;
  void matchTable(){vec2 p=gl_FragCoord.xy/resolution;vec4 ray=rayToCapture*vec4((p*2.-1.+viewShift)*tanHalfFov,-1.,0.);
    vec2 uv=ray.xy/ray.w*.5+.5;if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))discard;
    vec2 d=texture2D(tableDepth,uv).rg*255.;float z=(d.x*256.+d.y)/65535.*64./ray.w;if(abs(z-tableZ)>.025)discard;}
`;

export function tabletopLighting(owner,config){
  const {world,fan,plateUniforms:p}=owner;
  const shared={tableDepth:p.depth,rayToCapture:p.rayToCapture,tanHalfFov:p.tanHalfFov,viewShift:p.viewShift,resolution:owner.uniforms.resolution};
  const y=config.position[1]+.002;
  const reflection=new Reflector(new T.PlaneGeometry(1.2,1.2),{textureWidth:384,textureHeight:384,multisample:0,clipBias:.001,shader:{
    uniforms:{...mirrorShader.uniforms,...shared},
    vertexShader:receiverVertex.replace('void main()', 'uniform mat4 textureMatrix;varying vec4 reflectedUV;void main()').replace('gl_Position=projectionMatrix*p;', 'reflectedUV=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;'),
    fragmentShader:`uniform sampler2D tDiffuse;varying vec4 reflectedUV;${receiverDepth}
      void main(){matchTable();vec2 uv=reflectedUV.xy/reflectedUV.w;vec4 c=vec4(0.);
        for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)c+=texture2D(tDiffuse,uv+vec2(float(x),float(y))/384.*1.5)/9.;
        float facing=abs(normalize(cameraPosition-tableWorld).y);float fresnel=.045+.22*pow(1.-facing,5.);
        gl_FragColor=vec4(c.rgb/max(c.a,.0001),c.a*fresnel);}`,
  }});
  // Reflector clones uniforms; retain the live depth, camera and size bindings.
  Object.assign(reflection.material.uniforms,shared);
  reflection.material.transparent=true;reflection.material.depthWrite=false;
  reflection.position.set(config.position[0],y,config.position[2]);reflection.rotation.x=-Math.PI/2;reflection.renderOrder=1;
  const shadowMaterial=new T.ShadowMaterial({opacity:.32,depthWrite:false});
  shadowMaterial.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,shared);
    shader.vertexShader=shader.vertexShader.replace('void main()', 'varying float tableZ;varying vec3 tableWorld;void main()').replace('#include <project_vertex>','#include <project_vertex>\ntableZ=-mvPosition.z;tableWorld=(modelMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader=receiverDepth+shader.fragmentShader.replace('void main() {','void main() {\nmatchTable();');
  };
  const shadow=new T.Mesh(new T.PlaneGeometry(1.2,1.2),shadowMaterial);shadow.position.copy(reflection.position);shadow.position.y+=.001;shadow.rotation.copy(reflection.rotation);shadow.receiveShadow=true;shadow.renderOrder=2;
  world.add(reflection,shadow);
  const key=config.areaLights?.find(light=>light.radiance>0);
  if(key){
    // Shadow-only key follows the source counter light. Source area lights and
    // HDR continue to supply the fan's actual diffuse and specular radiance.
    const light=new T.DirectionalLight(0xffffff,0);light.position.fromArray(key.position);light.target.position.fromArray(config.position);
    light.castShadow=true;light.shadow.mapSize.set(512,512);Object.assign(light.shadow.camera,{left:-.8,right:.8,top:.8,bottom:-.8,near:.05,far:12});light.shadow.bias=-.0002;light.shadow.normalBias=.002;
    world.add(light,light.target);
  }
  fan.group.traverse(o=>{if(o.isMesh)o.castShadow=!o.material.transparent&&o.geometry.type!=='TorusGeometry'&&o.geometry.type!=='TubeGeometry';});
  const renderReflection=reflection.onBeforeRender;
  reflection.onBeforeRender=function(renderer,scene,camera){
    // Capture the live subject against transparent clear, leaving the room's
    // baked marble radiance intact beneath its Fresnel-weighted reflection.
    const background=scene.background,clear=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha();
    const hidden=[owner.plateMesh,shadow,...fan.group.children.filter(o=>o.userData.focusable===false)];
    const visible=hidden.map(o=>o.visible);hidden.forEach(o=>o.visible=false);scene.background=null;renderer.setClearColor(0,0);
    renderReflection.call(this,renderer,scene,camera);
    hidden.forEach((o,i)=>o.visible=visible[i]);scene.background=background;renderer.setClearColor(clear,alpha);
  };
  fan.effectBounds=(camera,width,height)=>{
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    const project=p=>{
      if(p.clone().applyMatrix4(camera.matrixWorldInverse).z>=-camera.near)return;
      p.project(camera);const x=(p.x*.5+.5)*width,v=(p.y*.5+.5)*height;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,v);maxY=Math.max(maxY,v);
    };
    const direction=key?new T.Vector3().fromArray(config.position).sub(new T.Vector3().fromArray(key.position)):null;
    // Only the rotor's reflected and projected-shadow footprints change during
    // integration. Static marble, fan body and base retain the initial image.
    for(const x of [-.21,.21])for(const v of [-.21,.21])for(const z of [-.015,.06]){
      const p=new T.Vector3(x,v,z).applyMatrix4(fan.head.matrixWorld),mirror=p.clone();mirror.y=2*y-p.y;project(mirror);
      if(direction&&Math.abs(direction.y)>.0001)project(p.clone().addScaledVector(direction,(y+.001-p.y)/direction.y));
    }
    const pad=Math.ceil(Math.max(width,height)/384*3)+3;
    const x=Math.max(0,Math.floor(minX)-pad),v=Math.max(0,Math.floor(minY)-pad),right=Math.min(width,Math.ceil(maxX)+pad),top=Math.min(height,Math.ceil(maxY)+pad);
    return right>x&&top>v?{x,y:v,width:right-x,height:top-v}:null;
  };
  owner.reflections=[reflection];owner.canvas.dataset.reflections='1';owner.canvas.dataset.environment='source-hdr';
}
