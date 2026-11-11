import {describe,it,expect} from 'vitest';
import {createBindPose,createSkeletonState,solveSkeleton,getBindBones,BONE_NAMES} from '../../src/render/ride/skeleton-math.js';
const transform=(m,i,p)=>[0,1,2].map(k=>m[i*16+k]*p[0]+m[i*16+4+k]*p[1]+m[i*16+8+k]*p[2]+m[i*16+12+k]);
function rotatePose(p,angle){const q=structuredClone(p),c=Math.cos(angle),s=Math.sin(angle);
 for(const v of [...Object.values(q.joints),q.chestFwd,q.chestUp,q.headFwd,...Object.values(q.board)]){const y=v.y,z=v.z;v.y=y*c-z*s;v.z=y*s+z*c;}return q;}
describe('flat worldFromBind skeleton',()=>{
 it('has 22 bones and gives identity at bind pose',()=>{const s=createSkeletonState(),m=solveSkeleton(createBindPose(),1,s);expect(BONE_NAMES).toHaveLength(22);
 for(let i=0;i<352;i++)expect(m[i]).toBeCloseTo(i%16%5===0?1:0,6);});
 it('maps every bind root to the matching posed root, with scale clamped',()=>{const p=createBindPose(),s=createSkeletonState(),bones=getBindBones(s);
 for(const v of Object.values(p.joints)){v.x+=4;v.y=v.y*1.3+2;v.z-=3;}p.board.pos={x:4,y:2,z:-3};
 const m=solveSkeleton(p,1,s);bones.forEach((b,i)=>{const mapped=transform(m,i,b.position);for(let k=0;k<3;k++)expect(mapped[k]).toBeCloseTo(s.origins[i*3+k],5);
  const cols=[0,1,2].map(c=>[0,1,2].map(k=>m[i*16+c*4+k]));const determinant=cols[0][0]*(cols[1][1]*cols[2][2]-cols[1][2]*cols[2][1])-cols[1][0]*(cols[0][1]*cols[2][2]-cols[0][2]*cols[2][1])+cols[2][0]*(cols[0][1]*cols[1][2]-cols[0][2]*cols[1][1]);
  expect(determinant).toBeGreaterThanOrEqual(.84999);expect(determinant).toBeLessThanOrEqual(1.15001);
 });});
 it('is orthogonal at rigid rotations and continuous across full inverted flips',()=>{const s=createSkeletonState(),p=createBindPose();let last;
 for(let step=0;step<=360;step++){const m=solveSkeleton(rotatePose(p,step*Math.PI/180),1,s);expect([...m].every(Number.isFinite)).toBe(true);
  for(let i=0;i<22;i++)for(let a=0;a<3;a++)for(let b=0;b<3;b++){let d=0;for(let k=0;k<3;k++)d+=m[i*16+a*4+k]*m[i*16+b*4+k];expect(d).toBeCloseTo(a===b?1:0,5);}
  if(last)expect(Math.max(...m.map((v,i)=>Math.abs(v-last[i])))).toBeLessThan(.05);last=m.slice();
 }});
 it('carries the bend plane through straight elbows and knees',()=>{const p=createBindPose(),s=createSkeletonState();solveSkeleton(p,1,s);const before=s.planes.slice();
 for(const suffix of ['L','R'])for(const [a,b,c]of [['shoulder','elbow','hand'],['hip','knee','ankle']]){const root=p.joints[a+suffix],end=p.joints[c+suffix],mid=p.joints[b+suffix];for(const k of ['x','y','z'])mid[k]=(root[k]+end[k])/2;}
 solveSkeleton(p,1,s);for(let i=0;i<12;i++)expect(s.planes[i]).toBeCloseTo(before[i],10);expect([...s.matrices].every(Number.isFinite)).toBe(true);
 });
 it('sets feet by board angles for both stances, without accumulating drift',()=>{const p=createBindPose();for(const stance of [1,-1]){const s=createSkeletonState(),m=solveSkeleton(p,stance,s),bones=getBindBones(s);
  for(const i of [13,16]){const f=bones[i].basis,toe=[-f[6],-f[7],-f[8]],a=transform(m,i,toe.map((v,k)=>v+bones[i].position[k])),root=transform(m,i,bones[i].position);
   const angle=((stance===1?i===13:i===16)?Math.PI/12:-Math.PI/20)*stance;
   expect(a[0]-root[0]).toBeCloseTo(stance*Math.cos(angle),5);expect(a[2]-root[2]).toBeCloseTo(-stance*Math.sin(angle),5);
  }
  const before=m.slice();for(let n=0;n<100;n++)expect(solveSkeleton(p,stance,s)).toBe(m);expect(m).toEqual(before);
 }});
 it('reuses all buffers and averages below 0.3ms per solve',()=>{const s=createSkeletonState(),p=createBindPose(),refs=Object.values(s).filter(ArrayBuffer.isView);
 const start=performance.now();for(let i=0;i<10000;i++)solveSkeleton(p,1,s);expect((performance.now()-start)/10000).toBeLessThan(.3);
 expect(Object.values(s).filter(ArrayBuffer.isView)).toEqual(refs);
 });
});
it('parallel-transports straight limb planes around their former singular axis',()=>{
 const p=createBindPose(),s=createSkeletonState();
 for(const suffix of ['L','R'])for(const [a,b,c]of [['shoulder','elbow','hand'],['hip','knee','ankle']])for(const k of ['x','y','z'])p.joints[b+suffix][k]=(p.joints[a+suffix][k]+p.joints[c+suffix][k])/2;
 solveSkeleton(p,1,s);
 const y=Array.from(s.frames.subarray(48,51)),n=Array.from(s.planes.subarray(0,3));
 let axis=[y[1]*n[2]-y[2]*n[1],y[2]*n[0]-y[0]*n[2],y[0]*n[1]-y[1]*n[0]],length=Math.hypot(...axis);axis=axis.map(v=>v/length);
 let last=s.matrices.slice();
 for(let step=1;step<=360;step++){
  const q=structuredClone(p),angle=step*Math.PI/180,c=Math.cos(angle),sn=Math.sin(angle);
  for(const v of [...Object.values(q.joints),q.chestFwd,q.chestUp,q.headFwd,...Object.values(q.board)]){
   const dot=axis[0]*v.x+axis[1]*v.y+axis[2]*v.z,x=v.x,yy=v.y,z=v.z;
   v.x=x*c+(axis[1]*z-axis[2]*yy)*sn+axis[0]*dot*(1-c);
   v.y=yy*c+(axis[2]*x-axis[0]*z)*sn+axis[1]*dot*(1-c);
   v.z=z*c+(axis[0]*yy-axis[1]*x)*sn+axis[2]*dot*(1-c);
  }
  const m=solveSkeleton(q,1,s);expect([...m].every(Number.isFinite)).toBe(true);
  expect(Math.max(...m.map((v,i)=>Math.abs(v-last[i])))).toBeLessThan(.05);last=m.slice();
 }
});
