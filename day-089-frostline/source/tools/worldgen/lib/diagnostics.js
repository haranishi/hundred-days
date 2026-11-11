import {spline} from '../../../src/world/surface-math.js';
import {FEATURE_PARAMS} from './features.js';
const quantile=(a,q)=>a.length?a[Math.floor((a.length-1)*q)]:0;
/** Report measurements with their definitions; counts come from the D8 network, not painted rays. */
export function drainageStats(height,c,flow){
  const p=FEATURE_PARAMS,n=c.grid,threshold=50000,radius=1700,links=[],donors=new Uint8Array(height.length);
  const read=(x,z)=>spline(height,n,(x+c.size/2)/c.cell-.5,(z+c.size/2)/c.cell-.5);
  let confluences=0,outlets=0,totalOutletArea=0;
  for(let k=0;k<height.length;k++){
    const r=flow.receiver[k];if(r<0){outlets++;totalOutletArea+=flow.area[k];continue;}
    if(flow.area[k]<threshold)continue;donors[r]++;
    const x=(k%n+.5)*c.cell-c.size/2,z=(Math.floor(k/n)+.5)*c.cell-c.size/2;
    const rx=(r%n+.5)*c.cell-c.size/2,rz=(Math.floor(r/n)+.5)*c.cell-c.size/2;
    if(Math.hypot(x-p.centerX,z-p.centerZ)<radius&&Math.hypot(rx-p.centerX,rz-p.centerZ)>=radius){
      const dx=(rx-x)/flow.distance[k],dz=(rz-z)/flow.distance[k],center=read(x,z),left=read(x-dz*100,z+dx*100),right=read(x+dz*100,z-dx*100);
      links.push({x,z,area:flow.area[k],angle:Math.atan2(z-p.centerZ,x-p.centerX),relief:Math.max(0,(left+right)*.5-center)});
    }
  }
  for(const d of donors)if(d>=2)confluences++;
  links.sort((a,b)=>a.angle-b.angle);
  // Crossings within 80m along the contour represent one finite-width major trough.
  const channels=[];
  for(const link of links){const last=channels.at(-1);if(last&&(link.angle-last.angle)*radius<80){if(link.area>last.area)channels[channels.length-1]=link;}else channels.push(link);}
  if(channels.length>1&&(channels[0].angle+2*Math.PI-channels.at(-1).angle)*radius<80)channels.pop();
  const major=channels.filter(l=>l.relief>=20&&l.relief<=90);
  const reliefs=channels.map(l=>l.relief).sort((a,b)=>a-b),coherent=[];
  for(let r=800;r<=2700;r+=30){
    let sum=0,positive=0,negative=0,count=0;
    for(let q=0;q<96;q++){
      const a=q*Math.PI*2/96,at=d=>read(p.centerX+Math.cos(a)*d,p.centerZ+Math.sin(a)*d);
      const v=at(r)-(at(r-90)+at(r+90))*.5;sum+=v;positive+=v>4;negative+=v< -4;count++;
    }
    const fraction=Math.max(positive,negative)/count,amplitude=Math.abs(sum/count);
    if(fraction>=.75&&amplitude>6)coherent.push({radius:r,fraction,amplitude});
  }
  return {method:'D8 A>=50000m² crossing 1700m summit contour; crossings clustered within 80m; relief=center to mean banks +/-100m',
    calculationGrid:n,majorChannels:major.length,routedCrossings:channels.length,confluences,allCellsReachBoundary:Math.abs(totalOutletArea-c.size*c.size)<c.cell*c.cell,
    majorReliefRange:major.length?[Math.min(...major.map(l=>l.relief)),Math.max(...major.map(l=>l.relief))]:[],
    relief:{p25:quantile(reliefs,.25),median:quantile(reliefs,.5),p75:quantile(reliefs,.75),max:quantile(reliefs,1)},channels,
    rings:{method:'radial high-pass +/-90m, 96 bearings; >=75% same sign above 4m and mean >6m',coherentRadii:coherent},outlets};
}
