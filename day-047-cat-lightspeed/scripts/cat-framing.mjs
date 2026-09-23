// Real GLB, mixer and skin vertex projection; no browser or GPU required.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createScene} from '../lib/scene.js';
import {loadModels} from '../scripts/audit-models.mjs';
import {catRunRate} from '../lib/cat-model.js';
import {LIGHT_SPEED as c} from '../lib/milestones.js';
import {counterRenderer} from './render-budget.mjs';
globalThis.devicePixelRatio=1;globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
const read=async file=>{const b=readFileSync(new URL(`../assets/models/${file}`,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const models=await loadModels(read),rows=[],range={x:[1,0],h:[1,0],w:[1,0]},speeds=[0,1,30,99,100,300,600,999,1000,3000,6000,9999,10000,30000,60000,99999,100000,300000,600000,999999,1e6,3e6,c*.99,c*.9999];let samples=0;
for(const [viewport,width,height] of [['1280×900',1080,450],['390×844',362,540],['390×664',362,374]]){
  const scene=await createScene({clientWidth:width,clientHeight:height},{models,readCat:()=>read('cat-run.glb'),renderer:counterRenderer()});
  assert.equal(scene.stats().catModel,'glb');
  for(const speed of speeds){scene.reset();for(let phase=0;phase<37;phase++){
    scene.simulate(speed,1/24/catRunRate(speed),true);scene.draw(speed,0,true,false);
    const s=scene.catScreen();assert.ok(s.x>=.4&&s.x<=.6&&s.h>=.15&&s.h<=.38&&s.w>=.30&&s.w<=.70&&s.head.x>s.tail.x&&s.spread>=s.w*.55&&s.flowX<0&&s.x-s.w/2>.02&&s.x+s.w/2<.98&&s.y-s.h/2>.02&&s.y+s.h/2<.98,JSON.stringify({viewport,speed,phase,s}));
    for(const key of ['x','h','w']){range[key][0]=Math.min(range[key][0],s[key]);range[key][1]=Math.max(range[key][1],s[key]);}samples++;
  }}
  for(const speed of [0,1000,100000,c*.9999]){scene.reset();scene.simulate(speed,.5,true);scene.draw(speed,0,true,false);rows.push({viewport,canvas:`${width}×${height}`,speed,...scene.catScreen()});}
  scene.dispose();
}
console.log(JSON.stringify({method:'Node: skinned vertices, world Box3 corners projected by production camera; CSS-derived canvas sizes',samples,range,rows},null,2));
