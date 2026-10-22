import assert from 'node:assert/strict';
export function distribution(values){
  const finite=values.filter(Number.isFinite).sort((a,b)=>a-b),at=p=>finite.length?finite[Math.min(finite.length-1,Math.ceil(finite.length*p)-1)]:null;
  return {n:finite.length,min:finite[0]??null,p50:at(.5),p95:at(.95),max:finite.at(-1)??null,sum:finite.reduce((a,b)=>a+b,0)};
}
export function summarize(evidence,scenarios){
  return Object.fromEntries(scenarios.map(s=>{
    const frames=evidence.frames.filter(f=>f.label===s.id),reads=evidence.reads.filter(r=>r.label===s.id),longTasks=evidence.longTasks.filter(t=>t.label===s.id);
    return [s.id,{latencies:s.latencies,renderedRafCpuMs:distribution(frames.map(f=>f.cpuMs)),wholeRafGpuMs:distribution(frames.map(f=>f.gpuMs)),drawCalls:distribution(frames.map(f=>f.drawCalls)),readbackCalls:reads.length,readbackCpuMs:distribution(reads.map(r=>r.cpuMs)),synchronousArrayReads:reads.filter(r=>r.mode==='synchronous-array').length,pixelPackBufferReads:reads.filter(r=>r.mode==='pixel-pack-buffer').length,longTaskMs:distribution(longTasks.map(t=>t.duration)),gpuSampleMissing:frames.filter(f=>f.gpuUnavailable).map(f=>f.gpuUnavailable)}];
  }));
}
export function comparePixels(a,b){
  assert.equal(a.length,b.length,'matched captures must have equal byte lengths');let sum=0,max=0,changed=0;
  for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);sum+=d;max=Math.max(max,d);if(d)changed++;}
  return {bytes:a.length,meanAbsoluteByteDifference:sum/a.length,maxAbsoluteByteDifference:max,changedByteFraction:changed/a.length,identical:changed===0};
}
