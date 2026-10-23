import test from 'node:test';
import assert from 'node:assert/strict';
import {planPhotoAddition} from '../src/photo-collection.js';
const shot=(id,size=8)=>Object.freeze({id,blob:Object.freeze({size})});
test('recent collection evicts oldest at count cap without mutating originals',()=>{
  const originals=Object.freeze(Array.from({length:8},(_,i)=>shot(i)));
  const result=planPhotoAddition(originals,shot(9));
  assert.deepEqual(result.removed.map(s=>s.id),[0]);assert.equal(result.kept.length,7);assert.equal(originals.length,8);
});
test('byte cap may evict several old originals',()=>{
  const result=planPhotoAddition([shot(1,12),shot(2,12),shot(3,12)],shot(4,25),{maxBytes:40});
  assert.deepEqual(result.removed.map(s=>s.id),[1,2]);assert.equal(result.bytes,37);
});
test('displayed, compared and exporting originals are protected from eviction',()=>{
  const result=planPhotoAddition([shot(1),shot(2),shot(3)],shot(4),{maxShots:3,protectedIds:new Set([1,2])});
  assert.deepEqual(result.removed.map(s=>s.id),[3]);assert.deepEqual(result.kept.map(s=>s.id),[1,2]);
});
test('oversized shot and wholly protected cap leave prior collection intact',()=>{
  const originals=Object.freeze([shot(1,20),shot(2,20)]);
  assert.throws(()=>planPhotoAddition(originals,shot(3,41),{maxBytes:40}),/上限/);
  assert.throws(()=>planPhotoAddition(originals,shot(3,20),{maxBytes:40,protectedIds:new Set([1,2])}),/存储已满/);
  assert.deepEqual(originals.map(s=>s.id),[1,2]);
});
