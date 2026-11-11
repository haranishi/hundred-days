import {spline} from '../../../src/world/surface-math.js';
import {routeFlow} from './drainage.js';
import {lakeInside} from './alpine.js';
import {smooth01} from './features.js';
const drainageCache=new WeakMap();
/** Route over a sampled, priority-flood drainage surface. Filling is analytical only:
 * it lets the route cross tiny spline basins; no terrain or ride physics is changed. */
export function traceValley(world,drop){
 if(world.buffers){
  let route=drainageCache.get(world.buffers.height);
  if(!route){const n=512,cell=world.size/n,c={grid:n,cell,size:world.size},h=Float32Array.from({length:n*n},(_,k)=>world.heightAt((k%n+.5)*cell-world.half,(Math.floor(k/n)+.5)*cell-world.half));
   route={...c,receiver:routeFlow(h,c,{outlet:lakeInside}).receiver};drainageCache.set(world.buffers.height,route);}
  const {grid:n,cell,receiver}=route,points=[{x:drop.x,z:drop.z}];
  let k=Math.max(0,Math.min(n-1,Math.floor((drop.z+world.half)/cell)))*n+Math.max(0,Math.min(n-1,Math.floor((drop.x+world.half)/cell)));
  for(let i=0;k>=0&&i<n*n;i++){points.push({x:(k%n+.5)*cell-world.half,z:(Math.floor(k/n)+.5)*cell-world.half});k=receiver[k];}
  const end=points.at(-1);return {points,reason:lakeInside(end.x,end.z)?'lake':'boundary',method:'8m priority-flood D8 (analytical, not an unattended ride)'};
 }
 return traceGradient(world,drop);
}
function traceGradient(world,drop){
  let x=drop.x,z=drop.z;const points=[];let reason='length';
  for(let distance=0;distance<=18000;distance+=6){
    points.push({x,z});if(Math.abs(x)>world.half-20||Math.abs(z)>world.half-20){reason='boundary';break;}
    const hx=(world.heightAt(x+12,z)-world.heightAt(x-12,z))/24,hz=(world.heightAt(x,z+12)-world.heightAt(x,z-12))/24,l=Math.hypot(hx,hz);
    if(l<.002){reason='flat';break;}
    if(points.length>20&&Math.hypot(x-points.at(-20).x,z-points.at(-20).z)<12){reason='basin';break;}
    x-=hx/l*6;z-=hz/l*6;
  }
  return {points,reason};
}
export function makeStations(c,b,drops){
  const read=(x,z)=>spline(b.height,c.grid,(x+c.size/2)/c.cell-.5,(z+c.size/2)/c.cell-.5),world={heightAt:read,half:c.size/2};
  const routes=drops.map(d=>traceValley(world,d)),ends=routes.map(r=>r.points[Math.max(0,r.points.length-20)]);
  // Base stations belong at the foot, even when an upper basin traps a route.
  // A trapped route remains a failing acceptance result rather than relabelling a summit shelf as a base.
  const targets=[{x:2600,z:400},{x:500,z:2600},{x:-2400,z:300}],low=ends.filter(p=>read(p.x,p.z)<1150);
  const centers=targets.map(t=>low.length?low.reduce((a,p)=>Math.hypot(p.x-t.x,p.z-t.z)<Math.hypot(a.x-t.x,a.z-t.z)?p:a):t);
  const stations=centers.map((p,i)=>({...p,id:['east-base','south-base','west-base'][i],name:['東の駅','南の駅','西の駅'][i],base:true,radius:25}));
  for(const [id,name,drop]of [['rime-mid','樹氷の駅','rime-plateau'],['crater-mid','火口の駅','crater-shelf']]){
    const index=drops.findIndex(d=>d.id===drop),route=routes[index].points,p=route[Math.min(80,route.length-1)];stations.push({...p,id,name,base:false,radius:25});
  }
  for(const station of stations){
    station.x=Math.max(-c.size/2+80,Math.min(c.size/2-80,station.x));station.z=Math.max(-c.size/2+80,Math.min(c.size/2-80,station.z));station.y=read(station.x,station.z);
    const r=70,n=c.grid;for(let j=Math.max(0,Math.floor((station.z-r+c.size/2)/c.cell));j<=Math.min(n-1,Math.ceil((station.z+r+c.size/2)/c.cell));j++)for(let i=Math.max(0,Math.floor((station.x-r+c.size/2)/c.cell));i<=Math.min(n-1,Math.ceil((station.x+r+c.size/2)/c.cell));i++){
      const k=j*n+i,x=(i+.5)*c.cell-c.size/2,z=(j+.5)*c.cell-c.size/2,w=1-smooth01((Math.hypot(x-station.x,z-station.z)-34)/36);b.height[k]=b.height[k]*(1-w)+station.y*w;
    }
  }
  for(let j=0;j<c.maskGrid;j++)for(let i=0;i<c.maskGrid;i++){
    const x=(i+.5)*c.cell*2-c.size/2,z=(j+.5)*c.cell*2-c.size/2,k=(j*c.maskGrid+i)*4;
    if(stations.some(s=>Math.hypot(x-s.x,z-s.z)<60)){b.masksB[k]=0;b.masksB[k+1]=0;b.masksA[k]=90;b.masksA[k+3]=0;}
  }
  for(let i=0;i<drops.length;i++){
    let best=null,bestDistance=Infinity;for(const s of stations)for(const p of routes[i].points){const d=Math.hypot(p.x-s.x,p.z-s.z);if(d<bestDistance){bestDistance=d;best=s;}}
    drops[i].finish=best.id;
  }
  return stations;
}
