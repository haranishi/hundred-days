import {makeRollers} from './feature-stamps.js';
/** Add finite rollers to existing snow; retain the original mountain beneath them. */
export function addRollers(world,f){
 const stamp=makeRollers({slopeDeg:f.slopeDeg,count:2}),{meta:m,buffers:b}=world,undo=[],r=stamp.after+stamp.width;
 for(let j=Math.max(0,Math.floor((f.z-r+m.size/2)/m.cell));j<Math.min(m.grid,Math.ceil((f.z+r+m.size/2)/m.cell));j++)for(let i=Math.max(0,Math.floor((f.x-r+m.size/2)/m.cell));i<Math.min(m.grid,Math.ceil((f.x+r+m.size/2)/m.cell));i++){
  const x=(i+.5)*m.cell-m.size/2-f.x,z=(j+.5)*m.cell-m.size/2-f.z,s=x*Math.sin(f.heading)-z*Math.cos(f.heading),t=x*Math.cos(f.heading)+z*Math.sin(f.heading),delta=stamp.delta(s,t);if(!delta)continue;const k=j*m.grid+i;undo.push([k,b.height[k]]);b.height[k]+=delta;
 }
 return ()=>{for(const [k,v]of undo)b.height[k]=v;};
}
