import { MAX_SPEED } from './physics.js';
export const BEST_STORAGE_NAME='day046.best.v1',MUTE_STORAGE_NAME='day046.mute.v1';
function valid(v) { return v&&Number.isFinite(v.speed)&&v.speed>=0&&v.speed<=MAX_SPEED&&Number.isFinite(v.seconds)&&v.seconds>0&&typeof v.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v.date); }
export function load(storage) {
  let best=null,mute=false,available=true;
  try{mute=storage.getItem(MUTE_STORAGE_NAME)==='true';const v=JSON.parse(storage.getItem(BEST_STORAGE_NAME)||'null');if(valid(v))best={speed:v.speed,seconds:v.seconds,date:v.date};}catch{available=false;}
  return {best,mute,available};
}
export function saveBest(storage,best,speed,seconds,date=new Date().toISOString().slice(0,10)) {
  const next={speed,seconds,date};
  if(!valid(next))return {best,saved:false,improved:false};
  const improved=!best||speed>best.speed||(speed===best.speed&&seconds<best.seconds),chosen=improved?next:best;
  try{storage.setItem(BEST_STORAGE_NAME,JSON.stringify(chosen));return {best:chosen,saved:true,improved};}catch{return {best:chosen,saved:false,improved};}
}
export function saveMute(storage,mute) { try{storage.setItem(MUTE_STORAGE_NAME,String(Boolean(mute)));return true;}catch{return false;} }
