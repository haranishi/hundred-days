// CPU measurements using production geometry/camera. Does not launch a browser.
import {readFileSync} from 'node:fs';
import {createScene} from '../lib/scene.js';
import {createImpacts,updateImpacts,TYPES} from '../lib/impacts.js';
import {loadModels} from '../scripts/audit-models.mjs';
import {counterRenderer} from './render-budget.mjs';
import {catRunRate} from '../lib/cat-model.js';
globalThis.devicePixelRatio=1;globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
const read=async file=>{const b=readFileSync(new URL(`../assets/models/${file}`,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const models=await loadModels(read),rows=[],tails=[];
for(const [width,height] of [[1080,450],[362,540],[362,374]]){
  const scene=await createScene({clientWidth:width,clientHeight:height},{models,renderer:counterRenderer(),readCat:()=>read('cat-run.glb')});
  for(const speed of [100,1000,100000]){const state=createImpacts();
    for(const world of Object.keys(TYPES)){let minimum=Infinity,atThreeSeconds;
      for(let frame=0;frame<=600;frame++){
        updateImpacts(state,{speed,world,dt:frame===0?0:1/60});scene.draw(speed,0,true,false,state);
        minimum=Math.min(minimum,scene.stats().impact.visibleTargets);
        if(frame===180)atThreeSeconds=scene.stats().impact.visibleTargets;
      }
      rows.push({canvas:`${width}×${height}`,world,speed,minimum,atThreeSeconds});
    }
  }
  for(const speed of [0,1000,100000,1079252849*.9999]){
    scene.reset();scene.simulate(speed,.5,true);scene.draw(speed,0,true,false);
    const {box,root}=scene.trailBounds();tails.push({canvas:`${width}×${height}`,speed,box,root,gap:root.z-box.max.z});
  }
  scene.dispose();
}
console.log(JSON.stringify({method:'CPU: intact target boxes fully inside production camera frustum; 601 frames per world/speed, including immediate world transitions. Occlusion is not pixel-tested.',rows,tails,rates:[0,1,100,813,1000,1225,2025,100000].map(speed=>({speed,rate:catRunRate(speed)}))},null,2));
