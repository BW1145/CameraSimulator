#!/usr/bin/env node
// Capture the real, pinned app decoder. No browser, images, or GPU are needed.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);assert(i>=0,`Missing ${name}`);return args[i+1];};
const app=resolve(option('--app-root')),out=resolve(option('--out'));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const decoder=resolve(app,'src/linear-radiance.js');
const require=createRequire(resolve(app,'package.json'));
const threeRoot=resolve(dirname(require.resolve('three')),'..');
const dataUtils=resolve(threeRoot,'src/extras/DataUtils.js');
const version=JSON.parse(readFileSync(resolve(threeRoot,'package.json'),'utf8')).version;
assert.equal(version,'0.186.1');
assert.equal(hash(decoder),'50bd534f57d3cb643b7b89cb32b13a02b7059b2e7b03a0db63e70d0b3c066d02');
assert.equal(hash(dataUtils),'c13af55f853b7882c7435d06b9c66333e9d68b42b22f6c257a060d6248052d6b');
const {decodeRadiancePixels}=await import(pathToFileURL(decoder));
const {DataUtils}=await import(pathToFileURL(dataUtils));
const rgba=Uint8Array.from({length:256*4},(_,i)=>i%4===3?255:Math.floor(i/4));
const half=decodeRadiancePixels(rgba,-16,6);
const values=Array.from({length:256},(_,code)=>{
  assert.equal(half[code*4+3],0x3c00);
  const expected=DataUtils.toHalfFloat(2**(-16+code/255*22));
  for(let c=0;c<3;c++)assert.equal(half[code*4+c],expected);
  return {code,decoded:2**(-16+code/255*22),halfBits:half[code*4],linear:DataUtils.fromHalfFloat(half[code*4])};
});
const result={version:1,type:'log2-rgb8',min:-16,max:6,
  conversion:'Three.js DataUtils.toHalfFloat: JS Number -> Float32 -> mantissa bit truncation, not nearest-even FP16',
  threeVersion:version,decoder:{file:'src/linear-radiance.js',sha256:hash(decoder)},
  dataUtils:{file:'node_modules/three/src/extras/DataUtils.js',sha256:hash(dataUtils)},
  captureScriptSha256:hash(fileURLToPath(import.meta.url)),values};
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'captured-real-app-decoder',entries:values.length,threeVersion:version,sha256:hash(out)}));
