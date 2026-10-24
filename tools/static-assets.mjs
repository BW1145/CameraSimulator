import assert from 'node:assert/strict';
import {readdir,lstat,mkdir,link} from 'node:fs/promises';
import path from 'node:path';
// Shared by the ordinary copy build and the explicitly budgeted hardlink build.
export const LEGACY_ASSETS=['Images/Background','Images/ISO','Images/Fan/7','libs','loadHelper.js','sketch.js','style.css','favicon.png','LICENSE'];
export async function listAssetFiles(root){
  const files=[];
  async function visit(relative){
    const file=path.join(root,relative),entry=await lstat(file);
    assert.ok(!entry.isSymbolicLink(),`static asset must not be a symlink: ${file}`);
    if(entry.isDirectory())for(const name of (await readdir(file)).sort())await visit(path.join(relative,name));
    else{assert.ok(entry.isFile(),`regular asset required: ${file}`);files.push(relative);}
  }
  await visit('');return files;
}
export async function linkAssetTree(source,destination){
  const entry=await lstat(source);assert.ok(!entry.isSymbolicLink(),'no linked symlink assets');
  if(entry.isDirectory()){
    await mkdir(destination,{recursive:true});
    for(const name of (await readdir(source)).sort())await linkAssetTree(path.join(source,name),path.join(destination,name));
  }else{
    assert.ok(entry.isFile(),'only regular asset files');await mkdir(path.dirname(destination),{recursive:true});
    // No copy fallback and no in-place overwrite: EXDEV/EEXIST fails closed.
    await link(source,destination);
  }
}
