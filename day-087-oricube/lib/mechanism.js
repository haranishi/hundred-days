// Rigid clusters are transformed, never relaxed. Angles are radians internally;
// a directed edge rotates cluster b relative to a by the right-hand rule.
import {add,sub,mul,dot,cross,norm,unit,distance,rotate} from './math.js';
import {FoldError} from './error.js';
const ZERO=[0,0,0],BASIS=[[1,0,0],[0,1,0],[0,0,1]];
const TOL=2e-14,EDGE_TOL=1e-9;
const fail=(message,code='MECHANISM_INFEASIBLE',details={})=>{
  const error=new FoldError(message,{code});Object.assign(error,details);throw error;
};
const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const vector=(pose,p)=>[0,1,2].map(i=>pose.r[0][i]*p[0]+pose.r[1][i]*p[1]+pose.r[2][i]*p[2]);
export const mechanismPoint=(pose,p)=>[
  pose.r[0][0]*p[0]+pose.r[1][0]*p[1]+pose.r[2][0]*p[2]+pose.o[0],
  pose.r[0][1]*p[0]+pose.r[1][1]*p[1]+pose.r[2][1]*p[2]+pose.o[1],
  pose.r[0][2]*p[0]+pose.r[1][2]*p[1]+pose.r[2][2]*p[2]+pose.o[2]];
