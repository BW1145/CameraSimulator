// A real glTF backdrop for the live 3D ball's autofocus exercise. Architectural
// packs are covered separately; their raster cost is unrelated to this test.
const vertices=new Float32Array([
  -20,-20,-12,20,-20,-12,20,20,-12,-20,-20,-12,20,20,-12,-20,20,-12,
  0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,
]);
export const focusRoom={
  asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],
  nodes:[{camera:0,name:'Camera'},{mesh:0}],
  cameras:[{name:'Camera',type:'perspective',perspective:{yfov:1,znear:.03,zfar:150}}],
  meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},material:0}]}],
  materials:[{pbrMetallicRoughness:{baseColorFactor:[.18,.18,.18,1]},extensions:{KHR_materials_unlit:{}}}],extensionsUsed:['KHR_materials_unlit'],
  buffers:[{byteLength:vertices.byteLength,uri:'data:application/octet-stream;base64,'+Buffer.from(vertices.buffer).toString('base64')}],
  bufferViews:[{buffer:0,byteLength:72},{buffer:0,byteOffset:72,byteLength:72}],
  accessors:[{bufferView:0,componentType:5126,count:6,type:'VEC3',min:[-20,-20,-12],max:[20,20,-12]},{bufferView:1,componentType:5126,count:6,type:'VEC3'}],
};
