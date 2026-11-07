// Public order is also the initial UI tab order.
import {plane} from './plane.js';
import {heart} from './heart.js';
import {pochi} from './pochi.js';
import {yacht} from './yacht.js';
import {tree} from './tree.js';
import {kimono} from './kimono.js';
import {swan} from './swan.js';
import {tray} from './tray.js';
import {crane} from './crane.js';
export const MODELS=[plane,heart,pochi,yacht,tree,kimono,swan,tray,crane];
export function modelDef(id) { return MODELS.find(def=>def.id===id); }
