import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createPose,createPoseMemory,solvePose} from '../../src/render/ride/pose.js';
import {groundPoseCases,riding} from './fixtures.js';
const before=JSON.parse(readFileSync(new URL('./shoulder-before.json',import.meta.url))),axes=['x','y','z'];
it.each(['heel-deep','switch-heel','goofy-heel','brake','brake-heel'])('adds the specified uphill upper-body angle, fixing the lower body: %s',name=>{
 const i=groundPoseCases.findIndex(c=>c.name===name),c=groundPoseCases[i],p=createPose(),m=createPoseMemory();
 for(let n=0;n<120;n++)solvePose({state:riding(c),dt:1/60,events:[],heightAt:()=>0},m,p);
 const u=axes.map(k=>(before[i].chest[k]-before[i].pelvis[k])/.30),v=Object.values(p.chestUp);
 const angle=Math.acos(Math.max(-1,Math.min(1,u.reduce((s,x,k)=>s+x*v[k],0))))*180/Math.PI;
 expect(angle).toBeGreaterThanOrEqual(8);expect(angle).toBeLessThanOrEqual(c.mode==='skid'?12:14);
 for(const key of ['pelvis','hipL','hipR','kneeL','kneeR','ankleL','ankleR'])expect(p.joints[key]).toEqual(before[i][key]);
 if(c.mode==='skid')expect(v[2]-u[2]).toBeGreaterThan(0); // +Z is uphill, opposite -Z travel.
 else expect((v[0]-u[0])*(c.stance||1)).toBeLessThan(0);
});
