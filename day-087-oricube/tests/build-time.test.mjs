import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel} from '../lib/model.js';
import {MODELS} from '../lib/models/index.js';

for(const def of MODELS) test(`${def.id}: model assembly stays within the build-time budget`,t=>{
  buildModel(def);
  const start=performance.now();
  const model=buildModel(def),elapsed=performance.now()-start;
  const limit=def.id==='crane'?2000:1000;
  assert.equal(model.id,def.id);
  t.diagnostic(`buildModel: ${elapsed.toFixed(1)} ms (limit ${limit} ms)`);
  assert.ok(elapsed<limit,`${def.id}: ${elapsed.toFixed(1)} ms >= ${limit} ms`);
});
