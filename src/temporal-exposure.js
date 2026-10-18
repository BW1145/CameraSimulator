// Midpoint quadrature of a periodic subject over a physical shutter interval.
// Complete cycles share one cycle average; the residual interval has its own
// normalized weight. Long exposures therefore do not add more render samples.
export function periodicExposureSamples(time,shutter,period,maxSamples=24){
  const duration=Math.max(1e-8,shutter),cap=Math.max(1,Math.floor(maxSamples));
  const segment=(span,count,weight)=>Array.from({length:count},(_,i)=>({time:time-span*(i+.5)/count,weight:weight/count}));
  if(duration<period||cap===1)return segment(duration,Math.min(cap,Math.max(1,Math.ceil(duration/period*cap))),1);
  let remainder=duration%period;
  if(remainder<period*1e-8||period-remainder<period*1e-8)remainder=0;
  if(remainder===0)return segment(period,cap,1);
  const residualFraction=remainder/duration,residualCount=Math.min(cap-1,Math.max(1,Math.round(cap*residualFraction)));
  return [...segment(period,cap-residualCount,1-residualFraction),...segment(remainder,residualCount,residualFraction)];
}
