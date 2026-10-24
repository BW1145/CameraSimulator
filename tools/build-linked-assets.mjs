// Explicit low-disk equivalent of `vite build --base=./ && copy-legacy`.
// Compile normally, then link identical static assets. Never edit linked dist
// files in place: rebuild/relink or replace individual files with new inodes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {LEGACY_ASSETS,listAssetFiles,linkAssetTree} from './static-assets.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const digest=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
await build({root,base:'./',build:{copyPublicDir:false}});
const compiler=[];
for(const file of await listAssetFiles(dist))compiler.push({path:file,bytes:(await stat(path.join(dist,file))).size,sha256:await digest(path.join(dist,file))});
const expected=new Map();
for(const file of await listAssetFiles(path.join(root,'public')))expected.set(file,path.join(root,'public',file));
for(const name of LEGACY_ASSETS)for(const file of await listAssetFiles(path.join(root,name))){const target=file?path.join(name,file):name;assert.ok(!expected.has(target),'static source collision');expected.set(target,path.join(root,name,file));}
for(const file of compiler)assert.ok(!expected.has(file.path),'compiled/static destination collision');
await linkAssetTree(path.join(root,'public'),dist);
for(const name of LEGACY_ASSETS)await linkAssetTree(path.join(root,name),path.join(dist,name));
assert.deepEqual((await listAssetFiles(dist)).sort(),[...expected.keys(),...compiler.map(f=>f.path)].sort(),'exact normal-build file set');
const staticFiles=[];
for(const [file,source]of expected){
  const destination=path.join(dist,file),a=await stat(source),b=await stat(destination),sha256=await digest(source);
  assert.equal(b.size,a.size);assert.equal(await digest(destination),sha256,'normal-build static bytes');
  assert.equal(a.dev,b.dev);assert.equal(a.ino,b.ino,'static bytes occupy the same immutable inode');
  staticFiles.push({path:file,bytes:a.size,sha256});
}
for(const file of compiler){assert.equal((await stat(path.join(dist,file.path))).size,file.bytes);assert.equal(await digest(path.join(dist,file.path)),file.sha256,'compiled output was not overwritten');}
const receipt={version:1,method:'Normal Vite compilation with copyPublicDir:false; immutable hardlinks for the exact shared normal-build static list',compilerFiles:compiler,staticFiles,staticBytesNotDuplicated:staticFiles.reduce((n,f)=>n+f.bytes,0)};
await mkdir(path.join(root,'.assets-cache'),{recursive:true});await writeFile(path.join(root,'.assets-cache/linked-build-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:'verified',compilerFiles:compiler.length,staticFiles:staticFiles.length,staticBytesNotDuplicated:receipt.staticBytesNotDuplicated,warning:'Linked dist assets are read-only by workflow; never mutate their content in place.'},null,2));
