import {flatSeed} from './landscape.js';
export const SHAPE_PARAMS=Object.freeze({initialHeight:1180,noiseAmplitude:5});
export function makeShape(c,seed){return flatSeed(c,seed);}
