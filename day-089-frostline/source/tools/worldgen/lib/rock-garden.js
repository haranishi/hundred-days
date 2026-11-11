import {inFeatureClearance} from '../../../src/world/feature-clearance.js';
import {structureClearance} from '../../../src/world/structures.js';
import {stationRide} from './terrain-rides.js';
export function placeRockGarden(world){
 const d=world.drops.find(d=>d.id==='rock-garden'),ride=stationRide(world,{...d,speed:0},{trace:true,seconds:40}),points=ride.points.filter(p=>Math.hypot(p.x-d.x,p.z-d.z)<=300),rocks=[];
 for(let ring=45;ring<=280&&rocks.length<40;ring+=17)for(const side of [-1,1])for(const degrees of [16,28,42,58,72]){
  if(rocks.length>=40)continue;
  const angle=d.heading+side*degrees*Math.PI/180,x=d.x+Math.sin(angle)*ring,z=d.z-Math.cos(angle)*ring,along=(x-d.x)*Math.sin(d.heading)-(z-d.z)*Math.cos(d.heading),across=(x-d.x)*Math.cos(d.heading)+(z-d.z)*Math.sin(d.heading);
  if(along<0||Math.abs(across)<8||points.some(p=>Math.hypot(p.x-x,p.z-z)<10)||inFeatureClearance(world.meta,x,z,3)||structureClearance(world.meta,x,z,3)||world.waterAt(x,z)||rocks.some(p=>Math.hypot(p.x-x,p.z-z)<9))continue;
  const y=world.heightAt(x,z);rocks.push({id:'garden-rock:'+rocks.length,type:'rock',x,y,z,radius:1+(rocks.length%4)*.3,height:1.4+(rocks.length%5)*.35});
 }
 const garden={id:d.id,x:d.x,z:d.z,radius:300,heading:d.heading,clearHalfWidth:5,rocks};world.meta.rockGardens=[garden];return garden;
}
