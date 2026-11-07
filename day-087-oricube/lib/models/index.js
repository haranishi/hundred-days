// Public order is also the initial UI tab order.
import {plane} from './plane.js';
import {heart} from './heart.js';
import {pochi} from './pochi.js';
import {kimono} from './kimono.js';
import {swan} from './swan.js';
import {tray} from './tray.js';
export const MODELS=[plane,heart,pochi,kimono,swan,tray];
export function modelDef(id) { return MODELS.find(def=>def.id===id); }
