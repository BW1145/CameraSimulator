/** Independent JS scalar oracle for the defined production Three AgX + sRGB transform.
 * Deliberately does NOT run or parse the production GLSL. Constants are transcribed
 * from the installed Three 0.186.1 public transform, matrices here are ROW-major.
 * This verifies implementation consistency, not that Three's approximation is
 * identical to Blender's OCIO AgX view or the unknown original JPEG pipeline.
 */
export const TRANSFORM_ID='Three-r186-AgX-polynomial-linear-sRGB+IEC-sRGB';
const to2020=[.6274,.3293,.0433,.0691,.9195,.0113,.0164,.0880,.8956];
const from2020=[1.6605,-.5876,-.0728,-.1246,1.1329,-.0083,-.0182,-.1006,1.1187];
const inset=[.856627153315983,.0951212405381588,.0482516061458583,.137318972929847,.761241990602591,.101439036467562,.11189821299995,.0767994186031903,.811302368396859];
const outset=[1.1271005818144368,-.11060664309660323,-.016493938717834573,-.1413297634984383,1.157823702216272,-.016493938717834257,-.14132976349843826,-.11060664309660294,1.2519364065950405];
const mul=(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
export const clamp=x=>Math.max(0,Math.min(1,x));
export const linearToSrgb=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
export function displayRGB(rgb,{ev=0,wb=5000}={}){
 const temperature=(wb-5000)/3000,scale=2**ev;
 let v=mul(inset,mul(to2020,[rgb[0]*scale*Math.exp(temperature*.32),rgb[1]*scale,rgb[2]*scale*Math.exp(-temperature*.32)]));
 v=v.map(x=>clamp((Math.log2(Math.max(1e-10,x))+12.47393)/16.499999));
 v=v.map(x=>15.5*x**6-40.14*x**5+31.96*x**4-6.868*x**3+.4298*x*x+.1191*x-.00232);
 v=mul(outset,v).map(x=>Math.max(0,x)**2.2);
 return mul(from2020,v).map(x=>clamp(linearToSrgb(clamp(x))));
}
export function displayImage(data,options={}){const out=new Uint8Array(data.length);for(let i=0;i<data.length;i+=4){const rgb=displayRGB([data[i],data[i+1],data[i+2]],options);for(let c=0;c<3;c++)out[i+c]=Math.round(255*rgb[c]);out[i+3]=255;}return out;}
export function halfToFloat(h){const sign=(h&0x8000)?-1:1,e=(h>>10)&31,m=h&1023;return sign*(e===0?m*2**-24:e===31?(m?NaN:Infinity):(1+m/1024)*2**(e-15));}
export function decodeHalfBuffer(buffer){const out=new Float32Array(buffer.byteLength/2);for(let i=0;i<out.length;i++)out[i]=halfToFloat(buffer.readUInt16LE(i*2));return out;}
export function metrics(a,b,width,height,rect=[0,0,width,height]){
 const [x0,y0,w,h]=rect,errors=[],signed=[0,0,0],meanA=[0,0,0],meanB=[0,0,0];let sq=0,over1=0,over2=0,nonfinite=0;
 for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)for(let c=0;c<3;c++){const i=(y*width+x)*4+c,av=a[i],bv=b[i],d=bv-av,e=Math.abs(d);if(!Number.isFinite(e)){nonfinite++;continue;}errors.push(e);sq+=d*d;signed[c]+=d;meanA[c]+=av;meanB[c]+=bv;over1+=e>1;over2+=e>2;}
 errors.sort((x,y)=>x-y);const pixels=w*h,n=errors.length;return {pixels,channels:n,nonfinite,mae:errors.reduce((s,x)=>s+x,0)/n,rmse:Math.sqrt(sq/n),p95:errors[Math.floor((n-1)*.95)],p99:errors[Math.floor((n-1)*.99)],max:errors.at(-1),fractionOver1:over1/n,fractionOver2:over2/n,signedMeanRGB:signed.map(x=>x/pixels),meanRGBReference:meanA.map(x=>x/pixels),meanRGBTest:meanB.map(x=>x/pixels)};
}
