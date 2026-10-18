import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const fragment=`
precision highp float;
varying vec2 vUv;
uniform sampler2D plate;uniform sampler2D sceneDepth;
uniform vec2 resolution;uniform float focus;uniform float focal;uniform float aperture;
uniform float exposure;uniform float iso;uniform float wb;uniform float time;uniform bool zebra;
uniform float sensorWidth;uniform float nearClip;uniform float farClip;
uniform bool meteringPass;
uniform bool agx;
#include <tonemapping_pars_fragment>
float depthAt(vec2 p){float d=texture2D(sceneDepth,p).x;return nearClip*farClip/(farClip-(farClip-nearClip)*d);}
float coc(float z){
  float f=focal/1000.;
  return min(28.,abs(f*f*(z-focus)/(aperture*max(.05,z)*max(.01,focus-f)))*1000./sensorWidth*resolution.x*.5);
}
float random(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  // The meter consumes linear HDR light, before lens effects or display encoding.
  if(meteringPass){gl_FragColor=vec4(texture2D(plate,vUv).rgb,1.);return;}
  float z=depthAt(vUv);float radius=coc(z);
  vec3 c=texture2D(plate,vUv).rgb;float count=1.;
  for(int i=0;i<24;i++){
    float angle=float(i)*2.399963;float r=sqrt((float(i)+.5)/24.);
    vec2 offset=vec2(cos(angle),sin(angle))*r*radius;
    vec2 sampleUV=clamp(vUv+offset/resolution,vec2(0.),vec2(1.));
    float sampleZ=depthAt(sampleUV);
    float weight=sampleZ<z-.1 && coc(sampleZ)<length(offset)?0.:1.;
    c+=texture2D(plate,sampleUV).rgb*weight;count+=weight;
  }
  c=c/count*exp2(exposure);
  float temperature=(wb-5000.)/3000.;c*=vec3(exp(temperature*.32),1.,exp(-temperature*.32));
  // Filmic highlight shoulder, applied after photographic exposure.
  if(!meteringPass)c=agx?AgXToneMapping(c):(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);
  c=max(c,vec3(0.));
  c=mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));
  bool clipped=max(c.r,max(c.g,c.b))>=.995;
  c+=(random(gl_FragCoord.xy+floor(time*30.))-.5)*.018*sqrt(iso/100.);
  if(zebra&&clipped&&mod(gl_FragCoord.x+gl_FragCoord.y,12.)<5.)c=vec3(1.,.1,.1);
  gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;

function disposeScene(scene){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [o.material].flat().filter(Boolean)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
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
    this.uniforms=Object.fromEntries(Object.entries({plate:this.target.texture,sceneDepth:this.target.depthTexture,resolution:new T.Vector2(1,1),focus:3,focal:35,aperture:4,exposure:0,iso:200,wb:5000,time:0,zebra:false,sensorWidth:36,nearClip:.03,farClip:150,meteringPass:false,agx:false,toneMappingExposure:1}).map(([key,value])=>[key,{value}]));
    this.postScene=new T.Scene();this.postCamera=new T.Camera();
    this.postScene.add(new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:this.uniforms,depthTest:false,depthWrite:false})));
    this.loadVersion=0;
  }
  async load(scene,onProgress){
    const version=++this.loadVersion;
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf=await loader.loadAsync(`${import.meta.env.BASE_URL}scenes/${scene.id}/scene.glb`,e=>onProgress(e.loaded,e.total));
    const baked=new Set();gltf.scene.traverse(o=>{for(const m of [o.material].flat().filter(Boolean))if(m.userData.bakedIndirect)baked.add(m);});
    await Promise.all([...baked].map(async m=>{
      m.lightMap=await new T.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}scenes/${scene.id}/${m.userData.bakedIndirect}`);
      m.lightMap.channel=m.map?.channel??m.userData.bakedIndirectUV??1;m.lightMapIntensity=Math.PI;
      // This atlas stores indirect diffuse light, not another ambient fill.
      // Keep direct lights and flash, and retain environment specular separately.
      m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>','irradiance = vec3(0.0);\n#include <lights_fragment_maps>\niblIrradiance = vec3(0.0);');};
      m.customProgramCacheKey=()=> 'baked-indirect-v1';
    }));
    if(version!==this.loadVersion){disposeScene(gltf.scene);return false;}
    if(this.world)disposeScene(this.world);
    this.scene=scene;this.restoredLighting=baked.size>0;
    const lighting=scene.bakedLighting??{};
    this.exposureOffset=this.restoredLighting?(lighting.exposureOffset??0):0;
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
    // Punctual lights export directly; indirect illumination uses ambient fill.
    source.traverse(o=>{
      // glTF punctual lights are photometric (candela). The source bake is
      // radiometric; use one unit conversion, preserving original light ratios.
      if(o.isLight)o.intensity=this.restoredLighting?o.intensity*(lighting.lightScale??(1/683)):Math.min(o.intensity,scene.lightCap??30);
      if(o.isMesh){o.frustumCulled=true;for(const m of [o.material].flat()){
        o.castShadow=this.restoredLighting;o.receiveShadow=this.restoredLighting;
        if(!this.restoredLighting&&m.transmission>0){m.transmission=0;m.opacity=.22;m.transparent=true;m.depthWrite=false;}
        if(m.userData.cameraInvisible){m.colorWrite=false;m.depthWrite=false;}
        m.envMapIntensity=.35;
      }}
    });
    // Bound shadow cost by choosing the strongest original directional/spot keys.
    const keys=[];source.traverse(o=>{if(o.isSpotLight||o.isDirectionalLight)keys.push(o);});
    if(this.restoredLighting)keys.sort((a,b)=>b.intensity-a.intensity).slice(0,2).forEach(light=>{light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.normalBias=.025;light.shadow.bias=-.0001;});
    this.world.add(new T.HemisphereLight(0xdceaff,0x807060,this.restoredLighting ? (lighting.fill??0) : (scene.fill??1.5)));
    const sun=new T.DirectionalLight(0xffead1,this.restoredLighting ? (lighting.sunlight??0) : (scene.sunlight??1));sun.position.set(-3,8,5);this.world.add(sun);
    this.flashLight=new T.PointLight(0xffffff,0,25,2);this.world.add(this.flashLight);
    this.ballGroup=new T.Group();this.world.add(this.ballGroup);
    const ballGeometry=new T.SphereGeometry(.12,20,12);
    this.balls=Array.from({length:24},(_,i)=>{
      const m=new T.Mesh(ballGeometry,new T.MeshStandardMaterial({color:0xe96522,roughness:.5,transparent:true,opacity:i===0?1:1/24,depthWrite:i===0}));this.ballGroup.add(m);return m;
    });
    this.ready=true;this.frameStats={};return true;
  }
  resize(width,height){
    width=Math.round(width);height=Math.round(height);
    if(this.canvas.width===width&&this.canvas.height===height&&this.pixels)return;
    this.renderer.setSize(width,height,false);this.target.setSize(width,height);
    // Metering and histogram do not need a multi-megapixel GPU readback.
    this.analysisWidth=Math.min(256,width);this.analysisHeight=Math.max(1,Math.round(this.analysisWidth*height/width));
    this.analysisTarget.setSize(this.analysisWidth,this.analysisHeight);
    this.meterTarget.setSize(this.analysisWidth,this.analysisHeight);
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
    this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
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
  renderPlate(s,exposure,time,flash=true){
    this.geometry(s);this.updateMotion(s,exposure,time);
    this.flashLight.position.copy(this.camera.position);
    // Inverse duration preserves flash energy when ambient shutter time changes.
    this.flashLight.intensity=flash?s.flash*.08/exposure.shutter:0;
    this.renderer.setRenderTarget(this.target);this.renderer.render(this.world,this.camera);
    this.frameStats={triangles:this.renderer.info.render.triangles,calls:this.renderer.info.render.calls,textures:this.renderer.info.memory.textures};
  }
  readPlate(s,exposure,time){
    this.renderPlate(s,exposure,time,false);
    const u=this.uniforms;u.focus.value=s.focus;u.focal.value=s.focal;u.aperture.value=1000000;
    u.exposure.value=0;u.iso.value=0;u.wb.value=5000;u.zebra.value=false;u.meteringPass.value=true;
    this.renderer.setRenderTarget(this.meterTarget);this.renderer.render(this.postScene,this.postCamera);
    this.renderer.readRenderTargetPixels(this.meterTarget,0,0,this.analysisWidth,this.analysisHeight,this.meterLight);u.meteringPass.value=false;return this.meterLight;
  }
  draw(s,exposure,time,analyse=false){
    if(!this.ready)return;
    this.renderPlate(s,exposure,time);
    const values={focus:s.focus,focal:s.focal,aperture:this.sourceView?1000000:exposure.aperture,exposure:this.scene.baseEV+this.exposureOffset-exposure.ev,iso:this.sourceView?0:exposure.iso,wb:s.wb,time,zebra:false,sensorWidth:this.filmWidth,agx:this.restoredLighting};
    for(const [key,value]of Object.entries(values))this.uniforms[key].value=value;
    if(analyse){
      this.renderer.setRenderTarget(this.analysisTarget);this.renderer.render(this.postScene,this.postCamera);
      this.renderer.readRenderTargetPixels(this.analysisTarget,0,0,this.analysisWidth,this.analysisHeight,this.pixels);
    }
    this.uniforms.zebra.value=s.zebra;
    this.renderer.setRenderTarget(null);this.renderer.render(this.postScene,this.postCamera);return this.pixels;
  }
  hitAt(x,y){
    this.raycaster.setFromCamera(new T.Vector2(x*2-1,y*2-1),this.camera);
    const hits=this.raycaster.intersectObjects(this.world.children,true).filter(h=>h.object.visible&&h.object.material?.opacity!==.22&&!h.object.material?.userData.cameraInvisible&&!(h.object.material?.transmission>0));
    const hit=hits.find(h=>!this.balls.slice(1).includes(h.object)&&(!this.balls.includes(h.object)||this.ballGroup.visible));
    if(!hit)return null;
    const z=-hit.point.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
    return {z,point:hit.point,ball:hit.object===this.balls[0]};
  }
  depthAt(x,y){return this.hitAt(x,y)?.z||65;}
  project(point){const p=point.clone().project(this.camera);return{x:p.x*.5+.5,y:p.y*.5+.5,z:-point.clone().applyMatrix4(this.camera.matrixWorldInverse).z};}
}
