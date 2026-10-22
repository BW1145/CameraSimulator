import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld,prune,meshopt,inspect} from '@gltf-transform/functions';
import {MeshoptEncoder} from 'meshoptimizer';
import sharp from 'sharp';
import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {FloatType} from 'three';

const [folder,work]=process.argv.slice(2);
if(!work)throw Error('Usage: node tools/apply-surface-bake.mjs <scene-folder> <work-folder>');
await MeshoptEncoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});
const doc=await io.read(path.join(work,'prepared.glb')),root=doc.getRoot(),buffer=root.listBuffers()[0];
const targets=JSON.parse(await readFile(path.join(work,'targets.json'),'utf8')),report=JSON.parse(await readFile(path.join(work,'bake.json'),'utf8'));
const file=await readFile(path.join(work,'uv.bin')),uv=new Float32Array(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength));
const coverageWhite=Math.max(1e-8,...Object.values(report.opacityMaps||{}).map(o=>o.color[1]));
const {data:albedo,info:albedoInfo}=await sharp(path.join(work,'albedo.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
if(Object.keys(report.opacityMaps||{}).length)for(let i=0;i<albedo.length;i+=4){const encoded=albedo[i+1]/255,linear=encoded<=.04045?encoded/12.92:((encoded+.055)/1.055)**2.4;albedo[i+3]=Math.round(Math.min(1,linear/coverageWhite)*255);}
const color=doc.createTexture('Source surface albedo and coverage').setImage(await sharp(albedo,{raw:{width:albedoInfo.width,height:albedoInfo.height,channels:4}}).webp({quality:94,alphaQuality:100}).toBuffer()).setMimeType('image/webp');
const rough=doc.createTexture('Source surface roughness').setImage(await sharp(path.join(work,'roughness.png')).webp({lossless:true}).toBuffer()).setMimeType('image/webp');
const hdrFile=await readFile(path.join(work,'irradiance.hdr')),hdr=new HDRLoader().setDataType(FloatType).parse(hdrFile.buffer.slice(hdrFile.byteOffset,hdrFile.byteOffset+hdrFile.byteLength));
let maximum=0;for(let i=0;i<hdr.data.length;i+=4)for(let c=0;c<3;c++)maximum=Math.max(maximum,hdr.data[i+c]);
const encoding={min:-16,max:Math.max(6,Math.ceil(Math.log2(Math.max(1,maximum)))+1)},step=Math.max(1,Math.ceil(hdr.width/2048)),width=hdr.width/step,height=hdr.height/step,packed=Buffer.alloc(width*height*3);
for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){
  let value=0;for(let dy=0;dy<step;dy++)for(let dx=0;dx<step;dx++)value+=hdr.data[((y*step+dy)*hdr.width+x*step+dx)*4+c]/(step*step);
  packed[(y*width+x)*3+c]=Math.round(Math.max(0,Math.min(255,(Math.log2(Math.max(2**encoding.min,value))-encoding.min)/(encoding.max-encoding.min)*255)));
}
await sharp(packed,{raw:{width,height,channels:3}}).webp({lossless:true}).toFile(path.join(folder,'irradiance.webp'));
const converted=new Set();
for(const entry of targets.primitives){
  const primitive=root.listMeshes()[entry.mesh].listPrimitives()[entry.primitive],material=primitive.getMaterial();
  if(/metal|silver|brass|chrome|steel|copper/i.test(material.getName()))continue;
  const coordinates=uv.slice(entry.start*2,(entry.start+entry.count)*2);for(let i=1;i<coordinates.length;i+=2)coordinates[i]=1-coordinates[i];
  primitive.setAttribute('TEXCOORD_1',doc.createAccessor().setType('VEC2').setArray(coordinates).setBuffer(buffer));
  if(!converted.has(material)){
    converted.add(material);if(!material.getBaseColorTexture()||!report.directImageMaterials.includes(material.getName())){material.setBaseColorFactor([1,1,1,1]).setBaseColorTexture(color);material.getBaseColorTextureInfo().setTexCoord(1);material.getBaseColorTextureInfo().setExtension('KHR_texture_transform',null);}
    material.setMetallicFactor(0).setRoughnessFactor(1).setMetallicRoughnessTexture(rough);material.getMetallicRoughnessTextureInfo().setTexCoord(1);
    material.getMetallicRoughnessTextureInfo().setExtension('KHR_texture_transform',null);
    // A Cycles diffuse shader's roughness is an Oren–Nayar parameter. Zero
    // there does not describe a glossy GGX surface in a web PBR material.
    material.setExtras({...material.getExtras(),bakedDiffuse:'irradiance.webp',bakedDiffuseEncoding:encoding,bakedDiffuseUV:1,bakedDiffuseMatte:report.diffuseOnlyMaterials.includes(material.getName())});
    const opacity=report.opacityMaps?.[material.getName()];
    if(opacity){
      material.setBaseColorFactor([1,1,1,1]).setBaseColorTexture(color).setAlphaMode('MASK').setAlphaCutoff(.1*opacity.color[1]/coverageWhite);material.getBaseColorTextureInfo().setTexCoord(1);material.getBaseColorTextureInfo().setExtension('KHR_texture_transform',null);
    }
  }
}
await doc.transform(weld(),prune(),meshopt({encoder:MeshoptEncoder,level:'medium'}));
for(const material of converted)material.setExtras({...material.getExtras(),bakedDiffuseUV:material.getMetallicRoughnessTextureInfo().getTexCoord()});
await io.write(path.join(folder,'scene.glb'),doc);
const model=JSON.parse(await readFile(path.join(folder,'model.json'),'utf8')),stats=inspect(doc);
model.bytes=(await stat(path.join(folder,'scene.glb'))).size;model.materials=root.listMaterials().length;model.textures=root.listTextures().length;
model.meshes=root.listMeshes().length;model.triangles=stats.meshes.properties.reduce((sum,m)=>sum+m.glPrimitives,0);
model.maxTextureSize=Math.max(model.maxTextureSize,report.maps.albedo.width);
model.surfaceBake={...report,maps:{...report.maps,irradiance:{...report.maps.irradiance,sourceWidth:hdr.width,width}},materials:converted.size,encoding,bytes:(await stat(path.join(folder,'irradiance.webp'))).size,license:'Same source and adaptation license as the scene'};
await writeFile(path.join(folder,'model.json'),JSON.stringify(model,null,2)+'\n');console.log(JSON.stringify({bytes:model.bytes,materials:converted.size,triangles:model.triangles}));
