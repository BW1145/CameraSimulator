import * as T from 'three';

export class TemporalIntegrator {
  constructor(){
    this.target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});
    this.uniforms={image:{value:null},weight:{value:1}};
    this.material=new T.ShaderMaterial({depthTest:false,depthWrite:false,transparent:true,premultipliedAlpha:true,uniforms:this.uniforms,
      vertexShader:'varying vec2 uvImage;void main(){uvImage=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'varying vec2 uvImage;uniform sampler2D image;uniform float weight;void main(){gl_FragColor=texture2D(image,uvImage)*weight;}'});
    this.scene=new T.Scene();this.scene.add(new T.Mesh(new T.PlaneGeometry(2,2),this.material));this.camera=new T.Camera();
  }
  render(owner,samples,time){
    const renderer=owner.renderer,plate=owner.target,fan=owner.fan,width=plate.width,height=plate.height;
    if(this.target.width!==width||this.target.height!==height)this.target.setSize(width,height);
    const autoClear=renderer.autoClear,clearColor=renderer.getClearColor(new T.Color()),clearAlpha=renderer.getClearAlpha();
    const scissorTest=renderer.getScissorTest(),scissor=renderer.getScissor(new T.Vector4());
    let calls=0,triangles=0,patch=null;
    // setRenderTarget restores that target's scissor state. Apply the subject
    // rectangle after every bind, including the accumulation target.
    const bind=target=>{renderer.setRenderTarget(target);renderer.setScissorTest(Boolean(patch));if(patch)renderer.setScissor(patch.x,patch.y,patch.width,patch.height);};
    const drawWorld=sampleTime=>{fan.setTime(sampleTime);bind(plate);renderer.clear(true,true,true);renderer.render(owner.world,owner.camera);calls+=renderer.info.render.calls;triangles+=renderer.info.render.triangles;};
    renderer.autoClear=false;renderer.setScissorTest(false);drawWorld(samples.length===1?samples[0].time:time);
    const bounds=fan.bounds(owner.camera,width,height);
    if(samples.length===1||!bounds){
      owner.uniforms.plate.value=plate.texture;
    }else{
      this.uniforms.image.value=plate.texture;this.uniforms.weight.value=1;this.material.blending=T.NoBlending;
      bind(this.target);renderer.render(this.scene,this.camera);
      patch=bounds;bind(this.target);
      renderer.setClearColor(0,0);renderer.clear(true,false,false);this.material.blending=T.AdditiveBlending;
      // Average complete opaque instantaneous images. Alpha ghosts and repeated
      // depth writes cannot brighten or darken a long exposure's static frame.
      for(const sample of samples){drawWorld(sample.time);bind(this.target);this.uniforms.weight.value=sample.weight;renderer.render(this.scene,this.camera);}
      drawWorld(time);owner.uniforms.plate.value=this.target.texture;
    }
    fan.setTime(time);renderer.autoClear=autoClear;renderer.setClearColor(clearColor,clearAlpha);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
    owner.frameStats={triangles,calls,textures:renderer.info.memory.textures};
    owner.canvas.dataset.temporalSamples=String(bounds?samples.length:1);owner.canvas.dataset.temporalWeight=samples.reduce((sum,s)=>sum+s.weight,0).toFixed(12);
    owner.canvas.dataset.temporalRegion=JSON.stringify(bounds);
  }
  dispose(){this.target.dispose();this.material.dispose();this.scene.children[0].geometry.dispose();}
}
