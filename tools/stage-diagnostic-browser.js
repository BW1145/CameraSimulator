// Diagnostic-only controller. It imports the unchanged production renderer;
// there is deliberately no duplicate plate, lens, tone-map, or decode shader.
import * as T from 'three';
const variant=new URLSearchParams(location.search).get('rendererVariant')==='baseline'?'baseline':'candidate';
const {PlateRenderer}=await import(/* @vite-ignore */ variant==='baseline'?'/diagnostics/stage-audit/__baseline-src/plate-renderer.js':'/src/plate-renderer.js');
import {SCENES} from '../src/scenes.js';

const owner = new PlateRenderer(document.querySelector('#image'));
let state, width, height, displayTarget, linearTarget, depthTarget;

function base64(data) {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let text = '';
  for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}
function topDown(data, channels = 4) {
  const output = new data.constructor(data.length), stride = width * channels;
  for (let y = 0; y < height; y++) output.set(data.subarray(y * stride, (y + 1) * stride), (height - 1 - y) * stride);
  return output;
}
function read(target, Type) {
  const data = new Type(width * height * 4);
  owner.renderer.readRenderTargetPixels(target, 0, 0, width, height, data);
  return topDown(data);
}
function uniforms() {
  const names = ['lensRadiusLimit','focus','focal','aperture','exposure','iso','wb','time','zebra','sensorWidth','nearClip','farClip','radianceScale','meteringPass','lensOnly','skipLens','agx','linearDepth','toneMappingExposure','foregroundSupportRadius'];
  return Object.fromEntries(names.map(name => [name, owner.uniforms[name]?.value??null]));
}
function renderPost(target) { owner.renderer.setRenderTarget(target); owner.renderer.render(owner.postScene, owner.postCamera); }

