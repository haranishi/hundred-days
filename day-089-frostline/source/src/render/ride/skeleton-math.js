/** Flat world-space skin transforms. Column-major; metres; +Y up, board nose -Z.
 * Setup allocates; solveSkeleton does not. Each rider needs its own state.
 * Matrices already include inverse bind: do NOT apply inverse bind a second time.
 */
import { BODY } from './pose.js';
export const BONE_NAMES = Object.freeze(['pelvis','abdomen','chest','neck','head',
  'upperArmL','forearmL','handL','upperArmR','forearmR','handR',
  'thighL','shinL','footL','thighR','shinR','footR','clavicleL','clavicleR','board','poleL','poleR']);
const ROOTS = ['pelvis','pelvis','chest','neck','head','shoulderL','elbowL','handL',
  'shoulderR','elbowR','handR','hipL','kneeL','ankleL','hipR','kneeR','ankleR','neck','neck'];
const ENDS = ['chest','chest','neck','head',null,'elbowL','handL',null,'elbowR','handR',null,
  'kneeL','ankleL',null,'kneeR','ankleR',null,'shoulderL','shoulderR'];
const POLE_BONES = [[20,'L'],[21,'R']];
const CHAINS = [[5,6,7],[8,9,10],[11,12,13],[14,15,16]];
const vec = (x=0,y=0,z=0) => ({x,y,z});
export function createBindPose() {
  const j = {}, h = .89;
  j.pelvis=vec(0,h,0); j.chest=vec(0,h+BODY.pelvisToChest,0);
  j.neck=vec(0,j.chest.y+BODY.chestToNeck,0); j.head=vec(0,j.neck.y+BODY.neck+BODY.headRadius,0);
  for (const [s,sign] of [['L',-1],['R',1]]) {
    j['hip'+s]=vec(0,h,sign*.10); j['ankle'+s]=vec(0,.11,sign*.26);
    // Exact two-segment lengths, slight forward flexion.
    const a=j['hip'+s], b=j['ankle'+s], dy=b.y-a.y,dz=b.z-a.z,d=Math.hypot(dy,dz);
    const along=(BODY.thigh**2-BODY.shin**2+d*d)/(2*d), bend=Math.sqrt(BODY.thigh**2-along**2);
    j['knee'+s]=vec(bend,a.y+dy*along/d,a.z+dz*along/d);
    j['shoulder'+s]=vec(0,j.chest.y+BODY.shoulderRise,sign*BODY.shoulderWidth/2);
    j['elbow'+s]=vec(-.10,j['shoulder'+s].y-.23,sign*(.2+Math.sqrt(BODY.upperArm**2-.10**2-.23**2)));
    j['hand'+s]=vec(.06,j['elbow'+s].y-Math.sqrt(BODY.forearm**2-.16**2-.07**2),j['elbow'+s].z+sign*.07);
  }
  return {joints:j,chestFwd:vec(1,0,0),chestUp:vec(0,1,0),headFwd:vec(1,0,0),
    board:{pos:vec(),right:vec(1,0,0),up:vec(0,1,0),fwd:vec(0,0,-1)}};
}
function frame(f,o,xx,xy,xz,yx,yy,yz) {
  let n=Math.hypot(yx,yy,yz); if(n<1e-10){yx=f[o+3];yy=f[o+4];yz=f[o+5];n=Math.hypot(yx,yy,yz)||1;}
  yx/=n;yy/=n;yz/=n;
  let d=xx*yx+xy*yy+xz*yz; xx-=d*yx;xy-=d*yy;xz-=d*yz;
  n=Math.hypot(xx,xy,xz);
  if(n<1e-7){xx=f[o];xy=f[o+1];xz=f[o+2];d=xx*yx+xy*yy+xz*yz;xx-=d*yx;xy-=d*yy;xz-=d*yz;n=Math.hypot(xx,xy,xz);}
  if(n<1e-7){xx=Math.abs(yx)<.8?1:0;xy=xx?0:1;xz=0;d=xx*yx+xy*yy;xx-=d*yx;xy-=d*yy;xz-=d*yz;n=Math.hypot(xx,xy,xz);}
  xx/=n;xy/=n;xz/=n;
  f[o]=xx;f[o+1]=xy;f[o+2]=xz;f[o+3]=yx;f[o+4]=yy;f[o+5]=yz;
  f[o+6]=xy*yz-xz*yy;f[o+7]=xz*yx-xx*yz;f[o+8]=xx*yy-xy*yx;
}
function compute(p,stance,s) {
  const f=s.frames,j=p.joints,b=p.board,u=p.chestUp,c=p.chestFwd;
  // Frames use body right = forward cross up; no fixed world-up singularity.
  const rx=c.y*u.z-c.z*u.y,ry=c.z*u.x-c.x*u.z,rz=c.x*u.y-c.y*u.x;
  for(let i=0;i<19;i++) {
    const a=j[ROOTS[i]], e=ENDS[i]&&j[ENDS[i]],o=i*9,t=i*3;
    s.origins[t]=a.x;s.origins[t+1]=a.y;s.origins[t+2]=a.z;
    let dx=e?e.x-a.x:u.x,dy=e?e.y-a.y:u.y,dz=e?e.z-a.z:u.z;
    if(i===1){s.origins[t]+=(j.chest.x-a.x)*.5;s.origins[t+1]+=(j.chest.y-a.y)*.5;s.origins[t+2]+=(j.chest.z-a.z)*.5;dx*=.5;dy*=.5;dz*=.5;}
    s.lengths[i]=e?Math.hypot(dx,dy,dz):1;
    if(i===4&&p.gear==='ski'){const v=p.headFwd,w=p.chestUp,q=v.x*w.x+v.y*w.y+v.z*w.z;frame(f,o,v.y*w.z-v.z*w.y,v.z*w.x-v.x*w.z,v.x*w.y-v.y*w.x,w.x-v.x*q,w.y-v.y*q,w.z-v.z*q);}
    else if(i===4){const v=p.headFwd;frame(f,o,v.y*u.z-v.z*u.y,v.z*u.x-v.x*u.z,v.x*u.y-v.y*u.x,u.x,u.y,u.z);}
    else if(i===13||i===16){
      if(p.gear==='ski'){frame(f,o,b.right.x,b.right.y,b.right.z,b.up.x,b.up.y,b.up.z);continue;}
      const front=stance===1?i===13:i===16,angle=(front?BODY.frontBinding:BODY.rearBinding)*stance;
      const co=Math.cos(angle),si=Math.sin(angle),tx=b.right.x*stance,ty=b.right.y*stance,tz=b.right.z*stance;
      const vx=tx*co+(b.up.y*tz-b.up.z*ty)*si,vy=ty*co+(b.up.z*tx-b.up.x*tz)*si,vz=tz*co+(b.up.x*ty-b.up.y*tx)*si;
      frame(f,o,vy*b.up.z-vz*b.up.y,vz*b.up.x-vx*b.up.z,vx*b.up.y-vy*b.up.x,b.up.x,b.up.y,b.up.z);
    } else frame(f,o,rx,ry,rz,dx,dy,dz);
  }
  for(let i=13;i<=16;i+=3) for(let k=0;k<9;k++) s.feet[(i===13?0:9)+k]=f[i*9+k];
  for(let k=0;k<4;k++) {
    const chain=CHAINS[k],a=j[ROOTS[chain[0]]],m=j[ROOTS[chain[1]]],e=j[ROOTS[chain[2]]];
    const ax=m.x-a.x,ay=m.y-a.y,az=m.z-a.z,bx=e.x-m.x,by=e.y-m.y,bz=e.z-m.z;
    let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,n=Math.hypot(nx,ny,nz),o=k*3;
    // Parallel transport last bend plane along the proximal bone before reuse.
    const length=Math.hypot(ax,ay,az)||1,ux=ax/length,uy=ay/length,uz=az/length;
    const ox=s.directions[o],oy=s.directions[o+1],oz=s.directions[o+2];
    if(ox*ox+oy*oy+oz*oz>.5){
      const vx=oy*uz-oz*uy,vy=oz*ux-ox*uz,vz=ox*uy-oy*ux,d=ox*ux+oy*uy+oz*uz;
      const px=s.planes[o],py=s.planes[o+1],pz=s.planes[o+2];
      const cx=vy*pz-vz*py,cy=vz*px-vx*pz,cz=vx*py-vy*px;
      if(d>-.999999){s.planes[o]=px+cx+(vy*cz-vz*cy)/(1+d);s.planes[o+1]=py+cy+(vz*cx-vx*cz)/(1+d);s.planes[o+2]=pz+cz+(vx*cy-vy*cx)/(1+d);}
    }
    s.directions[o]=ux;s.directions[o+1]=uy;s.directions[o+2]=uz;
    if(n>1e-4){nx/=n;ny/=n;nz/=n;if(p.gear==='ski' ? nx*rx+ny*ry+nz*rz<0 : nx*s.planes[o]+ny*s.planes[o+1]+nz*s.planes[o+2]<0){nx=-nx;ny=-ny;nz=-nz;}}
    else {nx=s.planes[o];ny=s.planes[o+1];nz=s.planes[o+2];}
    s.planes[o]=nx;s.planes[o+1]=ny;s.planes[o+2]=nz;
    frame(f,chain[0]*9,nx,ny,nz,ax,ay,az);frame(f,chain[1]*9,nx,ny,nz,bx,by,bz);
    if(k<2) frame(f,chain[2]*9,nx,ny,nz,bx,by,bz);
  }
  // Limb hand frames follow forearm; legs must not replace binding frames.
  for(let i=13;i<=16;i+=3) for(let k=0;k<9;k++) f[i*9+k]=s.feet[(i===13?0:9)+k];
  if(p.gear==='ski'&&p.grabHand&&p.grabWristAngle){
    const i=p.grabHand==='L'?7:10,o=i*9,dy=-b.up.x*f[o+3]-b.up.y*f[o+4]-b.up.z*f[o+5];
    let x=-b.up.x-f[o+3]*dy,y=-b.up.y-f[o+4]*dy,z=-b.up.z-f[o+5]*dy;
    const n=Math.hypot(x,y,z)||1,az=(p.grabWristAzimuth||0)*Math.PI/180;
    x/=n;y/=n;z/=n;
    const qx=f[o+4]*z-f[o+5]*y,qy=f[o+5]*x-f[o+3]*z,qz=f[o+3]*y-f[o+4]*x;
    x=x*Math.cos(az)+qx*Math.sin(az);y=y*Math.cos(az)+qy*Math.sin(az);z=z*Math.cos(az)+qz*Math.sin(az);
    const c=Math.cos(p.grabWristAngle*Math.PI/180),a=Math.sin(p.grabWristAngle*Math.PI/180);
    frame(f,o,f[o],f[o+1],f[o+2],f[o+3]*c+x*a,f[o+4]*c+y*a,f[o+5]*c+z*a);
  }
  for(const [i,side] of POLE_BONES){
    // 棒の支点は、握りのまん中（こぶしの中）。スノーボードでは使わない
    const d=p.gear==='ski'?p.poleDirs[side]:null,h=d&&p.poleGrip?p.poleGrip[side]:j['hand'+side];
    frame(f,i*9,b.right.x,b.right.y,b.right.z,d?-d.x:0,d?-d.y:1,d?-d.z:0);
    s.origins[i*3]=h.x;s.origins[i*3+1]=h.y;s.origins[i*3+2]=h.z;s.lengths[i]=1;
  }
  frame(f,19*9,b.right.x,b.right.y,b.right.z,b.up.x,b.up.y,b.up.z);
  s.origins[57]=b.pos.x;s.origins[58]=b.pos.y;s.origins[59]=b.pos.z;s.lengths[19]=1;
}
export function createSkeletonState(bindPose=createBindPose()) {
  const s={frames:new Float64Array(198),origins:new Float64Array(66),lengths:new Float64Array(22),
    planes:new Float64Array(12),directions:new Float64Array(12),feet:new Float64Array(18),matrices:new Float32Array(352)};
  for(let i=0;i<22;i++){s.frames[i*9]=1;s.frames[i*9+4]=1;s.frames[i*9+8]=1;}
  for(let i=0;i<4;i++)s.planes[i*3+2]=1;
  compute(bindPose,1,s);
  s.bindFrames=s.frames.slice();s.bindOrigins=s.origins.slice();s.bindLengths=s.lengths.slice();
  return s;
}
export function solveSkeleton(pose,stance,state,out=state.matrices) {
  compute(pose,stance===-1?-1:1,state);
  const f=state.frames,r=state.bindFrames,p=state.origins,b=state.bindOrigins;
  for(let i=0;i<22;i++) {
    const o=i*9,t=i*3,m=i*16,scale=Math.max(.85,Math.min(1.15,state.lengths[i]/state.bindLengths[i]));
    for(let col=0;col<3;col++)for(let row=0;row<3;row++)
      out[m+col*4+row]=f[o+row]*r[o+col]+f[o+3+row]*scale*r[o+3+col]+f[o+6+row]*r[o+6+col];
    out[m+3]=out[m+7]=out[m+11]=0;out[m+15]=1;
    for(let row=0;row<3;row++)out[m+12+row]=p[t+row]-out[m+row]*b[t]-out[m+4+row]*b[t+1]-out[m+8+row]*b[t+2];
  }
  return out;
}
export function getBindBones(state=createSkeletonState()) {
  return BONE_NAMES.map((name,i)=>({name,parent:-1,position:Array.from(state.bindOrigins.subarray(i*3,i*3+3)),
    basis:Array.from(state.bindFrames.subarray(i*9,i*9+9)),length:state.bindLengths[i]}));
}
