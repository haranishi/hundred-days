export const PROGRESS_KEY='ginrei.progress.v1';
const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:0;
export function validateProgress(raw) {
  const p={totals:{runs:0,time:0,descent:0,distance:0,air:0,score:0,crashes:0},drops:{},discovered:[],lastDrop:null};
  if(!raw||typeof raw!=='object')return p;
  for(const key in p.totals)p.totals[key]=num(raw.totals?.[key]);
  if(raw.drops&&typeof raw.drops==='object') for(const [id,d] of Object.entries(raw.drops)) {
    if(!d||typeof d!=='object'||['__proto__','constructor','prototype'].includes(id)) continue;
    p.drops[id]={runs:num(d.runs),best:num(d.best),stars:[0,1,2].map(i=>d.stars?.[i]===true)};
  }
  p.discovered=Array.isArray(raw.discovered)?[...new Set(raw.discovered.filter(s=>typeof s==='string'))]:[];
  p.lastDrop=typeof raw.lastDrop==='string'?raw.lastDrop:null;return p;
}
export function createProgress(storage) {
  if(storage===undefined)try{storage=globalThis.localStorage;}catch{storage=null;}
  let value;try{value=validateProgress(JSON.parse(storage?.getItem(PROGRESS_KEY)??'null'));}catch{value=validateProgress();}
  return {get:()=>value,save(){try{storage?.setItem(PROGRESS_KEY,JSON.stringify(value));}catch{/* 滑走を続ける */}},clear(){value=validateProgress();this.save();}};
}
