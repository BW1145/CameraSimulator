// Exposure equations use seconds, metres, millimetres and EV100.
export const APERTURES = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
export const SHUTTERS = [1/8000, 1/4000, 1/2000, 1/1000, 1/500, 1/250, 1/125, 1/60, 1/30, 1/15, 1/8, 1/4, 1/2, 1, 2, 4, 8, 15, 30];
export const ISOS = [50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600];
export const DEFAULTS = Object.freeze({
  aperture: 4, shutter: 1/125, iso: 200, wb: 5000, mode: 'M', autoISO: true,
  compensation: 0, metering: 'matrix', focal: 35, focus: 3, af: 'AF-S',
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, crop: '21:9', sensor:'full',
  grid: false, level: false, histogram: false, zebra: false,
  motion: false, pause: false, flash: 0, magnifier: true,
});
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const nearest = (x, values) => values.reduce((a,b) => Math.abs(Math.log2(b/x)) < Math.abs(Math.log2(a/x)) ? b : a);
export const ev100 = (n, t, iso) => Math.log2(n*n/t*100/iso);
export const formatShutter = t => t >= 1 ? `${t} s` : `1/${Math.round(1/t)} s`;

export function resolveExposure(s, meteredEV) {
  // Positive compensation means MORE light: reduce the target camera EV.
  const target = meteredEV - ((s.mode !== 'M' || s.autoISO) ? s.compensation : 0);
  let n = s.aperture, t = s.shutter, iso = s.iso;
  if (s.mode === 'P') n = 4;
  if (s.mode === 'A' || s.mode === 'P') {
    if (s.autoISO) {
      t = nearest(1 / Math.max(60, s.focal), SHUTTERS);
      const wanted = 100*n*n/t/2**target;
      iso = nearest(clamp(wanted, 50, 25600), ISOS);
      if (wanted < 50 || wanted > 25600) t = nearest(n*n*100/iso/2**target, SHUTTERS);
    } else t = nearest(n*n*100/iso/2**target, SHUTTERS);
  } else if (s.mode === 'S') {
    n = nearest(Math.sqrt(2**target*t*(s.autoISO ? 1 : iso/100)), APERTURES);
    if (s.autoISO) iso = nearest(clamp(100*n*n/t/2**target, 50, 25600), ISOS);
  } else if (s.autoISO) iso = nearest(clamp(100*n*n/t/2**target, 50, 25600), ISOS);
  const actual = ev100(n,t,iso);
  return { aperture:n, shutter:t, iso, deviation: meteredEV-actual, limited: (s.mode!=='M'||s.autoISO)&&Math.abs(target-actual)>0.55 };
}

export const srgbToLinear = v => v<=0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4;
export const linearToSrgb = v => v<=0.0031308 ? 12.92*v : 1.055*v**(1/2.4)-0.055;
export function meterPixels(pixels, width, height, mode, point={x:0.5,y:0.5}) {
  return weightedMeter(pixels,width,height,mode,point,v=>srgbToLinear(v/255));
}
export function meterLinearPixels(pixels, width, height, mode, point={x:0.5,y:0.5}) {
  return weightedMeter(pixels,width,height,mode,point,v=>v);
}
function weightedMeter(pixels, width, height, mode, point, linear) {
  let sum=0, weight=0;
  // Log-average in linear light; input is an unexposed sRGB scene plate.
  for (let y=0; y<height; y+=4) for (let x=0; x<width; x+=4) {
    const dx=x/width-(mode==='spot'?point.x:0.5), dy=y/height-(mode==='spot'?point.y:0.5);
    const d=dx*dx+dy*dy;
    const w=mode==='spot' ? (d<0.0064?1:0) : mode==='center' ? 0.15+Math.exp(-d*20) : 1;
    const i=(y*width+x)*4;
    const l=0.2126*linear(pixels[i])+0.7152*linear(pixels[i+1])+0.0722*linear(pixels[i+2]);
    sum+=Math.log2(Math.max(0.00000001,l))*w; weight+=w;
  }
  return 2**(sum/Math.max(1,weight));
}

export function circleOfConfusion(depth, focus, focal, aperture, frameWidth=36) {
  const f=focal/1000;
  return Math.abs(f*f*(depth-focus)/(aperture*depth*Math.max(0.01,focus-f)))*1000/frameWidth;
}
export function histogram(pixels) {
  const bins=new Uint32Array(64);
  for (let i=0;i<pixels.length;i+=16) bins[Math.min(63,Math.floor((0.2126*pixels[i]+0.7152*pixels[i+1]+0.0722*pixels[i+2])/4))]++;
  return bins;
}
