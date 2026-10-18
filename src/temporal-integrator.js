import * as T from 'three';

export class TemporalIntegrator {
  constructor(){
    this.target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});
    this.lensTarget=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});
    this.pulseTarget=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});
    this.uniforms={image:{value:null},base:{value:null},difference:{value:false},weight:{value:1}};
    this.material=new T.ShaderMaterial({depthTest:false,depthWrite:false,transparent:true,premultipliedAlpha:true,uniforms:this.uniforms,
      vertexShader:'varying vec2 uvImage;void main(){uvImage=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'varying vec2 uvImage;uniform sampler2D image;uniform sampler2D base;uniform bool difference;uniform float weight;void main(){vec4 c=texture2D(image,uvImage);if(difference)c=vec4(max(vec3(0.),c.rgb-texture2D(base,uvImage).rgb),0.);gl_FragColor=c*weight;}'});
    this.scene=new T.Scene();this.scene.add(new T.Mesh(new T.PlaneGeometry(2,2),this.material));this.camera=new T.Camera();
  }
  render(owner,samples,time,optical=true){
    const renderer=owner.renderer,plate=owner.target,fan=owner.fan||owner.motionSubject,width=plate.width,height=plate.height;
    if(this.target.width!==width||this.target.height!==height){this.target.setSize(width,height);this.lensTarget.setSize(width,height);this.pulseTarget.setSize(width,height);}
    const autoClear=renderer.autoClear,clearColor=renderer.getClearColor(new T.Color()),clearAlpha=renderer.getClearAlpha();
    const scissorTest=renderer.getScissorTest(),scissor=renderer.getScissor(new T.Vector4());
    let calls=0,triangles=0,patch=null;
    // setRenderTarget restores that target's scissor state. Apply the subject
    // rectangle after every bind, including the accumulation target.
    const bind=target=>{renderer.setRenderTarget(target);renderer.setScissorTest(Boolean(patch));if(patch)renderer.setScissor(patch.x,patch.y,patch.width,patch.height);};
    const drawWorld=sampleTime=>{fan.setTime(sampleTime);bind(plate);renderer.clear(true,true,true);renderer.render(owner.world,owner.camera);calls+=renderer.info.render.calls;triangles+=renderer.info.render.triangles;};
    const lensImage=()=>{
      if(!optical)return plate.texture;
      owner.uniforms.plate.value=plate.texture;owner.uniforms.lensOnly.value=true;owner.uniforms.skipLens.value=false;
      bind(this.lensTarget);renderer.render(owner.postScene,owner.postCamera);
      owner.uniforms.lensOnly.value=false;
      return this.lensTarget.texture;
    };
    // A flash is a short pulse at the end of the exposure. Integrate ambient
    // motion first, then add only the flash contribution at its actual phase.
    const flashPower=owner.flashLight.intensity,roomFlash=owner.plateUniforms.flashStrength.value;
    const pulse=flashPower>0||roomFlash>0;
    owner.flashLight.intensity=0;owner.plateUniforms.flashStrength.value=0;this.uniforms.difference.value=false;
    renderer.autoClear=false;renderer.setScissorTest(false);drawWorld(samples.length===1?samples[0].time:time);
    let bounds=fan.bounds(owner.camera,width,height);
    if(bounds&&optical){
      // Defocused blades spread outside the instantaneous rotor silhouette.
      const pad=Math.ceil(width*.08),right=Math.min(width,bounds.x+bounds.width+pad),top=Math.min(height,bounds.y+bounds.height+pad);
      bounds={x:Math.max(0,bounds.x-pad),y:Math.max(0,bounds.y-pad),width:0,height:0};bounds.width=right-bounds.x;bounds.height=top-bounds.y;
    }
    owner.uniforms.skipLens.value=false;
    if(!bounds)samples=[{time,weight:1}];
    if(samples.length===1&&!pulse){
      owner.uniforms.plate.value=plate.texture;
    }else{
      this.uniforms.image.value=lensImage();this.uniforms.weight.value=1;this.material.blending=T.NoBlending;
      bind(this.target);renderer.render(this.scene,this.camera);
      patch=bounds;bind(this.target);
      renderer.setClearColor(0,0);renderer.clear(true,false,false);this.material.blending=T.AdditiveBlending;
      // Average complete opaque instantaneous images. Alpha ghosts and repeated
      // depth writes cannot brighten or darken a long exposure's static frame.
      for(const sample of samples){drawWorld(sample.time);this.uniforms.image.value=lensImage();bind(this.target);this.uniforms.weight.value=sample.weight;renderer.render(this.scene,this.camera);}
      if(pulse){
        patch=null;drawWorld(time);this.uniforms.image.value=lensImage();this.uniforms.weight.value=1;this.material.blending=T.NoBlending;
        bind(this.pulseTarget);renderer.render(this.scene,this.camera);
        owner.flashLight.intensity=flashPower;owner.plateUniforms.flashStrength.value=roomFlash;drawWorld(time);
        this.uniforms.image.value=lensImage();this.uniforms.base.value=this.pulseTarget.texture;this.uniforms.difference.value=true;this.material.blending=T.AdditiveBlending;
        bind(this.target);renderer.render(this.scene,this.camera);this.uniforms.difference.value=false;
      }
      owner.uniforms.plate.value=this.target.texture;owner.uniforms.skipLens.value=optical;
    }
    owner.flashLight.intensity=flashPower;owner.plateUniforms.flashStrength.value=roomFlash;
    fan.setTime(time);owner.world.updateMatrixWorld(true);renderer.autoClear=autoClear;renderer.setClearColor(clearColor,clearAlpha);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
    owner.frameStats={triangles,calls,textures:renderer.info.memory.textures};
    owner.canvas.dataset.temporalSamples=String(bounds?samples.length:1);owner.canvas.dataset.temporalWeight=samples.reduce((sum,s)=>sum+s.weight,0).toFixed(12);
    owner.canvas.dataset.temporalRegion=JSON.stringify(bounds);
  }
  dispose(){this.target.dispose();this.lensTarget.dispose();this.pulseTarget.dispose();this.material.dispose();this.scene.children[0].geometry.dispose();}
}
