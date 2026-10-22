import * as T from 'three';
import {DepthOfFieldEffect,EffectPass} from 'postprocessing';

// This trial changes only the CoC producer through public ShaderMaterial APIs.
// The pinned package still owns the foreground/background blur and composite.
// RG is the package's documented unsigned near/far CoC texture convention.
export const physicalCocFragment=`
varying vec2 vUv;
uniform sampler2D physicalDepth;
uniform bool axialDepth;
uniform float opticalNear,opticalFar,opticalFocus,opticalFocal,opticalAperture;
uniform float opticalSensorWidth,opticalImageWidth,opticalRadiusLimit;
void main(){
  float d=texture2D(physicalDepth,vUv).r;
  float z=axialDepth?d:opticalNear*opticalFar/(opticalFar-(opticalFar-opticalNear)*d);
  float f=opticalFocal/1000.;
  float signedRadius=f*f*(z-opticalFocus)/(opticalAperture*max(.05,z)*max(.01,opticalFocus-f));
  signedRadius*=1000./opticalSensorWidth*opticalImageWidth*.5;
  float magnitude=min(1.,abs(signedRadius)/max(.000001,opticalRadiusLimit));
  gl_FragColor=vec4(signedRadius<0.?magnitude:0.,signedRadius>0.?magnitude:0.,0.,1.);
}`;

export function installPhysicalCoc(effect,uniforms){
  const material=effect.cocMaterial;
  const bindings={physicalDepth:'sceneDepth',axialDepth:'linearDepth',opticalNear:'nearClip',opticalFar:'farClip',
    opticalFocus:'focus',opticalFocal:'focal',opticalAperture:'aperture',opticalSensorWidth:'sensorWidth',opticalRadiusLimit:'lensRadiusLimit'};
  for(const [name,key]of Object.entries(bindings))material.uniforms[name]=uniforms[key];
  material.uniforms.opticalImageWidth=new T.Uniform(1);
  material.fragmentShader=physicalCocFragment;
  material.needsUpdate=true;
}

// CPU oracle for the tiny physical adapter, not a replacement blur algorithm.
export function physicalCocChannels(depth,{focus,focal,aperture,sensorWidth=36,width,radiusLimit=width*.08}){
  const f=focal/1000;
  const radius=f*f*(depth-focus)/(aperture*Math.max(.05,depth)*Math.max(.01,focus-f))*1000/sensorWidth*width*.5;
  const magnitude=Math.min(1,Math.abs(radius)/Math.max(.000001,radiusLimit));
  return {near:radius<0?magnitude:0,far:radius>0?magnitude:0,radius:Math.min(radiusLimit,Math.abs(radius))};
}

export class LibraryDof {
  constructor(owner){
    // Package base blur + offset max-fill have almost two disc radii of
    // support. Include the default half-res Kawase/filter footprint as well.
    this.kernelSupport=Object.freeze({radiusScale:2,margin:16});
    this.effect=new DepthOfFieldEffect(owner.camera,{resolutionScale:.5});
    installPhysicalCoc(this.effect,owner.uniforms);
    this.pass=new EffectPass(owner.camera,this.effect);
    this.pass.fullscreenMaterial.encodeOutput=false;
    this.output=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});
    this.output.texture.name='LibraryDOF.LinearHDR';
    this.disposed=false;
    try{this.pass.initialize(owner.renderer,false,T.HalfFloatType);}catch(error){this.dispose();throw error;}
  }
  supportRadius(radiusLimit){return Math.ceil(radiusLimit*this.kernelSupport.radiusScale)+this.kernelSupport.margin;}
  render(owner,input){
    if(this.disposed)throw Error('The library DOF trial has been disposed.');
    const renderer=owner.renderer,u=owner.uniforms;
    if(renderer.outputColorSpace!==T.LinearSRGBColorSpace||renderer.toneMapping!==T.NoToneMapping){
      throw Error('Library DOF requires linear HDR before the existing display transform.');
    }
    const saved={target:renderer.getRenderTarget(),viewport:renderer.getViewport(new T.Vector4()),
      scissor:renderer.getScissor(new T.Vector4()),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear};
    try{
      if(this.output.width!==input.width||this.output.height!==input.height){
        this.output.setSize(input.width,input.height);this.pass.setSize(input.width,input.height);
      }
      this.effect.mainCamera=owner.camera;
      this.effect.cocMaterial.uniforms.opticalImageWidth.value=u.resolution.value.x;
      this.effect.bokehScale=u.lensRadiusLimit.value;
      // This public setter also satisfies EffectPass's depth contract. The
      // physical adapter reads the same canonical optical-depth uniform.
      if(this.pass.getDepthTexture()!==u.sceneDepth.value)this.pass.setDepthTexture(u.sceneDepth.value);
      // Library passes deliberately cover a whole frame. Temporal accumulation
      // retains its own patch when it copies this result; no stale CoC regions.
      renderer.autoClear=true;renderer.setScissorTest(false);
      this.pass.render(renderer,input,this.output,0);
      return this.output.texture;
    }finally{
      renderer.autoClear=saved.autoClear;
      renderer.setRenderTarget(saved.target);renderer.setViewport(saved.viewport);
      renderer.setScissor(saved.scissor);renderer.setScissorTest(saved.scissorTest);
    }
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;this.pass.dispose();this.output.dispose();
  }
}
