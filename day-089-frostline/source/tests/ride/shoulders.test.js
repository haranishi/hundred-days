import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {BODY,createPose,createPoseMemory,solvePose} from '../../src/render/ride/pose.js';
import {createBindPose} from '../../src/render/ride/skeleton-math.js';
import {riding,groundPoseCases,distance} from './fixtures.js';
const before=JSON.parse(readFileSync(new URL('./shoulder-before.json',import.meta.url)));
const axes=['x','y','z'];
function settled(c){const p=createPose(),m=createPoseMemory();for(let f=0;f<120;f++)solvePose({state:riding(c),dt:1/60,heightAt:(x,z)=>-z*(c.slope||0),events:c.impact&&f===119?[{type:'land',efh:c.impact}]:[]},m,p);return p;}
it('places both shoulder centres 19cm above chest along chestUp in bind and ground poses',()=>{
 for(const p of [createBindPose(),...groundPoseCases.map(settled)]){
  const j=p.joints,u=p.chestUp;
  for(const k of axes)expect((j.shoulderL[k]+j.shoulderR[k])/2-j.chest[k]).toBeCloseTo(.19*u[k],10);
  for(const s of ['L','R'])expect(axes.reduce((n,k)=>n+(j.neck[k]-j['shoulder'+s][k])*u[k],0)).toBeCloseTo(.05,10);
 }
 expect(BODY.shoulderRise).toBe(.19);
});
it('preserves pelvis, hips, knees and ankles exactly against the I13d capture',()=>{
 groundPoseCases.forEach((c,i)=>{const p=settled(c);for(const k of Object.keys(before[i]).filter(k=>/^(pelvis|hip|knee|ankle)/.test(k)))expect(p.joints[k],c.name+':'+k).toEqual(before[i][k]);});
});
it('keeps the raised shoulders and both arm lengths under the updated collision and uphill constraints',()=>{
 for(const c of groundPoseCases){const p=settled(c);for(const side of ['L','R']){
  expect(distance(p.joints['shoulder'+side],p.joints['elbow'+side])).toBeCloseTo(BODY.upperArm,10);
  expect(distance(p.joints['elbow'+side],p.joints['hand'+side])).toBeCloseTo(BODY.forearm,10);
  const reach=distance(p.joints['shoulder'+side],p.joints['hand'+side]);
  expect(reach).toBeLessThanOrEqual(.534+1e-10);
 }}
});
