// Final UV refinement is reused at every step: later cuts cannot make earlier
// frames pop or change the paper's shape. Scratch buffers are owned by each step.
import {VERTEX_EPS,add,sub,mul,unit,cross,dot,rotate,axisDistance,lerp,boundsOf,distance,barycentric,weighted,segmentTriangleInterval} from './math.js';
import {createSheet,cloneSheet,paperPoint,makeLocator} from './sheet.js';
import {applyOp,assertSheet,resolveLine} from './ops.js';
import {FoldError} from './error.js';
import {drivePose,rotateFaceVector} from './drive.js';
import {sheetMechanismPose} from './mechanism-sheet.js';
export {FoldError} from './error.js';
// Lower layers are drawn a little darker so stacked paper of one colour reads as separate
// layers. The tint follows rank order only; it never feeds geometry. Subtle on purpose.
const SHADE_DEPTH=0.1;
const DRIVE_WALK=96,DRIVE_STEP_LIMIT=0.06;
const internals=new WeakMap();
// Read-only-by-convention double-precision diagnostics for invariant tests; the
// renderer consumes only frame(), never these topology/UV implementation details.
export const inspectModel = model => internals.get(model);
const centroid=(s,t)=>t.v.map(v=>s.vertices[v].uv).reduce((a,b)=>add(a,b),[0,0]).map(v=>v/3);
function guide(r,start) {
  if(r.type==='scribe'||r.type==='tag'||Math.abs(r.angle)<1e-12) return null;
  let origin=r.origin,axis=r.axis;
  if(r.type==='fold'||r.type==='crease') {
    const l=resolveLine(start,r.op.line);origin=[l.o[0],0,l.o[1]];axis=[l.d[0],0,l.d[1]];
  } else if(r.type==='hinge') {
    const ref=r.op.axis.through;
    const beforePoint=x=>typeof x==='string'?paperPoint(start,start.marks[x]):[x[0],0,x[1]];
    origin=beforePoint(ref[0]);axis=unit(sub(beforePoint(ref[1]),origin));
  } else origin=boundsOf(start.vertices.map(v=>v.p)).center;
  const vertices=r.before.vertices.map(v=>paperPoint(start,v.uv));
  let on=vertices.filter(p=>axisDistance(p,origin,axis)<VERTEX_EPS);
  if(on.length<2) {
    const b=boundsOf(vertices);
    on=[add(origin,mul(axis,-b.radius)),add(origin,mul(axis,b.radius))];
  }
  const along=on.map(p=>dot(sub(p,origin),axis));
  const line=[add(origin,mul(axis,Math.min(...along))),add(origin,mul(axis,Math.max(...along)))];
  let p=vertices.filter((_,i)=>r.movingVertices.has(i))
    .sort((a,b)=>axisDistance(b,origin,axis)-axisDistance(a,origin,axis))[0];
  if(!p) p=add(origin,[.1,0,0]);
  // Half of the arc makes the lift direction readable before a 180-degree fold.
  const points=Array.from({length:25},(_,i)=>rotate(p,origin,axis,r.angle*i/48));
  const position=points.at(-1).slice(),direction=unit(sub(position,points.at(-2)));
  // A fold that names the layers it nests between is a reverse fold: its line is the pre-crease
  // (valley) but the motion is "push the tip in", so the viewer draws it with its own pattern.
  const reverse=r.type==='fold'&&r.op.stack&&typeof r.op.stack==='object';
  return {kind:reverse?'reverse':r.type==='crease'?r.op.mode:r.type==='fold'?r.op.mode:r.type,line,arrow:{points,head:{position,direction}}};
}
function mechanismGuides(r,start) {
  // Every hinge samples the same path times; solve each guide pose only once.
  const poses=new Map();
  const guidePoint=(cluster,p,t)=>{
    if(!poses.has(t)) poses.set(t,r.mechanism.path.at(t,{points:false}).poses);
    const pose=poses.get(t)[cluster];
    return p.reduce((sum,x,k)=>add(sum,mul(pose.r[k],x)),pose.o.slice());
  };
  return r.mechanism.path.core.hinges.flatMap((h,i)=>{
    if(!h.degrees) return [];
    const candidates=[h.a,h.b].flatMap(cluster=>r.mechanism.clusterVertices[cluster]
      .map(v=>({cluster,v,p:r.before.vertices[v].p,motion:distance(r.before.vertices[v].p,guidePoint(cluster,r.before.vertices[v].p,.5))})));
    const chosen=candidates.sort((a,b)=>b.motion-a.motion)[0];
    if(!chosen||chosen.motion<VERTEX_EPS) return [];
    const tri=r.before.triangles.find((_,i)=>r.mechanism.faces[i]===chosen.cluster);
    const before=tri.v.map(v=>r.before.vertices[v].p),initial=tri.v.map(v=>paperPoint(start,r.before.vertices[v].uv));
    const transport=p=>add(initial[0],rotateFaceVector(sub(p,before[0]),before,initial));
    const points=Array.from({length:25},(_,k)=>transport(guidePoint(chosen.cluster,chosen.p,k/48)));
    const position=points.at(-1).slice(),delta=sub(position,points.at(-2));
    if(distance(position,points[0])<VERTEX_EPS||Math.hypot(...delta)<VERTEX_EPS) return [];
    return [{kind:(h.assignment??h.degrees)>=0?'valley':'mountain',line:h.uvEdge.map(uv=>paperPoint(start,uv)),arrow:{points,head:{position,direction:unit(delta)}}}];
  });
}
function creaseMapping(fine,pairs) {
  const result=[];
  for(const pair of pairs) fine.triangles.forEach((tri,triangle)=>{
    const uv=tri.v.map(v=>fine.vertices[v].uv);
    const interval=segmentTriangleInterval(...pair,uv);
    if(!interval) return;
    const [low,high]=interval;
    if(high-low<VERTEX_EPS) return;
    const endpoints=[low,high].map(t=>({v:tri.v,w:barycentric(lerp(pair[0],pair[1],t),...uv)}));
    result.push({triangle,endpoints});
  });
  return result;
}
function makeSampler(fine) {
  const cache=new WeakMap(),centers=fine.triangles.map(t=>centroid(fine,t));
  return s=>{
    if(cache.has(s)) return cache.get(s);
    const locate=makeLocator(s),indices=new Map(s.triangles.map((tri,i)=>[tri,i]));
    const hits=fine.vertices.map(v=>locate(v.uv));
    const mapping=hits.map(({tri,w})=>({v:tri.v,w})),vertexFaces=hits.map(({tri})=>indices.get(tri));
    const faces=centers.map(uv=>indices.get(locate(uv).tri));
    const state={p:mapping.map(({v,w})=>weighted(v.map(i=>s.vertices[i].p),w)),
      offsets:faces.map(i=>s.triangles[i].offset.slice()),ranks:faces.map(i=>s.triangles[i].rank)};
    const result={state,mapping,faces,vertexFaces};cache.set(s,result);return result;
  };
}
function compileRecord(r,sample) {
  const {state:base,mapping,faces,vertexFaces}=sample(r.before),end=sample(r.type==='crease'?r.folded:r.after).state;
  if(r.type==='drive'||r.type==='mechanism') {
    return {...r,base,end,mapping,faces,mv:mapping.map(({v,w})=>v.some((id,k)=>w[k]>VERTEX_EPS&&r.movingVertices.has(id))),
      mt:faces.map(i=>r.moving.has(i))};
  }
  const mv=base.p.map((p,i)=>r.origin&&axisDistance(p,r.origin,r.axis)>VERTEX_EPS&&r.moving.has(vertexFaces[i]));
  const mt=faces.map(i=>r.moving.has(i));
  const clearance=r.clearance?faces.map(i=>r.clearance[i]):null;
  return {...r,base,end,mv,mt,clearance};
}
function fillPose(step,t,p,offsets,ranks=[]) {
  const progress=t*step.groups.length;
  const index=Math.min(Math.floor(progress),step.groups.length-1),q=t===1?1:progress-index;
  const group=step.groups[index];
  group.base.p.forEach((v,i)=>{p[i]=v.slice();});
  group.base.offsets.forEach((v,i)=>{offsets[i]=v.slice();});
  group.base.ranks.forEach((v,i)=>{ranks[i]=v;});
  for(const r of group.records) {
    const f=r.type==='crease'?(q<=.5?q*2:2-q*2):q;
    if(r.type==='drive'||r.type==='mechanism') {
      const pose=r.type==='drive'?drivePose(r.before,r.drive,f):sheetMechanismPose(r.before,r.mechanism,f);
      r.mapping.forEach(({v,w},i)=>{if(r.mv[i]) p[i]=v.reduce((sum,id,k)=>add(sum,mul(pose.p[id],w[k])),[0,0,0]);});
      r.faces.forEach((face,i)=>{if(r.mt[i]) offsets[i]=pose.offsets[face].slice();});
      if(r.type==='mechanism'&&r.mechanism.ranks) r.faces.forEach((face,i)=>{
        if(r.mt[i]) ranks[i]=r.base.ranks[i]+(r.mechanism.ranks[face]-r.base.ranks[i])*f;
      });
      continue;
    }
    for(let i=0;i<p.length;i++) if(r.mv[i]) p[i]=rotate(r.base.p[i],r.origin,r.axis,r.angle*f);
    for(let i=0;i<ranks.length;i++) if(r.mt[i]) ranks[i]=r.base.ranks[i]+(r.end.ranks[i]-r.base.ranks[i])*f;
    for(let i=0;i<offsets.length;i++) if(r.mt[i]) {
      offsets[i]=r.type==='hinge'||r.type==='turn'
        ?rotate(r.base.offsets[i],[0,0,0],r.axis,r.angle*f):lerp(r.base.offsets[i],r.end.offsets[i],f);
      if(r.clearance) offsets[i]=add(offsets[i],mul(r.clearance[i],f));
    }
  }
}
export function buildModel(def) {
  let stepNumber=0,opNumber=0;
  try {
    const paper={layerGap:.004,...def.paper};
    if(!Number.isFinite(paper.layerGap)||paper.layerGap<0) throw new FoldError('Invalid layer gap');
    if(!Array.isArray(def.steps)||!def.steps.length) throw new FoldError('Model needs steps');
    const s=createSheet(paper,def.marks),raw=[];
    assertSheet(s,paper);
    for(let i=0;i<def.steps.length;i++) {
      stepNumber=i+1;opNumber=0;const data=def.steps[i],start=cloneSheet(s),groups=[];
      if(!Array.isArray(data.ops)||!data.ops.length) throw new FoldError('Step needs operations');
      for(let j=0;j<data.ops.length;j++) {
        opNumber=j+1;const op=data.ops[j],r=applyOp(s,op,paper.layerGap);r.opNumber=opNumber;
        if(op.together && groups.length) {
          const g=groups.at(-1);
          for(const other of g.records) {
            // UV identity is stable, but indices may change when a later op cuts.
            for(const k of r.movingVertices) {
              const uv=r.before.vertices[k].uv;
              const old=other.before.vertices.findIndex(v=>distance(v.uv,uv)<VERTEX_EPS);
              if(other.movingVertices.has(old)) throw new FoldError('Simultaneous operations share moving vertices',{code:'TOGETHER_CONFLICT'});
            }
          }
          g.records.push(r);
        } else groups.push({start:r.before,records:[r]});
        assertSheet(s,paper);
      }
      raw.push({data,start,end:cloneSheet(s),groups});
    }
    const fine=cloneSheet(s),sample=makeSampler(fine);
    // The paper's own edge is drawn as a thin line so folded-over layers of one colour
    // keep a visible border. It is fixed in paper space, so it follows every fold.
    const {width:pw,height:ph}=paper;
    const outlineMap=creaseMapping(fine,[[[0,0],[pw,0]],[[pw,0],[pw,ph]],[[pw,ph],[0,ph]],[[0,ph],[0,0]]]);
    const compiled=raw.map((step,i)=>{
      stepNumber=i+1;
      const groups=step.groups.map(g=>({base:sample(g.start).state,records:g.records.map(r=>compileRecord(r,sample))}));
      for(const g of groups) for(let a=0;a<g.records.length;a++) for(let b=a+1;b<g.records.length;b++) {
        const first=g.records[a],second=g.records[b];
        if(first.mv.some((moving,i)=>moving&&second.mv[i])) {
          opNumber=second.opNumber;
          throw new FoldError('Simultaneous operations overlap after refinement',{code:'TOGETHER_CONFLICT'});
        }
      }
      // Clip in UV first: a crease crossing a later fold must bend with that fold.
      const creaseMap=creaseMapping(fine,step.end.creases);
      return {...step,groups,creaseMap,outlineMap,buffer:{positions:new Float32Array(fine.triangles.length*9),
        normals:new Float32Array(fine.triangles.length*9),shade:new Float32Array(fine.triangles.length*9),triCount:fine.triangles.length,
        topologyKey:`${def.id}:${i}`,creaseSegments:new Float32Array(creaseMap.length*6),
        outlineSegments:new Float32Array(outlineMap.length*6),bounds:null}};
    });
    const p=[],offsets=[],ranks=[];
    for(let i=0;i<compiled.length;i++) for(const t of [0,1]) {
      stepNumber=i+1;opNumber=t?raw[i].data.ops.length:1;
      fillPose(compiled[i],t,p,offsets,ranks);
      const state=t?raw[i].end:raw[i].start;
      const vertices=fine.vertices.map((v,j)=>({uv:v.uv,p:p[j]}));
      for(let j=0;j<vertices.length;j++) if(distance(vertices[j].p,sample(state).state.p[j])>VERTEX_EPS)
        throw new FoldError('Compiled endpoint disagrees with paper state',{code:'ENDPOINT'});
      // Ranks were checked on the source flat mesh; here we check the refined
      // geometry that will actually reach the renderer, independently of offsets.
      assertSheet({...fine,vertices,flat:false},paper);
    }
    // A follower vertex takes the root nearest its start position. When the drivers are not
    // symmetric that root can swap part-way and the vertex jumps; it would only show while
    // playing. Walk each drive here and refuse such data (see engine-notes).
    raw.forEach((step,i)=>step.groups.forEach(g=>g.records.forEach(r=>{
      if(r.type!=='drive') return;
      stepNumber=i+1;opNumber=r.opNumber;
      let last=null;
      for(let k=0;k<=DRIVE_WALK;k++) {
        const {p:q}=drivePose(r.before,r.drive,k/DRIVE_WALK);
        if(last) for(let v=0;v<q.length;v++) if(distance(q[v],last[v])>DRIVE_STEP_LIMIT)
          throw new FoldError('Drive follower jumps between solutions',{code:'DRIVE_BRANCH_JUMP'});
        last=q;
      }
    })));
    const steps=raw.map((r,i)=>({index:i,id:r.data.id,title:r.data.title,text:r.data.text,tip:r.data.tip,view:r.data.view,
      durationMs:r.data.durationMs??2200*r.groups.length,guides:r.groups.flatMap(g=>g.records.flatMap(op=>
        op.type==='drive'?op.drive.groups.map(group=>guide(group,r.start)):op.type==='mechanism'?mechanismGuides(op,r.start):[guide(op,r.start)]).filter(Boolean))}));
    const model={id:def.id,name:def.name,level:def.level,minutes:def.minutes,paper,steps,
      frame(i,t,{explode=1}={}) {
        if(!Number.isInteger(i)||i<0||i>=compiled.length) throw new RangeError('Step out of range');
        if(!Number.isFinite(t)||t<0||t>1) throw new RangeError('Progress must be in [0,1]');
        if(!Number.isFinite(explode)||explode<0) throw new RangeError('Explode must be nonnegative');
        const step=compiled[i],out=step.buffer;
        fillPose(step,t,p,offsets,ranks);
        const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
        let lowRank=Infinity,highRank=-Infinity;
        for(const r of ranks) {if(r<lowRank)lowRank=r;if(r>highRank)highRank=r;}
        const rankSpan=highRank-lowRank;
        fine.triangles.forEach((tri,j)=>{
          const points=tri.v.map(i=>p[i]),normal=unit(cross(sub(points[1],points[0]),sub(points[2],points[0])));
          for(let k=0;k<3;k++) for(let c=0;c<3;c++) {
            out.positions[j*9+k*3+c]=points[k][c]+offsets[j][c]*explode;
            const value=out.positions[j*9+k*3+c];
            if(value<min[c])min[c]=value;if(value>max[c])max[c]=value;
            out.normals[j*9+k*3+c]=normal[c];
            out.shade[j*9+k*3+c]=rankSpan>1e-9?1-SHADE_DEPTH*(1-(ranks[j]-lowRank)/rankSpan):1;
          }
        });
        step.creaseMap.forEach(({triangle,endpoints},j)=>endpoints.forEach(({v,w},k)=>{
          for(let c=0;c<3;c++) out.creaseSegments[j*6+k*3+c]=v.reduce((sum,id,n)=>sum+p[id][c]*w[n],0)+offsets[triangle][c]*explode;
        }));
        step.outlineMap.forEach(({triangle,endpoints},j)=>endpoints.forEach(({v,w},k)=>{
          for(let c=0;c<3;c++) out.outlineSegments[j*6+k*3+c]=v.reduce((sum,id,n)=>sum+p[id][c]*w[n],0)+offsets[triangle][c]*explode;
        }));
        out.bounds={min,max,center:lerp(min,max,.5),radius:distance(min,max)/2};
        return out;
      },
      finalFrame(opts) { return this.frame(steps.length-1,1,opts); },bounds:null};
    // A full circular envelope is conservative even between the sampled frames.
    // The display contract uses explode=1..24; larger factors remain caller-owned.
    const boundPoints=[];
    const boundSamples=compiled.some(step=>step.groups.some(g=>g.records.some(r=>r.type==='drive'||r.type==='mechanism')))
      ?[0,.125,.25,.375,.5,.625,.75,.875,1]:[0,.25,.5,.75,1];
    for(let i=0;i<steps.length;i++) for(const t of boundSamples) {
      // Keep the last sample's diagnostic buffers as before. Intermediate
      // bounds need only positions, with the renderer's Float32 rounding.
      if(t===1) {
        const b=model.frame(i,t,{explode:24}).bounds;boundPoints.push(b.min,b.max);continue;
      }
      fillPose(compiled[i],t,p,offsets,ranks);
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      fine.triangles.forEach((tri,j)=>{
        for(const v of tri.v) for(let c=0;c<3;c++) {
          const value=Math.fround(p[v][c]+offsets[j][c]*24);
          if(value<min[c]) min[c]=value;if(value>max[c]) max[c]=value;
        }
      });
      boundPoints.push(min,max);
    }
    for(const step of compiled) for(const g of step.groups) for(const r of g.records) {
      if(r.type==='drive'||r.type==='mechanism') {
        // Every material point lies within its paper distance of a fixed anchor.
        // This envelope covers between samples as well as rotating offsets.
        const anchor=r.type==='drive'?[...r.drive.fixedVertices][0]:r.before.triangles.find((_,i)=>r.mechanism.faces[i]===r.mechanism.path.core.pin).v[0];
        const uv=r.before.vertices[anchor].uv;
        const radius=Math.max(...r.before.vertices.map(v=>distance(v.uv,uv)))+
          24*Math.max(0,...r.base.offsets.map(v=>Math.hypot(...v)));
        const center=r.before.vertices[anchor].p;
        boundPoints.push(sub(center,[radius,radius,radius]),add(center,[radius,radius,radius]));
      }
      if(!r.axis) continue;
      const padding=[0,1,2].map(c=>24*Math.max(0,...r.base.offsets.map(v=>Math.abs(v[c])),...r.end.offsets.map(v=>Math.abs(v[c]))));
      // Rotating offsets can have their largest component between the endpoints.
      if(r.type==='hinge'||r.type==='turn') {
        const maximum=24*(Math.max(0,...r.base.offsets.map(v=>Math.hypot(...v)))+
          Math.max(0,...(r.clearance??[]).map(v=>Math.hypot(...v))));
        padding.fill(maximum);
      }
      r.base.p.forEach((p,i)=>{
        if(!r.mv[i]) return;
        const q=sub(p,r.origin),axial=mul(r.axis,dot(q,r.axis)),radial=sub(q,axial),tangent=cross(r.axis,radial),center=add(r.origin,axial);
        const radius=radial.map((v,c)=>Math.hypot(v,tangent[c])+padding[c]);
        boundPoints.push(sub(center,radius),add(center,radius));
      });
    }
    model.bounds=boundsOf(boundPoints);
    internals.set(model,{fine,raw,compiled,
      pose(i,t) { const p=[],offsets=[],ranks=[];fillPose(compiled[i],t,p,offsets,ranks);return {p,offsets,ranks}; }});
    return model;
  } catch(error) {
    const e=error instanceof FoldError?error:new FoldError(error.message,{cause:error});
    e.step=stepNumber;e.op=opNumber;e.message=`${def?.id??'model'} step ${e.step} op ${e.op}: ${e.message}`;
    throw e;
  }
}
