import {mesh,box,beam,poly,face,finish} from './mesh.mjs';
// Snow is a closed layer above a solid timber roof, never a coincident white decal.
export function roof(m,c,w,d,eave,ridge,revision){
 const z0=c[2]-d/2,z1=c[2]+d/2,x0=c[0]-w/2,x1=c[0]+w/2;
 for(const [edge,sign] of [[x0,-1],[x1,1]]){
  const top=[[edge,eave,z0],[c[0],ridge,z0],[c[0],ridge,z1],[edge,eave,z1]];

  // Hidden underside can be a closed pyramid, freeing faces for the snow lip.
  const underside=[c[0]+(edge-c[0])*.5,(eave+ridge)*.5-.23,(z0+z1)*.5];
  poly(m,[...top,underside],[[0,1,2,3],[4,1,0],[4,2,1],[4,3,2],[4,0,3]],0);
  // A seven-point cross-section replaces the flat slab within the old budget.
  // The central shoulder is thick; the lip overhangs and rolls down at the eave.
  const snow=top.map(p=>[p[0]+(p[0]===edge?sign*.15:0),p[1]+.40,p[2]]);
  const profile=z=>{
   const bulge=.5+.5*Math.sin(z*1.9+edge);
   return [[edge+sign*.15,eave+.40,z],[c[0]+(edge-c[0])*.85,eave+(ridge-eave)*.15+.60,z],[c[0]+(edge-c[0])*.45,eave+(ridge-eave)*.55+.65+bulge*.07,z],[c[0],ridge+.40,z],[c[0],ridge+.025,z],[edge+sign*.22,eave+.13,z],[edge+sign*.25,eave+.24,z]];
  };
  poly(m,[...profile(z0),...profile(z1)],[[0,1,2,3,4,5,6],[7,13,12,11,10,9,8],...Array.from({length:7},(_,i)=>[i,(i+1)%7,(i+1)%7+7,i+7])],2,.99,.04);
  m.roofs.push({kind:'snow',corners:sign<0?[snow[0],snow[3],snow[2],snow[1]]:snow});
  beam(m,[edge,eave-.16,z0],[edge,eave-.16,z1],.18,.23,0,.77);
  for(let i=0;i<2;i++){
   const z=z0+d*(.25+i*.47),len=.21+.24*(.5+.5*Math.sin(z*8+edge)),q=[[edge+sign*.16,eave+.16,z-.045],[edge+sign*.16,eave+.16,z+.045],[edge+sign*.17,eave-len,z]];
   face(m,q,2,[sign,0,0],.94);face(m,[...q].reverse(),2,[-sign,0,0],.94);
  }
 }
 // Triangular gable infill, tucked behind the overhang.
 for(const z of [z0+.45,z1-.45])face(m,[[x0+.6,eave-.2,z],[x1-.6,eave-.2,z],[c[0],ridge-.24,z]],0,[0,0,z<c[2]?-1:1],.87,.24);
 for(const z of [z0,z1])for(const edge of [x0,x1])beam(m,[edge,eave-.18,z],[c[0],ridge-.18,z],.20,.22,0,.8);
}
export {detailedBuilding as building} from './lodge.mjs';