window.stageAudit = {
  async initialize() {
    await owner.load({...SCENES[0], platePack: 'diagnostics/matched-reference'}, () => {});
    [width,height] = owner.pack.camera.nativeResolution;
    owner.resize(width,height);
    state = {sensor:'full',crop:'native',focal:owner.pack.referenceFocal,focus:1.4,aperture:1.4,shutter:1/125,iso:0,wb:5000,x:0,y:0,z:0,yaw:0,pitch:0,roll:0,motion:false,flash:0,zebra:false};
    displayTarget = new T.WebGLRenderTarget(width,height,{type:T.UnsignedByteType,depthBuffer:false});
    linearTarget = new T.WebGLRenderTarget(width,height,{type:T.HalfFloatType,depthBuffer:false});
    depthTarget = new T.WebGLRenderTarget(width,height,{type:T.FloatType,depthBuffer:false});
    const gl = owner.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {width,height,state,variant,sourceView:owner.sourceView,subjectPresent:Boolean(owner.fan),opticalDepthPresent:Boolean(owner.plate.optical),pack:owner.pack,gpu:{vendor:gl.getParameter(ext?.UNMASKED_VENDOR_WEBGL??gl.VENDOR),renderer:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),version:gl.getParameter(gl.VERSION)},webglSamples:owner.target.samples,texture:{type:owner.plate.image.type,colorSpace:owner.plate.image.colorSpace,flipY:owner.plate.image.flipY,minFilter:owner.plate.image.minFilter,magFilter:owner.plate.image.magFilter,generateMipmaps:owner.plate.image.generateMipmaps},notes:['No UI state injection: diagnostic directly exercises unchanged production classes at explicit settings.','iso=0 disables stochastic display noise, not scene radiance; photographic gain is the explicit exposureEV.','All binary artifacts are RGBA, row-major, top-left origin; float16/float32 files are little-endian.','Single-view source pack has no mirror optical-distance metadata. Mirrors are excluded from ordinary-surface DOF equivalence.']};
  },
  async transport() {
    const image = await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=owner.packBase+owner.entry.file;});
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    return {encoded:base64(ctx.getImageData(0,0,width,height).data),decoded:base64(owner.plate.image.image.data),packedDepth:base64(owner.plate.pixels)};
  },
  capture({id,exposureEV=0,wb=5000,lens=false,aperture=1.4,linear=false}) {
    const current={...state,wb,aperture};
    // draw() resolves the same production geometry, plate, depth, and uniforms.
    // Only noise and lens are selectively disabled after the source stage draw.
    const exposure={aperture,shutter:current.shutter,iso:0,ev:owner.scene.baseEV+owner.exposureOffset-exposureEV};
    owner.draw(current,exposure,0,false,displayTarget);
    owner.uniforms.skipLens.value=!lens;
    owner.uniforms.lensOnly.value=false;
    renderPost(displayTarget);
    const display=base64(read(displayTarget,Uint8Array)), actual=uniforms();
    let radiance;
    if(linear){owner.uniforms.lensOnly.value=true;renderPost(linearTarget);radiance=base64(read(linearTarget,Uint16Array));owner.uniforms.lensOnly.value=false;}
    owner.renderer.setRenderTarget(null);owner.renderer.render(owner.postScene,owner.postCamera);
    return {id,requested:{exposureEV,wb,lens,aperture,focus:current.focus},state:current,exposure,uniforms:actual,camera:{position:owner.camera.position.toArray(),quaternion:owner.camera.quaternion.toArray(),projectionMatrix:owner.camera.projectionMatrix.toArray(),rayToCapture:owner.plateUniforms.rayToCapture.value.toArray(),filmWidth:owner.filmWidth},frameStats:owner.frameStats,display,radiance};
  },
  synthetic({id,whiteSide,nearZ=.9,farZ=3,focus=1.4,aperture=1.4,shape='step',orientation='vertical',supportRatio=1,supportNearZ=null,nearRadius=null,timing=false}) {
    if(!['left','right'].includes(whiteSide))throw Error('Unsupported synthetic edge');
    const source=new Float32Array(width*height*4),depth=new Float32Array(width*height*4);
    if(nearRadius!==null){const f=owner.pack.referenceFocal/1000,k=f*f/(aperture*Math.max(.01,focus-f))*1000/36*width*.5;nearZ=focus/(1+nearRadius/k);}
    const minimumZ=supportNearZ??(supportRatio>1?focus/(1+supportRatio*(focus/nearZ-1)):nearZ);
    const patchX=whiteSide==='left'||orientation==='horizontal'?8:width-24,patchY=whiteSide==='right'&&orientation!=='vertical'?height-24:8;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4,distance=orientation==='horizontal'?y+.5-height/2:orientation==='diagonal'?(x+.5-width/2+y+.5-height/2)/Math.SQRT2:x+.5-width/2,near=shape==='thin-strip'?Math.abs(x-width/2)<1.5:(whiteSide==='left'?distance:-distance)<(orientation==='diagonal'?.123:0);
      source[i]=source[i+1]=source[i+2]=near?1:0;source[i+3]=1;
      depth[i]=depth[i+1]=depth[i+2]=near ? nearZ : farZ;depth[i+3]=1;
      if(minimumZ<nearZ&&x>=patchX&&x<patchX+16&&y>=patchY&&y<patchY+16){source[i]=source[i+1]=source[i+2]=1;depth[i]=depth[i+1]=depth[i+2]=minimumZ;}
    }
    const colorTexture=new T.DataTexture(source,width,height,T.RGBAFormat,T.FloatType),depthTexture=new T.DataTexture(depth,width,height,T.RGBAFormat,T.FloatType);
    colorTexture.colorSpace=T.LinearSRGBColorSpace;colorTexture.minFilter=colorTexture.magFilter=T.LinearFilter;
    depthTexture.minFilter=depthTexture.magFilter=T.NearestFilter;
    for(const texture of [colorTexture,depthTexture]){texture.flipY=true;texture.generateMipmaps=false;texture.needsUpdate=true;}
    const saved=Object.fromEntries(Object.entries(owner.uniforms).map(([key,u])=>[key,u.value]));
    try{
      const overrides={plate:colorTexture,sceneDepth:depthTexture,linearDepth:true,lensOnly:true,skipLens:false,meteringPass:false,lensRadiusLimit:width*.08,focus,focal:owner.pack.referenceFocal,aperture,exposure:0,iso:0,wb:5000,time:0,zebra:false,sensorWidth:36,radianceScale:1,agx:true,toneMappingExposure:1};
      if(owner.uniforms.foregroundSupportRadius){
        const f=owner.pack.referenceFocal/1000;
        overrides.foregroundSupportRadius=minimumZ>=focus?0:Math.min(width*.08,Math.abs(f*f*(minimumZ-focus)/(aperture*Math.max(.05,minimumZ)*Math.max(.01,focus-f)))*1000/36*width*.5);
      }
      for(const [key,value]of Object.entries(overrides))owner.uniforms[key].value=value;
      const shaderTiming=[];if(timing){const pixel=new Uint16Array(4);for(let n=0;n<5;n++){const start=performance.now();renderPost(linearTarget);owner.renderer.readRenderTargetPixels(linearTarget,0,0,1,1,pixel);if(n>=2)shaderTiming.push(performance.now()-start);}}
      renderPost(linearTarget);const radiance=base64(read(linearTarget,Uint16Array));
      owner.uniforms.lensOnly.value=false;renderPost(displayTarget);const display=base64(read(displayTarget,Uint8Array));
      return {id,shaderTimingMs:shaderTiming,timingScope:timing?'Synthetic capped-support post-pass plus1px synchronous readback completion; software-GPU wall timing':null,synthetic:{whiteSide,shape,orientation,supportRatio,minimumDepthPatch:minimumZ<nearZ?{z:minimumZ,rect:[patchX,patchY,16,16],purpose:"Real nearer geometry fixes scene support; far from measured edge"}:null,mirrorOperation:orientation==='horizontal'?'flip-y':orientation==='diagonal'?'rotate-180':'flip-x',planeOffset:orientation==='diagonal'?.123:0,edgeColumn:width/2,foreground:{linearRGB:[1,1,1],z:nearZ},background:{linearRGB:[0,0,0],z:farZ},textureFilter:{color:'linear',depth:'nearest'},truth:'Exact planar near/far step; mirror-paired inputs test kernel reflection symmetry, not a Cycles scene.'},uniforms:uniforms(),display,radiance};
    }finally{for(const [key,value]of Object.entries(saved))owner.uniforms[key].value=value;colorTexture.dispose();depthTexture.dispose();}
  },
  benchmark({aperture,focus=1.4,warmup=1,iterations=3}) {
    const current={...state,aperture,focus},exposure={aperture,shutter:current.shutter,iso:0,ev:owner.scene.baseEV+owner.exposureOffset};
    const durations=[],pixel=new Uint8Array(4);
    for(let i=0;i<warmup+iterations;i++){const start=performance.now();owner.draw(current,exposure,0,false,displayTarget);owner.renderer.readRenderTargetPixels(displayTarget,0,0,1,1,pixel);const elapsed=performance.now()-start;if(i>=warmup)durations.push(elapsed);}
    return {variant,width,height,renderTarget:{width:displayTarget.width,height:displayTarget.height},completionPixel:Array.from(pixel),aperture,focus,warmup,iterations,durationsMs:durations,uniforms:uniforms(),note:'Draw plus mandatory synchronous1px readPixels completion. Chromium gl.finish only flushes and is NOT a completion barrier. Software-CI wall timing, not user-device FPS.'};
  },
  rawFrame() {
    const raw=base64(read(owner.target,Uint16Array));
    // Read only: explicit depth visualization for comparing post-projection Z.
    const material=new T.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{source:{value:owner.target.depthTexture},near:{value:owner.camera.near},far:{value:owner.camera.far}},vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'varying vec2 p;uniform sampler2D source;uniform float near,far;void main(){float d=texture2D(source,p).r;float z=near*far/(far-(far-near)*d);gl_FragColor=vec4(z,z,z,1.);}'});
    const scene=new T.Scene(),mesh=new T.Mesh(new T.PlaneGeometry(2,2),material);scene.add(mesh);
    owner.renderer.setRenderTarget(depthTarget);owner.renderer.render(scene,new T.Camera());
    const depth=base64(read(depthTarget,Float32Array));material.dispose();mesh.geometry.dispose();
    return {raw,depth};
  }
};
window.stageAuditReady=true;
