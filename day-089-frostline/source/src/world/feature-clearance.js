const runoutIndex=new WeakMap();
function runoutNear(meta,x,z,padding){
 const paths=meta.runoutClearance??[];let index=runoutIndex.get(meta);if(!index||index.count!==paths.length){const bins=new Map();for(const path of paths)for(const q of path.points){const r=path.radius+4;for(let j=Math.floor((q[1]-r)/64);j<=Math.floor((q[1]+r)/64);j++)for(let i=Math.floor((q[0]-r)/64);i<=Math.floor((q[0]+r)/64);i++){const key=i+':'+j;if(!bins.has(key))bins.set(key,[]);bins.get(key).push({x:q[0],z:q[1],r:path.radius});}}index={count:paths.length,bins};runoutIndex.set(meta,index);}
 return (index.bins.get(Math.floor(x/64)+':'+Math.floor(z/64))??[]).some(q=>(q.x-x)**2+(q.z-z)**2<=(q.r+padding)**2);
}
/** Shared exclusion for procedural obstacles; padding includes the object's radius. */
export function inFeatureClearance(meta,x,z,padding=0){
  for(const s of meta.stations??[])if(Math.hypot(x-s.x,z-s.z)<=s.radius+padding+8)return true;
  for(const p of meta.reserved??[]){if(!p.id?.startsWith('east-park'))continue;const dx=x-p.x,dz=z-p.z,s=dx*Math.sin(p.heading)-dz*Math.cos(p.heading),t=dx*Math.cos(p.heading)+dz*Math.sin(p.heading);if(s>=-24-padding&&s<=p.length+24+padding&&Math.abs(t)<=99+padding)return true;}
  if(runoutNear(meta,x,z,padding))return true;
  for(const f of meta.features??[]){
    const dx=x-f.x,dz=z-f.z,s=dx*Math.sin(f.heading)-dz*Math.cos(f.heading),t=dx*Math.cos(f.heading)+dz*Math.sin(f.heading);
    // 飛ぶ仕掛け（台・崖・雪の段）は、着地の先も、木と岩を除く：着地してから時速 60〜100 km で 4〜5 秒ぶん（140 m）。先へ行くほど幅を広げる。
    // 着地の先 90 m で木が始まっていたときは、着地に成功しても、すぐ木に当たった（2026-11-11）
    const runout=f.kind==='rollers'?25:165,spread=s>0?.14*s:0;
    if(s>=-90-padding&&s<=f.length+padding+runout&&Math.abs(t)<=f.width/2+padding+12+spread)return true;
  }
  return false;
}
