import {test,expect} from 'vitest';
import {fixture} from './fixture.js';
import {createWorld} from '../../src/world/index.js';
import {validateMeta} from '../../src/world/format.js';
import {inFeatureClearance} from '../../src/world/feature-clearance.js';
import {runRide} from '../../tools/worldgen/lib/verify-features.js';
import {jumpProfile,JUMP_SPECS} from '../../tools/worldgen/lib/terrain-features.js';
test('feature and station obstacle exclusions follow heading and include object radii',()=>{
 const f={x:0,z:0,heading:Math.PI/2,width:20,length:100},m={features:[f],stations:[{x:400,z:300,radius:25}]};
 expect(inFeatureClearance(m,80,0)).toBe(true);expect(inFeatureClearance(m,0,80)).toBe(false);
 expect(inFeatureClearance(m,433,300,2)).toBe(true);expect(inFeatureClearance(m,450,300)).toBe(false);
 const {meta,buffers}=fixture();meta.features=[{id:'snow',kind:'chute',...f,y:1000}];
 const world=createWorld(meta,buffers),out=[];world.obstaclesNear(40,0,25,out);expect(out.every(o=>!inFeatureClearance(meta,o.x,o.z,o.radius))).toBe(true);
});
test('v2 schema rejects duplicate features, bad retry, unknown station and long descriptions',()=>{
 for(const change of [{features:[null]},{stations:[null]},{map:{file:'other.png',size:1024}},{drops:[{id:'a',name:'a',x:0,y:1,z:0,heading:0,zone:1,level:4,kind:'chute',hidden:false,finish:'missing',about:'a'}]}]){
 const {meta}=fixture();expect(()=>validateMeta({...meta,...change})).toThrow(/npm run worldgen/);
 }
});
test('authored kicker profile has continuous joins and a downhill landing instead of an isolated mound',()=>{
 for(const size of Object.keys(JUMP_SPECS)){const p=JUMP_SPECS[size],f={...p,profile:{pitch:p.pitch,run:p.run}};const v=(p.speed[0]+p.speed[1])/2/Math.sqrt(1+p.pitch**2),T=(p.air[0]+p.air[1])/2,d=v*T+3;
 for(const s of [-p.run,0,d*.6,d+24,d+70])expect(Math.abs(jumpProfile(s-1e-5,f)-jumpProfile(s+1e-5,f))).toBeLessThan(.001);
 expect(jumpProfile(d+5,f)-jumpProfile(d,f)).toBeCloseTo(-Math.tan(32*Math.PI/180)*5,6);
 }
});
test('real default ride records grounded travel without inventing flight measurements',()=>{
 const {meta,buffers}=fixture();for(let k=0;k<buffers.masksB.length;k+=4)buffers.masksB[k]=buffers.masksB[k+1]=0;
 const r=runRide(createWorld(meta,buffers),{x:0,z:0,heading:Math.PI,speed:8},1);
 expect(r.crash).toBe(null);expect(r.flight).toBe(null);expect(r.end.z).toBeGreaterThan(0);
});
