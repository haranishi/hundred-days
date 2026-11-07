// Ranks encode order, not physical thickness. Fractional ranks leave room inside
// a reverse fold without moving stationary layers or stretching shared vertices.
import {AREA_EPS,RANK_EPS,VERTEX_EPS,overlapArea,cross2,sub,distance,segmentTriangleInterval} from './math.js';
import {FoldError} from './error.js';
export const projection = (s,t) => t.v.map(i=>[s.vertices[i].p[0],s.vertices[i].p[2]]);
export const overlap = (s,a,b) => overlapArea(projection(s,a),projection(s,b));
export function orderStack(s,moving,stack,mode) {
  const moved=s.triangles.filter((_,i)=>moving.has(i)), fixed=s.triangles.filter((_,i)=>!moving.has(i));
  const ranks=[...new Set(moved.map(t=>t.rank))].sort((a,b)=>b-a);
  const touching=fixed.filter(t=>moved.some(m=>overlap(s,m,t)>AREA_EPS));
  let low,high;
  if(stack && stack!=='auto') {
    if(stack.mode!=='between') throw new FoldError('Unknown stack mode',{code:'STACK_MODE'});
    const upper=touching.filter(t=>t.tags.includes(stack.upper)),lower=touching.filter(t=>t.tags.includes(stack.lower));
    if(!upper.length||!lower.length) throw new FoldError('Reverse fold needs both stationary bounding layers',{code:'BETWEEN_MISSING'});
    low=Math.max(...lower.map(t=>t.rank)); high=Math.min(...upper.map(t=>t.rank));
    if(high-low<=RANK_EPS) throw new FoldError('Reverse fold bounds are reversed',{code:'BETWEEN_ORDER'});
  } else if(mode==='valley') {
    low=Math.max(0,...touching.map(t=>t.rank)); high=low+ranks.length+1;
  } else {
    high=Math.min(0,...touching.map(t=>t.rank)); low=high-ranks.length-1;
  }
  for(const t of moved) {
    const others=fixed.filter(f=>overlap(s,t,f)>AREA_EPS);
    if(!others.length && (!stack || stack==='auto')) {
      const adjacent=fixed.find(f=>f.v.filter(v=>t.v.includes(v)).length>=2);
      if(adjacent) { t.rank=adjacent.rank; continue; }
    }
    t.rank=low+(high-low)*(ranks.indexOf(t.rank)+1)/(ranks.length+1);
  }
}
export function assertLayers(s) {
  if(!s.flat) return;
  for(let i=0;i<s.triangles.length;i++) for(let j=i+1;j<s.triangles.length;j++) {
    const a=s.triangles[i],b=s.triangles[j];
    if(Math.abs(a.rank-b.rank)<RANK_EPS && overlap(s,a,b)>AREA_EPS)
      throw new FoldError('Overlapping faces have the same rank',{code:'LAYER_COLLISION'});
  }
  // A folded edge bounds a nested stack. An unrelated face crossing that edge
  // between its two ranks, or interleaving folded intervals, pierces the paper.
  const edges=new Map(),seams=[];
  for(const t of s.triangles) for(let k=0;k<3;k++) {
    const a=t.v[k],b=t.v[(k+1)%3],key=[a,b].sort((x,y)=>x-y).join(':');
    if(!edges.has(key)) edges.set(key,[]);
    edges.get(key).push(t);
  }
  for(const [key,ts] of edges) {
    if(ts.length!==2) continue;
    const [a,b]=key.split(':').map(Number),p=s.vertices[a].p,q=s.vertices[b].p;
    if(distance(p,q)<VERTEX_EPS) continue;
    const o=[p[0],p[2]],d=[q[0]-p[0],q[2]-p[2]];
    const sides=ts.map(t=>{
      const v=s.vertices[t.v.find(v=>v!==a&&v!==b)].p;
      return cross2(d,sub([v[0],v[2]],o));
    });
    if(sides[0]*sides[1]<=VERTEX_EPS**2) continue;
    const lo=Math.min(...ts.map(t=>t.rank)),hi=Math.max(...ts.map(t=>t.rank));
    seams.push({a,b,lo,hi,o,d});
    for(const t of s.triangles) {
      if(ts.includes(t)||t.rank<=lo+RANK_EPS||t.rank>=hi-RANK_EPS) continue;
      const poly=projection(s,t),interval=segmentTriangleInterval(o,[q[0],q[2]],poly);
      if(!interval || (interval[1]-interval[0])*distance(p,q)<=VERTEX_EPS) continue;
      const side=poly.map(v=>cross2(d,sub(v,o)));
      if(Math.min(...side)<-VERTEX_EPS && Math.max(...side)>VERTEX_EPS)
        throw new FoldError('A layer crosses a folded edge inside its stack',{code:'CREASE_PENETRATION'});
    }
  }
  // Consecutive segments of one UV crease are one connection (including the
  // two sides of a reverse fold). Only a different connection can pierce it.
  const parent=seams.map((_,i)=>i);
  const root=i=>{while(parent[i]!==i)i=parent[i];return i;};
  for(let i=0;i<seams.length;i++) for(let j=i+1;j<seams.length;j++)
    if([seams[i].a,seams[i].b].some(v=>v===seams[j].a||v===seams[j].b) &&
      Math.abs(cross2(seams[i].d,seams[j].d))<VERTEX_EPS &&
      Math.abs(cross2(seams[i].d,sub(seams[j].o,seams[i].o)))<VERTEX_EPS) parent[root(j)]=root(i);
  for(let i=0;i<seams.length;i++) for(let j=i+1;j<seams.length;j++) {
    if(root(i)===root(j)) continue;
    const a=seams[i],b=seams[j];
    const interleaves=(a.lo<b.lo-RANK_EPS && b.lo<a.hi-RANK_EPS && a.hi<b.hi-RANK_EPS)||
      (b.lo<a.lo-RANK_EPS && a.lo<b.hi-RANK_EPS && b.hi<a.hi-RANK_EPS);
    if(!interleaves) continue;
    if(Math.abs(cross2(a.d,b.d))>VERTEX_EPS || Math.abs(cross2(a.d,sub(b.o,a.o)))>VERTEX_EPS) continue;
    const axis=Math.abs(a.d[0])>Math.abs(a.d[1])?0:2;
    const ar=[s.vertices[a.a].p[axis],s.vertices[a.b].p[axis]].sort((x,y)=>x-y);
    const br=[s.vertices[b.a].p[axis],s.vertices[b.b].p[axis]].sort((x,y)=>x-y);
    if(Math.min(ar[1],br[1])-Math.max(ar[0],br[0])>VERTEX_EPS)
      throw new FoldError('Folded stacks interleave',{code:'CREASE_PENETRATION'});
  }
}
