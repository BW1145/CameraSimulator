import fs from 'node:fs/promises';
import {FloatType} from 'three';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
// Returns top-left-origin Float32 RGBA, matching decoded PNG/WebP row order.
// EXRLoader's bottom-left origin is flipped exactly once here.
export async function readLinearSource(file){
 const bytes=await fs.readFile(file);
 const parsed=new EXRLoader().setDataType(FloatType).parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const {width,height}=parsed,data=new Float32Array(width*height*4),stride=width*4;
 for(let y=0;y<height;y++)data.set(parsed.data.subarray((height-1-y)*stride,(height-y)*stride),y*stride);
 return {width,height,data};
}
