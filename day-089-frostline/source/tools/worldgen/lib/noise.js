import {hashInt,hashString} from './rng.js';
export const NOISE_PARAMS = Object.freeze({tileGrid:256,tileOctaves:4,shapeWavelengths:[400,180,80,50],shapeAmplitudes:[15,8,3,1.5]});
function corner(x,z,seed){return hashInt(Math.imul(x,374761393)^Math.imul(z,668265263)^seed)/2147483647.5-1;}
function ease(t){return t*t*t*(t*(t*6-15)+10);}
export function periodicNoise(x,z,period,seed) {
  const ix=Math.floor(x),iz=Math.floor(z),tx=ease(x-ix),tz=ease(z-iz);
  const x0=((ix%period)+period)%period,z0=((iz%period)+period)%period,x1=(x0+1)%period,z1=(z0+1)%period;
  const a=corner(x0,z0,seed)*(1-tx)+corner(x1,z0,seed)*tx;
  const b=corner(x0,z1,seed)*(1-tx)+corner(x1,z1,seed)*tx;
  return a*(1-tz)+b*tz;
}
export function terrainNoise(x,z,seed) {
  let v=0;
  for(let k=0;k<NOISE_PARAMS.shapeWavelengths.length;k++)v+=NOISE_PARAMS.shapeAmplitudes[k]*periodicNoise(x/NOISE_PARAMS.shapeWavelengths[k],z/NOISE_PARAMS.shapeWavelengths[k],65536,seed+k*101);
  return v;
}
export function makeTile(seed) {
  const n=NOISE_PARAMS.tileGrid,a=new Float32Array(n*n),h=hashString(`${seed}:tile`);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    let v=0,total=0;
    for(let k=0;k<NOISE_PARAMS.tileOctaves;k++){const p=4*2**k,amp=1/2**k;v+=amp*periodicNoise(i*p/n,j*p/n,p,h+k);total+=amp;}
    a[j*n+i]=v/total;
  }
  return a;
}
