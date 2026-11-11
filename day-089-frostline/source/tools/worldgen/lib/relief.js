import {spline,clamp} from '../../../src/world/surface-math.js';
import {boxBlur} from './fields.js';
import {FEATURE_PARAMS as F,practiceBlend,plateauBlend,craterCoordinates,smooth01} from './features.js';
import {periodicNoise} from './noise.js';
import {rngFor,hashString} from './rng.js';

export const RELIEF_PARAMS=Object.freeze({openTreeDensity:.18,coverage:.25,practiceCenters:[1917,1947,1977],practiceHeight:.45,practiceRadius:5.5});
const noise=(x,z,s,scale)=>periodicNoise(x/scale,z/scale,65536,s);
/** Raised, rounded crest; a shorter downstream face represents wind-deposited snow. */
export function roundedCrest(distance,height,upWidth,downWidth=upWidth){
  return height*Math.exp(-.5*(distance/(distance<0?upWidth:downWidth))**2);
}
export function practiceRelief(x,z){
  const side=1-smooth01((Math.abs(x-F.practiceX)-85)/55);
  return side*RELIEF_PARAMS.practiceCenters.reduce((v,center)=>{const d=Math.abs(z-center)/RELIEF_PARAMS.practiceRadius;return v+(d<1?RELIEF_PARAMS.practiceHeight*(1+Math.cos(Math.PI*d))/2:0);},0);
}

/** Work on the final height lattice; pre-snow masks only classify safe sites.
 * Broad derivatives cannot be contaminated by the small features being authored.
 */
