/** Shared local coordinates: heading zero along north; yaw is radians about Y. */
export function bridgeDeck(meta,x,z){
 const b=meta.structures?.bridge;if(!b||!Number.isFinite(x)||!Number.isFinite(z))return -Infinity;
 const dx=x-b.x,dz=z-b.z,s=Math.sin(b.yaw),c=Math.cos(b.yaw),along=dx*s-dz*c,across=dx*c+dz*s;
 if(Math.abs(along)>b.length/2||Math.abs(across)>b.width/2)return -Infinity;
 return b.y+b.rise*(1-(2*along/b.length)**2);
}
export function structureObstacles(meta,heightAt){
 const s=meta.structures;if(!s)return [];
 const items=[];
 function rect(b,id){const radius=1.6;for(let u=-b.length/2+1;u<=b.length/2;u+=2)for(let v=-b.width/2+1;v<=b.width/2;v+=2){const x=b.x+Math.sin(b.yaw)*u+Math.cos(b.yaw)*v,z=b.z-Math.cos(b.yaw)*u+Math.sin(b.yaw)*v;items.push({id:`${id}:${u}:${v}`,type:'building',x,z,y:b.y,radius,height:id==='lodge'?15:8});}}
 rect(s.lodge,'lodge');s.chalets.forEach((b,i)=>rect(b,`chalet-${i}`));rect(s.lift.base,'lift-base');rect(s.lift.top,'lift-top');
 s.lift.towers.forEach((b,i)=>items.push({id:`tower-${i}`,type:'tower',x:b.x,z:b.z,y:b.y,radius:.8,height:b.height}));
 const b=s.bridge;for(let u=-b.length/2;u<=b.length/2;u+=1.5)for(const side of [-1,1]){const x=b.x+Math.sin(b.yaw)*u+Math.cos(b.yaw)*side*(b.width/2+.35),z=b.z-Math.cos(b.yaw)*u+Math.sin(b.yaw)*side*(b.width/2+.35);items.push({id:`bridge-rail:${u}:${side}`,type:'building',x,z,y:heightAt(x,z),radius:.4,height:1.1});}
 return items;
}
export function structureClearance(meta,x,z,padding=0){
 const s=meta.structures;if(!s)return false;
 for(const b of [s.lodge,...s.chalets,s.lift.base,s.lift.top,s.bridge]){
 const dx=x-b.x,dz=z-b.z,u=dx*Math.sin(b.yaw)-dz*Math.cos(b.yaw),v=dx*Math.cos(b.yaw)+dz*Math.sin(b.yaw);
 if(Math.abs(u)<b.length/2+padding+8&&Math.abs(v)<b.width/2+padding+8)return true;
 }return s.lift.towers.some(b=>Math.hypot(x-b.x,z-b.z)<padding+4);
}
