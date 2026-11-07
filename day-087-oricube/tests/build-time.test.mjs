import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel} from '../lib/model.js';
import {MODELS} from '../lib/models/index.js';

// The budget is CPU time, not wall-clock time: a busy machine or a slow CI runner stretches the wall
// clock several times over (a load average of 50 made the crane 17x slower) while the work stays the same.
// The crane used to take about 7 s of CPU time and now takes about 0.5 s; the limits catch a return to that.
const cpuMs=()=>{const u=process.cpuUsage();return (u.user+u.system)/1000;};
for(const def of MODELS) test(`${def.id}: model assembly stays within the build-time budget`,t=>{
  buildModel(def);
  const start=cpuMs();
  const model=buildModel(def),elapsed=cpuMs()-start;
  const limit=def.id==='crane'?3000:1500;
  assert.equal(model.id,def.id);
  t.diagnostic(`buildModel: ${elapsed.toFixed(1)} ms CPU (limit ${limit} ms)`);
  assert.ok(elapsed<limit,`${def.id}: ${elapsed.toFixed(1)} ms CPU >= ${limit} ms`);
});
