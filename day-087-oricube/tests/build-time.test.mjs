import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel} from '../lib/model.js';
import {MODELS} from '../lib/models/index.js';

// The budget is CPU time, not wall-clock time: a busy machine or a slow CI runner stretches the wall
// clock several times over (a load average of 50 made the crane 17x slower) while the work stays the same.
// The crane used to take about 7 s of CPU time and now takes about 0.5 s; the limits catch a return to that.
// CPU time still depends on the machine: the process total includes V8's helper threads (GC, compiler).
// On the 4-vCPU CI runners the crane took 1.7-4.2 s in nine runs on 2026-11-11 (0.7 s locally), and four
// of them failed the old 3 s limit, so its limit is 6 s. A return to 7 s still fails here and on CI.
const cpuMs=()=>{const u=process.cpuUsage();return (u.user+u.system)/1000;};
for(const def of MODELS) test(`${def.id}: model assembly stays within the build-time budget`,t=>{
  buildModel(def);
  const start=cpuMs();
  const model=buildModel(def),elapsed=cpuMs()-start;
  const limit=def.id==='crane'?6000:1500;
  assert.equal(model.id,def.id);
  t.diagnostic(`buildModel: ${elapsed.toFixed(1)} ms CPU (limit ${limit} ms)`);
  assert.ok(elapsed<limit,`${def.id}: ${elapsed.toFixed(1)} ms CPU >= ${limit} ms`);
});
