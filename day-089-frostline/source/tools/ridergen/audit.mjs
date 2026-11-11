import {skinHeadTurn} from './preview.mjs';
// Horizontal cross-sections of the posed mesh, viewed from every azimuth.
// The outermost surface on a ray determines whether neck fabric is visible.
export function visibleNeck(model,pose,pitch=0){
 const mesh=skinHeadTurn(model,pose,pitch),neck=pose.joints.neck,head=pose.joints.head;
 const triangles=mesh.tri.filter(t=>[0,3,5,6,7,8,15].includes(mesh.a[t[0]].part));
 const runs=new Float64Array(36);let longest=0;
 for(let y=neck.y;y<=head.y+.02;y+=.001){
  const sections=[];
  for(const t of triangles){
   const points=t.map(i=>mesh.p[i]);if(points.every(p=>p[1]>y)||points.every(p=>p[1]<y))continue;
   const hits=[];
   for(let k=0;k<3;k++){
    const a=points[k],b=points[(k+1)%3];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y)){
     const f=(y-a[1])/(b[1]-a[1]);hits.push([a[0]+f*(b[0]-a[0])-neck.x,a[2]+f*(b[2]-a[2])-neck.z]);
    }
   }
   if(hits.length===2)sections.push([hits[0],hits[1],mesh.a[t[0]].part]);
  }
  for(let i=0;i<36;i++){
   const dx=Math.cos(i*Math.PI/18),dz=Math.sin(i*Math.PI/18);let outer=-Infinity,part=-1;
   for(const [a,b,p]of sections){
    const vx=b[0]-a[0],vz=b[1]-a[1],den=dx*vz-dz*vx;if(Math.abs(den)<1e-12)continue;
    const r=(a[0]*vz-a[1]*vx)/den,t=(a[0]*dz-a[1]*dx)/den;
    if(t>=0&&t<=1&&r>=0&&r>outer){outer=r;part=p;}
   }
   runs[i]=part===3?runs[i]+.001:0;longest=Math.max(longest,runs[i]);
  }
 }
 return longest;
}
export function headTurns(model){
 return [-60,0,60].flatMap(yaw=>[-20,20].map(pitch=>{
  const pose=structuredClone(model.pose),y=yaw*Math.PI/180,p=pitch*Math.PI/180;
  pose.headFwd={x:Math.cos(y)*Math.cos(p),y:Math.sin(p),z:Math.sin(y)*Math.cos(p)};
  return {yaw,pitch,pose};
 }));
}
