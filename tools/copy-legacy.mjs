import {cp,mkdir} from 'node:fs/promises';
await mkdir('dist/Images/Fan',{recursive:true});
for(const name of ['Background','ISO'])await cp(`Images/${name}`,`dist/Images/${name}`,{recursive:true});
await cp('Images/Fan/7','dist/Images/Fan/7',{recursive:true});
for(const name of ['libs','loadHelper.js','sketch.js','style.css','favicon.png'])await cp(name,`dist/${name}`,{recursive:true});
