import {forestNearest,forestSamples} from './forest-trail.js';
import {calibrateFeature} from './feature-rides.js';
import {parkPoint} from './park-search.js';
import {createObstacleStore} from '../../../src/world/obstacles.js';
import {spline} from '../../../src/world/surface-math.js';
export function roundTerrain(height,c,centres,radius=40){
 const before=height.slice(),read=(x,z)=>spline(before,c.grid,(x+c.size/2)/c.cell-.5,(z+c.size/2)/c.cell-.5);
 const forest=forestSamples(),changed=new Set();for(const centre of centres)for(let j=Math.max(0,Math.floor((centre.z-radius+c.size/2)/c.cell));j<Math.min(c.grid,Math.ceil((centre.z+radius+c.size/2)/c.cell));j++)for(let i=Math.max(0,Math.floor((centre.x-radius+c.size/2)/c.cell));i<Math.min(c.grid,Math.ceil((centre.x+radius+c.size/2)/c.cell));i++){
  const k=j*c.grid+i;if(changed.has(k))continue;const x=(i+.5)*c.cell-c.size/2,z=(j+.5)*c.cell-c.size/2,d=Math.hypot(x-centre.x,z-centre.z);if(d>=radius||forestNearest(x,z,forest).distance<14)continue;
  let sum=0,sw=0;for(let dz=-32;dz<=32;dz+=8)for(let dx=-32;dx<=32;dx+=8){const w=Math.exp(-(dx*dx+dz*dz)/512);sum+=w*read(x+dx,z+dz);sw+=w;}
  const t=Math.min(1,d/radius),w=(1-t*t*(3-2*t));height[k]=before[k]*(1-w)+sum/sw*w;changed.add(k);
 }
 return changed.size;
}
export function surveyRunouts(w,{repair=false}={}){
 const rows=[];const clear=w.meta.runoutClearance??(w.meta.runoutClearance=[]);const centres=[];
 for(const f of w.meta.features){const targets=f.kind==='rollers'?[20,20,20]:[f.speed[0],(f.speed[0]+f.speed[1])/2,f.speed[1]],test=f.kind==='kicker'?{...f,approach:{...parkPoint(f,-15),heading:f.heading,speed:0}}:f;
  const runs=targets.map(v=>{const r=calibrateFeature(w,test,v,{followSeconds:12,trace:true});
   if(repair){clear.push({feature:f.id,radius:14,points:r.points.filter((p,i)=>i%8===0).map(p=>[p.x,p.z])});if(r.crash?.reason==='landing-hard')centres.push({...r.end,feature:f.id,radius:40});}
   return {target:v,initial:r.initial,edge:r.edge,followed:r.followed,crash:r.crash,flight:r.flight,completed:r.completed,pass:r.completed&&!r.crash};
  });rows.push({id:f.id,runs,pass:runs.every(r=>r.pass)});
 }
 if(repair){
  for(const path of clear)for(const [x,z]of path.points){const n=w.meta.maskGrid,cell=w.meta.cell*2;for(let j=Math.max(0,Math.floor((z-path.radius+w.half)/cell));j<Math.min(n,Math.ceil((z+path.radius+w.half)/cell));j++)for(let i=Math.max(0,Math.floor((x-path.radius+w.half)/cell));i<Math.min(n,Math.ceil((x+path.radius+w.half)/cell));i++){if(((i+.5)*cell-w.half-x)**2+((j+.5)*cell-w.half-z)**2>path.radius**2)continue;const k=(j*n+i)*4;w.buffers.masksB[k]=0;if(w.buffers.masksA[k+3]>60){w.buffers.masksA[k+3]=0;w.buffers.masksA[k]=Math.max(45,w.buffers.masksA[k]);w.buffers.masksA[k+1]=Math.max(220,w.buffers.masksA[k+1]);}}}
  w.meta.terrainRepairs??=[];w.meta.terrainRepairs.push(...centres);roundTerrain(w.buffers.height,w.meta,centres);w.obstaclesNear=createObstacleStore(w);}
 return rows;
}
