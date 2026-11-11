/** Inspect the delivered spline, without changing mountain geometry. */
export function scanNaturalFeatures(world,{step=12}={}) {
 const candidates=[],h=(x,z)=>world.heightAt(x,z),deg=180/Math.PI;
 for(let z=-world.half+80;z<world.half-80;z+=step)for(let x=-world.half+80;x<world.half-80;x+=step){
  const sf=world.sampleSurface(x,z,{}),heading=Math.atan2(sf.nx,-sf.nz),a0=Math.acos(sf.ny)*deg;
  if(a0>85)continue;
  for(const turn of [-.3,0,.3]){
   const a=heading+turn,dx=Math.sin(a),dz=-Math.cos(a),at=s=>h(x+dx*s,z+dz*s),slope=s=>Math.atan((at(s-3)-at(s+3))/6)*deg;
   const before=slope(-7.5),after=slope(7.5);if(after-before<12)continue;
   const angles=Array.from({length:41},(_,i)=>20+i).map(slope);if(angles.some(v=>v<28||v>42))continue;
   const drop=at(0)-at(15)-15*Math.tan(before/deg);if(drop<2||drop>12)continue;
   const rock=[20,30,40,50,60].map(s=>world.snowAt(x+dx*s,z+dz*s,{}).rock);if(rock.some(v=>v>=.3))continue;
   candidates.push({x,z,heading:a,before,after,angles,drop,kind:[2,5,8,11].some(s=>world.snowAt(x+dx*s,z+dz*s,{}).rock>=.3)?'cliff':'lip',region:x>450?'east':x< -350?'west':'central'});
  }
 }
 return candidates;
}

/** A small snow takeoff, added to existing ground only. Peak fill is <=1.5m. */
export function addSnowLip(world,f,height=1.5){
 const {meta:m,buffers:b}=world,n=m.grid,c=m.cell,half=m.size/2,undo=[];
 for(let j=Math.max(0,Math.floor((f.z-42+half)/c));j<Math.min(n,Math.ceil((f.z+42+half)/c));j++)for(let i=Math.max(0,Math.floor((f.x-42+half)/c));i<Math.min(n,Math.ceil((f.x+42+half)/c));i++){
  const dx=(i+.5)*c-half-f.x,dz=(j+.5)*c-half-f.z,s=dx*Math.sin(f.heading)-dz*Math.cos(f.heading),t=dx*Math.cos(f.heading)+dz*Math.sin(f.heading);
  const run=f.moundRun??12,fall=f.moundFall??5;
  if(s<=-run||s>=fall||Math.abs(t)>=36)continue;
  const u=s<0?(s+run)/run:(fall-s)/fall,side=Math.abs(t)<=20?1:(1+Math.cos(Math.PI*(Math.abs(t)-20)/16))/2;
  const k=j*n+i;undo.push([k,b.height[k]]);b.height[k]+=height*(1-Math.cos(Math.PI*u))/2*side;
 }
 return ()=>{for(const [k,v]of undo)b.height[k]=v;};
}
