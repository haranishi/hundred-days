import {boxBlur} from './fields.js';
import {spline} from '../../../src/world/surface-math.js';
import {VALLEY,profile,glacierPoint,glacierWidth,GLACIER_LENGTH,trailAxis} from './valley-layout.js';
export function morphologyAudit(w){
 const c=w.meta,blur=boxBlur(w.buffers.height,c.grid,75/c.cell),read=(a,x,z)=>spline(a,c.grid,(x+w.half)/c.cell-.5,(z+w.half)/c.cell-.5);
 const depths=[-350,40,430,830].map(z=>{const x=profile(VALLEY,z,1),floor=w.heightAt(x,z),west=w.heightAt(x-400,z)-floor,east=w.heightAt(x+400,z)-floor;return {x,z,west,east,pass:Math.min(west,east)>=120};});
 let upperN=0,upperSum=0,pisteN=0,pisteSum=0,high=0,rocks=0;const widths=[];
 for(let z=-2000;z<1900;z+=16){let run=0;for(let x=-2000;x<2000;x+=16){const h=w.heightAt(x,z),piste=x>=400&&x<=1650&&z>=-600&&z<=870,rock=w.snowAt(x,z,{}).rock>.5,r=h-read(blur,x,z);
  if(h>=1750){upperN++;upperSum+=r*r;}if(piste){pisteN++;pisteSum+=r*r;}
  if(h>1900&&!piste){high++;rocks+=rock;}
  if(rock){run+=16;}else if(run){widths.push(run);run=0;}
 }if(run)widths.push(run);}
 widths.sort((a,b)=>a-b);
 const branches=[];
 for(const side of [-1,1]){const a=[];for(let z=-1600;z<=850;z+=10){const x=profile(VALLEY,z,1)+side*650,h=w.heightAt(x,z),v=h-(w.heightAt(x,z-150)+w.heightAt(x,z+150))/2;a.push({x,z,v});}
  const peaks=[];for(let i=1;i<a.length-1;i++){const p=a[i];if(p.v>12&&p.v>a[i-1].v&&p.v>=a[i+1].v&&(!peaks.length||p.z-peaks.at(-1).z>210))peaks.push(p);}
  const flanks=peaks.flatMap(p=>[-50,50].map(d=>Math.acos(w.sampleSurface(p.x,p.z+d,{}).ny)*180/Math.PI));
  branches.push({side:side<0?'west':'east',count:peaks.length,peaks,spacing:peaks.slice(1).map((p,i)=>p.z-peaks[i].z),flankMin:Math.min(...flanks),flankMax:Math.max(...flanks),steepFraction:flanks.filter(a=>a>=35&&a<=55).length/(flanks.length||1)});
 }
 const summit=w.heightAt(40,-1800),ring=[];for(let a=0;a<Math.PI*2;a+=Math.PI/90){const x=40+600*Math.cos(a),z=-1800+600*Math.sin(a);if(Math.abs(z)<w.half)ring.push(w.heightAt(x,z));}
 const summitRise=summit-Math.min(...ring);
 const tangents=[80,GLACIER_LENGTH-80].map(s=>{const a=glacierPoint(s-4),b=glacierPoint(s+4);return Math.atan2(b.z-a.z,b.x-a.x)*180/Math.PI;});
 const glacierTurn=Math.abs(tangents[0]-tangents[1]),widthsGlacier=[];
 for(let s=100;s<GLACIER_LENGTH-100;s+=130){let lo=Infinity,hi=-Infinity;for(let t=-260;t<=260;t+=2){const p=glacierPoint(s,t);if(w.snowAt(p.x,p.z,{}).ice>.06){lo=Math.min(lo,t);hi=Math.max(hi,t);}}widthsGlacier.push({s,width:hi-lo,designed:glacierWidth(s)});}
 const trailCurves=[];for(let i=0;i<4;i++){const a=trailAxis(i,-600),b=trailAxis(i,930);let maxDeviation=0;for(let z=-600;z<=930;z+=10)maxDeviation=Math.max(maxDeviation,Math.abs(trailAxis(i,z)-(a+(b-a)*(z+600)/1530)));trailCurves.push({line:i+1,maxDeviation});}
 const merges=[100,640].map(z=>({z,width:trailAxis(3,z)-trailAxis(0,z),above:trailAxis(3,z-150)-trailAxis(0,z-150),below:trailAxis(3,z+150)-trailAxis(0,z+150)}));
 const bridge=w.meta.structures.bridge,bridgeBanks=[-1,1].map(sign=>{const x=bridge.x+sign*Math.sin(bridge.yaw)*bridge.length/2,z=bridge.z-sign*Math.cos(bridge.yaw)*bridge.length/2;return {x,z,height:read(w.buffers.height,x,z),error:read(w.buffers.height,x,z)-bridge.y};});
 const forestRuns=[],treeEdges=[];
 for(const z of [200,400,600,800,1000,1200]){let run=0;for(let x=-1800;x<=1800;x+=4){const t=w.treeDensityAt(x,z);if(t>.15)run+=4;else if(run){forestRuns.push({z,width:run});run=0;}}}
 for(let x=-1600;x<=1600;x+=50){let highest=0;for(let z=-1000;z<1300;z+=20)if(w.treeDensityAt(x,z)>.1)highest=Math.max(highest,w.heightAt(x,z));if(highest)treeEdges.push(highest);}
 const ordered=forestRuns.map(p=>p.width).sort((a,b)=>a-b),forest={runs:forestRuns,median:ordered[Math.floor(ordered.length/2)],min:ordered[0],max:ordered.at(-1),treeEdgeRange:[Math.min(...treeEdges),Math.max(...treeEdges)],method:'density>0.15, 4m horizontal sections at six Z positions; fringes included'};
 const glacierMaterials=[];for(let i=0;i<6;i++){const s=105+i*145,front=glacierPoint(s+6),bench=glacierPoint(s+60);glacierMaterials.push({step:i+1,frontIce:w.snowAt(front.x,front.z,{}).ice,benchPowder:w.snowAt(bench.x,bench.z,{}).powder});}
 return {forest,glacierMaterials,depths,branches,summitRise,summitRingMin:Math.min(...ring),rms:{upper:Math.sqrt(upperSum/upperN),piste:Math.sqrt(pisteSum/pisteN),method:'150m square moving average removed, 16m area samples'},rockFraction:rocks/high,rockWidthMedian:widths[Math.floor(widths.length/2)],rockWidthMethod:'horizontal 16m run lengths, rock > 0.5; conservative for diagonal ribs',glacierTurn,widthsGlacier,trailCurves,merges,bridgeBanks};
}
