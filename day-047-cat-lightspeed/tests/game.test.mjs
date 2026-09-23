import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun,tick } from '../lib/game.js';
import { MAX_SPEED,lorentzFactor } from '../lib/physics.js';
// v2 finished in 80–100 s (and earth > 5x cat was a property of that curve). v3 P0-1 finishes in 45–60 s;
// the earth clock is compared with an independent trapezoid integral of gamma over the same ticks.
test('連続押下で45〜60秒に20件通過して自動結果、ソニックブームは1回、地球の秒はγの積分',()=>{let r=createRun(),booms=0,earth=0;for(let i=0;i<9000&&r.phase==='playing';i++){const before=r.speed;r=tick(r,true,1/60);earth+=(lorentzFactor(before)+lorentzFactor(r.speed))/2/60;if(r.boom)booms++;}assert.equal(r.phase,'result');assert.equal(r.speed,MAX_SPEED);assert.equal(r.passed,20);assert.equal(booms,1);assert.ok(r.elapsed>=45&&r.elapsed<=60,`完走 ${r.elapsed}秒`);assert.ok(Math.abs(r.earthSeconds-earth)<=1e-3*earth,`地球の秒 ${r.earthSeconds}・台形積分 ${earth}`);assert.ok(r.earthSeconds>r.elapsed);assert.deepEqual(tick(r,true,1/60),r);});
test('減速で音速を往復しても衝撃音を繰り返さない',()=>{let r={...createRun(),speed:1224};while(!r.boomed)r=tick(r,true,1/60);for(let i=0;i<100;i++)r=tick(r,false,1/60);assert.ok(r.speed<1225);for(let i=0;i<500;i++){r=tick(r,true,1/60);assert.equal(r.boom,false);}assert.ok(r.speed>1225);});
test('離すと速度が下がり、通過済みの件数は失われない',()=>{let r=createRun();for(let i=0;i<1800;i++)r=tick(r,true,1/60);const passed=r.passed,speed=r.speed;r=tick(r,false,1/60);assert.ok(r.speed<speed);assert.equal(r.passed,passed);});
test('停止中の2つの時計は等しく、再挑戦で記録をリセット',()=>{let r=createRun();for(let i=0;i<60;i++)r=tick(r,false,1/60);assert.ok(Math.abs(r.earthSeconds-1)<1e-12);assert.equal(r.elapsed,r.earthSeconds);assert.equal(createRun().boomed,false);assert.equal(createRun().elapsed,0);});
