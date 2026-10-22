import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dequantize,unweld} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';
import {Matrix3,Matrix4,Vector3} from 'three';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const [folder,out]=process.argv.slice(2);
if(!out)throw Error('Usage: node tools/prepare-surface-bake.mjs <scene-folder> <work-folder>');
await mkdir(out,{recursive:true});
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const doc=await io.read(path.join(folder,'scene.glb'));
await doc.transform(dequantize(),unweld());
for(const extension of doc.getRoot().listExtensionsUsed())if(extension.extensionName==='EXT_meshopt_compression')extension.dispose();
const positions=[],normals=[],primitives=[],seen=new Set();
for(const node of doc.getRoot().listNodes()){
  const mesh=node.getMesh();if(!mesh)continue;
  const matrix=new Matrix4().fromArray(node.getWorldMatrix()),normalMatrix=new Matrix3().getNormalMatrix(matrix);
  for(const [primitiveIndex,primitive]of mesh.listPrimitives().entries()){
    const material=primitive.getMaterial();
    if(!material||material.getAlphaMode()!=='OPAQUE'||material.getMetallicFactor()>.5||material.getExtension('KHR_materials_unlit')||material.getExtension('KHR_materials_transmission')||/mirror|glass|metal|silver|brass|chrome|steel|copper/i.test(material.getName())||material.getExtras().cameraInvisible)continue;
    if(seen.has(primitive))throw Error('Bake targets must have independent world transforms');seen.add(primitive);
    const attribute=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL'),start=positions.length/3,p=new Vector3();
    for(let i=0;i<attribute.getCount();i++){
      p.fromArray(attribute.getArray(),i*3).applyMatrix4(matrix);
      positions.push(p.x,-p.z,p.y);
      p.fromArray(normal.getArray(),i*3).applyMatrix3(normalMatrix).normalize();normals.push(p.x,-p.z,p.y);
    }
    primitives.push({mesh:doc.getRoot().listMeshes().indexOf(mesh),primitive:primitiveIndex,start,count:attribute.getCount(),material:material.getName()});
  }
}
await io.write(path.join(out,'prepared.glb'),doc);
await writeFile(path.join(out,'positions.bin'),Buffer.from(new Float32Array(positions).buffer));
await writeFile(path.join(out,'normals.bin'),Buffer.from(new Float32Array(normals).buffer));
const model=JSON.parse(await readFile(path.join(folder,'model.json'),'utf8'));
await writeFile(path.join(out,'targets.json'),JSON.stringify({sourceSha256:model.sourceSha256,primitives,vertices:positions.length/3}));
console.log(JSON.stringify({primitives:primitives.length,triangles:positions.length/9}));
