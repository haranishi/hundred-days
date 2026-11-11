export const DROP_CLEARANCE=Object.freeze({length:160,width:12,behind:12});
/** Heading zero is north (-Z), pi/2 east (+X). */
export function inDropCorridor(drops,x,z,padding=0) {
  for(let i=0;i<drops.length;i++){
    const d=drops[i],dx=x-d.x,dz=z-d.z,s=Math.sin(d.heading),c=Math.cos(d.heading),along=dx*s-dz*c,across=dx*c+dz*s;
    if(along>=-DROP_CLEARANCE.behind-padding&&along<=DROP_CLEARANCE.length+padding&&Math.abs(across)<=DROP_CLEARANCE.width+padding)return true;
  }
  return false;
}