function across(pose,hinge,angle) {
  const origin=mechanismPoint(pose,hinge.edge[0]),axis=vector(pose,hinge.axis);
  return {r:pose.r.map(v=>rotate(v,ZERO,axis,angle)),o:rotate(pose.o,origin,axis,angle)};
}
function transforms(core,angles) {
  const result=core.clusters.map(()=>null);result[core.pin]={r:BASIS.map(v=>v.slice()),o:ZERO.slice()};
  for(const {from,to,index,sign} of core.tree) result[to]=across(result[from],core.hinges[index],sign*angles[index]);
  return result;
}
function residual(core,angles,poses=transforms(core,angles)) {
  const r=[];
  for(const index of core.loops) {
    const h=core.hinges[index],a=poses[h.a],b=poses[h.b],expected=across(a,h,angles[index]);
    for(const p of h.edge) r.push(...sub(mechanismPoint(a,p),mechanismPoint(b,p)));
    // Endpoint agreement alone leaves the non-tree hinge angle unconstrained.
    for(let k=0;k<3;k++) r.push(...sub(expected.r[k],b.r[k]));
  }
  return r;
}
function constraints(core,angles,t) {
  const r=residual(core,angles);
  if(core.driver==='projection') r.push((dot(angles,core.goals)-t*energy(core.goals))/norm(core.goals));
  return r;
}
const magnitude=r=>Math.max(0,...r.map(Math.abs));
const energy=r=>dot(r,r);
function linearSolve(matrix,rhs) {
  const n=rhs.length,a=matrix.map((row,i)=>[...row,rhs[i]]);
  for(let i=0;i<n;i++) {
    let pivot=i;
    for(let j=i+1;j<n;j++) if(Math.abs(a[j][i])>Math.abs(a[pivot][i])) pivot=j;
    if(Math.abs(a[pivot][i])<1e-28) return null;
    [a[i],a[pivot]]=[a[pivot],a[i]];
    for(let j=i+1;j<n;j++) {
      const f=a[j][i]/a[i][i];
      for(let k=i+1;k<=n;k++) a[j][k]-=f*a[i][k];
    }
  }
  const x=Array(n).fill(0);
  for(let i=n-1;i>=0;i--) {
    let v=a[i][n];for(let j=i+1;j<n;j++) v-=a[i][j]*x[j];x[i]=v/a[i][i];
  }
  return x;
}
function project(core,t,initial,maxIterations=60) {
  const angles=initial.slice(),driver=core.driver,free=core.goals.flatMap((goal,i)=>i===driver||!goal?[]:[i]);
  core.goals.forEach((goal,i)=>{if(!goal) angles[i]=0;});
  if(driver!=='projection') angles[driver]=t*core.goals[driver];
  let r=constraints(core,angles,t),damping=1e-10;
  for(let iteration=0;iteration<maxIterations;iteration++) {
    if(magnitude(r)<TOL) return angles;
    const columns=free.map(i=>{
      const h=1e-5,plus=angles.slice(),minus=angles.slice();plus[i]+=h;minus[i]-=h;
      const a=constraints(core,plus,t),b=constraints(core,minus,t);return a.map((v,k)=>(v-b[k])/(2*h));
    });
    const matrix=columns.map(a=>columns.map(b=>dot(a,b))),rhs=columns.map(a=>-dot(a,r));
    let accepted=false;
    for(let attempt=0;attempt<12;attempt++) {
      const step=linearSolve(matrix.map((row,i)=>row.map((v,j)=>v+(i===j?damping:0))),
        rhs.map((v,k)=>v+(magnitude(r)>1e-8?damping:0)*(t*core.goals[free[k]]-angles[free[k]])));
      if(!step) {damping*=10;continue;}
      const scale=Math.min(1,.35/Math.max(1e-30,...step.map(Math.abs))),next=angles.slice();
      free.forEach((i,k)=>{next[i]=Math.max(Math.min(0,core.goals[i]),Math.min(Math.max(0,core.goals[i]),next[i]+step[k]*scale));});
      const nr=constraints(core,next,t);
      if(energy(nr)<energy(r)) {
        next.forEach((v,i)=>{angles[i]=v;});r=nr;damping=Math.max(1e-16,damping/5);accepted=true;break;
      }
      damping*=10;
    }
    if(!accepted) break;
  }
  fail('Rigid loop projection did not converge','MECHANISM_NO_CONVERGENCE',{t,residual:magnitude(r),angles});
}
function assertBranch(core,angles,t) {
  for(let i=0;i<angles.length;i++) {
    const goal=core.goals[i],angle=angles[i];
    if(Math.abs(angle)>Math.PI+1e-8||goal*angle<-1e-10||(!goal&&Math.abs(angle)>1e-8))
      fail('Rigid path leaves the declared mountain/valley branch','MECHANISM_BRANCH',{t,hinge:i,angle});
  }
}
export function prepareMechanism({clusters,hinges,pin=0,driver}={}) {
  if(!Array.isArray(clusters)||!clusters.length||!Number.isInteger(pin)||pin<0||pin>=clusters.length||
    !Array.isArray(hinges)||!hinges.length) fail('Invalid cluster mechanism','INVALID_MECHANISM');
  clusters=clusters.map(c=>{
    if(!c||!Array.isArray(c.points)||c.points.length<3||!c.points.every(finitePoint)||
      !c.points.some(p=>c.points.some(q=>norm(cross(sub(p,c.points[0]),sub(q,c.points[0])))>1e-14)))
      fail('Cluster needs non-collinear finite points','INVALID_MECHANISM');
    return {points:c.points.map(p=>p.slice())};
  });
  hinges=hinges.map(h=>{
    if(!h||!Number.isInteger(h.a)||!Number.isInteger(h.b)||h.a===h.b||!clusters[h.a]||!clusters[h.b]||
      !Array.isArray(h.edge)||h.edge.length!==2||!h.edge.every(finitePoint)||
      distance(...h.edge)<EDGE_TOL||!Number.isFinite(h.degrees)||Math.abs(h.degrees)>180)
      fail('Invalid directed hinge','INVALID_MECHANISM');
    if([h.a,h.b].some(i=>h.edge.some(p=>!clusters[i].points.some(q=>distance(p,q)<EDGE_TOL))))
      fail('Hinge endpoints must belong to both clusters','INVALID_MECHANISM');
    return {...h,edge:h.edge.map(p=>p.slice()),axis:unit(sub(h.edge[1],h.edge[0]))};
  });
  const goals=hinges.map(h=>h.degrees*Math.PI/180);
  driver??='projection';
  if(!goals.some(Boolean)||(driver!=='projection'&&(!Number.isInteger(driver)||!hinges[driver]||!goals[driver])))
    fail('Mechanism needs a moving driver','INVALID_MECHANISM');
  const tree=[],seen=new Set([pin]),used=new Set(),queue=[pin];
  for(let k=0;k<queue.length;k++) hinges.forEach((h,index)=>{
    const from=queue[k],to=h.a===from?h.b:h.b===from?h.a:null;
    if(to===null||seen.has(to)) return;
    seen.add(to);used.add(index);queue.push(to);tree.push({from,to,index,sign:h.a===from?1:-1});
  });
  if(seen.size!==clusters.length) fail('Clusters are not connected to the pin','INVALID_MECHANISM');
  return {clusters,hinges,pin,driver,goals,tree,loops:hinges.flatMap((_,i)=>used.has(i)?[]:[i])};
}
export function mechanismPose(core,angles,{points=true}={}) {
  if(!Array.isArray(angles)||angles.length!==core.hinges.length||!angles.every(Number.isFinite))
    fail('Expected one finite radian angle per hinge','INVALID_MECHANISM');
  const poses=transforms(core,angles),positions=points?core.clusters.map((c,i)=>c.points.map(p=>mechanismPoint(poses[i],p))):undefined;
  let closure=0;
  for(const h of core.hinges) for(const p of h.edge)
    closure=Math.max(closure,distance(mechanismPoint(poses[h.a],p),mechanismPoint(poses[h.b],p)));
  return {angles:angles.slice(),poses,points:positions,closure,residual:magnitude(residual(core,angles,poses))};
}
export function projectMechanism(core,t,initial=core.goals.map(a=>a*t)) {
  if(!Number.isFinite(t)||t<0||t>1) throw new RangeError('Progress must be in [0,1]');
  if(!Array.isArray(initial)||initial.length!==core.goals.length||!initial.every(Number.isFinite))
    fail('Expected a finite angle seed','INVALID_MECHANISM');
  return mechanismPose(core,project(core,t,initial));
}
export function buildMechanism(input,{samples=256}={}) {
  const core=prepareMechanism(input);
  if(!Number.isInteger(samples)||samples<200) fail('Use at least 200 path intervals','INVALID_MECHANISM');
  const end=mechanismPose(core,core.goals);
  if(end.residual>EDGE_TOL||end.closure>EDGE_TOL)
    fail('Declared endpoint does not close','MECHANISM_INFEASIBLE',{t:1,residual:end.residual,closure:end.closure});
  const table=[core.goals.map(()=>0)];
  // A signed seed chooses a side of the flat singularity without random noise.
  const seedT=1e-3;let previous=project(core,seedT,core.goals.map(v=>v*seedT));
  assertBranch(core,previous,seedT);
  for(let k=1;k<samples;k++) {
    const t=k/samples,lastT=k===1?seedT:(k-1)/samples;
    const guess=previous.map((v,i)=>v+(core.goals[i]-v)*(t-lastT)/(1-lastT)),angles=project(core,t,guess);
    assertBranch(core,angles,t);
    if(angles.some((v,i)=>Math.abs(v-previous[i])>.3))
      fail('Rigid path jumps between branches','MECHANISM_BRANCH',{t});
    table.push(angles);previous=angles;
  }
  if(previous.some((v,i)=>Math.abs(v-core.goals[i])>.3))
    fail('Rigid path does not reach the declared endpoint','MECHANISM_BRANCH',{t:1});
  table.push(core.goals.slice());
  return {core,table,samples,
    at(t,{points=true}={}) {
      if(!Number.isFinite(t)||t<0||t>1) throw new RangeError('Progress must be in [0,1]');
      const index=Math.min(samples-1,Math.floor(t*samples)),f=t*samples-index;
      if(f===0) return mechanismPose(core,table[index],{points});
      if(t===1) return mechanismPose(core,table[samples],{points});
      const guess=table[index].map((v,i)=>v+(table[index+1][i]-v)*f),angles=project(core,t,guess,12);
      if(angles.some((a,i)=>Math.abs(a-guess[i])>.1)) fail('Frame projection changes branch','MECHANISM_BRANCH',{t});
      assertBranch(core,angles,t);return mechanismPose(core,angles,{points});
    }};
}
