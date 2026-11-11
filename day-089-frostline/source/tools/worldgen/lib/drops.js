import {heightAt,sampleSurface,clamp} from '../../../src/world/surface-math.js';
import {snowAt} from '../../../src/world/masks.js';
import {FEATURE_PARAMS,zoneId} from './features.js';
export const DROP_PARAMS=Object.freeze({searchRadius:360,searchStep:24,pathStep:6,pathLength:150,maxSlope:42,maxRock:.25,minSnow:.3,minDescent:2,pathHalfWidth:10,edgeMargin:5,allowableRise:2,practiceMaxSide:90,practiceNear:-150,practiceFar:-110});
export const DROP_CANDIDATES=Object.freeze([
  {id:'first-snow',name:'初雪の練習斜面',x:1700,z:1660,level:1,heading:Math.PI},
  {id:'eastern-field',name:'東の大雪原',x:1350,z:-800,level:2},
  {id:'crater-shelf',name:'火口の棚',x:310,z:-400,level:2},
  {id:'west-gully',name:'西沢の入口',x:-1050,z:-250,level:3},
  {id:'southern-ridge',name:'南尾根',x:500,z:1250,level:2},
  {id:'rime-plateau',name:'樹氷の原',x:2020,z:-700,level:1},
  {id:'lower-forest',name:'ブナ林の上',x:-700,z:1800,level:2},
]);
export function checkDrop(c,b,drop,out={}) {
  const p=DROP_PARAMS,surface={},snow={},sx=Math.sin(drop.heading),sz=-Math.cos(drop.heading),start=heightAt(c,b,drop.x,drop.z);
  let maxSlope=0,maxRock=0,minSnow=Infinity,minDescent=Infinity;
  for(let t=0;t<=p.pathLength;t+=p.pathStep)for(const side of [-p.pathHalfWidth,0,p.pathHalfWidth]){
    const x=drop.x+sx*t+sz*side,z=drop.z+sz*t-sx*side;
    if(Math.abs(x)>c.size/2-p.edgeMargin||Math.abs(z)>c.size/2-p.edgeMargin){out.safe=false;return out;}
    sampleSurface(c,b,x,z,surface);snowAt(c,b,x,z,snow);
    const angle=Math.acos(clamp(surface.ny,-1,1))*180/Math.PI;
    maxSlope=Math.max(maxSlope,angle);maxRock=Math.max(maxRock,snow.rock);minSnow=Math.min(minSnow,snow.depth);
    // Avoid a ledge or an uphill wall partway down the entry corridor.
    if(t>0&&surface.h>start+p.allowableRise){out.safe=false;return out;}
    if(t===p.pathLength)minDescent=Math.min(minDescent,start-surface.h);
  }
  sampleSurface(c,b,drop.x,drop.z,surface);
  const downhillLength=Math.hypot(surface.nx,surface.nz),downhillDot=downhillLength>1e-8?(sx*surface.nx+sz*surface.nz)/downhillLength:-1;
  const downhillAngle=Math.acos(clamp(downhillDot,-1,1))*180/Math.PI;
  Object.assign(out,{downhillAngle,maxSlope,maxRock,minSnow,descent:minDescent,safe:downhillAngle<=60&&maxSlope<=p.maxSlope&&maxRock<=p.maxRock&&minSnow>=p.minSnow&&minDescent>=p.minDescent});
  return out;
}
export function makeDrops(c,b,candidates=DROP_CANDIDATES) {
  const drops=[],surface={},check={};
  for(const candidate of candidates){
    let found=null;
    for(let ring=0;ring<=DROP_PARAMS.searchRadius&&!found;ring+=DROP_PARAMS.searchStep){
      const steps=ring===0?1:Math.ceil(2*Math.PI*ring/DROP_PARAMS.searchStep);
      for(let k=0;k<steps;k++){
        const x=candidate.x+ring*Math.cos(k*2*Math.PI/steps),z=candidate.z+ring*Math.sin(k*2*Math.PI/steps);
        if(candidate.id==='first-snow'&&(Math.abs(x-FEATURE_PARAMS.practiceX)>DROP_PARAMS.practiceMaxSide||z<FEATURE_PARAMS.practiceZ+DROP_PARAMS.practiceNear||z>FEATURE_PARAMS.practiceZ+DROP_PARAMS.practiceFar))continue;
        sampleSurface(c,b,x,z,surface);
        const heading=candidate.heading??Math.atan2(surface.nx,-surface.nz),drop={...candidate,x,z,y:surface.h,heading,zone:zoneId(x,z,surface.h)};
        if(checkDrop(c,b,drop,check).safe){found=drop;break;}
      }
    }
    if(!found)throw new Error(`出発地点 ${candidate.name} の安全な雪面がありません。npm run worldgen で再生成してください。`);
    drops.push(found);
  }
  return drops;
}
