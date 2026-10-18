import * as T from 'three';
import {Renderer} from './renderer.js';

export class PlateRenderer extends Renderer {
  constructor(canvas){super(canvas);this.cache=new Map();this.moveVersion=0;}
  async load(scene,onProgress){
    ++this.moveVersion;
    this.plateMode=Boolean(scene.platePack);
    if(!this.plateMode)return super.load(scene,onProgress);
    const version=++this.loadVersion;this.ready=false;
    const base=`${import.meta.env.BASE_URL}${scene.platePack}/`;
    const response=await fetch(base+'manifest.json');if(!response.ok)throw Error(`Scene pack ${response.status}`);
    this.pack=await response.json();this.packBase=base;this.scene=scene;this.exposureOffset=0;this.restoredLighting=true;
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
        vec2 packed=texture2D(depth,uv).rg*255.;float distance=(packed.x*256.+packed.y)/65535.*64.;
        float z=max(near,distance*inversesqrt(dot(ray,ray)));gl_FragDepth=far/(far-near)-far*near/((far-near)*z);
        gl_FragColor=vec4(radiance,1.);}`});
    this.plateMesh=new T.Mesh(new T.PlaneGeometry(2,2),this.plateMaterial);this.plateMesh.frustumCulled=false;this.plateMesh.renderOrder=-100;this.world.add(this.plateMesh);
    this.world.add(new T.HemisphereLight(0xffe6c8,0x40352a,.5));
    const key=new T.DirectionalLight(0xffddb2,3);key.position.copy(this.anchor).add(new T.Vector3(-2,3,-4));this.world.add(key);
    this.flashLight=new T.PointLight(0xffffff,0,25,2);this.world.add(this.flashLight);
    this.ballGroup=new T.Group();this.world.add(this.ballGroup);
    const geometry=new T.SphereGeometry(.12,24,16);
    this.balls=Array.from({length:24},(_,i)=>{const ball=new T.Mesh(geometry,new T.MeshStandardMaterial({color:0xe96522,roughness:.5,transparent:true,opacity:i?1/24:1,depthWrite:!i}));this.ballGroup.add(ball);return ball;});
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
    s.yaw=Math.max(-5,Math.min(5,s.yaw));s.pitch=Math.max(-3,Math.min(3,s.pitch));s.roll=Math.max(-5,Math.min(5,s.roll));
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
    return {x:p.x/p.w*.5+.5,y:p.y/p.w*.5+.5};
  }
  hitAt(x,y){
    if(!this.plateMode)return super.hitAt(x,y);
    const uv=this.uvAt(x,y),p=this.plate;if(uv.x<0||uv.x>1||uv.y<0||uv.y>1)return null;
    const col=Math.min(p.width-1,Math.floor(uv.x*p.width)),row=Math.min(p.height-1,Math.floor((1-uv.y)*p.height)),i=(row*p.width+col)*4;
    const radial=(p.pixels[i]*256+p.pixels[i+1])/65535*64;
    this.raycaster.setFromCamera(new T.Vector2(x*2-1,y*2-1),this.camera);
    const point=this.raycaster.ray.at(radial,new T.Vector3());
    let hit={z:-point.clone().applyMatrix4(this.camera.matrixWorldInverse).z,point,ball:false};
    if(this.ballGroup.visible){const ball=this.raycaster.intersectObject(this.balls[0])[0];if(ball&&ball.distance<radial)hit={z:-ball.point.clone().applyMatrix4(this.camera.matrixWorldInverse).z,point:ball.point,ball:true};}
    return hit;
  }
}
