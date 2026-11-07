import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,inspectModel} from '../lib/model.js';
import {assertSheet} from '../lib/ops.js';
import {enumerateSquareEndpoints,petalObstruction,hatFixture} from './mechanism-feasibility.mjs';
import {squareBaseFixture} from './mechanism-fixtures.mjs';
test('C1 feasibility: all 3^8 endpoint assignments are enumerated through geometry and layer checks',()=>{
  const result=enumerateSquareEndpoints();
  assert.deepEqual(result.counts,{total:6561,closed:1329,theorems:624,square:300,layered:300});
  assert.ok(result.candidates.some(c=>JSON.stringify(c.degrees)==='[180,-180,180,0,180,-180,180,0]'));
});
test('C2 obstruction: front-only petal creases require an edge of length .5 to become .7368128791',()=>{
  const model=buildModel(squareBaseFixture()),s=inspectModel(model).raw[1].end,r=petalObstruction(s);
  assert.ok(Math.abs(r.edge-.5)<1e-12);assert.ok(Math.abs(r.required-.7368128791039503)<1e-12);
  assert.ok(r.gap>.2368);
});
test('C3(b) starting fixture uses only the traditional half, corner and brim folds',()=>{
  const model=buildModel(hatFixture()),d=inspectModel(model);
  for(const r of d.raw)for(const s of [r.start,r.end])assertSheet(s,model.paper);
  assert.equal(d.raw.at(-1).end.flat,true);assert.equal(d.raw.at(-1).end.triangles.length,16);
});
