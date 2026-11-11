import {spline,clamp} from '../../../src/world/surface-math.js';
import {periodicNoise} from './noise.js';
import {hashString} from './rng.js';
export function refineTerrain(source,from,to,seed){
  const height=new Float32Array(to.grid**2),s=hashString(`${seed}:fine-relief`);
  for(let j=0;j<to.grid;j++)for(let i=0;i<to.grid;i++){
    const gx=(i+.5)*from.grid/to.grid-.5,gz=(j+.5)*from.grid/to.grid-.5,k=j*to.grid+i;
    const h=spline(source,from.grid,gx,gz),hx=(spline(source,from.grid,gx+1,gz)-spline(source,from.grid,gx-1,gz))/(2*from.cell),hz=(spline(source,from.grid,gx,gz+1)-spline(source,from.grid,gx,gz-1))/(2*from.cell);
    const x=(i+.5)*to.cell-to.size/2,z=(j+.5)*to.cell-to.size/2,slope=Math.hypot(hx,hz);
    const curve=(spline(source,from.grid,gx+3,gz)+spline(source,from.grid,gx-3,gz)+spline(source,from.grid,gx,gz+3)+spline(source,from.grid,gx,gz-3)-4*h)/(9*from.cell*from.cell);
    const ridge=clamp(-curve*80,0,1),amp=clamp((slope-.18)*3,0,2.2)*(1+ridge);
    const detail=periodicNoise(x/37,z/37,65536,s)*amp+periodicNoise(x/83,z/83,65536,s+5)*amp*.65;
    height[k]=h+detail;
  }
  return height;
}
