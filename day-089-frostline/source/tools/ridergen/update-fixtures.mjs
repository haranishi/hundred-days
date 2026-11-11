import {readFileSync,writeFileSync} from 'node:fs';
import {groundPoseCases,groundPoseGolden,riding} from '../../tests/ride/fixtures.js';
import {createPose,createPoseMemory,solvePose} from '../../src/render/ride/pose.js';
const allowed=/^(chest|neck|head|shoulder[LR]|elbow[LR]|hand[LR])$/;
const updated=groundPoseCases.map((c,i)=>{
 const p=createPose(),m=createPoseMemory();for(let f=0;f<120;f++)solvePose({state:riding(c),dt:1/60,heightAt:(x,z)=>-z*(c.slope||0),events:c.impact&&f===119?[{type:'land',efh:c.impact}]:[]},m,p);
 const baseline=structuredClone(groundPoseGolden[i]);
 for(const [k,v]of Object.entries(p.joints)){
  if(!allowed.test(k)&&JSON.stringify(v)!==JSON.stringify(baseline.joints[k]))throw Error('lower-body drift: '+c.name+':'+k);
  if(allowed.test(k))baseline.joints[k]=v;
 }
 for(const key of ['chestUp','chestFwd','headFwd'])baseline[key]=p[key];
 return baseline;
});
const path='tests/ride/fixtures.js',s=readFileSync(path,'utf8'),a=s.indexOf('export const groundPoseGolden = '),b=s.indexOf(';',a);
writeFileSync(path,s.slice(0,a)+'export const groundPoseGolden = '+JSON.stringify(updated)+s.slice(b));
