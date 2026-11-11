import {cleanMesh} from './clean-mesh.mjs';
import {createBindPose,createSkeletonState,solveSkeleton} from '../../src/render/ride/skeleton-math.js';
import {realPoses} from './preview.mjs';
import {sub,cross,dot,unit} from './sdf.mjs';
// Choose diagonals against a set of articulation envelopes. This changes only
// triangulation and collapses ill-conditioned edges under the manifold link
// condition. A bounded pass count keeps this offline operation predictable.
export function improveSkinTopology(mesh,round=0){
 const bind=createBindPose(),poses=realPoses().map(([,p])=>p),samples=poses.map(p=>{
  const mat=solveSkeleton(p,1,createSkeletonState(bind));
  const points=mesh.p.map((p,i)=>{const q=[0,0,0];for(const [b,w]of mesh.a[i].weights)for(let k=0;k<3;k++)q[k]+=w*(mat[b*16+k]*p[0]+mat[b*16+4+k]*p[1]+mat[b*16+8+k]*p[2]+mat[b*16+12+k]);return q;});return {mat,points};
 });
 const normal=(points,t)=>cross(sub(points[t[1]],points[t[0]]),sub(points[t[2]],points[t[0]]));
 const score=t=>{const bn=normal(mesh.p,t);if(Math.hypot(...bn)<1e-10)return -1;let min=1;
  for(const {mat,points}of samples){const n=unit(normal(points,t)),expected=[0,0,0];for(const id of t)for(const[b,w]of mesh.a[id].weights)for(let k=0;k<3;k++)expected[k]+=w*(mat[b*16+k]*bn[0]+mat[b*16+4+k]*bn[1]+mat[b*16+8+k]*bn[2]);min=Math.min(min,dot(n,unit(expected)));}return min;
 };
 for(let pass=0;pass<4;pass++){
  const edges=new Map(),bad=[];mesh.tri.forEach((t,i)=>{if(score(t)<.08)bad.push(i);for(let k=0;k<3;k++){const a=t[k],b=t[(k+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);if(!edges.has(key))edges.set(key,[]);edges.get(key).push([i,a,b,t[(k+2)%3]]);}});
  if(!bad.length)break;
  const used=new Set(),collapse=new Set();
  for(const i of bad){if(used.has(i))continue;const t=mesh.tri[i];let best=null,bestScore=.08;
   for(let k=0;k<3;k++){
    const a=t[k],b=t[(k+1)%3],c=t[(k+2)%3],edge=edges.get(Math.min(a,b)+':'+Math.max(a,b)),other=edge.find(([j])=>j!==i);
    if(!other||used.has(other[0]))continue;const [j,,,d]=other;
    if(edges.has(Math.min(c,d)+':'+Math.max(c,d)))continue;
    const t0=[c,d,b],t1=[d,c,a],oldNormal=normal(mesh.p,t);
    if(dot(normal(mesh.p,t0),oldNormal)<=0||dot(normal(mesh.p,t1),oldNormal)<=0)continue;
    const value=Math.min(score(t0),score(t1));if(value>bestScore){bestScore=value;best=[j,t0,t1];}
   }
   if(best){const[j,t0,t1]=best;mesh.tri[i]=t0;mesh.tri[j]=t1;used.add(i);used.add(j);}
   else {
    const neighbors=id=>new Set(mesh.tri.filter(t=>t.includes(id)).flat().filter(i=>i!==id));
    const shortest=t.map((a,k)=>[a,t[(k+1)%3]]).filter(([a,b])=>[...neighbors(a)].filter(i=>neighbors(b).has(i)).length===2).sort(([a,b],[c,d])=>Math.hypot(...sub(mesh.p[a],mesh.p[b]))-Math.hypot(...sub(mesh.p[c],mesh.p[d])))[0];
    if(!shortest)continue;const[a,b]=shortest;if(Math.hypot(...sub(mesh.p[a],mesh.p[b]))<.05)collapse.add(Math.min(a,b)+':'+Math.max(a,b));
   }
  }
  if(collapse.size&&round<8){cleanMesh(mesh,collapse);return improveSkinTopology(mesh,round+1);}
 }
}