export function addRideRelief(source,c,seed,baseline,drops){
  const n=c.grid,cell=c.cell,half=c.size/2,s=hashString(`${seed}:ride-relief`),random=rngFor(seed,'ride-relief');
  const broad=boxBlur(source,n,10/cell,3),eligible=new Float32Array(source.length),covered=new Uint8Array(source.length),height=source.slice();
  const read=(a,x,z)=>spline(a,n,(x+half)/cell-.5,(z+half)/cell-.5);
  const mask=(a,x,z,ch)=>spline(a,c.maskGrid,(x+half)/(cell*2)-.5,(z+half)/(cell*2)-.5,4,ch)/255;
  function geometry(x,z){
    const hx=(read(broad,x+12,z)-read(broad,x-12,z))/24,hz=(read(broad,x,z+12)-read(broad,x,z-12))/24;
    const slope=Math.hypot(hx,hz),h=read(broad,x,z);
    const curve=(read(broad,x+30,z)+read(broad,x-30,z)+read(broad,x,z+30)+read(broad,x,z-30)-4*h)/900;
    return {dx:-hx/(slope||1),dz:-hz/(slope||1),angle:Math.atan(slope)*180/Math.PI,curve};
  }
  function protectedAt(x,z){
    if(practiceBlend(x,z)>.001||plateauBlend(x,z)>.8||craterCoordinates(x,z).r<600)return true;
    for(const d of drops){
      const dx=x-d.x,dz=z-d.z,along=dx*Math.sin(d.heading)-dz*Math.cos(d.heading),side=dx*Math.cos(d.heading)+dz*Math.sin(d.heading);
      if(Math.hypot(dx,dz)<65||(along>-15&&along<70&&Math.abs(side)<30))return true;
    }
    return false;
  }
  function safe(x,z,g){
    return Math.abs(x)<half-20&&Math.abs(z)<half-20&&!protectedAt(x,z)&&g.angle<45&&g.curve<.003&&mask(baseline.masksA,x,z,3)<.4&&mask(baseline.masksB,x,z,0)<RELIEF_PARAMS.openTreeDensity;
  }
  let openCells=0;
  // Mask-resolution classification, then smooth interpolation during full-resolution application.
  const m=c.maskGrid,open=new Float32Array(m*m);
  for(let j=0;j<m;j++)for(let i=0;i<m;i++){
    const x=(i+.5)*cell*2-half,z=(j+.5)*cell*2-half,g=geometry(x,z);
    if(g.angle>=10&&g.angle<=28&&safe(x,z,g))open[j*m+i]=1;
  }
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const k=j*n+i,x=(i+.5)*cell-half,z=(j+.5)*cell-half;
    eligible[k]=spline(open,m,(i+.5)/2-.5,(j+.5)/2-.5);
    if(eligible[k]>.5)openCells++;
    const hx=(source[j*n+Math.min(n-1,i+1)]-source[j*n+Math.max(0,i-1)])/(2*cell),hz=(source[Math.min(n-1,j+1)*n+i]-source[Math.max(0,j-1)*n+i])/(2*cell);
    if(protectedAt(x,z)||Math.hypot(hx,hz)>1)eligible[k]=0;
  }
  const candidates=[];
  for(let z=-half+180;z<half-180;z+=170)for(let x=-half+180;x<half-180;x+=170){
    const xx=x+(random()-.5)*100,zz=z+(random()-.5)*100,g=geometry(xx,zz);
    const score=noise(xx,zz,s,360);
    if(g.angle<10||g.angle>28||!safe(xx,zz,g))continue;
    const wavelength=26+random()*12,waves=3+Math.floor(random()*4);
    candidates.push({x:xx,z:zz,dx:g.dx,dz:g.dz,wavelength,waves,halfLength:(waves+.8)*wavelength/2,halfWidth:70+random()*45,height:1.25+random()*.15,phase:random()*wavelength,score});
  }
  // Keep accessible open snowfields on the ordinary downhill lines, as well as the
  // noise-selected fields across the mountain. This does not move or flatten a line.
  for(const drop of drops){
    if(['first-snow','rime-plateau','crater-shelf'].includes(drop.id))continue;
    let x=drop.x,z=drop.z;
    for(let distance=0;distance<=570;distance+=6){
      const g=geometry(x,z);
      if(distance>=150&&distance%120===60&&g.angle>=12&&g.angle<=26&&safe(x,z,g)){
        const wavelength=27+random()*7;
        candidates.push({x,z,dx:g.dx,dz:g.dz,wavelength,waves:4,halfLength:2.4*wavelength,halfWidth:80,height:1.4,phase:random()*wavelength,score:2+noise(x,z,s,360),accessLine:drop.id});
      }
      x+=g.dx*6;z+=g.dz*6;
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  const fields=[];let coveredCells=0;
  function bounds(p,r,visit){
    for(let j=Math.max(1,Math.floor((p.z-r+half)/cell));j<=Math.min(n-2,Math.ceil((p.z+r+half)/cell));j++)
      for(let i=Math.max(1,Math.floor((p.x-r+half)/cell));i<=Math.min(n-2,Math.ceil((p.x+r+half)/cell));i++)visit(j*n+i,(i+.5)*cell-half,(j+.5)*cell-half);
  }
  for(const p of candidates){
    if(coveredCells>=openCells*RELIEF_PARAMS.coverage)break;
    let added=0;
    bounds(p,Math.hypot(p.halfLength,p.halfWidth)+30,(k,x,z)=>{
      if(eligible[k]<.01)return;
      const rx=x-p.x,rz=z-p.z,across=-p.dz*rx+p.dx*rz,along=p.dx*rx+p.dz*rz;
      const warp=16*periodicNoise(across/85,along/240,65536,s+7)+5*periodicNoise(across/38,along/150,65536,s+19);
      const edge=18*noise(x,z,s+31,75);
      const envelope=(1-smooth01((Math.abs(along+warp)-p.halfLength+18)/18))*(1-smooth01((Math.abs(across+edge)-p.halfWidth+35)/35));
      const weight=envelope*eligible[k];if(weight<=.01)return;
      const distance=((along+warp+p.phase)%p.wavelength+p.wavelength*1.5)%p.wavelength-p.wavelength/2;
      const crest=roundedCrest(distance,p.height,3.8,3.2);
      height[k]=Math.max(height[k],source[k]+crest*weight);
      if(weight>.1&&!covered[k]){covered[k]=1;if(eligible[k]>.5){added++;coveredCells++;}}
    });
    if(added>10)fields.push({...p,area:added*cell*cell});
  }
  // Trace short contour segments on convex southeast-facing shoulders; validate their landing apron.
  const shoulders=[];
  for(let z=-half+180;z<half-180;z+=24)for(let x=-half+180;x<half-180;x+=24){
    const g=geometry(x,z);
    if(g.angle<20||g.angle>30||g.curve>-.0007||(g.dx+g.dz)/Math.SQRT2<.65||!safe(x,z,g))continue;
    shoulders.push({x,z,...g,score:-g.curve+noise(x,z,s+53,230)*.002});
  }
  shoulders.sort((a,b)=>b.score-a.score);
  const ledges=[];
  for(const p of shoulders){
    if(ledges.length>=22)break;
    if(ledges.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<145))continue;
    p.length=60+random()*80;p.height=1.8+random()*.7;
    let valid=true;
    for(let t=-p.length/2;t<=p.length/2;t+=12)for(const d of [-8,12,24,40]){
      const x=p.x-p.dz*t+p.dx*d,z=p.z+p.dx*t+p.dz*d,g=geometry(x,z);
      if(!safe(x,z,g)||(d>=12&&(g.angle<20||g.angle>32))){valid=false;break;}
    }
    if(!valid)continue;
    ledges.push({...p});
    bounds(p,p.length/2+55,(k,x,z)=>{
      const rx=x-p.x,rz=z-p.z,t=-p.dz*rx+p.dx*rz;
      const d=p.dx*rx+p.dz*rz-5*noise(x,z,s+71,45)-2*noise(x,z,s+73,19);
      const end=1-smooth01((Math.abs(t)-p.length/2+18)/18);
      // A long windward ramp, a short lee lip, then the original landing slope.
      const profile=smooth01((d+36)/30)*(1-smooth01((d+1)/4));
      if(end*profile<=0||protectedAt(x,z))return;
      height[k]+=p.height*end*profile;
    });
  }
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const x=(i+.5)*cell-half,z=(j+.5)*cell-half;
    if(Math.abs(x-F.practiceX)<145&&z>1895&&z<2005)height[j*n+i]+=practiceRelief(x,z);
  }
  return {height,report:{fields,ledges,openArea:openCells*cell*cell,fieldArea:coveredCells*cell*cell,coverage:coveredCells/openCells,practice:{centers:RELIEF_PARAMS.practiceCenters.map(z=>({x:F.practiceX,z})),height:RELIEF_PARAMS.practiceHeight,wavelength:30,protected:{x:F.practiceX,z:1740,width:200,length:300}}}};
}
