// Compute the union boundary, including crossings and partially covered edges.
// Convex hulls would erase the heart notch and the spaces beside kimono sleeves.
import {cross2,sub,distance,signedArea} from '../lib/math.js';
const eps=1e-8;
const key=p=>p.map(x=>Math.round(x/eps)).join(':');
const inside=(p,tri)=>{
  const signs=tri.map((a,i)=>cross2(sub(tri[(i+1)%3],a),sub(p,a)));
  return signs.every(x=>x>=-1e-12)||signs.every(x=>x<=1e-12);
};
export function outline(s) {
  const triangles=s.triangles.map(t=>t.v.map(i=>[s.vertices[i].p[0],s.vertices[i].p[2]]));
  const edges=triangles.flatMap(t=>t.map((a,i)=>[a,t[(i+1)%3]]));
  const boundary=new Map();
  for(const [a,b] of edges) {
    const d=sub(b,a),length=distance(a,b),dd=d[0]**2+d[1]**2;
    if(length<eps) continue;
    const cuts=[0,1];
    for(const [c,e] of edges) {
      const v=sub(e,c),w=sub(c,a),den=cross2(d,v);
      if(Math.abs(den)>1e-12) {
        const t=cross2(w,v)/den,u=cross2(w,d)/den;
        if(t>eps&&t<1-eps&&u>=-eps&&u<=1+eps) cuts.push(t);
      } else if(Math.abs(cross2(w,d))<1e-10) for(const p of [c,e]) {
        const t=((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/dd;
        if(t>eps&&t<1-eps) cuts.push(t);
      }
    }
    cuts.sort((a,b)=>a-b);
    const values=cuts.filter((t,i)=>!i||t-cuts[i-1]>eps);
    for(let i=0;i<values.length-1;i++) {
      const point=t=>a.map((x,k)=>x+d[k]*t),p=point(values[i]),q=point(values[i+1]);
      if(distance(p,q)<eps) continue;
      const mid=point((values[i]+values[i+1])/2),delta=Math.min(1e-7,distance(p,q)*1e-3);
      const left=[mid[0]-d[1]/length*delta,mid[1]+d[0]/length*delta];
      const right=[mid[0]+d[1]/length*delta,mid[1]-d[0]/length*delta];
      const l=triangles.some(t=>inside(left,t)),r=triangles.some(t=>inside(right,t));
      if(l===r) continue;
      const pair=l?[p,q]:[q,p];boundary.set(pair.map(key).join('/'),pair);
    }
  }
  const next=new Map([...boundary.values()].map(([p,q])=>[key(p),q]));
  if(!next.size) throw new Error('Empty union boundary');
  const first=[...boundary.values()][0][0],poly=[first];
  let p=next.get(key(first));
  while(key(p)!==key(first)) {
    poly.push(p);p=next.get(key(p));
    if(!p||poly.length>next.size) throw new Error('Union boundary is not a closed loop');
  }
  if(poly.length!==next.size) throw new Error('Union has multiple boundary loops');
  return poly.filter((p,i)=>{
    const a=poly[(i+poly.length-1)%poly.length],b=poly[(i+1)%poly.length];
    return Math.abs(cross2(sub(p,a),sub(b,p)))>1e-10;
  });
}
export const concave=poly=>poly.filter((p,i)=>
  cross2(sub(p,poly[(i+poly.length-1)%poly.length]),sub(poly[(i+1)%poly.length],p))*Math.sign(signedArea(poly))<-1e-10);
export const symmetryError=poly=>Math.max(...poly.map(p=>Math.min(...poly.map(q=>distance([-p[0],p[1]],q)))));

// Resolve the visible material face without relying on display offsets or a hull.
export function topFace(s,p) {
  return s.triangles.filter(t=>inside(p,t.v.map(i=>[s.vertices[i].p[0],s.vertices[i].p[2]])))
    .sort((a,b)=>b.rank-a.rank)[0];
}

// Unregistered flat models need the same motion checks as registered models.
export async function verifyFlatMotion(model) {
  const {default:assert}=await import('node:assert/strict');
  const {inspectModel}=await import('../lib/model.js');
  const {assertSheet}=await import('../lib/ops.js');
  const {cross,unit,dot,rotate}=await import('../lib/math.js');
  const {fine,raw,compiled,pose}=inspectModel(model);
  const normal=ps=>unit(cross(sub(ps[1],ps[0]),sub(ps[2],ps[0])));
  for(let i=0;i<raw.length;i++) {
    for(const s of [raw[i].start,raw[i].end]) assertSheet(s,model.paper);
    for(const g of raw[i].groups) for(const r of g.records) {
      for(const s of [r.before,r.after,r.folded].filter(Boolean)) assertSheet(s,model.paper);
    }
    const groups=compiled[i].groups;
    for(let gi=0;gi<groups.length;gi++) for(const q of [0,.125,.25,.5,.75,.875,1]) {
      const t=(gi+q)/groups.length,{p}=pose(i,t),frame=model.frame(i,t,{explode:0});
      let area=0;
      fine.triangles.forEach((tri,j)=>{
        const uv=tri.v.map(v=>fine.vertices[v].uv),ps=tri.v.map(v=>p[v]);
        const material=signedArea(uv),world=cross(sub(ps[1],ps[0]),sub(ps[2],ps[0]));
        assert.ok(material>0);
        assert.ok(Math.abs(Math.hypot(...world)/2-material)<1e-8);
        area+=Math.hypot(...world)/2;
        for(let k=0;k<3;k++) {
          const n=(k+1)%3,expected=distance(uv[k],uv[n]);
          assert.ok(Math.abs(distance(ps[k],ps[n])-expected)<1e-8);
          assert.ok(Math.abs(distance(frame.positions.slice(j*9+k*3,j*9+k*3+3),
            frame.positions.slice(j*9+n*3,j*9+n*3+3))-expected)<2e-7);
        }
        // At group boundaries use the active group selected by the public timeline.
        const at=Math.min(Math.floor(t*groups.length),groups.length-1),g=groups[at];
        const f=t===1?1:t*groups.length-at;
        let expected=normal(tri.v.map(v=>g.base.p[v]));
        for(const r of g.records) if(r.mt[j]) {
          expected=rotate(normal(tri.v.map(v=>r.base.p[v])),[0,0,0],r.axis,
            r.angle*(r.type==='crease'?(f<=.5?2*f:2-2*f):f));
        }
        assert.ok(dot(normal(ps),expected)>1-1e-7);
        assert.ok(dot(frame.normals.slice(j*9,j*9+3),expected)>1-1e-7);
      });
      assert.ok(Math.abs(area-1)<1e-7);
    }
    if(i) {
      const before=model.frame(i-1,1).positions.slice(),after=model.frame(i,0).positions;
      assert.ok(after.every((v,j)=>Math.abs(v-before[j])<1e-7));
    }
  }
}
