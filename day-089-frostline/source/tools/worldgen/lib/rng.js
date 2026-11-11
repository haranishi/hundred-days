import {hashString,randomStream} from '../../../src/world/seed.js';
export function rngFor(seed,stage) {return randomStream(hashString(`${seed}:${stage}`));}
export {hashString,hashInt} from '../../../src/world/seed.js';
