// Public order is also the initial UI tab order.
import {plane} from './plane.js';
import {swan} from './swan.js';
import {tray} from './tray.js';
export const MODELS=[plane,swan,tray];
export function modelDef(id) { return MODELS.find(def=>def.id===id); }
