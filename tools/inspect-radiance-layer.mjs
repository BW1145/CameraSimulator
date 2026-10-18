// Quantify actual linear-radiance layers before accepting a flash capture.
import fs from 'node:fs/promises';import path from 'node:path';import {FloatType} from 'three';import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
for(const file of process.argv.slice(2)){
 const bytes=await fs.readFile(file),loader=path.extname(file)==='.exr'?new EXRLoader():new HDRLoader(),image=loader.setDataType(FloatType).parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 let maximum=0,sumLuminance=0,litPixels=0,positiveChannels=0,overHalfFloat=0;
 for(let i=0;i<image.width*image.height;i++){
  const r=image.data[i*4],g=image.data[i*4+1],b=image.data[i*4+2],l=.2126*r+.7152*g+.0722*b;maximum=Math.max(maximum,r,g,b);sumLuminance+=l;if(l>1e-5)litPixels++;
  for(const value of [r,g,b]){if(value>1e-6)positiveChannels++;if(value>65504)overHalfFloat++;}
 }
 console.log(JSON.stringify({file,width:image.width,height:image.height,maximumRadiance:maximum,meanLuminance:sumLuminance/(image.width*image.height),litPixelFraction:litPixels/(image.width*image.height),positiveChannels,overHalfFloatChannels:overHalfFloat}));
}
