// Reproducible feasibility probes, not production model definitions.
import {createSheet,paperPoint} from '../lib/sheet.js';
import {applyOp} from '../lib/ops.js';
import {assertLayers} from '../lib/stack.js';
import {prepareMechanism,mechanismPose,projectMechanism} from '../lib/mechanism.js';
import {mechanismGraph} from '../lib/mechanism-sheet.js';
import {buildModel,inspectModel} from '../lib/model.js';
import {distance,rotate,unit,sub} from '../lib/math.js';
import {squareBaseFixture} from './mechanism-fixtures.mjs';
export function squareFan() {
  const s=createSheet({width:1,height:1});applyOp(s,squareBaseFixture().steps[0].ops[0],.004);
  const center=s.vertices.findIndex(v=>distance(v.uv,[.5,.5])<1e-9);
  const angle=i=>(Math.atan2(s.vertices[i].uv[1]-.5,s.vertices[i].uv[0]-.5)+2*Math.PI)%(2*Math.PI);
  const rays=s.vertices.flatMap((_,i)=>i===center?[]:[i]).sort((a,b)=>angle(a)-angle(b));
  s.triangles=rays.map((v,i)=>({v:[center,v,rays[(i+1)%8]],rank:0,tags:[],offset:[0,0,0]}));
  return {s,center,rays,input:{pin:0,clusters:rays.map((v,i)=>({points:[s.vertices[center].p,s.vertices[v].p,s.vertices[rays[(i+1)%8]].p]})),
    hinges:rays.map((v,i)=>({a:(i+7)%8,b:i,edge:[s.vertices[center].p,s.vertices[v].p],degrees:180}))}};
}
function orderEndpoint(core,pose,degrees,fan) {
  const parent=degrees.map((_,i)=>i),root=i=>parent[i]===i?i:root(parent[i]);
  core.hinges.forEach((h,i)=>{if(!degrees[i])parent[root(h.b)]=root(h.a);});
  const groups=[...new Set(parent.map((_,i)=>root(i)))],edges=[];
  core.hinges.forEach((h,i)=>{
    if(!degrees[i])return;
    edges.push(degrees[i]*pose.poses[h.a].r[1][1]>0?[root(h.a),root(h.b)]:[root(h.b),root(h.a)]);
  });
  const {s,rays,center}=fan;s.vertices[center].p=pose.points[0][0];
  rays.forEach((v,i)=>{s.vertices[v].p=pose.points[i][1];});
  function visit(order) {
    if(order.length===groups.length) {
      s.triangles.forEach((t,i)=>{t.rank=order.indexOf(root(i));});
      try{assertLayers(s);return s.triangles.map(t=>t.rank);}catch{return null;}
    }
    for(const g of groups) {
      if(order.includes(g)||edges.some(([a,b])=>b===g&&!order.includes(a)))continue;
      const result=visit([...order,g]);if(result)return result;
    }
    return null;
  }
  return visit([]);
}
export function enumerateSquareEndpoints() {
  const fan=squareFan(),core=prepareMechanism(fan.input),counts={total:6561,closed:0,theorems:0,square:0,layered:0},candidates=[];
  for(let n=0;n<6561;n++) {
    let code=n;const degrees=[];
    for(let i=0;i<8;i++){degrees.push([0,180,-180][code%3]);code=Math.floor(code/3);}
    const pose=mechanismPose(core,degrees.map(v=>v*Math.PI/180));
    if(pose.closure>1e-9||pose.residual>1e-9)continue;counts.closed++;
    const active=degrees.flatMap((d,i)=>d?[i]:[]);
    if(Math.abs(degrees.reduce((s,d)=>s+Math.sign(d),0))!==2)continue;
    const sectors=active.map((v,i)=>((active[(i+1)%active.length]-v+8)%8)*Math.PI/4);
    if(Math.abs(sectors.reduce((s,v,i)=>s+(i%2?-v:v),0))>1e-9)continue;counts.theorems++;
    const p=pose.points.map(c=>c[1]),corners=[1,3,5,7].map(i=>p[i]);
    if(corners.some(c=>distance(c,corners[0])>1e-9)||Math.abs(distance(corners[0],[0,0,0])-Math.SQRT1_2)>1e-9)continue;
    if(p.some(c=>Math.abs(c[1])>1e-9)||Math.abs(Math.max(...p.map(c=>c[0]))-Math.min(0,...p.map(c=>c[0]))-.5)>1e-9||
      Math.abs(Math.max(0,...p.map(c=>c[2]))-Math.min(...p.map(c=>c[2]))-.5)>1e-9)continue;
    counts.square++;const ranks=orderEndpoint(core,pose,degrees,fan);
    if(ranks){counts.layered++;candidates.push({degrees,ranks});}
  }
  return {counts,candidates};
}
export function petalObstruction(s) {
  const a=1-Math.SQRT1_2,tip=paperPoint(s,[1,0]),side=paperPoint(s,[1,.5]);
  const kr=paperPoint(s,[.5+a,.5]),kl=paperPoint(s,[.5,.5-a]),end=rotate(tip,kr,unit(sub(kl,kr)),Math.PI);
  return {edge:distance(tip,side),required:distance(end,side),gap:distance(end,side)-distance(tip,side),end};
}
export function hatFixture() {
  const h=Math.SQRT2;
  return {id:'hat-fixture',paper:{width:1,height:h},marks:{roofL:[0,h/2-.5],roofR:[1,h/2-.5],backL:[0,h/2+.5],backR:[1,h/2+.5]},steps:[
    {ops:[{type:'fold',line:{through:['L','R']},moving:'TL',mode:'valley',tagMoved:'back',tagStationary:'front'}]},
    {ops:[{type:'fold',line:{through:['C','roofL']},moving:'L',mode:'valley'}]},
    {ops:[{type:'fold',line:{through:['C','roofR']},moving:'R',mode:'valley'}]},
    {ops:[{type:'fold',line:{through:['roofL','roofR']},moving:'BL',mode:'valley',select:{tags:['back']}}]},
    {ops:[{type:'fold',line:{through:['roofL','roofR']},moving:'BL',mode:'mountain',select:{tags:['front']}}]},
    {ops:[{type:'scribe',split:true,segments:[['C','B']]},{type:'tag',rect:[.65,.36,.68,.39],add:['pin']}]},
  ]};
}
export function probeHatOpening() {
  const def=hatFixture(),s=inspectModel(buildModel(def)).raw.at(-1).end,mid=Math.SQRT2/2;
  const rays=[[1,mid],def.marks.backR,[.5,Math.SQRT2],def.marks.backL,[0,mid],def.marks.roofL,[.5,0],def.marks.roofR];
  const {input}=mechanismGraph(s,{pin:{tags:['pin']},hinges:rays.map(p=>({line:{through:['C',p]},degrees:0}))});
  const zero=input.hinges.flatMap((h,i)=>h.degrees===0?[i]:[]),results=[];
  for(const signs of [[1,1],[1,-1],[-1,1]]) {
    input.hinges.forEach((h,i)=>{if(zero.includes(i))h.degrees=180*signs[zero.indexOf(i)];});input.driver=zero[0];
    try{const pose=projectMechanism(prepareMechanism(input),.5);results.push({signs,closure:pose.closure,residual:pose.residual});}
    catch(e){results.push({signs,code:e.code,residual:e.residual});}
  }
  return results;
}
