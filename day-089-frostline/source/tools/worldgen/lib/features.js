import {clamp} from '../../../src/world/surface-math.js';
import {zoneId,ZONES} from './valley-layout.js';
// Compatibility for reusable diagnostics and the legacy entrance/relief unit tests.
// No crater, rectangular practice cut or plateau participates in valley generation.
export const FEATURE_PARAMS=Object.freeze({centerX:60,centerZ:-2700,base:600,summit:2490,practiceX:1700,practiceZ:1800});
export function smooth01(t){t=clamp(t,0,1);return t*t*(3-2*t);}
export function rectangleBlend(x,z,cx,cz,w,h,feather){return (1-smooth01((Math.abs(x-cx)-w/2)/feather))*(1-smooth01((Math.abs(z-cz)-h/2)/feather));}
export const practiceBlend=()=>0;
export const plateauBlend=()=>0;
export const inPractice=()=>false;
export const craterCoordinates=()=>({r:Infinity,a:0,breach:0});
export const featureHeight=()=>1180;
export const protectFeatures=h=>h;
export {zoneId,ZONES};
