import {cp,mkdir} from 'node:fs/promises';
import {LEGACY_ASSETS} from './static-assets.mjs';
await mkdir('dist/Images/Fan',{recursive:true});
for(const name of LEGACY_ASSETS)await cp(name,`dist/${name}`,{recursive:true});
