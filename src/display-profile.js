import * as T from 'three';
import {DISPLAY_PROFILE_ASSETS} from './display-profile-assets.js';

export const MONK_DISPLAY_PROFILE='blender-4.5.14-agx-medium-high-v1';
export const MONK_DISPLAY_TRANSFORM=Object.freeze({version:1,profile:MONK_DISPLAY_PROFILE,
  view:'AgX',look:'AgX - Medium High Contrast',exposure:-1.5,gamma:1});

// Absence means the original shader, not a best-effort substitution of looks.
export function validateDisplayTransform(value){
  if(value==null)return null;
  if(value.version!==1||value.profile!==MONK_DISPLAY_PROFILE||value.view!=='AgX'||
    value.look!=='AgX - Medium High Contrast'||value.gamma!==1||
    !Number.isFinite(value.exposure)||Math.abs(value.exposure)>16)
    throw Error('Unsupported scene display transform');
  return Object.freeze(Object.fromEntries(Object.keys(MONK_DISPLAY_TRANSFORM).map(key=>[key,value[key]])));
}

export async function verifiedResource(url,expected,fetcher=fetch){
  const response=await fetcher(url);
  if(!response.ok)throw Error(`Display profile resource ${response.status}`);
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength!==expected.bytes)throw Error('Display profile resource size mismatch');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(digest!==expected.sha256)throw Error('Display profile resource hash mismatch');
  return bytes;
}

export function rgbFloatLutTexture(bytes,edge){
  if(!Number.isInteger(edge)||edge<2||edge>128||bytes.byteLength!==edge**3*3*4)
    throw Error('Invalid display profile LUT dimensions');
  const view=new DataView(bytes),rgba=new Float32Array(edge**3*4);
  for(let i=0;i<edge**3;i++){
    for(let c=0;c<3;c++){
      const value=view.getFloat32((i*3+c)*4,true);
      if(!Number.isFinite(value))throw Error('Nonfinite display profile LUT');
      rgba[i*4+c]=value;
    }
    rgba[i*4+3]=1;
  }
  const texture=new T.Data3DTexture(rgba,edge,edge,edge);
  texture.type=T.FloatType;texture.format=T.RGBAFormat;texture.colorSpace=T.NoColorSpace;
  // OCIO's generated shader performs tetrahedral interpolation itself.
  texture.minFilter=T.NearestFilter;texture.magFilter=T.NearestFilter;
  texture.wrapS=T.ClampToEdgeWrapping;texture.wrapT=T.ClampToEdgeWrapping;texture.wrapR=T.ClampToEdgeWrapping;
  texture.generateMipmaps=false;texture.flipY=false;texture.unpackAlignment=1;texture.needsUpdate=true;
  return texture;
}

export function displayProfileFragment(fragment,resource){
  if(!resource)return fragment; // Preserve the original ten-scene shader verbatim.
  const insertion='#include <tonemapping_pars_fragment>';
  const original='if(!meteringPass)c=agx?AgXToneMapping(c):(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);';
  if(!fragment.includes(insertion)||!fragment.includes(original))throw Error('Photographic display insertion point changed');
  return fragment.replace(insertion,insertion+'\nuniform float displayExposureEV;\n'+resource.shader)
    .replace(original,'if(!meteringPass)c=monkAgxDisplay(vec4(c*exp2(displayExposureEV),1.)).rgb;');
}

export class DisplayProfileCache{
  constructor(baseURL,fetcher=fetch){this.baseURL=baseURL;this.fetcher=fetcher;this.resources=new Map();}
  async load(transform){
    const spec=validateDisplayTransform(transform);if(!spec)return null;
    const asset=DISPLAY_PROFILE_ASSETS[spec.profile];
    if(!asset)throw Error('Missing pinned display profile');
    if(!this.resources.has(spec.profile)){
      const promise=this.loadAsset(asset).catch(error=>{if(this.resources.get(spec.profile)===promise)this.resources.delete(spec.profile);throw error;});
      this.resources.set(spec.profile,promise);
    }
    return {resource:await this.resources.get(spec.profile),transform:spec};
  }
  async loadAsset(asset){
    const base=this.baseURL+asset.path+'/',textures=[];
    try{
      const raw=await verifiedResource(base+'profile.json',asset,this.fetcher);
      const profile=JSON.parse(new TextDecoder().decode(raw));
      if(profile.id!==MONK_DISPLAY_PROFILE||profile.functionName!=='monkAgxDisplay')throw Error('Invalid pinned display profile identity');
      const shader=new TextDecoder().decode(await verifiedResource(base+profile.shader.file,profile.shader,this.fetcher));
      const uniforms={};
      for(const lut of profile.luts){
        const bytes=await verifiedResource(base+lut.file,lut,this.fetcher);
        const texture=rgbFloatLutTexture(bytes,lut.edge);textures.push(texture);uniforms[lut.sampler]={value:texture};
      }
      return {shader,uniforms,profile,profileSha256:asset.sha256,dispose(){textures.forEach(texture=>texture.dispose());}};
    }catch(error){textures.forEach(texture=>texture.dispose());throw error;}
  }
}
