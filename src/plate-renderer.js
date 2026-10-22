import * as T from 'three';
import {Renderer,disposeScene} from './renderer.js';
import {createDeskFan} from './desk-fan.js';
import {periodicExposureSamples} from './temporal-exposure.js';
import {TemporalIntegrator} from './temporal-integrator.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {decodeRadianceTexture} from './linear-radiance.js';
import {createBallSubject} from './practice-ball.js';
import {tabletopLighting} from './lighting.js';
import {PlateOptics} from './plate-optics.js';
import {DetailPass} from './detail-pass.js';

function readSourceDepth(depth){
  depth.colorSpace=T.NoColorSpace;depth.minFilter=T.NearestFilter;depth.magFilter=T.NearestFilter;depth.generateMipmaps=false;
  const canvas=document.createElement('canvas');canvas.width=depth.image.width;canvas.height=depth.image.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(depth.image,0,0);
  return {depth,pixels:context.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};
}

export class PlateRenderer extends Renderer {
  constructor(canvas){super(canvas);this.cache=new Map();this.subjectEnvironments=new Map();this.subjectViewLights=new Map();this.moveVersion=0;this.pendingLayers=0;this.canvas.dataset.pendingLayers='0';}
  trackLayer(task){
    this.canvas.dataset.pendingLayers=String(++this.pendingLayers);
    return task.finally(()=>{this.canvas.dataset.pendingLayers=String(--this.pendingLayers);});
  }
  releaseSubjectLighting(){
    if(this.world)this.world.environment=null;
    for(const resource of this.subjectEnvironments?.values()||[])resource.target?.dispose();
    // Replacing the map also invalidates HDR requests still in flight.
    this.subjectEnvironments=new Map();this.subjectViewLights=new Map();this.subjectEnvironment=null;this.subjectConfig=null;this.subjectFallbackLights=[];
  }
  releaseLighting(){this.releaseSubjectLighting();super.releaseLighting();}
  async createSubjectEnvironment(url,isCurrent){
    const hdr=await new HDRLoader().loadAsync(url);
    try{
      if(!isCurrent())return null;
      hdr.mapping=T.EquirectangularReflectionMapping;
      const pmrem=new T.PMREMGenerator(this.renderer);
      try{return pmrem.fromEquirectangular(hdr);}finally{pmrem.dispose();}
    }finally{hdr.dispose();}
  }
  loadSubjectEnvironment(file){
    if(!file)return Promise.resolve(null);
    const cache=this.subjectEnvironments,url=this.packBase+file;
    if(cache.has(url))return cache.get(url).promise;
    const resource={target:null,promise:null};
    resource.promise=this.trackLayer(this.createSubjectEnvironment(url,()=>cache===this.subjectEnvironments).then(target=>{
      if(cache!==this.subjectEnvironments){target?.dispose();return null;}
      resource.target=target;return target;
    }).catch(error=>{if(cache.get(url)===resource)cache.delete(url);throw error;}));
    cache.set(url,resource);return resource.promise;
  }
  applySubjectLighting(id,environment){
    this.subjectEnvironment=environment;this.world.environment=environment?.texture??null;
    this.world.environmentRotation.y=environment?Math.PI/2:0;
    for(const {light,intensity}of this.subjectFallbackLights||[])light.intensity=environment?0:intensity;
    for(const [view,group]of this.subjectViewLights)group.visible=view===id;
  }
  async load(scene,onProgress){
    ++this.moveVersion;
    this.releaseSubjectLighting();
    this.ready=false;this.plate=null;this.entry=null;this.pack=null;this.packBase=null;this.canvas.dataset.detailWidth='';this.canvas.dataset.detailDepthWidth='';
    this.detailPass?.dispose();this.detailPass=null;this.integrator?.dispose();this.integrator=null;this.fan=null;this.motionSubject=null;
    this.plateOptics?.dispose();this.plateOptics=null;
    this.uniforms.plate.value=this.target.texture;
    this.plateMode=Boolean(scene.platePack);
    this.canvas.dataset.reflections='0';this.canvas.dataset.environment='baked';
    if(!this.plateMode)return super.load(scene,onProgress);
    const version=++this.loadVersion;this.ready=false;
    const base=`${import.meta.env.BASE_URL}${scene.platePack}/`;
    const response=await fetch(base+'manifest.json');if(!response.ok)throw Error(`Scene pack ${response.status}`);
    const pack=await response.json();if(version!==this.loadVersion)return false;
    this.releaseLighting();if(this.world)disposeScene(this.world);
    this.pack=pack;this.packBase=base;this.scene=scene;this.exposureOffset=0;this.restoredLighting=true;
    this.nativeCamera={referenceFocal:this.pack.referenceFocal};
    const matrix=new T.Matrix4().fromArray(this.pack.views[0].cameraMatrix);this.anchor.setFromMatrixPosition(matrix);this.anchorRotation.setFromRotationMatrix(matrix);
    this.camera.near=this.pack.camera.near??1.1;this.camera.far=this.pack.camera.far??100;this.uniforms.nearClip.value=this.camera.near;this.uniforms.farClip.value=this.camera.far;
    this.world=new T.Scene();this.world.background=new T.Color(0,0,0);
    this.plateUniforms={radianceScale:this.uniforms.radianceScale,image:{value:null},flashImage:{value:null},flashStrength:{value:0},depth:{value:null},rayToCapture:{value:new T.Matrix4()},tanHalfFov:{value:new T.Vector2()},viewShift:{value:new T.Vector2()},near:{value:this.camera.near},far:{value:this.camera.far}};
    this.plateMaterial=new T.ShaderMaterial({depthTest:true,depthWrite:true,uniforms:this.plateUniforms,vertexShader:'varying vec2 uvPlate;void main(){uvPlate=uv;gl_Position=vec4(position.xy,1.,1.);}',fragmentShader:`
      precision highp float;varying vec2 uvPlate;uniform sampler2D image;uniform sampler2D flashImage;uniform float flashStrength;uniform float radianceScale;uniform sampler2D depth;uniform mat4 rayToCapture;uniform vec2 tanHalfFov;uniform vec2 viewShift;uniform float near;uniform float far;
      void main(){vec3 ray=vec3((uvPlate*2.-1.+viewShift)*tanHalfFov,-1.);vec4 projected=rayToCapture*vec4(ray,0.);vec2 uv=projected.xy/projected.w*.5+.5;
        if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.)))){gl_FragColor=vec4(0.,0.,0.,1.);gl_FragDepth=1.;return;}
        vec3 radiance=texture2D(image,uv).rgb;if(flashStrength>0.)radiance+=texture2D(flashImage,uv).rgb*flashStrength;
        // Cycles perspective Z is axial camera-space depth, not ray length.
        // projected.w is the capture-camera Z scale of this current-view ray.
        vec2 packed=texture2D(depth,uv).rg*255.;float sourceZ=(packed.x*256.+packed.y)/65535.*64.;
        float z=max(near,sourceZ/projected.w);gl_FragDepth=far/(far-near)-far*near/((far-near)*z);
        gl_FragColor=vec4(radiance*radianceScale,1.);}`});
    this.plateMesh=new T.Mesh(new T.PlaneGeometry(2,2),this.plateMaterial);this.plateMesh.frustumCulled=false;this.plateMesh.renderOrder=-100;this.world.add(this.plateMesh);
    this.world.add(new T.HemisphereLight(0xffe6c8,0x40352a,.5));
    const key=new T.DirectionalLight(0xffddb2,3);key.position.copy(this.anchor).add(new T.Vector3(-2,3,-4));this.world.add(key);
    this.flashLight=new T.PointLight(0xffffff,0,25,2);this.world.add(this.flashLight);
    this.ballGroup=new T.Group();this.world.add(this.ballGroup);
    const geometry=new T.SphereGeometry(.12,24,16);
    this.balls=Array.from({length:24},(_,i)=>{const ball=new T.Mesh(geometry,new T.MeshStandardMaterial({color:0xe96522,roughness:.5,transparent:true,opacity:i?1/24:1,depthWrite:!i}));this.ballGroup.add(ball);return ball;});
    this.integrator=new TemporalIntegrator();this.motionSubject=createBallSubject(this);
    this.plateOptics=new PlateOptics(this);
    if(new URLSearchParams(location.search).get('subject')!=='none'&&this.pack.subjects){
      const response=await fetch(base+this.pack.subjects);if(!response.ok)throw Error(`Subject pack ${response.status}`);
      const subjects=await response.json();if(version!==this.loadVersion)return false;const config=subjects.find(subject=>subject.type==='desk-fan');
      if(config){
        this.fan=createDeskFan(config,this.anchor);this.world.add(this.fan.group);
        this.subjectConfig=config;
        this.world.traverse(light=>{if(light.isHemisphereLight||light.isDirectionalLight)this.subjectFallbackLights.push({light,intensity:light.intensity});});
        // viewLighting[id] optionally overrides the HDR and adds view-only
        // area lights. The original light list still owns the tabletop key.
        const viewLighting=Object.entries(config.viewLighting??{});
        if(config.areaLights?.length||viewLighting.some(([,rig])=>rig.areaLights?.length)){
          const {RectAreaLightUniformsLib}=await import('three/addons/lights/RectAreaLightUniformsLib.js');if(version!==this.loadVersion)return false;RectAreaLightUniformsLib.init();
          const addLights=(keys,parent)=>{for(const key of keys??[]){const light=new T.RectAreaLight(new T.Color().fromArray(key.color),key.radiance,key.width,key.height);light.position.fromArray(key.position);light.lookAt(light.position.clone().add(new T.Vector3().fromArray(key.direction)));parent.add(light);}};
          addLights(config.areaLights,this.world);
          for(const [id,rig]of viewLighting){if(!rig.areaLights?.length)continue;const group=new T.Group();group.visible=false;addLights(rig.areaLights,group);this.world.add(group);this.subjectViewLights.set(id,group);}
        }
        if(config.tabletopLighting)tabletopLighting(this,config);
      }
    }
    await this.selectPosition('center',onProgress);
    if(version!==this.loadVersion)return false;
    this.ready=true;this.frameStats={};this.canvas.dataset.view='prerender';this.canvas.dataset.packInitialBytes=this.pack.initialBytes;return true;
  }
  constrain(s,key){
    if(!this.plateMode||!this.ready||!this.pack||!this.entry)return;
    s.focal=Math.max(this.pack.minimumFocal??Math.ceil(this.pack.referenceFocal/1.199),Math.min(200,s.focal));
    if(['x','y','z'].includes(key)){
      const id=key==='x'?(s.x<0?'left':s.x>0?'right':'center'):key==='y'?(s.y<0?'down':s.y>0?'up':'center'):(s.z<0?'back':s.z>0?'front':'center');
      const offset=this.pack.views.find(v=>v.id===id).offset;
      [s.x,s.y,s.z]=[offset[0],offset[1],-offset[2]];
    }
    for(const axis of ['yaw','pitch','roll'])s[axis]=Math.max(this.pack.bounds[axis][0],Math.min(this.pack.bounds[axis][1],s[axis]));
    // Limit rotation to the photographed overscan instead of revealing black
    // borders or silently changing the displayed focal length.
    const aspect=this.canvas.width/this.canvas.height,wide=s.sensor==='aps-c'?23.5:36;
    const filmWidth=Math.min(wide,wide/this.pack.camera.aspect*aspect),horizontal=filmWidth/(2*s.focal),vertical=horizontal/aspect;
    const projection=new T.Matrix4().fromArray(this.entry.projectionMatrix);
    const shiftX=projection.elements[8]*36/filmWidth,shiftY=projection.elements[9]*(36/this.pack.camera.aspect)/(filmWidth/aspect),limit=1-2*(this.pack.reframeInset??0);
    for(let iteration=0;iteration<50;iteration++){
      const q=new T.Quaternion().setFromEuler(new T.Euler(s.pitch*Math.PI/180,s.yaw*Math.PI/180,s.roll*Math.PI/180,'YXZ'));
      const fits=[[-1,-1],[-1,1],[1,-1],[1,1]].every(([x,y])=>{const p=new T.Vector3((x+shiftX)*horizontal,(y+shiftY)*vertical,-1).applyQuaternion(q);return p.z<0&&Math.abs(p.x/-p.z*projection.elements[0]-projection.elements[8])<limit*.999&&Math.abs(p.y/-p.z*projection.elements[5]-projection.elements[9])<limit*.999;});
      if(fits)break;s.yaw*=.94;s.pitch*=.94;s.roll*=.94;
    }
  }
  async setPosition(s,onProgress){
    if(!this.plateMode||!this.ready)return;
    const id=s.x<0?'left':s.x>0?'right':s.y<0?'down':s.y>0?'up':s.z<0?'back':s.z>0?'front':'center';
    await this.selectPosition(id,onProgress);
  }
  async selectPosition(id,onProgress=()=>{}){
    const version=++this.moveVersion,entry=this.pack.views.find(v=>v.id===id),base=this.packBase,encoding=entry.encoding||this.pack.encoding;
    const environmentFile=this.subjectConfig?.viewLighting?.[id]?.environment??this.subjectConfig?.environment;
    const environment=this.loadSubjectEnvironment(environmentFile);
    const cacheKey=base+id;let resource=this.cache.get(cacheKey);
    if(!resource){
      const loader=new T.TextureLoader();
      resource=this.trackLayer(Promise.all([loader.loadAsync(base+entry.file,e=>onProgress(e.loaded,e.total)),loader.loadAsync(base+entry.depth),entry.opticalDepth?loader.loadAsync(base+entry.opticalDepth):null]).then(([image,depth,optical])=>{
        image=decodeRadianceTexture(image,encoding,Math.min(4,this.renderer.capabilities.getMaxAnisotropy()));
        return {image,...readSourceDepth(depth),optical:optical?readSourceDepth(optical):null};
      }).catch(error=>{this.cache.delete(cacheKey);throw error;}));
      this.cache.set(cacheKey,resource);
    }else{this.cache.delete(cacheKey);this.cache.set(cacheKey,resource);}
    // Commit the plate and its subject rig together, after both are ready.
    const [loaded,subjectEnvironment]=await Promise.all([resource,environment]);if(version!==this.moveVersion)return;
    this.applySubjectLighting(id,subjectEnvironment);
    this.plate=loaded;this.entry=entry;this.captureMatrix=new T.Matrix4().fromArray(entry.matrix);
    loaded.detailFailed=false;loaded.flashFailed=false;
    this.camera.near=entry.near??this.pack.camera.near;this.uniforms.nearClip.value=this.camera.near;this.plateUniforms.near.value=this.camera.near;
    this.plateUniforms.image.value=loaded.image;this.plateUniforms.depth.value=loaded.depth;this.plateUniforms.flashImage.value=loaded.flash||loaded.image;this.plateUniforms.flashStrength.value=0;
    this.canvas.dataset.position=id;this.canvas.dataset.cameraPosition=JSON.stringify(entry.position);
    this.canvas.dataset.detailWidth=String(loaded.image.image.width);this.canvas.dataset.detailDepthWidth=String(loaded.width);
    // Only the selected position downloads. Keep at most three decoded views.
    while(this.cache.size>3){const [old,promise]=this.cache.entries().next().value;this.cache.delete(old);promise.then(r=>{r.image.dispose();r.depth.dispose();r.flash?.dispose();r.optical?.depth.dispose();},()=>{});}
    this.trimDecodedCache();
  }
  async trimDecodedCache(){
    const resources=await Promise.all([...this.cache].map(async([key,promise])=>({key,promise,resource:await promise.catch(()=>null)})));
    const footprint=r=>(r.image.image.width*r.image.image.height+(r.flash?r.flash.image.width*r.flash.image.height:0))*8*4/3+r.width*r.height*8+(r.optical?r.optical.width*r.optical.height*8:0);
    let bytes=resources.reduce((sum,{resource:r})=>sum+(r?footprint(r):0),0);
    for(const {key,promise,resource:r}of resources){if(bytes<=160*1024*1024&&this.cache.size<=3)break;if(!r||r===this.plate)continue;
      if(this.cache.get(key)===promise&&this.cache.delete(key)){bytes-=footprint(r);r.image.dispose();r.depth.dispose();r.flash?.dispose();r.optical?.depth.dispose();}
    }
  }
  ensureDetail(s,width=this.canvas.width){
    const entry=this.entry,resource=this.plate;
    if(!entry.detailFile||resource.detailLoading||resource.detailFailed||resource.image.image.width>=entry.detailWidth)return;
    const needed=width*(s.focal/this.pack.referenceFocal)*1.2*(36/this.filmWidth);
    if(needed<resource.image.image.width*1.15||entry.detailWidth>this.renderer.capabilities.maxTextureSize)return;
    resource.detailLoading=true;const base=this.packBase,encoding=entry.detailEncoding||this.pack.detail?.encoding||this.pack.encoding;
    const loader=new T.TextureLoader();
    resource.detailTask=this.trackLayer(Promise.all([loader.loadAsync(base+entry.detailFile),entry.detailDepth?loader.loadAsync(base+entry.detailDepth):Promise.resolve(null)]).then(([encoded,depth])=>{
      // Only the currently selected room/position may promote a late detail map.
      if(resource!==this.plate||base!==this.packBase){encoded.dispose();depth?.dispose();return;}
      const linear=decodeRadianceTexture(encoded,encoding,Math.min(4,this.renderer.capabilities.getMaxAnisotropy()));
      resource.image.dispose();resource.image=linear;this.plateUniforms.image.value=linear;
      if(depth){const upgraded=readSourceDepth(depth);resource.depth.dispose();Object.assign(resource,upgraded);this.plateUniforms.depth.value=depth;this.canvas.dataset.detailDepthWidth=String(upgraded.width);}
      this.plateUniforms.flashImage.value=resource.flash||linear;
      this.canvas.dataset.detailWidth=String(linear.image.width);this.trimDecodedCache();this.onTextureUpdate?.();
    }).catch(()=>{resource.detailFailed=true;if(resource===this.plate)this.onLayerError?.('高精度图',()=>{resource.detailFailed=false;this.ensureDetail(s,width);});}).finally(()=>{resource.detailLoading=false;}));
    return resource.detailTask;
  }
  async prepareCapture(s,width){
    if(!this.plateMode)return;
    this.geometry(s);this.ensureDetail(s,width);if(s.flash>0)this.ensureFlash();
    await Promise.all([this.plate.detailTask,this.plate.flashTask]);
  }
  ensureFlash(){
    const resource=this.plate,entry=this.entry,base=this.packBase,encoding=this.pack.flash?.encoding||this.pack.encoding;
    if(!entry.flash||resource.flash||resource.flashLoading||resource.flashFailed)return;
    resource.flashLoading=true;
    resource.flashTask=this.trackLayer(new T.TextureLoader().loadAsync(base+entry.flash).then(encoded=>{
      if(resource!==this.plate||base!==this.packBase){encoded.dispose();return;}
      resource.flash=decodeRadianceTexture(encoded,encoding,Math.min(4,this.renderer.capabilities.getMaxAnisotropy()));
      this.plateUniforms.flashImage.value=resource.flash;this.trimDecodedCache();this.onTextureUpdate?.();
    }).catch(()=>{resource.flashFailed=true;if(resource===this.plate)this.onLayerError?.('闪光层',()=>{resource.flashFailed=false;this.ensureFlash();});}).finally(()=>{resource.flashLoading=false;}));
  }
  geometry(s){
    if(!this.plateMode)return super.geometry(s);
    const aspect=this.canvas.width/this.canvas.height,wide=s.sensor==='aps-c'?23.5:36;
    // Ratios crop the source photographic image; a portrait crop does not
    // invent missing ceiling/floor outside that panoramic source photograph.
    this.filmWidth=Math.min(wide,wide/this.pack.camera.aspect*aspect);
    this.camera.aspect=aspect;this.camera.fov=2*Math.atan(this.filmWidth/aspect/(2*s.focal))*180/Math.PI;
    this.camera.position.fromArray(this.entry.position);
    this.camera.quaternion.copy(this.anchorRotation).multiply(new T.Quaternion().setFromEuler(new T.Euler(s.pitch*Math.PI/180,s.yaw*Math.PI/180,s.roll*Math.PI/180,'YXZ')));
    this.camera.updateProjectionMatrix();
    const shift=this.plateUniforms.viewShift.value;
    shift.set(this.entry.projectionMatrix[8]*36/this.filmWidth,this.entry.projectionMatrix[9]*(36/this.pack.camera.aspect)/(this.filmWidth/aspect));
    this.camera.projectionMatrix.elements[8]=shift.x;this.camera.projectionMatrix.elements[9]=shift.y;this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();this.camera.updateMatrixWorld(true);
    this.plateUniforms.rayToCapture.value.multiplyMatrices(this.captureMatrix,this.camera.matrixWorld);
    const vertical=Math.tan(this.camera.fov*Math.PI/360);this.plateUniforms.tanHalfFov.value.set(vertical*aspect,vertical);
    this.ensureDetail(s,this.detailView?.fullWidth??this.canvas.width);this.applyDetailView();
  }
  drawDetail(s,exposure,time,region,destination,request){
    if(!this.ready||!this.plateMode)return false;
    this.detailPass??=new DetailPass(this);
    // A busy pass is handled (not a request to upscale preview pixels).
    this.detailPass.render(this,s,exposure,time,region,destination,request);return true;
  }
  uvAt(x,y){
    const t=this.plateUniforms.tanHalfFov.value;
    const shift=this.plateUniforms.viewShift.value;
    const p=new T.Vector4((x*2-1+shift.x)*t.x,(y*2-1+shift.y)*t.y,-1,0).applyMatrix4(this.plateUniforms.rayToCapture.value);
    return {x:p.x/p.w*.5+.5,y:p.y/p.w*.5+.5,depthScale:p.w};
  }
  updateMotion(s,exposure,time){
    if(!this.fan)return super.updateMotion(s,exposure,time);
    this.ballGroup.visible=false;this.fan.setTime(s.motion?time:0);
  }
  ballPosition(time){
    if(!this.fan)return super.ballPosition(time);
    const p=this.fan.center(),view=p.clone().applyMatrix4(this.camera.matrixWorldInverse),uv=p.project(this.camera);
    return {x:uv.x*.5+.5,y:uv.y*.5+.5,z:-view.z};
  }
  renderPlate(s,exposure,time,flash=true,integrate=true){
    if(!this.plateMode)return super.renderPlate(s,exposure,time,flash,integrate);
    this.geometry(s);this.fan?.setQuality(this.detailView?this.detailFullCamera:this.camera,this.detailView?.fullWidth??this.target.width,this.detailView?.fullHeight??this.target.height);this.updateMotion(s,exposure,time);
    this.uniforms.sceneDepth.value=this.target.depthTexture;this.uniforms.linearDepth.value=false;
    if(flash&&s.flash>0)this.ensureFlash();
    const amount=flash?s.flash*(this.pack.flash?.referenceDuration??.01)/exposure.shutter:0;
    this.setRadianceScale(amount);
    this.plateUniforms.flashStrength.value=this.plate.flash?amount:0;
    this.canvas.dataset.flashReady=String(Boolean(this.plate.flash));
    this.flashLight.position.copy(this.camera.position).addScaledVector(new T.Vector3(0,0,-1).applyQuaternion(this.anchorRotation),this.pack.flash?.originOffsetForward??0);this.flashLight.intensity=flash?s.flash*(this.pack.flash?.referenceEnergy??1000)/Math.PI*(this.pack.flash?.referenceDuration??.01)/exposure.shutter:0;
    if(!this.fan){
      const samples=integrate&&s.motion?this.motionSubject.exposure(time,exposure.shutter):[{time,weight:1}];
      this.integrator.render(this,samples,time,integrate&&flash&&!this.sourceView);return;
    }
    const bounds=this.fan.bounds(this.detailView?this.detailFullCamera:this.camera,this.detailView?.fullWidth??this.target.width,this.detailView?.fullHeight??this.target.height);
    const radius=bounds?Math.max(bounds.width,bounds.height)/2:0;
    const samples=integrate&&s.motion?periodicExposureSamples(time,exposure.shutter,this.fan.period,24,radius*2*Math.PI/3):[{time:s.motion?time:0,weight:1}];
    this.integrator.render(this,samples,s.motion?time:0,integrate&&flash&&!this.sourceView);
  }
  hitAt(x,y){
    if(!this.plateMode)return super.hitAt(x,y);
    const uv=this.uvAt(x,y),p=this.plate;if(uv.x<0||uv.x>1||uv.y<0||uv.y>1)return null;
    const col=Math.min(p.width-1,Math.floor(uv.x*p.width)),row=Math.min(p.height-1,Math.floor((1-uv.y)*p.height)),i=(row*p.width+col)*4;
    const sourceZ=(p.pixels[i]*256+p.pixels[i+1])/65535*64,z=sourceZ/uv.depthScale;
    this.raycaster.setFromCamera(new T.Vector2(x*2-1,y*2-1),this.camera);
    const radial=z/this.raycaster.ray.direction.dot(this.camera.getWorldDirection(new T.Vector3()));
    const point=this.raycaster.ray.at(radial,new T.Vector3());
    const optical=p.optical;
    if(optical){const col=Math.min(optical.width-1,Math.floor(uv.x*optical.width)),row=Math.min(optical.height-1,Math.floor((1-uv.y)*optical.height)),i=(row*optical.width+col)*4;if(optical.pixels[i+2]>127){const virtualZ=(optical.pixels[i]*256+optical.pixels[i+1])/65535*64/uv.depthScale;this.raycaster.ray.at(radial*virtualZ/z,point);}}
    let hit={z:-point.clone().applyMatrix4(this.camera.matrixWorldInverse).z,point,ball:false};
    if(this.fan){const fan=this.raycaster.intersectObject(this.fan.group,true).find(hit=>hit.object.visible&&hit.object.userData.focusable!==false);if(fan&&fan.distance<radial)hit={z:-fan.point.clone().applyMatrix4(this.camera.matrixWorldInverse).z,point:fan.point,ball:false,track:{object:fan.object,localPoint:fan.object.worldToLocal(fan.point.clone())}};}
    if(this.ballGroup.visible){const ball=this.raycaster.intersectObject(this.balls[0])[0];if(ball&&ball.distance<radial)hit={z:-ball.point.clone().applyMatrix4(this.camera.matrixWorldInverse).z,point:ball.point,ball:true};}
    return hit;
  }
  resolveLensDepth(patch){if(this.plate?.optical)this.plateOptics.render(this,patch);}
}
