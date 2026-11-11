import {readFileSync,writeFileSync} from 'node:fs';
import {buildModel} from './model.mjs';
import {encodeModel} from './format.mjs';
import {exportedModel,realPoses,shoulderRaises,inversionStats,skinMesh} from './preview.mjs';
import {createPose,createPoseMemory,solvePose} from '../../src/render/ride/pose.js';
import {groundPoseCases,riding,distance,mittenClearance} from '../../tests/ride/fixtures.js';
import {dot,unit,cross,sub} from './sdf.mjs';
const raw=buildModel(),encoded=encodeModel(raw),model=exportedModel(raw),before=JSON.parse(readFileSync('.agent-harness/runs/ridergen/I13f/ground-before.json'));
const settled=c=>{const p=createPose(),m=createPoseMemory();for(let f=0;f<120;f++)solvePose({state:riding(c),dt:1/60,heightAt:(x,z)=>-z*(c.slope||0),events:c.impact&&f===119?[{type:'land',efh:c.impact}]:[]},m,p);return p;};
const ground=groundPoseCases.map((c,i)=>{
 const p=settled(c),changes=Object.keys(p.joints).filter(k=>distance(p.joints[k],before[i].joints[k])>1e-12);
 const lowerError=Math.max(...['pelvis','hipL','hipR','kneeL','kneeR','ankleL','ankleR'].map(k=>distance(p.joints[k],before[i].joints[k])));
 const elbows=['L','R'].map(s=>{const d=distance(p.joints['hand'+s],p.joints['shoulder'+s]);return Math.acos((.29**2+.27**2-d*d)/(2*.29*.27))*180/Math.PI;});
 return {name:c.name,changes,lowerError,clearance:mittenClearance(p,c.stance),elbows};
});
const air=[];for(const stance of [1,-1])for(const grab of [1,2,3]){const p=settled({stance,mode:'air',crouch:1,pos:{x:0,y:2,z:0},air:{grab,grabTime:.5}});air.push({stance,grab,clearance:mittenClearance(p,stance)});}
const poseStats=realPoses().map(([name,p])=>({name,...inversionStats(model,p)})),raises=shoulderRaises(model.pose).map(([name,p])=>({name,...inversionStats(model,p)}));
const pose=realPoses().find(([n])=>n==='grab')[1],m=skinMesh(model,pose),az=60*Math.PI/180,el=6*Math.PI/180,dir=unit([-Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)]),up=cross(dir,unit(cross([0,1,0],dir))),center=Object.values(pose.joints.pelvis);
const heights=part=>m.p.filter((_,i)=>m.a[i].part===part).map(p=>{const v=sub(p,center);return dot(v,up)*3.2/(3.2-dot(v,dir));}),helmet=heights(5),pack=heights(11);
const result={vertices:raw.mesh.p.length,triangles:raw.mesh.tri.length,binBytes:encoded.bin.length,jsonBytes:Buffer.byteLength(encoded.json),totalBytes:encoded.bin.length+Buffer.byteLength(encoded.json),lowerBodyMaxError:Math.max(...ground.map(p=>p.lowerError)),minMittenClearance:Math.min(...ground.map(p=>p.clearance),...air.map(p=>p.clearance)),maxElbow:Math.max(...ground.flatMap(p=>p.elbows)),helmetVisibleFractionAbovePack:(Math.max(...helmet)-Math.max(...pack))/(Math.max(...helmet)-Math.min(...helmet)),ground,air,poseStats,raises};
writeFileSync('.agent-harness/runs/ridergen/I13f/final-validation.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,ground:undefined,air:undefined},null,2));
