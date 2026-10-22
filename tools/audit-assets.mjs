import {readFile,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {SCENES} from '../src/scenes.js';
import {subjectAssetBytes} from './subject-assets.mjs';
for(const scene of SCENES){
  const root=`public/scenes/${scene.id}`,b=await readFile(`${root}/scene.glb`),meta=JSON.parse(await readFile(`${root}/model.json`,'utf8'));
  assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);
  const json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  assert.ok(json.meshes.length>10);assert.ok(json.nodes.some(n=>n.camera!==undefined&&n.name===scene.camera));
  assert.ok(json.buffers.every(x=>!x.uri));assert.ok((json.images||[]).every(x=>x.bufferView!==undefined));
  assert.ok(meta.sourceSha256.match(/^[a-f0-9]{64}$/));assert.equal(meta.bytes,(await stat(`${root}/scene.glb`)).size);
  assert.ok(meta.bytes<25*1024*1024);assert.ok(meta.triangles<900000);assert.ok(meta.maxTextureSize<=(meta.surfaceBake?4096:1024));
  if(meta.surfaceBake){
    assert.equal(meta.surfaceBake.sourceSha256,meta.sourceSha256);
    const light=`${root}/irradiance.webp`,size=(await stat(light)).size;
    assert.equal(size,meta.surfaceBake.bytes);assert.ok(meta.bytes+size<25*1024*1024);
    const image=await sharp(light).metadata();assert.equal(image.width,meta.surfaceBake.maps.irradiance.width);assert.equal(image.height,image.width);
    const materials=json.materials.filter(m=>m.extras?.bakedDiffuse);assert.equal(materials.length,meta.surfaceBake.materials);
    for(const m of materials){assert.equal(m.extras.bakedDiffuse,'irradiance.webp');assert.deepEqual(m.extras.bakedDiffuseEncoding,meta.surfaceBake.encoding);}
    for(const name of Object.keys(meta.surfaceBake.opacityMaps||{})){const m=json.materials.find(m=>m.name===name);assert.equal(m.alphaMode,'MASK');assert.equal(m.alphaCutoff,.1);assert.equal(m.pbrMetallicRoughness.baseColorTexture.texCoord??0,m.extras.bakedDiffuseUV);}
  }
  console.log(`${scene.id}: ${(meta.bytes/1048576).toFixed(2)} MiB, ${meta.triangles} triangles, ${meta.textures} textures`);
  if(scene.platePack){
    const packRoot=`public/${scene.platePack}`,pack=JSON.parse(await readFile(`${packRoot}/manifest.json`,'utf8'));
    assert.equal(pack.id,scene.id);assert.equal(pack.version,1);assert.equal(pack.views.length,7);assert.equal(pack.sourceSha256,meta.sourceSha256);
    let total=0;
    for(const view of pack.views){
      assert.equal((await stat(`${packRoot}/${view.file}`)).size,view.bytes);assert.equal((await stat(`${packRoot}/${view.depth}`)).size,view.depthBytes);
      assert.equal(view.clampedChannels,0);assert.equal(view.cameraMatrix.length,16);assert.equal(view.projectionMatrix.length,16);
      total+=view.bytes+view.depthBytes;
      if(view.opticalDepth){
        assert.equal((await stat(`${packRoot}/${view.opticalDepth}`)).size,view.opticalDepthBytes);
        assert.equal(pack.optics.sourceSha256,meta.sourceSha256);
        const optical=await sharp(`${packRoot}/${view.opticalDepth}`).raw().toBuffer({resolveWithObject:true});
        const physical=await sharp(`${packRoot}/${view.depth}`).raw().toBuffer({resolveWithObject:true});
        assert.equal(optical.info.width,physical.info.width);assert.equal(optical.info.height,physical.info.height);
        let changed=0;
        for(let i=0;i<optical.info.width*optical.info.height;i++){
          const virtualZ=optical.data[i*optical.info.channels]*256+optical.data[i*optical.info.channels+1];
          const physicalZ=physical.data[i*physical.info.channels]*256+physical.data[i*physical.info.channels+1];
          assert.ok(virtualZ>=physicalZ-1,`${scene.id}/${view.id}: reflected path must reach the mirror first`);
          assert.equal(optical.data[i*optical.info.channels+2],virtualZ>physicalZ+1?255:0);
          if(virtualZ>physicalZ+1)changed++;
        }
        const record=pack.optics.views.find(v=>v.id===view.id);
        assert.ok(changed>0&&changed<=record.reflectedPixels);assert.equal(record.width,optical.info.width);assert.equal(record.height,optical.info.height);
        console.log(`${scene.id}/${view.id}: ${changed} pixels with unfolded mirror distance, ${(view.opticalDepthBytes/1024).toFixed(1)} KiB`);
      }
    }
    assert.equal(total,pack.totalBytes);assert.equal(pack.initialBytes,pack.views[0].bytes+pack.views[0].depthBytes);
    assert.ok(pack.initialBytes<4*1024*1024);assert.ok(total<25*1024*1024);
    if(pack.subjects){
      const {subjectBytes:bytes,initialSubjectBytes}=await subjectAssetBytes(packRoot,pack.subjects);
      assert.equal(bytes,pack.subjectBytes);assert.equal(initialSubjectBytes,pack.initialSubjectBytes??pack.subjectBytes);assert.equal(pack.initialBytes+initialSubjectBytes,pack.initialWithSubjectBytes);assert.ok(total+bytes<25*1024*1024);
      console.log(`${scene.id} local subject: ${(bytes/1024).toFixed(1)} KiB assets; geometry generated locally`);
    }
    console.log(`${scene.id} photographic pack: ${(pack.initialBytes/1048576).toFixed(2)} MiB initial, ${(total/1048576).toFixed(2)} MiB all seven positions`);
  }
}
