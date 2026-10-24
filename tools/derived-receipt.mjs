import assert from 'node:assert/strict';
import {validateDerivedDelivery as validatePortableDelivery} from './derived-viewpoint-audit.mjs';
// The import may add one newly completed rig later, while aggregate CI requires
// every independently approved scene to have its complete delivered receipt.
export function validateDerivedDelivery(receipt,profiles,{complete=true}={}){
  validatePortableDelivery(receipt,{version:1,rigs:profiles});
  if(complete)assert.deepEqual(receipt.packs.map(record=>record.id).sort(),profiles.map(profile=>profile.id).sort(),'all approved derived packs are present');
  return receipt;
}
