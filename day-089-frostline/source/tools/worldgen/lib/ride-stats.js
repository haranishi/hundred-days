/** Follow the broad downhill gradient while measuring the actual shared snow surface.
 * A 0.5m horizontal step resolves a >=3m unloading interval without counting tile-size noise.
 */
export function countFloatableRuns(world,{x,z,length=600,step=.5,speed=20}={}){
  const out={},intervals=[];let active=null,travelled=0;
  function close(){if(active&&active.length>=3)intervals.push(active);active=null;}
  for(let distance=0;distance<=length;distance+=step){
    if(Math.abs(x)>world.half-20||Math.abs(z)>world.half-20)break;
    const hx=(world.heightAt(x+12,z)-world.heightAt(x-12,z))/24,hz=(world.heightAt(x,z+12)-world.heightAt(x,z-12))/24,norm=Math.hypot(hx,hz);
    if(norm<1e-5)break;
    const dx=-hx/norm,dz=-hz/norm;world.sampleSurface(x,z,out);
    const kappa=world.curvatureAlong(x,z,dx,dz),threshold=-9.81*out.ny/(speed*speed);
    if(kappa<threshold){
      if(!active)active={start:distance,end:distance,length:0,x,z,minKappa:kappa};
      active.end=distance;active.length=distance-active.start;
      if(kappa<active.minKappa){active.minKappa=kappa;active.x=x;active.z=z;}
    }else close();
    travelled=distance;x+=dx*step;z+=dz*step;
  }
  close();return {length:travelled,count:intervals.length,perKm:intervals.length/(travelled/1000||1),intervals};
}
export function rideStats(world){
  const drops=world.drops.map(d=>{
    const lines=[-10,0,10].map(side=>({side,...countFloatableRuns(world,{x:d.x+Math.cos(d.heading)*side,z:d.z+Math.sin(d.heading)*side})}));
    const count=lines.reduce((sum,l)=>sum+l.count,0),length=lines.reduce((sum,l)=>sum+l.length,0);
    return {id:d.id,name:d.name,lines,count,length,perKm:count/(length/1000||1)};
  });
  const count=drops.reduce((sum,d)=>sum+d.count,0),length=drops.reduce((sum,d)=>sum+d.length,0);
  return {method:'shared curvatureAlong, kappa < -9.81*surface.ny/20^2, contiguous horizontal length >=3m; 0.5m step, +/-12m broad-gradient tracing, 600m x offsets -10/0/+10m',speed:20,drops,meanPerKm:count/(length/1000),practiceThree:drops[0].lines.every(l=>l.count===3)};
}

/** Audit the delivered surface, independently of the pre-snow site classifier. */
export function auditLedges(world,ledges){
  const surface={},snow={},near=[];
  return ledges.map(p=>{
    let min=90,max=0,rock=0,obstacles=0,lipMin=90,lipMax=0;
    for(let t=-p.length/2+18;t<=p.length/2-18;t+=6){
      for(const d of [12,24,40]){
        const x=p.x-p.dz*t+p.dx*d,z=p.z+p.dx*t+p.dz*d;
        world.sampleSurface(x,z,surface);world.snowAt(x,z,snow);
        const angle=Math.acos(surface.ny)*180/Math.PI;min=Math.min(min,angle);max=Math.max(max,angle);rock=Math.max(rock,snow.rock);
        world.obstaclesNear(x,z,4,near);obstacles+=near.length;
      }
      let steepest=0;
      for(let d=-5;d<=9;d+=1){world.sampleSurface(p.x-p.dz*t+p.dx*d,p.z+p.dx*t+p.dz*d,surface);steepest=Math.max(steepest,Math.acos(surface.ny)*180/Math.PI);}
      lipMin=Math.min(lipMin,steepest);lipMax=Math.max(lipMax,steepest);
    }
    return {x:p.x,z:p.z,length:p.length,height:p.height,downwindDot:(p.dx+p.dz)/Math.SQRT2,landingAngle:[min,max],lipAngle:[lipMin,lipMax],maxRock:rock,obstacles,landingPass:min>=20&&max<=32&&rock<=.4&&obstacles===0};
  });
}
