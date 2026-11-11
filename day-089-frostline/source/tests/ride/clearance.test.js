import {it,expect} from 'vitest';
import {BODY,createPose,createPoseMemory,solvePose} from '../../src/render/ride/pose.js';
import {groundPoseCases,riding,mittenClearance,distance} from './fixtures.js';
const axes=['x','y','z'];
export function settled(c){const p=createPose(),m=createPoseMemory();for(let f=0;f<120;f++)solvePose({state:riding(c),dt:1/60,heightAt:(x,z)=>-z*(c.slope||0),events:c.impact&&f===119?[{type:'land',efh:c.impact}]:[]},m,p);return p;}
it.each(groundPoseCases)('clears complete mitten capsules and boot boxes, fixed lengths and 145° elbows: $name',c=>{
 const p=settled(c);expect(mittenClearance(p,c.stance)).toBeGreaterThanOrEqual(-1e-6);
 for(const side of ['L','R']){
  expect(distance(p.joints['shoulder'+side],p.joints['elbow'+side])).toBeCloseTo(BODY.upperArm,9);
  expect(distance(p.joints['elbow'+side],p.joints['hand'+side])).toBeCloseTo(BODY.forearm,9);
  const d=distance(p.joints['shoulder'+side],p.joints['hand'+side]);
  const angle=Math.acos((BODY.upperArm**2+BODY.forearm**2-d*d)/(2*BODY.upperArm*BODY.forearm))*180/Math.PI;
  expect(angle).toBeLessThanOrEqual(145);
 }
});
it.each([1,2,3])('clears mittens in grab %s',grab=>expect(mittenClearance(settled({mode:'air',crouch:1,pos:{x:0,y:2,z:0},air:{grab,grabTime:.5}}))).toBeGreaterThanOrEqual(-1e-6));
