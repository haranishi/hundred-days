import {spline} from '../../../src/world/surface-math.js';
import {glacierPoint,glacierHeight,GLACIER_LENGTH,profile,WEST,VALLEY,trailAxis,streamX} from './valley-layout.js';
import {lakeValue} from '../../../src/world/masks.js';
export function valleyDetails(w){
 const c=w.meta,raw=(x,z)=>spline(w.buffers.height,c.grid,(x+w.half)/c.cell-.5,(z+w.half)/c.cell-.5);
 const runnels=[];
 // Follow actual local minima through the wall; every sample must remain snow.
 for(const [origin,tilt] of [[-500,.25],[200,.15]]){let depth=Infinity,maxRock=0,travel=0;const path=[];
  for(let d=10;d<=600;d+=10){let z=origin-tilt*d,x=profile(WEST,z,1)+d;for(let i=0;i<3;i++){const dd=x-profile(WEST,z,1);z=origin-tilt*dd;}
   const h=raw(x,z),bank=(raw(x,z-35)+raw(x,z+35))/2;depth=Math.min(depth,bank-h);maxRock=Math.max(maxRock,w.snowAt(x,z,{}).rock);path.push({x,z,h});travel+=10;
  }runnels.push({origin,depth,maxRock,travel,path,pass:maxRock<.3&&travel>=450&&depth>3});
 }
 const glacierWidths=[];let crevasse=0;
 for(let s=150;s<GLACIER_LENGTH-100;s+=150){let width=0;for(let t=-300;t<=300;t+=2){const p=glacierPoint(s,t);if(w.snowAt(p.x,p.z,{}).ice>.06)width+=2;}glacierWidths.push({s,width});}
 for(let s=100;s<GLACIER_LENGTH-100;s+=3){const p=glacierPoint(s);crevasse=Math.max(crevasse,glacierHeight(s)-raw(p.x,p.z));}
 const inlet=[1030,1140,1220,1255].map(z=>{const x=streamX(z),banks=(raw(x-9,z)+raw(x+9,z))/2,depth=banks-raw(x,z);let width=0;for(let t=-8;t<=8;t+=.25)if(banks-raw(x+t,z)>=1)width+=.25;return {x,z,depth,width,pass:depth>=1.8&&depth<=2.2&&width>=6&&width<=8};});
 const edge={north:[],west:[],east:[],south:[]};for(let v=-2000;v<=2000;v+=200){edge.north.push(raw(v,-2036));edge.west.push(raw(-2036,v));edge.east.push(raw(2036,v));edge.south.push(raw(v,2036));}
 const edges=Object.fromEntries(Object.entries(edge).map(([k,v])=>[k,{min:Math.min(...v),max:Math.max(...v)}]));
 const lakeBounds={x0:Infinity,z0:Infinity,x1:-Infinity,z1:-Infinity},l=c.lake,step=l.size/l.grid;
 for(let j=0;j<l.grid;j++)for(let i=0;i<l.grid;i++)if(w.buffers.lake[j*l.grid+i]){const x=l.x0+(i+.5)*step,z=l.z0+(j+.5)*step;lakeBounds.x0=Math.min(lakeBounds.x0,x);lakeBounds.x1=Math.max(lakeBounds.x1,x);lakeBounds.z0=Math.min(lakeBounds.z0,z);lakeBounds.z1=Math.max(lakeBounds.z1,z);}
 let lakeObstacles=0,monsters=0,treeCount=0,rockCount=0,treeMin=Infinity,treeMax=0;
 for(let z=-1950;z<2000;z+=120)for(let x=-1950;x<2000;x+=120)for(const o of w.obstaclesNear(x,z,30,[])){if(o.type==='tree'){treeCount++;treeMin=Math.min(treeMin,o.height);treeMax=Math.max(treeMax,o.height);if(lakeValue(c,w.buffers,o.x,o.z))lakeObstacles++;}if(o.type==='monster')monsters++;if(o.type==='rock')rockCount++;}
 const trailLines=[];for(let i=0;i<4;i++){let maxDensity=0,minAngle=90,maxAngle=0,closest=Infinity;for(let z=-600;z<=930;z+=10){const x=trailAxis(i,z),a=Math.acos(w.sampleSurface(x,z,{}).ny)*180/Math.PI;maxDensity=Math.max(maxDensity,w.treeDensityAt(x,z));minAngle=Math.min(minAngle,a);maxAngle=Math.max(maxAngle,a);closest=Math.min(closest,Math.hypot(x-420,z-930));}trailLines.push({line:i+1,maxDensity,minAngle,maxAngle,closestBase:closest});}
 const reserve=[];for(let along=0;along<=400;along+=20)for(const across of [-30,0,30]){const r=c.reserved[0],s=Math.sin(r.heading),zdir=-Math.cos(r.heading),x=r.x+s*along+zdir*across,z=r.z+zdir*along-s*across;reserve.push({angle:Math.acos(w.sampleSurface(x,z,{}).ny)*180/Math.PI,density:w.treeDensityAt(x,z)});}
 const reserved={min:Math.min(...reserve.map(p=>p.angle)),max:Math.max(...reserve.map(p=>p.angle)),density:Math.max(...reserve.map(p=>p.density))};
 const sun={azimuth:Math.atan2(c.sun.x,-c.sun.z)*180/Math.PI,elevation:Math.asin(c.sun.y)*180/Math.PI};
 const bowl=[];for(let z=-1530;z<=-670;z+=50)for(let x=-200;x<=430;x+=50)bowl.push(w.heightAt(x,z));
 return {runnels,glacierWidths,maxCrevasseBelowProfile:crevasse,inlet,edges,lakeBounds,treeCount,rockCount,treeMin,treeMax,monsters,lakeObstacles,trailLines,reserved,sun,bowl:{min:Math.min(...bowl),max:Math.max(...bowl)},notes:{bowl:'依頼Aの上盆範囲には谷入口1800mが重なるため、下限1950mを未達のまま測定。',runnels:'壁を横断する局所最低雪面を10m刻みで追跡。数点だけ雪でも連続合格にしない。'}};
}
