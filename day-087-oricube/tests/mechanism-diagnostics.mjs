// Numerical constraint rank at a supplied configuration, not a global mobility proof.
import {mechanismPose,mechanismPoint} from '../lib/mechanism.js';
import {sub,dot,norm,rotate} from '../lib/math.js';
export function loopResiduals(core,angles) {
  const {poses}=mechanismPose(core,angles),result=[];
  for(const i of core.loops) {
    const h=core.hinges[i],a=poses[h.a],b=poses[h.b],origin=mechanismPoint(a,h.edge[0]);
    const axis=[0,1,2].map(i=>dot(h.axis,a.r.map(v=>v[i])));
    for(const p of h.edge)result.push(...sub(mechanismPoint(a,p),mechanismPoint(b,p)));
    for(let k=0;k<3;k++)result.push(...sub(rotate(a.r[k],[0,0,0],axis,angles[i]),b.r[k]));
  }
  return result;
}
export function mechanismDimensions(core,angles) {
  const columns=angles.map((_,i)=>{
    const plus=angles.slice(),minus=angles.slice();plus[i]+=1e-5;minus[i]-=1e-5;
    const a=loopResiduals(core,plus),b=loopResiduals(core,minus);return a.map((v,k)=>(v-b[k])/2e-5);
  });
  let rank=0;
  // Pivoted, reorthogonalized QR avoids tiny Gaussian pivots at folded vertices.
  while(columns.length) {
    const lengths=columns.map(norm),pivot=lengths.indexOf(Math.max(...lengths));
    if(lengths[pivot]<1e-7)break;
    const axis=columns.splice(pivot,1)[0].map(x=>x/lengths[pivot]);
    for(const column of columns)for(let pass=0;pass<2;pass++) {
      const projection=dot(axis,column);column.forEach((x,i)=>{column[i]=x-projection*axis[i];});
    }
    rank++;
  }
  return {clusters:core.clusters.length,hinges:core.hinges.length,loops:core.loops.length,rank,freedom:angles.length-rank};
}
