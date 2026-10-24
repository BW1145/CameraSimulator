import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateDerivedManifest,validateDerivedRig,validateDerivedInputs,validateDerivedProfile,validateDerivedReceipt,validateDerivedDelivery,auditDerivedPack} from '../tools/derived-viewpoint-audit.mjs';

// Metadata-only tests. Normal CI reads the complete committed runtime packs and
// portable receipt. Before import, an explicit production root permits the same
// tests against frozen metadata without decoding/copying any image.
const profiles=JSON.parse(await readFile(new URL('../docs/visual-review/derived-viewpoints-approved-inputs.json',import.meta.url),'utf8'));
const productionRoot=process.env.DERIVED_AUDIT_PRODUCTION_ROOT;
const portable=productionRoot?null:JSON.parse(await readFile(new URL('../docs/visual-review/derived-viewpoints-delivery.json',import.meta.url),'utf8'));
const fixtures=[];
for(const profile of profiles.rigs){
  let rig,files,pack;
  if(productionRoot){
    const root=path.join(productionRoot,`${profile.id}-production-20261024`);
    rig=JSON.parse(await readFile(path.join(root,'rig-config.json'),'utf8')).rigs[0];
    const delivery=JSON.parse(await readFile(path.join(root,'outputs/delivery.json'),'utf8'));
    files=delivery.rigs[0].files;pack=JSON.parse(await readFile(path.join(delivery.rigs[0].pack,'manifest.json'),'utf8'));
  }else{
    const record=portable.packs.find(p=>p.id===profile.id);assert.ok(record,'the actual imported pack is required');
    rig=record.rig;files=record.files;pack=JSON.parse(await readFile(new URL(`../public/scenes/${profile.id}-plates/manifest.json`,import.meta.url),'utf8'));
  }
  fixtures.push({profile,rig,files,pack});
}
const fixture=(id='kitchen-pastry')=>structuredClone(fixtures.find(f=>f.profile.id===id));
const accepted=({pack,rig,profile})=>{validateDerivedManifest(pack,profile);validateDerivedRig(pack,rig,profile);};
const runtimeDelivery=()=>({version:1,schema:'derived-viewpoint-runtime-delivery-v1',packs:fixtures.map(({profile,rig,files})=>({id:profile.id,sourceSha256:profile.sourceSha256,deliverySha256:profile.deliverySha256,specSha256:profile.specSha256,files,rig}))});

for(const original of fixtures)test(`${original.profile.id}: actual completed metadata preserves reviewed source, native rays and quality`,()=>{
  const f=structuredClone(original);accepted(f);validateDerivedReceipt(f.files);validateDerivedInputs(f.rig,f.profile);
  assert.equal(f.pack.referenceFocal,f.profile.referenceFocal);assert.deepEqual(f.pack.defaults,f.profile.defaults);
});

test('tea flash keeps its measured 25k+ linear HDR rather than the depth transport range',()=>{
  const f=fixture('kitchen-tea');accepted(f);
  assert.ok(f.pack.flash.encoding.sourceMaximumRadiance>25000);assert.equal(f.pack.flash.encoding.max,15);
  assert.equal(f.pack.depth.range,64);assert.ok(f.pack.flash.encoding.sourceMaximumRadiance>f.pack.depth.range);
});

test('pastry keeps asymmetric physical capture bounds, not a symmetric guessed rig',()=>{
  const f=fixture();accepted(f);assert.deepEqual(f.pack.bounds.x,[-.08,.025]);assert.deepEqual(f.pack.bounds.z,[-.08,.04]);
});

