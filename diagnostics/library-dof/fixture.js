import * as T from 'three';
import {Renderer} from '../../src/renderer.js';
import {LibraryDof,physicalCocChannels} from '../../src/library-dof.js';

// Test-only, built separately after the ordinary application. Nothing in this
// fixture changes the production renderer or contributes an alternative kernel.
const canvas=document.querySelector('#fixture'),owner=new Renderer(canvas),gl=owner.renderer;
const library=new LibraryDof(owner);
const sourceMaterial=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
  uniforms:{image:new T.Uniform(null)},vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:'varying vec2 p;uniform sampler2D image;void main(){gl_FragColor=texture2D(image,p);}'});
const sourceScene=new T.Scene();sourceScene.add(new T.Mesh(new T.PlaneGeometry(2,2),sourceMaterial));
const sourceTarget=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});
const baselineTarget=sourceTarget.clone(),displayTarget=new T.WebGLRenderTarget(1,1,{depthBuffer:false});
let textures=[];
const half=value=>T.DataUtils.fromHalfFloat(value);
function dataTexture(data,width,height){
  const texture=new T.DataTexture(data,width,height,T.RGBAFormat,T.FloatType);
  texture.minFilter=T.NearestFilter;texture.magFilter=T.NearestFilter;texture.needsUpdate=true;textures.push(texture);return texture;
}
function prepare(settings){
  const {width=512,height=width/2,focus=8,focal=120,aperture=1.4,sensorWidth=36,nearZ=2,farZ=8,kind='edge',axial=true}=settings;
  const {fullWidth=width,fullHeight=height,originX=0,originY=0}=settings;
  for(const texture of textures)texture.dispose();textures=[];
  gl.setSize(width,height,false);for(const target of [sourceTarget,baselineTarget,displayTarget])target.setSize(width,height);
  const radiance=new Float32Array(width*height*4),depth=new Float32Array(width*height*4);
  let inputFlux=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,gx=x+originX,gy=y+originY;
    const near=kind==='wire'?Math.abs(gx-fullWidth*.5)<Math.max(1,fullWidth/256):gx<fullWidth/2;
    let z=near?nearZ:farZ,r=near?.2:0,g=0,b=near?0:.2;
    if(kind==='plane'){z=focus;r=.12;g=.24;b=.48;}
    if(kind==='texture'){const checker=(Math.floor(gx/8)+Math.floor(gy/8))%2;r=g=b=.04+checker*.16;}
    if(kind==='hdr'){r=g=b=.18;if((gx-fullWidth*.7)**2+(gy-fullHeight*.5)**2<(fullWidth*.008)**2){r=8;g=4;b=2;}}
    if(kind==='point'){z=farZ;r=g=b=(gx-fullWidth*.5)**2+(gy-fullHeight*.5)**2<=2.25?8:0;}
    radiance[i]=r;radiance[i+1]=g;radiance[i+2]=b;radiance[i+3]=1;
    inputFlux+=r;
    depth[i]=axial?z:(150-.03*150/z)/(150-.03);depth[i+3]=1;
  }
  sourceMaterial.uniforms.image.value=dataTexture(radiance,width,height);
  gl.setRenderTarget(sourceTarget);gl.render(sourceScene,owner.postCamera);
  const values={sceneDepth:dataTexture(depth,width,height),linearDepth:axial,resolution:new T.Vector2(width,height),
    pixelOrigin:new T.Vector2(originX,originY),lensRadiusLimit:fullWidth*.08,focus,focal,aperture,exposure:0,iso:0,wb:5000,time:0,zebra:false,
    sensorWidth:sensorWidth*width/fullWidth,nearClip:.03,farClip:150,radianceScale:1,meteringPass:false,lensOnly:true,skipLens:false,agx:true};
  for(const [key,value]of Object.entries(values))owner.uniforms[key].value=value;
  return {width,height,inputFlux,settings:{...settings,width,height,focus,focal,aperture,sensorWidth,nearZ,farZ,kind,axial}};
}
function lens(variant){
  owner.uniforms.plate.value=sourceTarget.texture;
  if(variant==='library')return library.render(owner,sourceTarget);
  if(variant!=='baseline')throw Error('Unknown fixture renderer');
  owner.uniforms.lensOnly.value=true;owner.uniforms.skipLens.value=false;
  gl.setRenderTarget(baselineTarget);gl.render(owner.postScene,owner.postCamera);return baselineTarget.texture;
}
function display(texture){
  owner.uniforms.plate.value=texture;owner.uniforms.lensOnly.value=false;owner.uniforms.skipLens.value=true;
  gl.setRenderTarget(displayTarget);gl.render(owner.postScene,owner.postCamera);
  gl.setRenderTarget(null);gl.render(owner.postScene,owner.postCamera);
}
window.lensFixture={
  async run(variant,settings,{repeats=5}={}){
    const prepared=prepare(settings),{width,height}=prepared;
    const pixels=new Uint16Array(width*height*4),samples=[],gpuMs=[];
    const context=gl.getContext(),timer=context.getExtension('EXT_disjoint_timer_query_webgl2');
    for(let i=0;i<2+repeats;i++){
      // readPixels completes the same-size HDR output. This is deliberately
      // labelled completed software-render latency, not native GPU FPS.
      const query=timer?context.createQuery():null;
      if(query)context.beginQuery(timer.TIME_ELAPSED_EXT,query);
      const start=performance.now(),texture=lens(variant),target=variant==='library'?library.output:baselineTarget;
      if(query)context.endQuery(timer.TIME_ELAPSED_EXT);
      gl.readRenderTargetPixels(target,0,0,width,height,pixels);
      const elapsed=performance.now()-start;if(i>=2)samples.push(elapsed);
      if(query){
        const until=performance.now()+3000;
        while(!context.getQueryParameter(query,context.QUERY_RESULT_AVAILABLE)&&performance.now()<until)await new Promise(requestAnimationFrame);
        const valid=context.getQueryParameter(query,context.QUERY_RESULT_AVAILABLE)&&!context.getParameter(timer.GPU_DISJOINT_EXT);
        if(i>=2)gpuMs.push(valid?context.getQueryParameter(query,context.QUERY_RESULT)/1e6:null);
        context.deleteQuery(query);
      }
      if(i===1+repeats)display(texture);
    }
    const scanline=Array.from(pixels.slice(Math.floor(height/2)*width*4,(Math.floor(height/2)+1)*width*4),half);
    const peak=Math.max(...scanline.filter((_,i)=>i%4!==3));
    let flux=0,mx=0,my=0,radialMoment=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const weight=half(pixels[(y*width+x)*4]);flux+=weight;mx+=x*weight;my+=y*weight;}
    const centroid=[mx/Math.max(1e-20,flux),my/Math.max(1e-20,flux)];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)radialMoment+=half(pixels[(y*width+x)*4])*((x-centroid[0])**2+(y-centroid[1])**2);
    const physicalRadius=physicalCocChannels(prepared.settings.farZ,{...prepared.settings,width:prepared.settings.fullWidth??prepared.width}).radius;
    const radialRms=Math.sqrt(radialMoment/Math.max(1e-20,flux));
    // The point input is a 3x3 grid (nine texels), not a mathematical delta.
    const inputPointRadialRms=prepared.settings.kind==='point'?Math.sqrt(4/3):null;
    const effectiveDiscRadius=inputPointRadialRms===null?null:Math.sqrt(Math.max(0,2*(radialRms**2-inputPointRadialRms**2)));
    let supportRadius1pct=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(half(pixels[(y*width+x)*4])>peak*.01) supportRadius1pct=Math.max(supportRadius1pct,Math.hypot(x-width/2,y-height/2));
    const red=scanline.filter((_,i)=>i%4===0),lastAbove=threshold=>red.reduce((last,v,i)=>v>threshold?i:last,-1);
    const edgeWidth10to90=lastAbove(.02)-lastAbove(.18);
    const debug=context.getExtension('WEBGL_debug_renderer_info');
    return {...prepared,variant,scanline,peak,flux,fluxRatio:flux/Math.max(1e-20,prepared.inputFlux),centroid,supportRadius1pct,edgeWidth10to90,
      radialRms,physicalRadius,inputPointRadialRms,effectiveDiscRadius,effectiveToPhysicalRadius:effectiveDiscRadius===null?null:effectiveDiscRadius/physicalRadius,
      idealUniformDiscRadialRms:physicalRadius/Math.sqrt(2),idealPointConvolutionRadialRms:inputPointRadialRms===null?null:Math.sqrt(physicalRadius**2/2+inputPointRadialRms**2),
      png:canvas.toDataURL('image/png'),completedMs:samples,
      timing:'performance.now around lens+full HDR readPixels; two warmups; includes readback; software results are not real-GPU FPS',
      gpu:context.getParameter(debug?.UNMASKED_RENDERER_WEBGL??context.RENDERER),
      gpuTimerAvailable:Boolean(timer),gpuMs,gpuTiming:'lens-only EXT_disjoint_timer_query_webgl2 milliseconds when available and not disjoint; null is invalid/unavailable'};
  },
  async compareDetail(variant,settings){
    const width=1024,height=512,outputWidth=128,outputHeight=64;
    const halo=library.supportRadius(width*.08),cropWidth=outputWidth+halo*2,cropHeight=outputHeight+halo*2;
    const originX=(width-cropWidth)/2,originY=(height-cropHeight)/2;
    const full=await this.run(variant,{...settings,width,height},{repeats:1});
    const crop=await this.run(variant,{...settings,width:cropWidth,height:cropHeight,fullWidth:width,fullHeight:height,originX,originY},{repeats:1});
    const a=full.scanline.slice((width-outputWidth)/2*4,(width+outputWidth)/2*4),b=crop.scanline.slice(halo*4,(halo+outputWidth)*4);
    const delta=a.map((v,i)=>Math.abs(v-b[i]));
    return {variant,settings,halo,crop:[originX,originY,cropWidth,cropHeight],mean:delta.reduce((n,v)=>n+v,0)/delta.length,max:Math.max(...delta)};
  },
  dispose(){library.dispose();for(const texture of textures)texture.dispose();sourceMaterial.dispose();sourceScene.children[0].geometry.dispose();
    sourceTarget.dispose();baselineTarget.dispose();displayTarget.dispose();owner.target.dispose();gl.dispose();},
};
document.documentElement.dataset.ready='true';
