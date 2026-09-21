import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT_SPEED,MILESTONES,lastPassed,passedCount,nextMilestone } from '../lib/milestones.js';
test('指定21件の数値は厳密な昇順、光速だけが壁',()=>{assert.deepEqual(MILESTONES.map(m=>m.speed),[.05,1.4,4,20,37,60,100,110,320,390,603,900,1225,3530,11000,27600,40300,107200,692000,828000,1079252849]);assert.equal(MILESTONES.at(-1).speed,LIGHT_SPEED);assert.equal(MILESTONES.filter(m=>m.wall).length,1);assert.ok(MILESTONES.at(-1).wall);for(let i=1;i<MILESTONES.length;i++)assert.ok(MILESTONES[i].speed>MILESTONES[i-1].speed);});
for(const [i,m] of MILESTONES.entries())test(`${m.name}の直前・一致・直後`,()=>{const previous=i===0?null:MILESTONES[i-1],at=m.wall?previous:m;assert.deepEqual(lastPassed(m.speed-.00001),previous);assert.deepEqual(lastPassed(m.speed),at);assert.deepEqual(lastPassed(m.speed+.00001),at);});
test('光速を追い越した数には含めない',()=>{assert.equal(lastPassed(-1),null);assert.equal(passedCount(LIGHT_SPEED*2),20);assert.equal(nextMilestone(828000).wall,true);assert.equal(nextMilestone(0).speed,.05);});
