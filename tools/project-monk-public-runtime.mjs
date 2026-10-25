// Project locally accepted production packs to a portable public runtime bundle.
// This never substitutes for source/pixel acceptance and never edits original packs.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateMonkRuntimeReceipt} from './monk-receipt.mjs';
import {createMonkPublicManifest,monkPublicManifestSha256} from './monk-public-manifest.mjs';
import {validateMonkPublicReceipt,auditMonkPublicPack} from './monk-public-receipt.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert.equal(process.argv.length,3,'Use OUTPUTS_ROOT');
const outputs=path.resolve(process.argv[2]);
const receipt=JSON.parse(await readFile(path.join(root,'.assets-cache/private-production/monk-runtime-delivery.json')));
const profiles=JSON.parse(await readFile(path.join(root,'.assets-cache/private-production/monk-final-approved-inputs.json')));
validateMonkRuntimeReceipt(receipt,profiles,{complete:false});
const packs=[];
for(const record of receipt.packs){
 const profile=profiles.rigs.find(p=>p.id===record.id);assert.ok(profile);
 assert.equal(record.pixelAuditSha256,profile.pixelAuditSha256);
 assert.equal(record.renderAcceptance.allRuntimePixelsVerified,true);
 const original=await readFile(path.join(outputs,'packs',record.id,'manifest.json'));
 assert.equal(sha(original),record.files['manifest.json'].sha256,'accepted original manifest');
 const projected=createMonkPublicManifest(JSON.parse(original));
 const bytes=Buffer.from(JSON.stringify(projected,null,2)+'\n');
 const files=structuredClone(record.files);files['manifest.json']={bytes:bytes.length,sha256:sha(bytes)};
 const next={id:record.id,sourceSha256:record.sourceSha256,internalManifestSha256:sha(original),publicManifestSha256:sha(bytes),publicManifestCanonicalSha256:monkPublicManifestSha256(projected),sourcePixelAuditSha256:record.pixelAuditSha256,files};
 validateMonkPublicReceipt({version:1,schema:'monk-public-runtime-delivery-v1',packs:[next]},{complete:false});
 const directory=path.join(root,'public/scenes',record.id+'-plates');
 const temporary=path.join(directory,'manifest.json.projecting');
 await writeFile(temporary,bytes,{flag:'wx'});await rename(temporary,path.join(directory,'manifest.json'));
 await auditMonkPublicPack(directory,next);
 packs.push(next);
}
const result={version:1,schema:'monk-public-runtime-delivery-v1',packs};
validateMonkPublicReceipt(result,{complete:packs.length===3});
const file=path.join(root,'docs/visual-review/monk-runtime-delivery.json');
await writeFile(file+'.projecting',JSON.stringify(result,null,2)+'\n',{flag:'wx'});await rename(file+'.projecting',file);
console.log(JSON.stringify({publicPacks:packs.map(p=>({id:p.id,publicManifestSha256:p.publicManifestSha256,internalManifestSha256:p.internalManifestSha256})),complete:packs.length===3}));
