import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateEntities,travel } from '../lib/entities.js';
import { DT,step } from '../lib/physics.js';
import { fixture,run } from './helpers.mjs';
test('カラス3マス・床4マスを決定的に往復',()=>{assert.equal(travel(2,24,48),48);assert.equal(travel(4,24,48),0);assert.equal(travel(64/24,24,64),64);let s=fixture([[8,8,'C'],[12,9,'M']]);const e=updateEntities(s.entities,s.level,s.player,2,DT);assert.equal(e[0].x,176);});
test('犬は穴の端で折り返す',()=>{let s=fixture([[5,10,'D'],[7,11,'.']]);s=run(s,240);const dog=s.entities.find(e=>e.type==='D');assert.ok(dog.x<96);assert.equal(dog.direction,-1);});
test('つららは真下に入って0.4秒後から落ちる',()=>{let s=fixture([[5,4,'^']]);s.player.x=80;s=run(s,47);let e=s.entities.find(e=>e.type==='^');assert.equal(e.y,64);s=step(s);e=s.entities.find(e=>e.type==='^');assert.ok(e.y>64);});
test('動く床に乗ると移動量を引き継ぐ',()=>{let s=fixture([[5,9,'M']]);const e=s.entities.find(e=>e.type==='M');Object.assign(s.player,{x:82,y:130,support:e.id});s=step(s);assert.ok(Math.abs(s.player.x-82.2)<1e-9);assert.equal(s.player.y,130);assert.equal(s.player.grounded,true);});
test('縦の床の上昇・下降の両方で足元が離れない',()=>{
 let s=fixture([[5,9,'M']]);const e=s.entities.find(e=>e.type==='M');e.axis='y';Object.assign(s.player,{x:82,y:130,support:e.id});
 for(let i=0;i<640;i++){s=step(s);const floor=s.entities.find(e=>e.type==='M');assert.ok(s.player.grounded,`tick ${i}`);assert.ok(Math.abs(s.player.y+s.player.h-floor.y)<1e-9);}
});
