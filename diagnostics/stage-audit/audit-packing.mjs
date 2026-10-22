// Reproduce from the repository root:
// node diagnostics/stage-audit/audit-packing.mjs [raw EXR] [packed WebP] [output directory]
// Defaults resolve the existing, separately generated matched-reference capture.
// No browser is used: canvas color handling is tested separately by browser CI.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {FloatType,DataUtils} from 'three';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {decodeRadiancePixels} from '../../src/linear-radiance.js';
const here=path.dirname(new URL(import.meta.url).pathname);
const rawPath=path.resolve(process.argv[2]??path.join(here,'../../../matched-reference/capture/matched-64spp-oidn.exr'));
const webpPath=path.resolve(process.argv[3]??path.join(here,'../matched-reference/center.webp'));
const out=path.resolve(process.argv[4]??here);
const min=-16,max=8,low=2**min,high=2**max;
await fs.mkdir(out,{recursive:true});
const bytes=await fs.readFile(rawPath),webpBytes=await fs.readFile(webpPath);
const exr=new EXRLoader().setDataType(FloatType).parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const {data:rgba,info}=await sharp(webpBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const metadata=await sharp(webpBytes).metadata();
const {width:W,height:H}=exr;
if(info.width!==W||info.height!==H)throw Error('Dimension mismatch');
const half=decodeRadiancePixels(rgba,min,max),N=W*H;
const regionDefinitions=JSON.parse(await fs.readFile(path.join(here,'regions.json'),'utf8'));
const regions=Object.fromEntries(regionDefinitions.map(({id,rect:[x,y,w,h]})=>[id,[x,y,x+w,y+h]]));
regions.darkShelf=[240,12,660,225];
const legacyRangeHypothesis={label:'Hypothetical encoding of this same matched-camera EXR using canonical log2[-16,6]. This is NOT a measurement of the different-camera canonical source.',maximum:64,clippedPixels:0,clippedChannels:0,excessRadianceSumRGB:[0,0,0],sourceRadianceSumRGB:[0,0,0],maximumSource:0};
const stats=Object.fromEntries(Object.keys(regions).map(k=>[k,{pixelCount:0,channels:0,zeros:0,belowFloor:0,aboveCeiling:0,nonfinite:0,negative:0,codeMismatches:0,rgbSumSource:[0,0,0],rgbSumDecoded:[0,0,0],absoluteLinearError:[],evError:[],halfFloatEVError:[],displayAbsCodeError:[],displayMaxPixelError:[],luminanceEVError:[],sourceMaximum:0,halfFloatMaximum:0}]));
const sourceDisplay=Buffer.alloc(N*3),packedDisplay=Buffer.alloc(N*3),heatmap=Buffer.alloc(N*3);
const luminance=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
const aces=x=>(x*(2.51*x+.03))/(x*(2.43*x+.59)+.14);
const display=x=>{const a=Math.max(0,aces(x));return Math.max(0,Math.min(1,a<.0031308?12.92*a:1.055*a**(1/2.4)-.055));};
let maximumAbsEVLocation=null,maxEV=-Infinity;
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const i=y*W+x,src=((H-1-y)*W+x)*4;
 const a=[0,1,2].map(c=>exr.data[src+c]);
 const b=[0,1,2].map(c=>DataUtils.fromHalfFloat(half[i*4+c]));
 if(a.some(v=>v>64))legacyRangeHypothesis.clippedPixels++;
 for(let c=0;c<3;c++){legacyRangeHypothesis.clippedChannels+=a[c]>64;legacyRangeHypothesis.excessRadianceSumRGB[c]+=Math.max(0,a[c]-64);legacyRangeHypothesis.sourceRadianceSumRGB[c]+=a[c];legacyRangeHypothesis.maximumSource=Math.max(legacyRangeHypothesis.maximumSource,a[c]);}
 const displayError=[];
 for(let c=0;c<3;c++){
  sourceDisplay[i*3+c]=Math.round(display(a[c])*255);
  packedDisplay[i*3+c]=Math.round(display(b[c])*255);
  displayError.push(Math.abs(display(a[c])-display(b[c]))*255);
 }
 const maxPixel=Math.max(...displayError);heatmap[i*3]=Math.min(255,Math.round(maxPixel*40));
 for(const [name,[x0,y0,x1,y1]] of Object.entries(regions)){
  if(x<x0||x>=x1||y<y0||y>=y1)continue;
  const s=stats[name];s.pixelCount++;s.displayMaxPixelError.push(maxPixel);
  if(luminance(a)>=low)s.luminanceEVError.push(Math.log2(luminance(b)/luminance(a)));
  for(let c=0;c<3;c++){
   const v=a[c],d=b[c],code=rgba[i*4+c],expected=Math.round(Math.max(0,Math.min(255,(Math.log2(Math.max(v,low))-min)/(max-min)*255)));
   const quantized=2**(min+code/255*(max-min));
   s.channels++;s.zeros+=v===0;s.belowFloor+=v<low;s.aboveCeiling+=v>high;s.nonfinite+=!Number.isFinite(v);s.negative+=v<0;s.codeMismatches+=code!==expected;
   s.rgbSumSource[c]+=v;s.rgbSumDecoded[c]+=d;s.absoluteLinearError.push(Math.abs(d-v));s.sourceMaximum=Math.max(s.sourceMaximum,v);s.halfFloatMaximum=Math.max(s.halfFloatMaximum,d);
   s.displayAbsCodeError.push(displayError[c]);s.halfFloatEVError.push(Math.log2(d/quantized));
   if(v>=low&&v<=high){const ev=Math.log2(d/v);s.evError.push(ev);if(name==='whole'&&Math.abs(ev)>maxEV){maxEV=Math.abs(ev);maximumAbsEVLocation={x,y,channel:'RGB'[c],source:v,code,decoded:d,ev};}}
  }
 }
}
function distribution(a){const n=a.length;if(!n)return null;const mean=a.reduce((s,v)=>s+v,0)/n;const abs=a.map(Math.abs).sort((a,b)=>a-b);const sorted=[...a].sort((a,b)=>a-b);const q=(v,p)=>v[Math.min(n-1,Math.floor((n-1)*p))];return {count:n,mean,rms:Math.sqrt(a.reduce((s,v)=>s+v*v,0)/n),minimum:sorted[0],maximum:sorted[n-1],meanAbsolute:abs.reduce((s,v)=>s+v,0)/n,p50Absolute:q(abs,.5),p95Absolute:q(abs,.95),p99Absolute:q(abs,.99),maxAbsolute:abs[n-1]};}
const outputRegions={};
for(const [name,s] of Object.entries(stats)){
 const n=s.pixelCount;
 outputRegions[name]={rectXYXY:regions[name],pixelCount:n,channels:s.channels,zeros:s.zeros,belowEncodingFloor:s.belowFloor,aboveEncodingCeiling:s.aboveCeiling,nonfinite:s.nonfinite,negative:s.negative,decodedCodeMismatches:s.codeMismatches,sourceMaximum:s.sourceMaximum,decodedMaximum:s.halfFloatMaximum,meanRGBSource:s.rgbSumSource.map(v=>v/n),meanRGBDecoded:s.rgbSumDecoded.map(v=>v/n),meanChannelRelativeShiftPercent:s.rgbSumSource.map((v,c)=>(s.rgbSumDecoded[c]/v-1)*100),absoluteLinearError:distribution(s.absoluteLinearError),nonClampedChannelEVError:distribution(s.evError),additionalHalfFloatEVError:distribution(s.halfFloatEVError),luminanceEVError:distribution(s.luminanceEVError),displayChannelErrorIn8BitCodeUnits:distribution(s.displayAbsCodeError),displayMaxPixelErrorIn8BitCodeUnits:distribution(s.displayMaxPixelError),displayPixelsOver1Code:s.displayMaxPixelError.filter(v=>v>1).length,displayPixelsOver2Codes:s.displayMaxPixelError.filter(v=>v>2).length,displayPixelsOver3Codes:s.displayMaxPixelError.filter(v=>v>3).length,displayPixelsOver4Codes:s.displayMaxPixelError.filter(v=>v>4).length};
}
const theoreticalHalfEV=(max-min)/510,halfFloatBoundEV=Math.max(...Array.from({length:256},(_,code)=>Math.abs(Math.log2(DataUtils.fromHalfFloat(DataUtils.toHalfFloat(2**(min+code/255*(max-min))))/2**(min+code/255*(max-min)))))),whole=outputRegions.whole;
legacyRangeHypothesis.clippedPixelPercent=legacyRangeHypothesis.clippedPixels/N*100;
legacyRangeHypothesis.removedRadiancePercentRGB=legacyRangeHypothesis.excessRadianceSumRGB.map((v,c)=>v/legacyRangeHypothesis.sourceRadianceSumRGB[c]*100);
const result={method:'Exact per-texel EXR RGB -> independently recomputed log2[-16,8] uint8 -> decoded lossless WebP -> actual production decodeRadiancePixels half-float. Original JPEG not used. Display estimates are NON-PRODUCTION SENSITIVITY ONLY: explicitly defined ACES approximation then IEC sRGB, exposure0/WB5000, no noise/filtering/DOF. Production restoredLighting uses AgX and is audited separately.',source:{file:path.basename(rawPath),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),dimensions:[W,H]},transport:{file:path.basename(webpPath),sha256:crypto.createHash('sha256').update(webpBytes).digest('hex'),bytes:webpBytes.length,metadata:{format:metadata.format,space:metadata.space,channels:metadata.channels,hasAlpha:metadata.hasAlpha,hasIccProfile:Boolean(metadata.icc),orientation:metadata.orientation??null}},encoding:{min,max,minimum:low,maximum:high,stepEV:(max-min)/255,maximumIdealQuantizationEV:theoreticalHalfEV,maximumAdditionalHalfFloatEV:halfFloatBoundEV,maximumCombinedNonClampedEV:theoreticalHalfEV+halfFloatBoundEV,maximumIdealRelativeErrorPercent:(2**theoreticalHalfEV-1)*100},acceptance:{losslessTransportExact:whole.decodedCodeMismatches===0,noUpperClipping:whole.aboveEncodingCeiling===0,finiteNonnegative:whole.nonfinite===0&&whole.negative===0,quantizationWithinMathematicalBound:whole.nonClampedChannelEVError.maxAbsolute<=theoreticalHalfEV+halfFloatBoundEV,blackFloorAffectsBelowOneTenthPercentOfChannels:whole.belowEncodingFloor/whole.channels<.001},maximumAbsEVLocation,hypotheticalCanonicalRange:legacyRangeHypothesis,regions:outputRegions,limitations:['EXR decoded source values were independently cross-checked with Blender; see cross-decoder-verification.json.','Luminance EV includes pixels with below-floor channels: its extreme near-black ratios are not the non-clamped per-channel bound.',
'Offline WebP decode verifies file coding, not browser Canvas/ICC behavior. Browser extraction must compare bytes or the transformed image separately.','The auxiliary ACES images are a sensitivity check, not the active production AgX display or a comparison to Blender AgX.',
'An 8-bit log encoding is quantized: this audit does not call 3.3% maximum relative per-channel error lossless radiance.','Display estimates isolate transport/half-float only, not GPU filtering, projection, display noise, color management, DOF, or subject compositing.','Source is a 64-spp OIDN diagnostic. This says nothing about missing source texture contributions or original-reference settings.']};
await fs.writeFile(path.join(out,'packing-audit.json'),JSON.stringify(result,null,2)+'\n');
await sharp(sourceDisplay,{raw:{width:W,height:H,channels:3}}).png().toFile(path.join(out,'expected-source-neutral-aces.png'));
await sharp(packedDisplay,{raw:{width:W,height:H,channels:3}}).png().toFile(path.join(out,'expected-packed-neutral-aces.png'));
await sharp(heatmap,{raw:{width:W,height:H,channels:3}}).png().toFile(path.join(out,'packing-display-error-x40.png'));
console.log(JSON.stringify({source:result.source,transport:result.transport,encoding:result.encoding,acceptance:result.acceptance,whole,maximumAbsEVLocation},null,2));
