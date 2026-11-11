import {spline,clamp} from '../../../src/world/surface-math.js';
import {practiceBlend,smooth01,zoneId} from './features.js';
import {periodicNoise} from './noise.js';
import {boxBlur,widenField} from './fields.js';
import {hashString} from './rng.js';
export const SNOW_PARAMS=Object.freeze({
  baseDepth:.65,altitudeDepth:.00065,altitudeBase:500,valleyDepth:2.4,leeDepth:1.15,
  shedStart:45,shedEnd:55,shedFraction:.998,maxDepth:5.1,practiceDepth:1.8,
  treeMin:600,treeMax:1630,treeline:1550,treelineVariation:80,treeSlopeStart:27,treeSlope:35,
  avalancheArea:60000,forestScale:67,forestBase:.55,forestNoise:.65,
});
const byte=v=>Math.round(clamp(v,0,1)*255);
export function makeSnow(source,c,seed,drainage=null){
  const p=SNOW_PARAMS,n=c.grid,m=c.maskGrid,masksA=new Uint8Array(m*m*4),masksB=new Uint8Array(m*m*4),depths=new Float32Array(m*m),s=hashString(`${seed}:snow`);
  let avalanche=null;
  if(drainage){const dc=drainage.c,field=Float32Array.from(drainage.area,A=>smooth01((A-p.avalancheArea*.4)/(p.avalancheArea*.6)));avalanche=boxBlur(widenField(field,dc.grid,Math.max(1,Math.round(12/dc.cell))),dc.grid,18/dc.cell,3);}
  for(let j=0;j<m;j++)for(let i=0;i<m;i++){
    const x=(i+.5)*c.cell*2-c.size/2,z=(j+.5)*c.cell*2-c.size/2,gx=(i+.5)*2-.5,gz=(j+.5)*2-.5,k=(j*m+i)*4;
    const h=spline(source,n,gx,gz),hx=(spline(source,n,gx+1,gz)-spline(source,n,gx-1,gz))/(2*c.cell),hz=(spline(source,n,gx,gz+1)-spline(source,n,gx,gz-1))/(2*c.cell);
    // Broad curvature, rather than an angle drawn around the summit, locates U-shaped troughs.
    const span=Math.max(1,30/c.cell),curvature=(spline(source,n,gx+span,gz)+spline(source,n,gx-span,gz)+spline(source,n,gx,gz+span)+spline(source,n,gx,gz-span)-4*h)/900;
    const valley=smooth01(curvature*80),ridge=smooth01(-curvature*65),angle=Math.atan(Math.hypot(hx,hz))*180/Math.PI,practice=practiceBlend(x,z);
    const aspect=(hx+hz)/Math.sqrt(2*(1+hx*hx+hz*hz));
    const wind=clamp(.4+.65*aspect+.32*ridge-.25*valley,0,1),lee=clamp(.5-aspect,0,1);
    let depth=(p.baseDepth+p.altitudeDepth*Math.max(0,h-p.altitudeBase)+p.valleyDepth*valley+p.leeDepth*lee)*(1-p.shedFraction*smooth01((angle-p.shedStart)/(p.shedEnd-p.shedStart)));
    depth*=1-.96*wind*ridge*smooth01((h-1450)/450);
    depth=clamp(depth*(1-practice)+p.practiceDepth*practice,0,p.maxDepth);depths[j*m+i]=depth;
    // Rotated, warped sums avoid visible square lattice noise and a circular treeline.
    const tx=(.8*x+.6*z)/510,tz=(-.6*x+.8*z)/510;
    const treeline=p.treeline+p.treelineVariation*clamp(1.3*periodicNoise(tx,tz,65536,s+91)+.7*Math.sin((x-z)/900-1.3),-1,1);
    let trees=smooth01((h-p.treeMin)/100)*(1-smooth01((h-(treeline-65))/65))*(1-smooth01((angle-p.treeSlopeStart)/(p.treeSlope-p.treeSlopeStart)));
    const warp=22*periodicNoise(x/180,z/180,65536,s+13);
    const forest=.65*periodicNoise((.83*x+.56*z+warp)/p.forestScale,(-.56*x+.83*z)/p.forestScale,65536,s)+.35*periodicNoise((x-z)*.707/32,(x+z)*.707/32,65536,s+7);
    trees*=smooth01((p.forestBase+p.forestNoise*forest-.12)/.65)*(1-.9*wind*ridge);
    if(drainage){
      const dc=drainage.c,flow=spline(avalanche,dc.grid,(x+dc.size/2)/dc.cell-.5,(z+dc.size/2)/dc.cell-.5);
      trees*=1-smooth01(flow/.55);
    }
    trees*=1-smooth01(curvature*100);
    if(angle>p.treeSlope||practice>0||h<p.treeMin||h>p.treeMax)trees=0;
    const rock=1-smooth01(depth/.15),summitWind=smooth01((h-1800)/550)*wind;
    const ice=clamp((.035+.36*wind*(1-valley)+.28*rock+.22*summitWind)*(1-.48*trees)*(1-.6*practice),0,.85);
    const powder=clamp(.22+.35*lee+.28*valley+.24*trees-.3*ice-.35*practice,0,1-ice);
    const amp=clamp((.10+.42*wind+.22*ridge)*(1-.8*trees)*(1-practice),0,1);
    masksA[k]=Math.round(depth/.02);masksA[k+1]=byte(powder);masksA[k+2]=byte(ice);masksA[k+3]=byte(rock);
    masksB[k]=byte(trees);masksB[k+1]=byte(amp);masksB[k+2]=byte(wind);masksB[k+3]=zoneId(x,z,h);
  }
  const height=source.slice();
  for(let j=0;j<n;j++)for(let i=0;i<n;i++)height[j*n+i]+=spline(depths,m,(i+.5)/2-.5,(j+.5)/2-.5);
  return {height,masksA,masksB};
}
