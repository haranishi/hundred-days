import {protectValley,lakeInside} from './valley-layout.js';
import {FEATURE_PARAMS,smooth01} from './features.js';
import {periodicNoise} from './noise.js';
import {hashString} from './rng.js';
import {routeFlow} from './drainage.js';
export const EROSION_PARAMS=Object.freeze({productionIterations:60,quickIterations:24,m:.45,dt:1,K:.018,hardK:.0025,uplift:.28,reposeAngle:40,hardReposeAngle:55,thermalRate:.22,thermalPasses:3,layerSpacing:165,layerWarp:140,fanRate:.012,creep:.14});
export function erosionFields(source,c,seed){
  const n=c.grid,s=hashString(`${seed}:geology`),p=EROSION_PARAMS,hard=new Float32Array(n*n),protection=new Float32Array(n*n);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const k=j*n+i,x=(i+.5)*c.cell-c.size/2,z=(j+.5)*c.cell-c.size/2;
    const warp=p.layerWarp*periodicNoise(x/480,z/480,65536,s)+95*periodicNoise(x/1100,z/1100,65536,s+3);
    const layer=Math.sin((source[k]*.35+warp+.32*x-.26*z)/p.layerSpacing*Math.PI*2);
    hard[k]=smooth01((layer-.25)/.55)*smooth01((periodicNoise((x+z)*.707/700,(z-x)*.707/700,65536,s+33)+.25)/.65);
    protection[k]=c.layout==='valley-1'?protectValley(x,z):0;
  }
  return {hard,protection};
}
export function relaxSlopes(a,c,hard,protection,p=EROSION_PARAMS){
  const n=c.grid,delta=new Float32Array(a.length),soft=Math.tan(p.reposeAngle*Math.PI/180),strong=Math.tan(p.hardReposeAngle*Math.PI/180);
  for(let pass=0;pass<p.thermalPasses;pass++){
    delta.fill(0);
    for(let j=1;j<n-1;j++)for(let i=1;i<n-1;i++){
      const k=j*n+i;
      for(const offset of [1,n]){
        const q=k+offset,limit=c.cell*(soft+(strong-soft)*Math.max(hard[k],hard[q])),d=a[k]-a[q],excess=Math.abs(d)-limit;
        if(excess>0){const move=Math.sign(d)*excess*p.thermalRate*(1-Math.max(protection[k],protection[q]));delta[k]-=move;delta[q]+=move;}
      }
    }
    for(let k=0;k<a.length;k++)a[k]+=delta[k];
  }
}
/** Stream-power incision, n=1, using updated downstream heights (Braun–Willett).
 * Basin area is square metres and dx is the true cardinal/diagonal link length.
 */
export function erodeTerrain(source,c,seed,options={}){
  const p={...EROSION_PARAMS,...options},n=c.grid,{hard,protection}=erosionFields(source,c,seed);
  const iterations=options.iterations??(n<=256?p.quickIterations:p.productionIterations),a=source.slice();
  let flow;
  for(let pass=0;pass<iterations;pass++){
    flow=routeFlow(a,c,{outlet:c.layout==='valley-1'?lakeInside:null});a.set(flow.height);
    for(let k=0;k<a.length;k++)a[k]+=p.uplift*Math.max(0,(source[k]-FEATURE_PARAMS.base)/(FEATURE_PARAMS.summit-FEATURE_PARAMS.base))*(1-protection[k]);
    for(let t=flow.order.length-1;t>=0;t--){
      const k=flow.order[t],r=flow.receiver[k];if(r<0)continue;
      const K=(p.K*(1-hard[k])+p.hardK*hard[k])*(1-protection[k]);
      const coeff=K*Math.pow(flow.area[k],p.m)*p.dt/flow.distance[k];
      a[k]=(a[k]+coeff*a[r])/(1+coeff);
    }
    relaxSlopes(a,c,hard,protection,p);
    // Lateral sediment creep suppresses D8 grid streaks and broadens tributary walls.
    const creep=a.slice();
    for(let j=1;j<n-1;j++)for(let i=1;i<n-1;i++){
      const k=j*n+i; a[k]+=p.creep*(creep[k-1]+creep[k+1]+creep[k-n]+creep[k+n]-4*creep[k])*(1-protection[k])*(1-.65*hard[k]);
    }
    // Sediment builds broad fans on low-gradient lower catchments, never point mounds.
    for(let j=1;j<n-1;j++)for(let i=1;i<n-1;i++){
      const k=j*n+i,r=flow.receiver[k];if(r<0||a[k]>1150||flow.area[k]<60000)continue;
      const slope=(a[k]-a[r])/flow.distance[k];
      if(slope<.28){const deposit=p.fanRate*Math.min(5,flow.area[k]/250000)*(1-Math.max(0,slope)/.28)*(1-protection[k]);a[k]+=deposit;}
    }
    for(let k=0;k<a.length;k++)if(protection[k]>.99)a[k]=source[k];
  }
  return a;
}
