import * as T from 'three';

// The transport image stores log2 radiance. Filtering those code values would
// take a geometric mean: 1 and 16 would become 4 instead of 8.5. Decode each
// texel first; both bilinear filtering and mip generation then average light.
export function decodeRadiancePixels(rgba,min=-16,max=6){
  const lut=Uint16Array.from({length:256},(_,n)=>T.DataUtils.toHalfFloat(2**(min+n/255*(max-min))));
  const linear=new Uint16Array(rgba.length);
  for(let i=0;i<rgba.length;i+=4){linear[i]=lut[rgba[i]];linear[i+1]=lut[rgba[i+1]];linear[i+2]=lut[rgba[i+2]];linear[i+3]=0x3c00;}
  return linear;
}

export function decodeRadianceTexture(encoded,encoding,anisotropy=1){
  const {width,height}=encoded.image,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(encoded.image,0,0);
  const pixels=context.getImageData(0,0,width,height).data;
  const texture=new T.DataTexture(decodeRadiancePixels(pixels,encoding.min,encoding.max),width,height,T.RGBAFormat,T.HalfFloatType);
  texture.colorSpace=T.LinearSRGBColorSpace;texture.flipY=true;
  texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=anisotropy;texture.needsUpdate=true;
  encoded.dispose();canvas.width=canvas.height=0;
  return texture;
}
