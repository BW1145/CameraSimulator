import * as T from 'three';

export class PlateOptics {
  constructor(owner){
    const p=owner.plateUniforms;
    this.target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});
    this.material=new T.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{physical:{value:owner.target.depthTexture},source:p.depth,virtualImage:{value:null},rayToCapture:p.rayToCapture,tanHalfFov:p.tanHalfFov,viewShift:p.viewShift,nearClip:owner.uniforms.nearClip,farClip:owner.uniforms.farClip},
      vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
        varying vec2 p;uniform sampler2D physical,source,virtualImage;uniform mat4 rayToCapture;uniform vec2 tanHalfFov,viewShift;uniform float nearClip,farClip;
        float axial(sampler2D image,vec2 uv){vec2 d=texture2D(image,uv).rg*255.;return (d.x*256.+d.y)/65535.*64.;}
        void main(){float d=texture2D(physical,p).r;float z=nearClip*farClip/(farClip-(farClip-nearClip)*d);
          vec4 ray=rayToCapture*vec4((p*2.-1.+viewShift)*tanHalfFov,-1.,0.);vec2 uv=ray.xy/ray.w*.5+.5;
          if(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)))){
            float realZ=axial(source,uv)/ray.w;if(abs(realZ-z)<.025)z=axial(virtualImage,uv)/ray.w;
          }gl_FragColor=vec4(vec3(z),1.);}`});
    this.scene=new T.Scene();this.scene.add(new T.Mesh(new T.PlaneGeometry(2,2),this.material));this.camera=new T.Camera();
  }
  render(owner,patch){
    const {width,height}=owner.target;if(this.target.width!==width||this.target.height!==height)this.target.setSize(width,height);
    this.material.uniforms.virtualImage.value=owner.plate.optical.depth;
    owner.renderer.setRenderTarget(this.target);owner.renderer.setScissorTest(Boolean(patch));if(patch)owner.renderer.setScissor(patch.x,patch.y,patch.width,patch.height);
    owner.renderer.render(this.scene,this.camera);owner.uniforms.sceneDepth.value=this.target.texture;owner.uniforms.linearDepth.value=true;
  }
  dispose(){this.target.dispose();this.material.dispose();this.scene.children[0].geometry.dispose();}
}
