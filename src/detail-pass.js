import * as T from 'three';
import {TemporalIntegrator} from './temporal-integrator.js';
import {PlateOptics} from './plate-optics.js';
import {AsyncReadback} from './async-readback.js';

// A small padded photographic render, independent of preview size and metering.
export class DetailPass {
  constructor(owner) {
    this.target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthTexture:new T.DepthTexture(1,1,T.UnsignedIntType)});
    this.target.samples=owner.target.samples;this.target.resolveDepthBuffer=true;
    this.output=new T.WebGLRenderTarget(1,1,{type:T.UnsignedByteType,depthBuffer:false});
    this.integrator=new TemporalIntegrator();
    this.readback=new AsyncReadback();
  }
  render(owner,s,exposure,time,region,destination,request={}) {
    if(!this.readback.available)return false;
    const gl=owner.renderer;
    const saved={target:owner.target,integrator:owner.integrator,optics:owner.plateOptics,stats:owner.frameStats,
      autoClear:gl.autoClear,clearColor:gl.getClearColor(new T.Color()),clearAlpha:gl.getClearAlpha(),
      flashPower:owner.flashLight.intensity,roomFlash:owner.plateUniforms.flashStrength.value,
      renderTarget:gl.getRenderTarget(),viewport:gl.getViewport(new T.Vector4()),scissor:gl.getScissor(new T.Vector4()),scissorTest:gl.getScissorTest()};
    const values=Object.fromEntries(Object.entries(owner.uniforms).map(([key,u])=>[key,u.value?.clone&&!u.value.isTexture?u.value.clone():u.value]));
    const data={...owner.canvas.dataset};
    if(this.target.width!==region.width||this.target.height!==region.height){this.target.setSize(region.width,region.height);this.output.setSize(region.width,region.height);}
    try {
      owner.target=this.target;owner.integrator=this.integrator;owner.detailView=region;
      if(!this.optics)this.optics=new PlateOptics(owner);
      owner.plateOptics=this.optics;
      owner.uniforms.resolution.value.set(region.width,region.height);
      owner.uniforms.plate.value=this.target.texture;
      owner.draw(s,exposure,time,false,this.output);
      const bytes=region.outputWidth*region.outputHeight*4;
      if(!this.pixels||this.pixels.length!==bytes)this.pixels=new Uint8Array(bytes);
      const pixels=this.pixels;
      // Issue the PBO copy now, then restore every main-photo binding BEFORE
      // yielding to Three's fence polling. Never hold renderer state over await.
      this.readback.start(()=>gl.readRenderTargetPixelsAsync(this.output,region.readX,region.readY,region.outputWidth,region.outputHeight,pixels),()=>{
        if(destination.width!==region.outputWidth||destination.height!==region.outputHeight){destination.width=region.outputWidth;destination.height=region.outputHeight;this.image=null;}
        const ctx=destination.getContext('2d');
        this.image??=ctx.createImageData(region.outputWidth,region.outputHeight);
        const stride=region.outputWidth*4;
        for(let row=0;row<region.outputHeight;row++)this.image.data.set(pixels.subarray(row*stride,(row+1)*stride),(region.outputHeight-1-row)*stride);
        ctx.putImageData(this.image,0,0);request.onCommit?.();
      },request.isCurrent,request.onError);
    } finally {
      owner.detailView=null;owner.target=saved.target;owner.integrator=saved.integrator;owner.plateOptics=saved.optics;
      owner.geometry(s);owner.fan?.setQuality(owner.camera,owner.target.width,owner.target.height);owner.updateMotion(s,exposure,time);
      for(const [key,value]of Object.entries(values)){const u=owner.uniforms[key];if(u.value?.copy&&value?.clone&&!value.isTexture)u.value.copy(value);else u.value=value;}
      owner.frameStats=saved.stats;
      for(const key of ['temporalSamples','temporalWeight','temporalRegion']){if(data[key]===undefined)delete owner.canvas.dataset[key];else owner.canvas.dataset[key]=data[key];}
      gl.autoClear=saved.autoClear;gl.setClearColor(saved.clearColor,saved.clearAlpha);
      owner.flashLight.intensity=saved.flashPower;owner.plateUniforms.flashStrength.value=saved.roomFlash;
      gl.setRenderTarget(saved.renderTarget);gl.setViewport(saved.viewport);gl.setScissor(saved.scissor);gl.setScissorTest(saved.scissorTest);
    }
    return true;
  }
  dispose(){this.readback.dispose();this.target.dispose();this.output.dispose();this.integrator.dispose();this.optics?.dispose();}
}
