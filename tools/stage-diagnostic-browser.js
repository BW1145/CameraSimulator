// Diagnostic-only controller. It imports the unchanged production renderer;
// there is deliberately no duplicate plate, lens, tone-map, or decode shader.
import * as T from 'three';
import {PlateRenderer} from '../src/plate-renderer.js';
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
  const names = ['lensRadiusLimit','focus','focal','aperture','exposure','iso','wb','time','zebra','sensorWidth','nearClip','farClip','radianceScale','meteringPass','lensOnly','skipLens','agx','linearDepth','toneMappingExposure'];
  return Object.fromEntries(names.map(name => [name, owner.uniforms[name].value]));
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
    return {width,height,state,sourceView:owner.sourceView,subjectPresent:Boolean(owner.fan),opticalDepthPresent:Boolean(owner.plate.optical),pack:owner.pack,gpu:{vendor:gl.getParameter(ext?.UNMASKED_VENDOR_WEBGL??gl.VENDOR),renderer:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),version:gl.getParameter(gl.VERSION)},webglSamples:owner.target.samples,texture:{type:owner.plate.image.type,colorSpace:owner.plate.image.colorSpace,flipY:owner.plate.image.flipY,minFilter:owner.plate.image.minFilter,magFilter:owner.plate.image.magFilter,generateMipmaps:owner.plate.image.generateMipmaps},notes:['No UI state injection: diagnostic directly exercises unchanged production classes at explicit settings.','iso=0 disables stochastic display noise, not scene radiance; photographic gain is the explicit exposureEV.','All binary artifacts are RGBA, row-major, top-left origin; float16/float32 files are little-endian.','Single-view source pack has no mirror optical-distance metadata. Mirrors are excluded from ordinary-surface DOF equivalence.']};
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
  synthetic({id,whiteSide}) {
    if(!['left','right'].includes(whiteSide))throw Error('Unsupported synthetic edge');
    const source=new Float32Array(width*height*4),depth=new Float32Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4,near=whiteSide==='left'?x<width/2:x>=width/2;
      source[i]=source[i+1]=source[i+2]=near?1:0;source[i+3]=1;
      depth[i]=depth[i+1]=depth[i+2]=near ? .9 : 3;depth[i+3]=1;
    }
    const colorTexture=new T.DataTexture(source,width,height,T.RGBAFormat,T.FloatType),depthTexture=new T.DataTexture(depth,width,height,T.RGBAFormat,T.FloatType);
    colorTexture.colorSpace=T.LinearSRGBColorSpace;colorTexture.minFilter=colorTexture.magFilter=T.LinearFilter;
    depthTexture.minFilter=depthTexture.magFilter=T.NearestFilter;
    for(const texture of [colorTexture,depthTexture]){texture.flipY=true;texture.generateMipmaps=false;texture.needsUpdate=true;}
    const saved=Object.fromEntries(Object.entries(owner.uniforms).map(([key,u])=>[key,u.value]));
    try{
      const overrides={plate:colorTexture,sceneDepth:depthTexture,linearDepth:true,lensOnly:true,skipLens:false,meteringPass:false,lensRadiusLimit:width*.08,focus:1.4,focal:owner.pack.referenceFocal,aperture:1.4,exposure:0,iso:0,wb:5000,time:0,zebra:false,sensorWidth:36,radianceScale:1,agx:true,toneMappingExposure:1};
      for(const [key,value]of Object.entries(overrides))owner.uniforms[key].value=value;
      renderPost(linearTarget);const radiance=base64(read(linearTarget,Uint16Array));
      owner.uniforms.lensOnly.value=false;renderPost(displayTarget);const display=base64(read(displayTarget,Uint8Array));
      return {id,synthetic:{whiteSide,edgeColumn:width/2,foreground:{linearRGB:[1,1,1],z:.9},background:{linearRGB:[0,0,0],z:3},textureFilter:{color:'linear',depth:'nearest'},truth:'Exact planar near/far step; mirror-paired inputs test kernel reflection symmetry, not a Cycles scene.'},uniforms:uniforms(),display,radiance};
    }finally{for(const [key,value]of Object.entries(saved))owner.uniforms[key].value=value;colorTexture.dispose();depthTexture.dispose();}
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
