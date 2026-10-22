import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {roomLighting,sourceMatteMaterial} from './lighting.js';
import {reflectPoint} from './mirror-optics.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {decodeRadianceTexture} from './linear-radiance.js';
import {createForegroundDirections} from './lens-support.js';

const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const fragment=`
precision highp float;
varying vec2 vUv;
uniform sampler2D plate;uniform sampler2D sceneDepth;
uniform vec2 foregroundDirections[48];
uniform float lensRadiusLimit;uniform float foregroundSupportRadius;uniform vec2 resolution;uniform vec2 pixelOrigin;uniform float focus;uniform float focal;uniform float aperture;
uniform float exposure;uniform float iso;uniform float wb;uniform float time;uniform bool zebra;
uniform float sensorWidth;uniform float nearClip;uniform float farClip;uniform float radianceScale;
uniform bool meteringPass;uniform bool lensOnly;uniform bool skipLens;
uniform bool agx;uniform bool linearDepth;
#include <tonemapping_pars_fragment>
float depthAt(vec2 p){float d=texture2D(sceneDepth,p).x;return linearDepth?d:nearClip*farClip/(farClip-(farClip-nearClip)*d);}
float coc(float z){
  float f=focal/1000.;
  return min(lensRadiusLimit,abs(f*f*(z-focus)/(aperture*max(.05,z)*max(.01,focus-f)))*1000./sensorWidth*resolution.x*.5);
}
// Exact radial integral only; depth/color within an angular stratum are still
// point samples. Keep this polynomial matched to lens-support.js softDiscArea.
float softDiscArea(float r,float R){
  float a=R-.5;
  if(r<=a)return r*r;
  if(r>=R+.5)return R*R+.05;
  float t=r-a;float t2=t*t;float t3=t2*t;float t4=t2*t2;float t5=t4*t;
  return a*a+2.*(a*(t-t3+.5*t4)+(.5*t2-.75*t4+.4*t5));
}
float random(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  // The meter consumes linear HDR light, before lens effects or display encoding.
  if(meteringPass){gl_FragColor=vec4(texture2D(plate,vUv).rgb/radianceScale,1.);return;}
  float z=depthAt(vUv);float radius=coc(z);
  vec3 center=texture2D(plate,vUv).rgb;
  vec3 c=center;float count=1.;
  if(!skipLens){
  // A nonnegative support is certified from the current plate and live subjects.
  // Legacy geometry mode retains its prior kernel until it has a depth bound.
  bool boundedForeground=foregroundSupportRadius>=0.;
  bool splitForeground=boundedForeground&&z>=focus&&foregroundSupportRadius>1.;
  // A sharp foreground surface occludes a defocused background. Use a soft,
  // relative depth comparison instead of a fixed 10 cm discontinuity.
  if(radius>.35){
    for(int i=0;i<32;i++){
      float index=boundedForeground?floor(float(i)*.5):float(i);
      float angle=index*2.399963;
      float r=sqrt((index+.5)/(boundedForeground?16.:32.));
      float direction=boundedForeground?(mod(float(i),2.)*2.-1.):1.;
      vec2 offset=direction*vec2(cos(angle),sin(angle))*r*radius;
      vec2 sampleUV=clamp(vUv+offset/resolution,vec2(0.),vec2(1.));
      float sampleZ=depthAt(sampleUV);float sampleRadius=coc(sampleZ);
      float separation=smoothstep(max(.02,z*.01),max(.04,z*.025),abs(sampleZ-z));
      float coverage=smoothstep(length(offset)-.75,length(offset)+.75,sampleRadius);
      float weight=sampleZ<z?mix(1.,coverage,separation):mix(1.,smoothstep(.35,2.,radius),separation);
      // This near layer is composited separately, never counted twice.
      if(splitForeground&&sampleZ<min(z,focus)-.02&&sampleRadius>1.)weight=0.;
      c+=texture2D(plate,sampleUV).rgb*weight;count+=weight;
    }
  }
  c/=count;
  if(splitForeground){
    vec3 foreground=vec3(0.);float coverage=0.;
    float support=min(lensRadiusLimit,foregroundSupportRadius);
    // CoC retains its safety cap; the extra half pixel includes the complete
    // antialiased disc edge rather than truncating it at its 50% boundary.
    float searchRadius=support+.5;
    float pairs=support<16.?16.:(support<64.?32.:48.);
    // Quadratic radial strata keep small near discs represented even when
    // another surface makes the certified global support much larger.
    // Nested base-2 azimuths and antipodes avoid an unpaired directional halo.
    for(int i=0;i<96;i++){
      if(float(i)>=2.*pairs)break;
      int index=i/2;float t=(float(index)+.5)/pairs;
      float direction=mod(float(i),2.)*2.-1.;
      vec2 offset=direction*foregroundDirections[index]*t*t*searchRadius;
      vec2 p=clamp(vUv+offset/resolution,vec2(0.),vec2(1.));
      float sampleZ=depthAt(p);float sampleRadius=coc(sampleZ);
      if(sampleZ<min(z,focus)-.02&&sampleRadius>1.){
        float lo=float(index)/pairs;float hi=(float(index)+1.)/pairs;
        // Integrate the soft-disc area across the complete radial stratum.
        // This avoids support-phase energy loss; angular/depth placement stays
        // a finite-sample approximation, not an exact optical convolution.
        float area=softDiscArea(hi*hi*searchRadius,sampleRadius)-softDiscArea(lo*lo*searchRadius,sampleRadius);
        float w=max(0.,area)/((sampleRadius*sampleRadius+.05)*2.);
        foreground+=texture2D(plate,p).rgb*w;coverage+=w;
      }
    }
    if(coverage>0.)c=mix(c,foreground/coverage,clamp(coverage,0.,1.));
  }
  // Foreground coverage is gathered independently of the centre CoC, so a
  // defocused near silhouette can soften into an otherwise focused background.
  // Radially concentrated taps retain small discs without a discontinuous
  // neighbour-probe gate. A soft disc edge suppresses sparse-sample rings.
  if(!boundedForeground&&z>=focus){
    vec3 foreground=vec3(0.);float coverage=0.;
    float searchRadius=lensRadiusLimit;
    for(int i=0;i<24;i++){
      float angle=float(i)*2.399963;float r=(float(i)+.5)/24.;
      vec2 offset=vec2(cos(angle),sin(angle))*r*searchRadius;
      vec2 p=clamp(vUv+offset/resolution,vec2(0.),vec2(1.));
      float sampleZ=depthAt(p);float sampleRadius=coc(sampleZ);
      if(sampleZ<min(z,focus)-.02 && sampleRadius>1.){
        float distance=length(offset);
        float w=1.-smoothstep(sampleRadius*.65,sampleRadius+.75,distance);
        // Importance correction: taps are uniform in radius, not disc area.
        w*=2.*r*searchRadius*searchRadius/max(1.,sampleRadius*sampleRadius);
        foreground+=texture2D(plate,p).rgb*w;coverage+=w;
      }
    }
    if(coverage>0.)c=mix(c,foreground/coverage,clamp(coverage/24.,0.,1.));
  }
  }
  if(lensOnly){gl_FragColor=vec4(c,1.);return;}
  // Restore pre-exposed scene units only after all HalfFloat intermediates.
  c*=exp2(exposure)/radianceScale;
  float temperature=(wb-5000.)/3000.;c*=vec3(exp(temperature*.32),1.,exp(-temperature*.32));
  // Filmic highlight shoulder, applied after photographic exposure.
  if(!meteringPass)c=agx?AgXToneMapping(c):(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);
  c=max(c,vec3(0.));
  c=mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));
  bool clipped=max(c.r,max(c.g,c.b))>=.995;
  c+=(random(gl_FragCoord.xy+pixelOrigin+floor(time*30.))-.5)*.003*sqrt(iso/100.);
  if(zebra&&clipped&&mod(gl_FragCoord.x+pixelOrigin.x+gl_FragCoord.y+pixelOrigin.y,12.)<5.)c=vec3(1.,.1,.1);
  gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;

export function disposeScene(scene){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  scene.traverse(o=>{o.shadow?.map?.dispose();if(o.geometry)geometries.add(o.geometry);for(const m of [o.material].flat().filter(Boolean)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}

export class Renderer {
  constructor(canvas){
    this.canvas=canvas;
    this.sourceView=new URLSearchParams(location.search).get('view')==='source';
    this.renderer=new T.WebGLRenderer({canvas,antialias:false,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=T.LinearSRGBColorSpace;this.renderer.toneMapping=T.NoToneMapping;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.camera=new T.PerspectiveCamera(50,1.5,.03,150);
    this.raycaster=new T.Raycaster();this.anchor=new T.Vector3();this.anchorRotation=new T.Quaternion();
    this.target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthTexture:new T.DepthTexture(1,1,T.UnsignedIntType)});
    // The scene is drawn offscreen: default-framebuffer antialiasing cannot help.
    // Resolve both colour and depth so the lens pass sees the same geometry.
    const gl=this.renderer.getContext();
    const supported=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES);
    this.target.samples=Math.max(0,...Array.from(supported).filter(n=>n<=4));
    this.target.resolveDepthBuffer=true;
    canvas.dataset.samples=String(this.target.samples);
    this.analysisTarget=new T.WebGLRenderTarget(1,1,{type:T.UnsignedByteType,depthBuffer:false});
    this.meterTarget=new T.WebGLRenderTarget(1,1,{type:T.FloatType,depthBuffer:false});
    this.meterSceneTarget=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthTexture:new T.DepthTexture(1,1,T.UnsignedIntType)});
    this.uniforms=Object.fromEntries(Object.entries({plate:this.target.texture,sceneDepth:this.target.depthTexture,linearDepth:false,resolution:new T.Vector2(1,1),pixelOrigin:new T.Vector2(),lensRadiusLimit:.08,foregroundSupportRadius:-1,foregroundDirections:createForegroundDirections(),focus:3,focal:35,aperture:4,exposure:0,iso:200,wb:5000,time:0,zebra:false,sensorWidth:36,nearClip:.03,farClip:150,radianceScale:1,meteringPass:false,lensOnly:false,skipLens:false,agx:false,toneMappingExposure:1}).map(([key,value])=>[key,{value}]));
    this.postScene=new T.Scene();this.postCamera=new T.Camera();
    this.postScene.add(new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:this.uniforms,depthTest:false,depthWrite:false})));
    this.loadVersion=0;
  }
  async load(scene,onProgress){
    const version=++this.loadVersion;
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf=await loader.loadAsync(`${import.meta.env.BASE_URL}scenes/${scene.id}/scene.glb`,e=>onProgress(e.loaded,e.total));
    const baked=new Set();gltf.scene.traverse(o=>{for(const m of [o.material].flat().filter(Boolean))if(m.userData.bakedIndirect||m.userData.bakedDiffuse)baked.add(m);});
    const maps=new Map(),sourceDiffuse=[...baked].some(m=>m.userData.bakedDiffuse);
    await Promise.all([...baked].map(async m=>{
      const file=m.userData.bakedDiffuse||m.userData.bakedIndirect;
      if(!maps.has(file)){
        const encoding=m.userData.bakedDiffuseEncoding;
        const task=(m.userData.bakedDiffuse&&!encoding?new HDRLoader():new T.TextureLoader()).loadAsync(`${import.meta.env.BASE_URL}scenes/${scene.id}/${file}`);
        maps.set(file,encoding?task.then(texture=>decodeRadianceTexture(texture,encoding,Math.min(4,this.renderer.capabilities.getMaxAnisotropy()))):task);
      }
      m.lightMap=(await maps.get(file)).clone();
      m.lightMap.channel=m.userData.bakedDiffuseUV??m.map?.channel??m.userData.bakedIndirectUV??1;m.lightMapIntensity=Math.PI;
      if(m.userData.bakedDiffuse)m.lightMap.flipY=false;
      const coordinateMap=m.userData.bakedDiffuse?(m.roughnessMap||m.map):m.map;
      if(coordinateMap){coordinateMap.updateMatrix();m.lightMap.matrixAutoUpdate=false;m.lightMap.matrix.copy(coordinateMap.matrix);}
      if(m.userData.bakedDiffuseMatte){m.roughnessMap=null;m.roughness=1;}
      // Source diffuse atlases contain static direct and indirect light.
      // Flash remains dynamic; the room probe supplies environment specular.
      m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>','irradiance = vec3(0.0);\n#include <lights_fragment_maps>\niblIrradiance = vec3(0.0);');};
      m.customProgramCacheKey=()=> 'baked-indirect-v1';
    }));
    if(version!==this.loadVersion){disposeScene(gltf.scene);return false;}
    const matte=new Map();
    const material=m=>{if(!m.userData.bakedDiffuseMatte)return m;if(!matte.has(m))matte.set(m,sourceMatteMaterial(m));return matte.get(m);};
    gltf.scene.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(material):material(o.material);});
    for(const original of matte.keys())original.dispose();
    this.sourceDiffuse=sourceDiffuse;
    this.releaseLighting();if(this.world)disposeScene(this.world);
    this.scene=scene;this.restoredLighting=baked.size>0;
    const lighting=scene.bakedLighting??{};
    this.exposureOffset=this.sourceDiffuse?0:this.restoredLighting?(lighting.exposureOffset??0):0;
    this.world=new T.Scene();this.world.background=new T.Color('#b5c2c9');
    const source=gltf.scene;source.updateMatrixWorld(true);
    const cam=gltf.cameras.find(c=>c.name===scene.camera)||gltf.cameras[0];
    if(!cam)throw Error('场景缺少拍摄机位。');
    cam.getWorldPosition(this.anchor);cam.getWorldQuaternion(this.anchorRotation);
    this.nativeCamera={fov:cam.fov,aspect:cam.aspect,referenceFocal:18.8027323};
    // The source room deliberately puts its camera behind the foreground wall.
    // Its 1.1 m native near plane is part of the shot, not missing geometry.
    this.camera.near=this.sourceView?cam.near:.03;this.camera.far=this.sourceView?cam.far:150;
    this.uniforms.nearClip.value=this.camera.near;this.uniforms.farClip.value=this.camera.far;
    if(!this.sourceView)this.anchor.add(new T.Vector3(0,scene.startUp||0,-(scene.startForward||0)).applyQuaternion(this.anchorRotation));
    this.canvas.dataset.view=this.sourceView?'source':'free';
    this.world.add(source);
    // Preserve source keys; the local room probe supplies reflected radiance.
    source.traverse(o=>{
      // glTF punctual lights are photometric (candela). The source bake is
      // radiometric; use one unit conversion, preserving original light ratios.
      if(o.isLight){o.intensity=this.sourceDiffuse?0:this.restoredLighting?o.intensity*(lighting.lightScale??(1/683)):Math.min(o.intensity,scene.lightCap??30);if(o.intensity===0)o.visible=false;}
      if(o.isMesh){o.frustumCulled=true;for(const m of [o.material].flat()){
        o.castShadow=this.restoredLighting;o.receiveShadow=this.restoredLighting;
        if(!this.restoredLighting&&m.transmission>0){m.transmission=0;m.opacity=.22;m.transparent=true;m.depthWrite=false;}
        if(m.userData.cameraInvisible){m.colorWrite=false;m.depthWrite=false;}
        m.envMapIntensity=.35;
      }}
    });
    // Bound shadow cost by choosing the strongest original directional/spot keys.
    const keys=[];source.traverse(o=>{if(o.isSpotLight||o.isDirectionalLight)keys.push(o);});
    if(this.restoredLighting&&!this.sourceDiffuse)keys.sort((a,b)=>b.intensity-a.intensity).slice(0,2).forEach(light=>{light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.normalBias=.025;light.shadow.bias=-.0001;});
    const fill=new T.HemisphereLight(0xdceaff,0x807060,this.sourceDiffuse?0:this.restoredLighting ? (lighting.fill??0) : (scene.fill??1.5)*.7);fill.visible=fill.intensity>0;this.world.add(fill);
    const sun=new T.DirectionalLight(0xffead1,this.sourceDiffuse?0:this.restoredLighting ? (lighting.sunlight??0) : (scene.sunlight??1));sun.position.set(-3,8,5);this.world.add(sun);
    sun.visible=sun.intensity>0;
    if(!this.restoredLighting){
      sun.target.position.copy(this.anchor).add(new T.Vector3(0,0,-3).applyQuaternion(this.anchorRotation));sun.position.copy(sun.target.position).add(new T.Vector3(-3,8,5));this.world.add(sun.target);
      sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:30});sun.shadow.bias=-.0002;sun.shadow.normalBias=.015;
    }
    roomLighting(this,source);
    this.flashLight=new T.SpotLight(0xffffff,0,25,1.2,.15,2);this.world.add(this.flashLight,this.flashLight.target);
    this.flashLight.shadow.mapSize.set(512,512);this.flashLight.shadow.camera.near=.05;this.flashLight.shadow.normalBias=.008;
    this.ballGroup=new T.Group();this.world.add(this.ballGroup);
    const ballGeometry=new T.SphereGeometry(.12,20,12);
    this.balls=Array.from({length:24},(_,i)=>{
      const m=new T.Mesh(ballGeometry,new T.MeshStandardMaterial({color:0xe96522,roughness:.5,transparent:true,opacity:i===0?1:1/24,depthWrite:i===0}));this.ballGroup.add(m);return m;
    });
    this.ready=true;this.frameStats={};return true;
  }
  releaseLighting(){
    this.mirrorOptics?.dispose();this.mirrorOptics=null;
    for(const reflection of this.reflections||[])reflection.dispose();this.reflections=[];
    this.environmentTarget?.dispose();this.environmentTarget=null;
  }
  resize(width,height){
    width=Math.round(width);height=Math.round(height);
    if(this.canvas.width===width&&this.canvas.height===height&&this.pixels)return;
    this.renderer.setSize(width,height,false);this.target.setSize(width,height);
    // Metering and histogram do not need a multi-megapixel GPU readback.
    this.analysisWidth=Math.min(256,width);this.analysisHeight=Math.max(1,Math.round(this.analysisWidth*height/width));
    this.analysisTarget.setSize(this.analysisWidth,this.analysisHeight);
    this.meterTarget.setSize(this.analysisWidth,this.analysisHeight);
    this.meterSceneTarget.setSize(this.analysisWidth,this.analysisHeight);
    this.meterLight=new Float32Array(this.analysisWidth*this.analysisHeight*4);
    this.uniforms.resolution.value.set(width,height);this.pixels=new Uint8Array(this.analysisWidth*this.analysisHeight*4);
  }
  geometry(s){
    const aspect=this.canvas.width/this.canvas.height,wide=s.sensor==='aps-c'?23.5:36,short=s.sensor==='aps-c'?15.6:24;
    this.filmWidth=aspect<1?Math.min(short,wide*aspect):Math.min(wide,short*aspect);
    this.camera.aspect=aspect;this.camera.fov=2*Math.atan(this.filmWidth/aspect/(2*s.focal))*180/Math.PI;
    if(this.sourceView&&this.scene.id==='barbershop'){
      this.camera.fov=2*Math.atan(Math.tan(this.nativeCamera.fov*Math.PI/360)*this.nativeCamera.referenceFocal/s.focal)*180/Math.PI;
      this.filmWidth=2*s.focal*aspect*Math.tan(this.camera.fov*Math.PI/360);
    }
    const offset=new T.Vector3(s.x,s.y,-s.z).applyQuaternion(this.anchorRotation);
    this.camera.position.copy(this.anchor).add(offset);
    this.camera.quaternion.copy(this.anchorRotation).multiply(new T.Quaternion().setFromEuler(new T.Euler(s.pitch*Math.PI/180,s.yaw*Math.PI/180,s.roll*Math.PI/180,'YXZ')));
    this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);this.applyDetailView();
  }
  applyDetailView(){
    const region=this.detailView;if(!region)return;
    this.detailFullCamera??=new T.PerspectiveCamera();this.detailFullCamera.copy(this.camera);
    const m=this.camera.projectionMatrix.elements;
    m[0]/=region.spanX;m[5]/=region.spanY;
    m[8]=(m[8]+region.centerX)/region.spanX;m[9]=(m[9]+region.centerY)/region.spanY;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    if(this.plateMode){
      const p=this.plateUniforms,shift=p.viewShift.value;
      shift.set((shift.x+region.centerX)/region.spanX,(shift.y+region.centerY)/region.spanY);
      p.tanHalfFov.value.multiply(new T.Vector2(region.spanX,region.spanY));
    }
    this.filmWidth*=region.spanX;
  }
  ballWorld(time){
    const d=this.scene.ballDistance;
    return new T.Vector3(Math.sin(time*1.4)*d*.24,0,-d*(.7+.2*Math.sin(time*.9))).applyQuaternion(this.anchorRotation).add(this.anchor);
  }
  ballPosition(time){
    const p=this.ballWorld(time),view=p.clone().applyMatrix4(this.camera.matrixWorldInverse),uv=p.project(this.camera);
    return {x:uv.x*.5+.5,y:uv.y*.5+.5,z:-view.z};
  }
  updateMotion(s,exposure,time){
    this.ballGroup.visible=s.motion;
    for(let i=0;i<this.balls.length;i++){
      const ball=this.balls[i];ball.position.copy(this.ballWorld(time-exposure.shutter*i/23));
      ball.scale.setScalar(this.scene.ballDistance*.055/.12);
      const blurred=exposure.shutter>1/60;
      ball.visible=blurred||i===0;ball.material.opacity=blurred?1/12:1;
      ball.material.depthWrite=true;
    }
  }
  setRadianceScale(strength){
    // The flash is represented as radiance / shutter until photographic
    // exposure is applied. Normalize that gain BEFORE any HalfFloat write:
    // even the 1/8000 s pulse is bounded by its reference-radiance magnitude.
    const scale=1/(1+Math.max(0,strength));
    this.uniforms.radianceScale.value=scale;
    // Scene Color is cleared directly by Three and bypasses mesh materials.
    // Keep its original linear value so the display unscale does not brighten
    // the legacy sky whenever flash pre-exposure changes.
    if(this.world.background?.isColor){
      if(this.preexposedBackground?.world!==this.world||this.preexposedBackground.color!==this.world.background){
        this.preexposedBackground={world:this.world,color:this.world.background,linear:this.world.background.clone()};
      }
      this.world.background.copy(this.preexposedBackground.linear).multiplyScalar(scale);
    }
    this.canvas.dataset.radianceScale=String(scale);
    this.scaledMaterials??=new WeakSet();
    this.world.traverse(object=>{
      for(const material of [object.material].flat().filter(Boolean)){
        // The plate has its own explicit output scale; ordinary live subjects
        // (including unlit coverage meshes) must use exactly the same scale.
        if(material.isShaderMaterial||this.scaledMaterials.has(material))continue;
        this.scaledMaterials.add(material);
        const compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
        material.onBeforeCompile=(shader,renderer)=>{
          compile.call(material,shader,renderer);
          shader.uniforms.sceneRadianceScale=this.uniforms.radianceScale;
          shader.fragmentShader='uniform float sceneRadianceScale;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.rgb *= sceneRadianceScale;\n#include <tonemapping_fragment>');
        };
        const originalKey=key();material.customProgramCacheKey=()=>originalKey+'-preexposed-radiance-v1';material.needsUpdate=true;
      }
    });
    return scale;
  }
  renderPlate(s,exposure,time,flash=true,integrate=true){
    this.geometry(s);this.updateMotion(s,integrate?exposure:{...exposure,shutter:0},time);
    this.flashLight.position.copy(this.camera.position).addScaledVector(new T.Vector3(0,1,0).applyQuaternion(this.camera.quaternion),.08);
    this.flashLight.target.position.copy(this.flashLight.position).add(this.camera.getWorldDirection(new T.Vector3()));
    // Inverse duration preserves flash energy when ambient shutter time changes.
    this.flashLight.intensity=flash?s.flash*(1000/Math.PI)*.01/exposure.shutter:0;
    this.flashLight.castShadow=this.flashLight.intensity>0;
    this.flashLight.visible=this.flashLight.intensity>0;
    this.setRadianceScale(this.flashLight.intensity);
    this.reflectionKey=[...this.camera.matrixWorld.elements,...this.camera.projectionMatrix.elements,s.motion?time:0,s.motion?exposure.shutter:0,s.motion,this.flashLight.intensity,this.uniforms.radianceScale.value].join(',');
    this.renderer.setRenderTarget(this.target);this.renderer.render(this.world,this.camera);
    const stats={triangles:this.renderer.info.render.triangles,calls:this.renderer.info.render.calls,textures:this.renderer.info.memory.textures};
    this.uniforms.sceneDepth.value=this.target.depthTexture;this.uniforms.linearDepth.value=false;if(integrate)this.mirrorOptics?.render(this);
    this.frameStats=stats;
  }
  readPlate(s,exposure,time){
    // The meter observes current ambient light before choosing the exposure.
    // Shutter integration and lens blur belong to the resulting photograph.
    const target=this.target;if(!this.plateMode)this.target=this.meterSceneTarget;
    this.renderPlate(s,exposure,time,false,false);this.target=target;
    const u=this.uniforms;u.focus.value=s.focus;u.focal.value=s.focal;u.aperture.value=1000000;
    if(!this.plateMode)u.plate.value=this.meterSceneTarget.texture;
    u.exposure.value=0;u.iso.value=0;u.wb.value=5000;u.zebra.value=false;u.meteringPass.value=true;
    this.renderer.setRenderTarget(this.meterTarget);this.renderer.render(this.postScene,this.postCamera);
    this.renderer.readRenderTargetPixels(this.meterTarget,0,0,this.analysisWidth,this.analysisHeight,this.meterLight);u.meteringPass.value=false;if(!this.plateMode)u.plate.value=target.texture;return this.meterLight;
  }
  draw(s,exposure,time,analyse=false,output=null){
    if(!this.ready)return;
    this.geometry(s);
    const values={lensRadiusLimit:(this.detailView?.fullWidth??this.target.width)*.08,foregroundSupportRadius:-1,focus:s.focus,focal:s.focal,aperture:this.sourceView?1000000:exposure.aperture,exposure:this.scene.baseEV+this.exposureOffset-exposure.ev,iso:this.sourceView?0:exposure.iso,wb:s.wb,time,zebra:false,sensorWidth:this.filmWidth,agx:this.restoredLighting};
    for(const [key,value]of Object.entries(values))this.uniforms[key].value=value;
    this.uniforms.pixelOrigin.value.set(this.detailView?.originX??0,this.detailView?.originY??0);
    this.uniforms.skipLens.value=false;this.uniforms.lensOnly.value=false;
    this.renderPlate(s,exposure,time);
    if(analyse){
      this.renderer.setRenderTarget(this.analysisTarget);this.renderer.render(this.postScene,this.postCamera);
      this.renderer.readRenderTargetPixels(this.analysisTarget,0,0,this.analysisWidth,this.analysisHeight,this.pixels);
    }
    this.uniforms.zebra.value=s.zebra;
    this.renderer.setRenderTarget(output);this.renderer.render(this.postScene,this.postCamera);return this.pixels;
  }
  passesCutout(hit){
    const m=hit.object.material;if(!m.alphaTest||!m.map)return true;
    const map=m.map,uv=map.transformUv((hit[map.channel?'uv'+map.channel:'uv']||new T.Vector2()).clone());
    if(!this.focusSampler){const canvas=document.createElement('canvas');canvas.width=canvas.height=1;this.focusSampler=canvas.getContext('2d',{willReadFrequently:true});}
    const c=this.focusSampler,image=map.image;c.clearRect(0,0,1,1);
    c.drawImage(image,Math.min(image.width-1,Math.max(0,Math.floor(uv.x*image.width))),Math.min(image.height-1,Math.max(0,Math.floor(uv.y*image.height))),1,1,0,0,1,1);
    return c.getImageData(0,0,1,1).data[3]/255*m.opacity>=m.alphaTest;
  }
  hitAt(x,y){
    this.raycaster.setFromCamera(new T.Vector2(x*2-1,y*2-1),this.camera);
    const visible=h=>h.object.visible&&h.object.material?.visible!==false&&h.object.material?.opacity!==.22&&!h.object.material?.userData.cameraInvisible&&!(h.object.material?.transmission>0)&&this.passesCutout(h);
    const hits=this.raycaster.intersectObjects(this.world.children,true).filter(visible);
    const hit=hits.find(h=>!this.balls.slice(1).includes(h.object)&&(!this.balls.includes(h.object)||this.ballGroup.visible));
    if(!hit)return null;
    if(hit.object.userData.opticalMirror){
      const mirror=hit.object,normal=new T.Vector3(0,0,1).applyQuaternion(mirror.quaternion),direction=this.raycaster.ray.direction.clone().reflect(normal);
      this.raycaster.set(hit.point.clone().addScaledVector(direction,.002),direction);
      const reflected=this.raycaster.intersectObjects(this.world.children,true).find(h=>visible(h)&&h.object!==mirror&&!this.balls.slice(1).includes(h.object)&&(!this.balls.includes(h.object)||this.ballGroup.visible));
      if(reflected){const point=reflectPoint(reflected.point,mirror);return {z:-point.clone().applyMatrix4(this.camera.matrixWorldInverse).z,point,track:{mirror,object:reflected.object,localPoint:reflected.object.worldToLocal(reflected.point.clone())}};}
    }
    const z=-hit.point.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
    return {z,point:hit.point,ball:hit.object===this.balls[0]};
  }
  depthAt(x,y){return this.hitAt(x,y)?.z||65;}
  projectTrack(track,time){
    if(track.ball)return this.ballPosition(time);
    let point=track.object?track.object.localToWorld(track.localPoint.clone()):track.point;
    if(track.mirror)point=reflectPoint(point,track.mirror);return this.project(point);
  }
  project(point){const p=point.clone().project(this.camera);return{x:p.x*.5+.5,y:p.y*.5+.5,z:-point.clone().applyMatrix4(this.camera.matrixWorldInverse).z};}
}
