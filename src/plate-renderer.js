import * as T from 'three';
import {Renderer,disposeScene} from './renderer.js';
import {createDeskFan} from './desk-fan.js';
import {periodicExposureSamples} from './temporal-exposure.js';
import {TemporalIntegrator} from './temporal-integrator.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';

export class PlateRenderer extends Renderer {
  constructor(canvas){super(canvas);this.cache=new Map();this.moveVersion=0;}
  async load(scene,onProgress){
    ++this.moveVersion;
    this.integrator?.dispose();this.integrator=null;this.fan=null;this.subjectEnvironment?.dispose();this.subjectEnvironment=null;
    this.uniforms.plate.value=this.target.texture;
    this.plateMode=Boolean(scene.platePack);
    if(!this.plateMode)return super.load(scene,onProgress);
    const version=++this.loadVersion;this.ready=false;
    const base=`${import.meta.env.BASE_URL}${scene.platePack}/`;
    const response=await fetch(base+'manifest.json');if(!response.ok)throw Error(`Scene pack ${response.status}`);
    const pack=await response.json();if(version!==this.loadVersion)return false;
    if(this.world)disposeScene(this.world);
    this.pack=pack;this.packBase=base;this.scene=scene;this.exposureOffset=0;this.restoredLighting=true;
    this.nativeCamera={referenceFocal:this.pack.referenceFocal};
    const matrix=new T.Matrix4().fromArray(this.pack.views[0].cameraMatrix);this.anchor.setFromMatrixPosition(matrix);this.anchorRotation.setFromRotationMatrix(matrix);
    this.camera.near=this.pack.camera.near??1.1;this.camera.far=this.pack.camera.far??100;this.uniforms.nearClip.value=this.camera.near;this.uniforms.farClip.value=this.camera.far;
    this.world=new T.Scene();this.world.background=new T.Color(0,0,0);
    this.plateUniforms={image:{value:null},depth:{value:null},rayToCapture:{value:new T.Matrix4()},tanHalfFov:{value:new T.Vector2()},near:{value:this.camera.near},far:{value:this.camera.far}};
    this.plateMaterial=new T.ShaderMaterial({depthTest:true,depthWrite:true,uniforms:this.plateUniforms,vertexShader:'varying vec2 uvPlate;void main(){uvPlate=uv;gl_Position=vec4(position.xy,1.,1.);}',fragmentShader:`
      precision highp float;varying vec2 uvPlate;uniform sampler2D image;uniform sampler2D depth;uniform mat4 rayToCapture;uniform vec2 tanHalfFov;uniform float near;uniform float far;
      void main(){vec3 ray=vec3((uvPlate*2.-1.)*tanHalfFov,-1.);vec4 projected=rayToCapture*vec4(ray,0.);vec2 uv=projected.xy/projected.w*.5+.5;
        if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.)))){gl_FragColor=vec4(0.,0.,0.,1.);gl_FragDepth=1.;return;}
        vec3 radiance=exp2(texture2D(image,uv).rgb*22.-16.);
        // Cycles perspective Z is axial camera-space depth, not ray length.
        // projected.w is the capture-camera Z scale of this current-view ray.
        vec2 packed=texture2D(depth,uv).rg*255.;float sourceZ=(packed.x*256.+packed.y)/65535.*64.;
        float z=max(near,sourceZ/projected.w);gl_FragDepth=far/(far-near)-far*near/((far-near)*z);
        gl_FragColor=vec4(radiance,1.);}`});
    this.plateMesh=new T.Mesh(new T.PlaneGeometry(2,2),this.plateMaterial);this.plateMesh.frustumCulled=false;this.plateMesh.renderOrder=-100;this.world.add(this.plateMesh);
    this.world.add(new T.HemisphereLight(0xffe6c8,0x40352a,.5));
    const key=new T.DirectionalLight(0xffddb2,3);key.position.copy(this.anchor).add(new T.Vector3(-2,3,-4));this.world.add(key);
    this.flashLight=new T.PointLight(0xffffff,0,25,2);this.world.add(this.flashLight);
    this.ballGroup=new T.Group();this.world.add(this.ballGroup);
    const geometry=new T.SphereGeometry(.12,24,16);
    this.balls=Array.from({length:24},(_,i)=>{const ball=new T.Mesh(geometry,new T.MeshStandardMaterial({color:0xe96522,roughness:.5,transparent:true,opacity:i?1/24:1,depthWrite:!i}));this.ballGroup.add(ball);return ball;});
    if(new URLSearchParams(location.search).get('subject')!=='none'&&this.pack.subjects){
      const response=await fetch(base+this.pack.subjects);if(!response.ok)throw Error(`Subject pack ${response.status}`);
      const subjects=await response.json();if(version!==this.loadVersion)return false;const config=subjects.find(subject=>subject.type==='desk-fan');
      if(config){
        this.fan=createDeskFan(config,this.anchor);this.world.add(this.fan.group);this.integrator=new TemporalIntegrator();
        if(config.environment){
          const hdr=await new HDRLoader().loadAsync(base+config.environment);if(version!==this.loadVersion){hdr.dispose();return false;}hdr.mapping=T.EquirectangularReflectionMapping;
          const pmrem=new T.PMREMGenerator(this.renderer);this.subjectEnvironment?.dispose();this.subjectEnvironment=pmrem.fromEquirectangular(hdr);this.world.environment=this.subjectEnvironment.texture;hdr.dispose();pmrem.dispose();
          this.world.environmentRotation.y=Math.PI/2;
          this.world.traverse(o=>{if(o.isHemisphereLight||o.isDirectionalLight)o.intensity=0;});
        }
        if(config.areaLights?.length){
          const {RectAreaLightUniformsLib}=await import('three/addons/lights/RectAreaLightUniformsLib.js');if(version!==this.loadVersion)return false;RectAreaLightUniformsLib.init();
          for(const key of config.areaLights){const light=new T.RectAreaLight(new T.Color().fromArray(key.color),key.radiance,key.width,key.height);light.position.fromArray(key.position);light.lookAt(light.position.clone().add(new T.Vector3().fromArray(key.direction)));this.world.add(light);}
        }
      }
    }
    await this.selectPosition('center',onProgress);
    if(version!==this.loadVersion)return false;
    this.ready=true;this.frameStats={};this.canvas.dataset.view='prerender';this.canvas.dataset.packInitialBytes=this.pack.initialBytes;return true;
  }
  constrain(s,key){
    if(!this.plateMode)return;
    if(['x','y','z'].includes(key)){
      const step=key==='y'?.2:.3,value=Math.sign(s[key])*Math.min(1,Math.round(Math.abs(s[key])/step))*step;
      s.x=0;s.y=0;s.z=0;s[key]=value;
    }
    for(const axis of ['yaw','pitch','roll'])s[axis]=Math.max(this.pack.bounds[axis][0],Math.min(this.pack.bounds[axis][1],s[axis]));
    // Limit rotation to the photographed overscan instead of revealing black
    // borders or silently changing the displayed focal length.
    const aspect=this.canvas.width/this.canvas.height,wide=s.sensor==='aps-c'?23.5:36;
    const filmWidth=Math.min(wide,wide/this.pack.camera.aspect*aspect),horizontal=filmWidth/(2*s.focal),vertical=horizontal/aspect;
    const projection=new T.Matrix4().fromArray(this.entry.projectionMatrix);
    for(let iteration=0;iteration<50;iteration++){
      const q=new T.Quaternion().setFromEuler(new T.Euler(s.pitch*Math.PI/180,s.yaw*Math.PI/180,s.roll*Math.PI/180,'YXZ'));
      const fits=[[-1,-1],[-1,1],[1,-1],[1,1]].every(([x,y])=>{const p=new T.Vector3(x*horizontal,y*vertical,-1).applyQuaternion(q);return p.z<0&&Math.abs(p.x/-p.z*projection.elements[0])<.999&&Math.abs(p.y/-p.z*projection.elements[5])<.999;});
      if(fits)break;s.yaw*=.94;s.pitch*=.94;s.roll*=.94;
    }
  }
  async setPosition(s,onProgress){
    if(!this.plateMode)return;
    const id=s.x<0?'left':s.x>0?'right':s.y<0?'down':s.y>0?'up':s.z<0?'back':s.z>0?'front':'center';
    await this.selectPosition(id,onProgress);
  }
  async selectPosition(id,onProgress=()=>{}){
    const version=++this.moveVersion,entry=this.pack.views.find(v=>v.id===id);
    const cacheKey=this.packBase+id;let resource=this.cache.get(cacheKey);
    if(!resource){
      const loader=new T.TextureLoader();
      resource=Promise.all([loader.loadAsync(this.packBase+entry.file,e=>onProgress(e.loaded,e.total)),loader.loadAsync(this.packBase+entry.depth)]).then(([image,depth])=>{
        image.colorSpace=T.NoColorSpace;image.minFilter=T.LinearFilter;image.magFilter=T.LinearFilter;image.generateMipmaps=false;
        depth.colorSpace=T.NoColorSpace;depth.minFilter=T.NearestFilter;depth.magFilter=T.NearestFilter;depth.generateMipmaps=false;
        const canvas=document.createElement('canvas');canvas.width=depth.image.width;canvas.height=depth.image.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(depth.image,0,0);
        return {image,depth,pixels:context.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};
      }).catch(error=>{this.cache.delete(cacheKey);throw error;});
      this.cache.set(cacheKey,resource);
    }else{this.cache.delete(cacheKey);this.cache.set(cacheKey,resource);}
    const loaded=await resource;if(version!==this.moveVersion)return;
    this.plate=loaded;this.entry=entry;this.captureMatrix=new T.Matrix4().fromArray(entry.matrix);
    this.plateUniforms.image.value=loaded.image;this.plateUniforms.depth.value=loaded.depth;
    this.canvas.dataset.position=id;this.canvas.dataset.cameraPosition=JSON.stringify(entry.position);
    // Only the selected position downloads. Keep at most three decoded views.
    while(this.cache.size>3){const [old,promise]=this.cache.entries().next().value;this.cache.delete(old);promise.then(r=>{r.image.dispose();r.depth.dispose();},()=>{});}
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
    this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
    this.plateUniforms.rayToCapture.value.multiplyMatrices(this.captureMatrix,this.camera.matrixWorld);
    const vertical=Math.tan(this.camera.fov*Math.PI/360);this.plateUniforms.tanHalfFov.value.set(vertical*aspect,vertical);
  }
  uvAt(x,y){
    const t=this.plateUniforms.tanHalfFov.value;
    const p=new T.Vector4((x*2-1)*t.x,(y*2-1)*t.y,-1,0).applyMatrix4(this.plateUniforms.rayToCapture.value);
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
  renderPlate(s,exposure,time,flash=true){
    if(!this.fan)return super.renderPlate(s,exposure,time,flash);
    this.geometry(s);this.updateMotion(s,exposure,time);this.flashLight.position.copy(this.camera.position);this.flashLight.intensity=0;
    const samples=s.motion?periodicExposureSamples(time,exposure.shutter,this.fan.period):[{time:0,weight:1}];
    this.integrator.render(this,samples,s.motion?time:0);
  }
  hitAt(x,y){
    if(!this.plateMode)return super.hitAt(x,y);
    const uv=this.uvAt(x,y),p=this.plate;if(uv.x<0||uv.x>1||uv.y<0||uv.y>1)return null;
    const col=Math.min(p.width-1,Math.floor(uv.x*p.width)),row=Math.min(p.height-1,Math.floor((1-uv.y)*p.height)),i=(row*p.width+col)*4;
    const sourceZ=(p.pixels[i]*256+p.pixels[i+1])/65535*64,z=sourceZ/uv.depthScale;
    this.raycaster.setFromCamera(new T.Vector2(x*2-1,y*2-1),this.camera);
    const radial=z/this.raycaster.ray.direction.dot(this.camera.getWorldDirection(new T.Vector3()));
    const point=this.raycaster.ray.at(radial,new T.Vector3());
    let hit={z:-point.clone().applyMatrix4(this.camera.matrixWorldInverse).z,point,ball:false};
    if(this.fan){const fan=this.raycaster.intersectObject(this.fan.group,true).find(hit=>hit.object.userData.focusable!==false);if(fan&&fan.distance<radial)hit={z:-fan.point.clone().applyMatrix4(this.camera.matrixWorldInverse).z,point:fan.point,ball:true};}
    if(this.ballGroup.visible){const ball=this.raycaster.intersectObject(this.balls[0])[0];if(ball&&ball.distance<radial)hit={z:-ball.point.clone().applyMatrix4(this.camera.matrixWorldInverse).z,point:ball.point,ball:true};}
    return hit;
  }
}