for(const [label,mutate]of [
  ['unreviewed source',f=>{f.pack.sourceSha256='a'.repeat(64);}],
  ['wrong original source',f=>{f.pack.sourceProvenance.originalSha256='a'.repeat(64);}],
  ['wrong CC0 license',f=>{f.pack.sourceProvenance.license='CC0';}],
  ['missing author',f=>{delete f.pack.sourceProvenance.originalAuthor;}],
  ['source object edits hidden as a camera-only change',f=>{f.pack.sourceProvenance.sourceFreeze.frozenObjectCount+=1;}],
  ['unapproved preview image',f=>{f.pack.approvedComposition.preview.sha256='b'.repeat(64);}],
  ['native crop passed as the whole capture',f=>{f.pack.approvedComposition.captureFrame.width=5120;}],
  ['old center dimensions labelled as 6144',f=>{f.pack.captureQuality.sourceCenter.width=5120;}],
  ['runtime map source width changed',f=>{f.pack.views[0].radianceCapture.sourceWidth=5120;}],
  ['missing HDR maximum',f=>{delete f.pack.flash.encoding.sourceMaximumRadiance;}],
  ['clipped flash',f=>{f.pack.flash.views[0].clampedChannels=1;}],
  ['negative radiance',f=>{f.pack.detail.views[0].negativeChannels=1;}],
  ['under-sized log encoding with coherent quantization field',f=>{f.pack.flash.encoding.max=7;f.pack.flash.encoding.maximumChannelQuantizationEV=(7-f.pack.flash.encoding.min)/510;}],
  ['a view maximum outside the encoding',f=>{f.pack.flash.views[0].maximumRadiance=2**20;}],
  ['wrong default focus',f=>{f.pack.defaults.focus=.5;}],
  ['wrong formal Z evidence',f=>{f.pack.defaultsEvidence.focus.sourceSha256='a'.repeat(64);}],
  ['different near plane',f=>{f.pack.views[1].near=.1;}],
  ['arbitrary captured pose',f=>{f.pack.views[1].cameraMatrix[12]+=.1;}],
  ['arbitrary world projection',f=>{f.pack.views[1].matrix[4]+=.1;}],
  ['misregistered flash',f=>{f.pack.flash.views[1].cameraMatrix[12]+=.1;}],
  ['missing physical direction',f=>{f.pack.views.pop();}],
  ['missing higher-resolution depth direction',f=>{f.pack.detailDepth.views.pop();}],
  ['invented wider movement bound',f=>{f.pack.bounds.x[1]=.08;}],
  ['independent 32-sample base incorrectly claimed as delivered',f=>{f.pack.views[0].independentBaseCapture.delivered=true;}],
  ['staged raw from a different source',f=>{for(const r of [f.pack.views[0].radianceCapture,f.pack.detail.views[0],f.pack.captureQuality.sourceCenter])r.denoisingEvidence.rawCaptureEvidence.sourceSha256='a'.repeat(64);}],
  ['manual center denoiser tiles',f=>{for(const r of [f.pack.views[0].radianceCapture,f.pack.detail.views[0],f.pack.captureQuality.sourceCenter])r.denoisingEvidence.manualTiling=true;}],
])test(`derived metadata rejects ${label}`,()=>{
  const f=fixture();mutate(f);assert.throws(()=>accepted(f));
});

test('a coherent replacement rig is rejected by the independently frozen canonical rig hash',()=>{
  const f=fixture();f.rig.defaults.focus=.5;f.pack.defaults.focus=.5;
  assert.throws(()=>validateDerivedInputs(f.rig,f.profile));
});

test('an unapproved future scene cannot be admitted merely by constructing a profile',()=>{
  const f=fixture();f.profile.id='unreviewed-derived-view';f.profile.deliverySchema='unreviewed-derived-view-delivery-v1';
  assert.throws(()=>validateDerivedProfile(f.profile));
});

test('portable receipt accepts complete exact pinned kitchen records without production paths',()=>{
  assert.equal(validateDerivedDelivery(runtimeDelivery(),profiles).packs.length,2);
});
for(const [label,mutate]of [
  ['missing image',r=>{delete r['center-flash.webp'];}],
  ['extra image',r=>{r['unused.webp']=r['center.webp'];}],
  ['parent traversal name',r=>{r['../center.webp']=r['center.webp'];delete r['center.webp'];}],
  ['zero size',r=>{r['center.webp'].bytes=0;}],
  ['malformed hash',r=>{r['center.webp'].sha256='bad';}],
])test(`derived file receipt rejects ${label}`,()=>{const f=fixture();mutate(f.files);assert.throws(()=>validateDerivedReceipt(f.files));});
for(const [label,mutate]of [
  ['wrong delivery hash',d=>{d.packs[0].deliverySha256='a'.repeat(64);}],
  ['wrong spec hash',d=>{d.packs[0].specSha256='a'.repeat(64);}],
  ['wrong pinned manifest',d=>{d.packs[0].files['manifest.json'].sha256='a'.repeat(64);}],
  ['duplicate scene',d=>{d.packs.push(d.packs[0]);}],
  ['unknown scene',d=>{d.packs[0].id='unknown';}],
])test(`portable derived receipt rejects ${label}`,()=>{const d=structuredClone(runtimeDelivery());mutate(d);assert.throws(()=>validateDerivedDelivery(d,profiles));});


test('actual file audit rejects a symlink manifest before following or decoding it',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'derived-audit-link-'));
  try{
    const target=path.join(root,'outside.json');await writeFile(target,'not accepted runtime metadata');
    await symlink(target,path.join(root,'manifest.json'));
    const f=fixture();await assert.rejects(auditDerivedPack(root,f.files,f.rig,f.profile),/non-symlink/);
  }finally{await rm(root,{recursive:true,force:true});}
});
