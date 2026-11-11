import {spline} from '../../../src/world/surface-math.js';
import {lakeRadius,glacierCoord,glacierWeight} from './valley-layout.js';
export const parkLocal=(p,x,z)=>({s:(x-p.x)*Math.sin(p.heading)-(z-p.z)*Math.cos(p.heading),t:(x-p.x)*Math.cos(p.heading)+(z-p.z)*Math.sin(p.heading)});
export const parkPoint=(p,s,t=0)=>({x:p.x+Math.sin(p.heading)*s+Math.cos(p.heading)*t,z:p.z-Math.cos(p.heading)*s+Math.sin(p.heading)*t});
export const parkBlend=(p,s,t)=>(p.blend??75)+15*Math.sin(s/83+.7)*Math.cos(t/127);
export function parkWeight(p,x,z){const q=parkLocal(p,x,z),d=Math.hypot(Math.max(0,-q.s,q.s-p.length),Math.max(0,Math.abs(q.t)-75)),u=Math.max(0,Math.min(1,d/parkBlend(p,q.s,q.t)));return 1-u*u*u*(10+u*(-15+6*u));}
export function searchPark(height,c,structures,features,stations,{length=620,protect=true,bounds=[500,1500,-500,700],blend=75,exclude=[]}={}){
 const read=(x,z)=>spline(height,c.grid,(x+c.size/2)/c.cell-.5,(z+c.size/2)/c.cell-.5),candidates=[];let searched=0,bounded=0,sloped=0;
 const obstacles=[structures.lodge,...structures.chalets,structures.lift.base,structures.lift.top,structures.bridge,...structures.lift.towers].map(b=>({...b,r:Math.hypot(b.width??4,b.length??4)/2+12}));
 const [xmin,xmax,zmin,zmax]=bounds;
 for(let z=zmin;z<=zmax;z+=60)for(let x=xmin;x<=xmax;x+=60)for(let degrees=0;degrees<360;degrees+=10){
  searched++;const p={x,z,heading:degrees*Math.PI/180,length,width:150,slopeDeg:18,blend};
  const end=parkPoint(p,length);if(end.x<xmin||end.x>xmax||end.z<zmin||end.z>zmax)continue;bounded++;
  const raw=[];let sh=0,ss=0,ssh=0,sss=0;
  for(let s=0;s<=length;s+=20){const q=parkPoint(p,s),h=read(q.x,q.z);raw.push({s,h});sh+=h;ss+=s;ssh+=s*h;sss+=s*s;}
  const pitch=-(ssh-ss*sh/raw.length)/(sss-ss*ss/raw.length),angle=Math.atan(pitch)*180/Math.PI;
  if(angle<17||angle>21)continue;sloped++;
  // Protect the entire changing footprint, including its maximum 90m blend and spline support.
  const hit=obstacles.some(b=>{const q=parkLocal(p,b.x,b.z);return Math.hypot(Math.max(0,-q.s,q.s-length),Math.max(0,Math.abs(q.t)-75))<parkBlend(p,q.s,q.t)+b.r+4;})||stations.some(b=>{const q=parkLocal(p,b.x,b.z);return Math.hypot(Math.max(0,-q.s,q.s-length),Math.max(0,Math.abs(q.t)-75))<parkBlend(p,q.s,q.t)+b.radius+4;});
  let conflict=hit,intersections=[];
  for(const f of features){let overlap=false;for(let s=-40;s<=f.length+25;s+=10)for(const t of [-f.width/2-20,0,f.width/2+20]){const q=parkPoint(f,s,t),a=parkLocal(p,q.x,q.z);if(parkWeight(p,q.x,q.z)>0)overlap=true;}if(overlap)intersections.push(f.id);}
  conflict ||= intersections.length>0;
  for(const other of exclude){if(Math.hypot(parkPoint(p,45).x-parkPoint(other,other.lip??45).x,parkPoint(p,45).z-parkPoint(other,other.lip??45).z)<300)conflict=true;
   for(let a=-120;a<=length+120;a+=20)for(let t=-195;t<=195;t+=20){const q=parkPoint(p,a,t);if(parkWeight(p,q.x,q.z)>0&&parkWeight(other,q.x,q.z)>0)conflict=true;}}

  let sum=0,n=0,values=[];
  for(let s=0;s<=length;s+=20)for(let t=-75;t<=75;t+=15){const q=parkPoint(p,s,t);if(lakeRadius(q.x,q.z)<1.1||glacierWeight(glacierCoord(q.x,q.z))>.01)conflict=true;const v=read(q.x,q.z)+Math.tan(Math.PI/10)*s;sum+=v;n++;values.push(v);}
  if(protect&&conflict)continue;
  const y=sum/n,maxCutFill=Math.max(...values.map(v=>Math.abs(v-y)));candidates.push({...p,y,angle,maxCutFill,conflict,intersections});
 }
 // Rank feasible sites on the actual cell centres. Mean intercept balances cut/fill volume before stamps.
 for(const p of candidates){const corners=[parkPoint(p,0,-75),parkPoint(p,0,75),parkPoint(p,length,-75),parkPoint(p,length,75)],values=[];
  const i0=Math.max(0,Math.floor((Math.min(...corners.map(q=>q.x))+c.size/2)/c.cell)),i1=Math.min(c.grid-1,Math.ceil((Math.max(...corners.map(q=>q.x))+c.size/2)/c.cell)),j0=Math.max(0,Math.floor((Math.min(...corners.map(q=>q.z))+c.size/2)/c.cell)),j1=Math.min(c.grid-1,Math.ceil((Math.max(...corners.map(q=>q.z))+c.size/2)/c.cell));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const q=parkLocal(p,(i+.5)*c.cell-c.size/2,(j+.5)*c.cell-c.size/2);if(q.s>=0&&q.s<=length&&Math.abs(q.t)<=75)values.push(height[j*c.grid+i]+Math.tan(Math.PI/10)*q.s);}
  p.y=values.reduce((sum,v)=>sum+v,0)/values.length;p.maxCutFill=Math.max(...values.map(v=>Math.abs(v-p.y)));p.coreCells=values.length;
 }
 candidates.sort((a,b)=>a.maxCutFill-b.maxCutFill);return {searched,bounded,sloped,accepted:candidates.length,best:candidates[0]??null,candidates};
}
