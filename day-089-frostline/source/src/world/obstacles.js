import {lakeValue} from './masks.js';
import {structureObstacles,structureClearance} from './structures.js';
import {hashString,hashInt,randomStream} from './seed.js';
import {inFeatureClearance} from './feature-clearance.js';
import {inDropCorridor} from './drop-clearance.js';
import {clamp} from './surface-math.js';
export const OBSTACLE_PARAMS=Object.freeze({cellSize:48,candidateStep:6,jitter:1.15,cacheSize:256,treeMin:600,treeMax:1630,monsterMin:1350,maxSlope:35,treeProbability:.8,monsterProbability:.34,monsterRadiusMin:.8,monsterRadiusRange:.6,monsterHeightScale:.72,rockProbability:.28,maxRadius:2.5,treeRadiusMin:.25,treeRadiusRange:.2,treeHeightMin:4,treeHeightRange:5,rockRadiusMin:.6,rockRadiusRange:1.9,rockHeightMin:.5,rockHeightRange:2.5,practiceMargin:12,troughSnowDepth:3.3,troughCurvature:.003,minSnowDepth:.15,rockExposureMin:.3,rockExposureMax:.8});
export function createObstacleStore(world) {
  const p=OBSTACLE_PARAMS,cache=new Map(),keys=new Int32Array(p.cacheSize).fill(-1),surface={},snow={},seed=hashString(`${world.meta.seed}:obstacles`),cells=Math.ceil(world.size/p.cellSize),slots=p.cellSize/p.candidateStep;
  const fixed=structureObstacles(world.meta,(x,z)=>world.heightAt(x,z));
  for(const [i,t]of (world.meta.structures?.forestTrail?.trees??[]).entries())if(!structureClearance(world.meta,t.x,t.z,1)&&!inFeatureClearance(world.meta,t.x,t.z,1)&&!(world.meta.stations??[]).some(s=>Math.hypot(s.x-t.x,s.z-t.z)<s.radius+2))fixed.push({...t,id:'forest-tree:'+i,type:'tree',radius:.32,y:world.heightAt(t.x,t.z)});
  for(const garden of world.meta.rockGardens??[])fixed.push(...garden.rocks);
  const valley=world.meta.layout==='valley-1';
  // 谷と湖のマップでは、置く位置を大きくゆらす（ゆらぎが 1 m ほどだと、木や岩が、6 m おきの列に並んで見えた：見た目の採点 2 周目）
  const jitter=valley?2.7:p.jitter;
  let cursor=0;
  function build(i,j) {
    const key=j*cells+i,found=cache.get(key);if(found)return found;
    const items=[],treeRandom=randomStream(hashInt(seed^Math.imul(i,73856093)^Math.imul(j,19349663))),rockRandom=randomStream(hashInt(seed^0xa681de39^Math.imul(i,73856093)^Math.imul(j,19349663)));
    for(let zz=0;zz<slots;zz++)for(let xx=0;xx<slots;xx++){
      const x=(i*slots+xx+.5)*p.candidateStep-world.half+(treeRandom()*2-1)*jitter,z=(j*slots+zz+.5)*p.candidateStep-world.half+(treeRandom()*2-1)*jitter;
      const acceptance=treeRandom(),radius=p.treeRadiusMin+p.treeRadiusRange*treeRandom(),height=p.treeHeightMin+p.treeHeightRange*treeRandom(),rockAcceptance=rockRandom(),rockRadius=p.rockRadiusMin+p.rockRadiusRange*rockRandom(),rockHeight=p.rockHeightMin+p.rockHeightRange*rockRandom();
      if(Math.abs(x)>world.half||Math.abs(z)>world.half||inFeatureClearance(world.meta,x,z,p.maxRadius)||structureClearance(world.meta,x,z,p.maxRadius)||lakeValue(world.meta,world.buffers,x,z)>0)continue;
      world.sampleSurface(x,z,surface);world.snowAt(x,z,snow);
      const practice=world.meta.practice;
      const inPractice=practice&&Math.abs(x-practice.x)<=practice.width/2+p.practiceMargin&&Math.abs(z-practice.z)<=practice.length/2+p.practiceMargin;
      const angle=Math.acos(clamp(surface.ny,-1,1))*180/Math.PI;
      // Deep concave troughs remain open even where a mask border interpolates some density.
      const trough=snow.depth>p.troughSnowDepth&&(world.curvatureAlong(x,z,1,0)>p.troughCurvature||world.curvatureAlong(x,z,0,1)>p.troughCurvature);
      if(!inPractice&&!trough&&surface.h>=p.treeMin&&surface.h<=(valley?1830:p.treeMax)&&angle<=(valley?43:p.maxSlope)&&snow.depth>=p.minSnowDepth&&acceptance<world.treeDensityAt(x,z)*(!valley&&surface.h>=p.monsterMin?p.monsterProbability:p.treeProbability)&&!inDropCorridor(world.drops,x,z,radius+(valley?28:0))){
        // 樹氷は雪の塊ごと当たる（幹だけの木より太い）。間をすり抜けられる間隔にするため、密度は木より下げる
        const monster=!valley&&surface.h>=p.monsterMin;
        items.push({id:`tree:${i*slots+xx}:${j*slots+zz}`,type:monster?'monster':'tree',x,y:surface.h,z,radius:monster?p.monsterRadiusMin+p.monsterRadiusRange*(radius-p.treeRadiusMin)/p.treeRadiusRange:radius,height:monster?height*p.monsterHeightScale:valley?9+(height-p.treeHeightMin)/p.treeHeightRange*7:height});
      }
      else if(!inPractice&&snow.rock>=p.rockExposureMin&&snow.rock<=p.rockExposureMax&&rockAcceptance<p.rockProbability*(valley?.3:1)&&!inDropCorridor(world.drops,x,z,rockRadius+(valley?12:0))){
        items.push({id:`rock:${i*slots+xx}:${j*slots+zz}`,type:'rock',x,y:surface.h,z,radius:rockRadius,height:rockHeight});
      }
    }
    if(keys[cursor]>=0)cache.delete(keys[cursor]);keys[cursor]=key;cursor=(cursor+1)%p.cacheSize;cache.set(key,items);return items;
  }
  return function obstaclesNear(x,z,radius,out) {
    out.length=0;
    if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||radius<0)return out;
    const reach=radius+p.maxRadius;
    if(x+reach<-world.half||x-reach>world.half||z+reach<-world.half||z-reach>world.half)return out;
    const minI=clamp(Math.floor((x-reach+world.half)/p.cellSize),0,cells-1),maxI=clamp(Math.floor((x+reach+world.half)/p.cellSize),0,cells-1);
    const minJ=clamp(Math.floor((z-reach+world.half)/p.cellSize),0,cells-1),maxJ=clamp(Math.floor((z+reach+world.half)/p.cellSize),0,cells-1);
    for(let j=minJ;j<=maxJ;j++)for(let i=minI;i<=maxI;i++){
      const items=build(i,j);for(let k=0;k<items.length;k++){const o=items[k];if((o.x-x)**2+(o.z-z)**2<=(radius+o.radius)**2)out.push(o);}
    }
    for(const o of fixed)if((o.x-x)**2+(o.z-z)**2<=(radius+o.radius)**2)out.push(o);
    return out;
  };
}
