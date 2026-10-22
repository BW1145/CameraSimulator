import * as T from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';

const vertex='varying vec4 mirrorUV;uniform mat4 textureMatrix;void main(){mirrorUV=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const colorShader={uniforms:{tDiffuse:{value:null},color:{value:new T.Color(1,1,1)},textureMatrix:{value:new T.Matrix4()}},vertexShader:vertex,
  fragmentShader:'uniform sampler2D tDiffuse;varying vec4 mirrorUV;void main(){gl_FragColor=vec4(texture2DProj(tDiffuse,mirrorUV).rgb*.92,1.);}'};

// Exporters may bake object transforms into vertices or join several mirror
// panels. Recover their actual world planes before constructing reflectors.
export function createRoomMirrors(owner,source){
  const planes=[];
  source.updateMatrixWorld(true);
  source.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const g=mesh.geometry,position=g.attributes.position,index=g.index,materials=[mesh.material].flat();
    for(const group of g.groups.length?g.groups:[{start:0,count:index?.count??position.count,materialIndex:0}]){
      const material=materials[group.materialIndex];if(!/mirror/i.test(material?.name))continue;
      for(let i=group.start;i<group.start+group.count;i+=3){
        const p=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld));
        const normal=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])),area=normal.length()/2;if(area<1e-8)continue;normal.normalize();
        if(normal.dot(owner.anchor.clone().sub(p[0]))<0){normal.negate();[p[1],p[2]]=[p[2],p[1]];}const d=normal.dot(p[0]);
        let plane=planes.find(plane=>plane.normal.dot(normal)>.9999&&Math.abs(plane.d-d)<.003);
        if(!plane){plane={normal,d,vertices:[],area:0,materials:new Set()};planes.push(plane);}
        plane.vertices.push(...p);plane.area+=area;plane.materials.add(material);
      }
    }
  });
  const mirrors=[];
  for(const plane of planes.filter(p=>p.area>.01).sort((a,b)=>b.area-a.area).slice(0,4)){
    const center=new T.Box3().setFromPoints(plane.vertices).getCenter(new T.Vector3()),rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),plane.normal),inverse=rotation.clone().invert();
    const positions=plane.vertices.flatMap(p=>p.clone().sub(center).applyQuaternion(inverse).toArray());
    const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));
    const mirror=new Reflector(geometry,{textureWidth:512,textureHeight:512,multisample:0,clipBias:.001,shader:colorShader});
    mirror.position.copy(center);mirror.quaternion.copy(rotation);mirror.userData.opticalMirror=true;
    mirror.getRenderTarget().depthTexture=new T.DepthTexture(512,512,T.UnsignedIntType);
    const capture=mirror.onBeforeRender;
    mirror.onBeforeRender=function(renderer,scene,camera){
      if(owner.reflecting||this.userData.reflectionKey===owner.reflectionKey)return;
      this.userData.reflectionKey=owner.reflectionKey;owner.reflecting=true;
      capture.call(this,renderer,scene,camera);owner.reflecting=false;
    };
    for(const material of plane.materials)material.visible=false;
    owner.world.add(mirror);mirrors.push(mirror);
  }
  return mirrors;
}

// Keep physical depth for occlusion. Only the lens receives virtual reflected
// distance, assembled from the reflection camera's oblique depth projection.
export class MirrorOptics {
  constructor(mirrors){
    this.target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});
    this.base=new T.Scene();this.screenCamera=new T.Camera();
    this.copy=new T.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{depth:{value:null},nearClip:{value:.03},farClip:{value:150}},vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform sampler2D depth;uniform float nearClip,farClip;varying vec2 p;void main(){float d=texture2D(depth,p).r;float z=nearClip*farClip/(farClip-(farClip-nearClip)*d);gl_FragColor=vec4(vec3(z),1.);}'});
    this.base.add(new T.Mesh(new T.PlaneGeometry(2,2),this.copy));this.scene=new T.Scene();
    this.proxies=mirrors.map(mirror=>{
      const material=new T.ShaderMaterial({depthTest:false,depthWrite:false,vertexShader:vertex,uniforms:{textureMatrix:mirror.material.uniforms.textureMatrix,physicalDepth:{value:null},reflectionDepth:{value:mirror.getRenderTarget().depthTexture},inverseProjection:{value:new T.Matrix4()},resolution:{value:new T.Vector2()},nearClip:{value:.03},farClip:{value:150}},fragmentShader:`
        varying vec4 mirrorUV;uniform sampler2D physicalDepth,reflectionDepth;uniform mat4 inverseProjection;uniform vec2 resolution;uniform float nearClip,farClip;
        void main(){if(abs(texture2D(physicalDepth,gl_FragCoord.xy/resolution).r-gl_FragCoord.z)>.00002)discard;
          vec2 uv=mirrorUV.xy/mirrorUV.w;float d=texture2D(reflectionDepth,uv).r;
          vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);float z=clamp(-p.z/p.w,nearClip,farClip);
          gl_FragColor=vec4(vec3(z),1.);}`});
      const proxy=new T.Mesh(mirror.geometry,material);proxy.matrixAutoUpdate=false;proxy.frustumCulled=false;this.scene.add(proxy);return {mirror,proxy};
    });
  }
  render(owner){
    const renderer=owner.renderer,width=owner.target.width,height=owner.target.height;
    if(this.target.width!==width||this.target.height!==height)this.target.setSize(width,height);
    this.copy.uniforms.depth.value=owner.target.depthTexture;
    this.copy.uniforms.nearClip.value=owner.camera.near;this.copy.uniforms.farClip.value=owner.camera.far;
    const clear=renderer.autoClear;renderer.autoClear=false;renderer.setRenderTarget(this.target);renderer.render(this.base,this.screenCamera);
    for(const {mirror,proxy}of this.proxies){
      proxy.matrix.copy(mirror.matrixWorld);const u=proxy.material.uniforms;
      u.inverseProjection.value.copy(mirror.getReflectionCamera(owner.camera).projectionMatrix).invert();u.physicalDepth.value=owner.target.depthTexture;
      u.resolution.value.set(width,height);u.nearClip.value=owner.camera.near;u.farClip.value=owner.camera.far;
    }
    renderer.render(this.scene,owner.camera);renderer.autoClear=clear;owner.uniforms.sceneDepth.value=this.target.texture;owner.uniforms.linearDepth.value=true;
  }
  dispose(){this.target.dispose();this.copy.dispose();this.base.children[0].geometry.dispose();for(const {proxy}of this.proxies)proxy.material.dispose();}
}

export function reflectPoint(point,mirror){
  const normal=new T.Vector3(0,0,1).applyQuaternion(mirror.quaternion);
  return point.clone().addScaledVector(normal,-2*point.clone().sub(mirror.position).dot(normal));
}
