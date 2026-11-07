// Reconstruct saved numerical probes without host-specific paths or dependencies.
import evidence from './mechanism-investigation.json' with {type:'json'};
import {buildModel,inspectModel} from '../lib/model.js';
import {locate,cloneSheet} from '../lib/sheet.js';
import {mechanismGraph} from '../lib/mechanism-sheet.js';
export {evidence};
export function cupProbe(index) {
  const trial=evidence.cup.designs[index],s=cloneSheet(inspectModel(buildModel(trial.definition)).raw.at(-1).end);
  const edges=new Map();
  s.triangles.forEach((t,i)=>t.v.forEach((a,k)=>{
    const b=t.v[(k+1)%3],key=[a,b].sort((a,b)=>a-b).join(':');
    if(!edges.has(key))edges.set(key,[]);edges.get(key).push(i);
  }));
  const pair=[evidence.cup.front,evidence.cup.back].map(uv=>s.triangles.indexOf(locate(s,uv).tri));
  s.triangles.forEach(t=>{t.tags=[];});s.triangles[pair[0]].tags.push('probe-pin');
  const hinges=[...edges].flatMap(([key,faces])=>faces.length===2?
    [{line:{through:key.split(':').map(v=>s.vertices[v].uv)},degrees:0}]:[]);
  return {s,pair,trial,...mechanismGraph(s,{pin:{tags:['probe-pin']},hinges})};
}
export function boatProbe(index) {
  const trial=evidence.boat[index],definition=structuredClone(trial.definition),op=definition.steps.pop().ops[0];
  const s=inspectModel(buildModel(definition)).raw.at(-1).end;
  return {s,trial,...mechanismGraph(s,op)};
}
