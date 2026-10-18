import {readFile,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {SCENES} from '../src/scenes.js';
for(const scene of SCENES){
  const root=`public/scenes/${scene.id}`,b=await readFile(`${root}/scene.glb`),meta=JSON.parse(await readFile(`${root}/model.json`,'utf8'));
  assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);
  const json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  assert.ok(json.meshes.length>10);assert.ok(json.nodes.some(n=>n.camera!==undefined&&n.name===scene.camera));
  assert.ok(json.buffers.every(x=>!x.uri));assert.ok((json.images||[]).every(x=>x.bufferView!==undefined));
  assert.ok(meta.sourceSha256.match(/^[a-f0-9]{64}$/));assert.equal(meta.bytes,(await stat(`${root}/scene.glb`)).size);
  assert.ok(meta.bytes<25*1024*1024);assert.ok(meta.triangles<900000);assert.ok(meta.maxTextureSize<=1024);
  console.log(`${scene.id}: ${(meta.bytes/1048576).toFixed(2)} MiB, ${meta.triangles} triangles, ${meta.textures} textures`);
}
