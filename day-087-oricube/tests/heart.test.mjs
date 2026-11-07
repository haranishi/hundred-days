import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,inspectModel,FoldError} from '../lib/model.js';
import {heart} from '../lib/models/heart.js';
import {modelDef,MODELS} from '../lib/models/index.js';
import {outline,concave,symmetryError} from './flat-geometry.mjs';
import {signedArea} from '../lib/math.js';
const model=buildModel(heart);
function criteria(m) {
  const s=inspectModel(m).raw.at(-1).end,poly=outline(s),notches=concave(poly);
  assert.ok(s.flat);
  assert.ok(s.vertices.every(v=>Math.abs(v.p[1])<1e-9));
  assert.equal(poly.length,10,'ten rounded silhouette corners');
  assert.ok(symmetryError(poly)<1e-6,'silhouette mirror symmetry');
  assert.equal(notches.length,1,'one central notch');
  assert.ok(Math.abs(notches[0][0])<1e-6);
  assert.ok(Math.abs(notches[0][1]+Math.SQRT1_2/2)<1e-6);
  const bottom=Math.max(...poly.map(p=>p[1]));
  const tips=poly.filter(p=>Math.abs(p[1]-bottom)<1e-6);
  assert.equal(tips.length,1,'one lower point');
  assert.ok(Math.abs(tips[0][0])<1e-6);
  assert.ok(Math.abs(bottom-Math.SQRT1_2/4)<1e-6);
  const width=Math.max(...poly.map(p=>p[0]))-Math.min(...poly.map(p=>p[0]));
  const height=bottom-Math.min(...poly.map(p=>p[1]));
  assert.ok(Math.abs(width-9*Math.SQRT1_2/8)<1e-6);
  assert.ok(Math.abs(height-7*Math.SQRT1_2/8)<1e-6);
  assert.ok(Math.abs(signedArea(poly)-.30859375)<1e-6,'union area');
}
test('heart: final union is symmetric with one notch, one bottom tip and rounded lobes',()=>criteria(model));
test('heart: named colours and registry metadata match the beginner model',()=>{
  assert.equal(modelDef('heart'),heart);
  assert.equal(heart.level,1);assert.equal(heart.minutes,3);
  assert.equal(heart.reading,'はーと');
  assert.equal(heart.steps.length,9);
  for(const key of ['front','back']) {
    assert.ok(heart.paper[`${key}Name`]);
    assert.notEqual(heart.paper[key],'#d6452d');
    for(const other of MODELS.filter(d=>d.id!=='heart'))
      for(const side of ['front','back']) assert.notEqual(heart.paper[key],other.paper[side]);
  }
  assert.notEqual(heart.paper.front,heart.paper.back);
});
for(const [name,change] of [
  ['unrounded lobes',d=>d.steps.splice(6,1)],
  ['unrounded sides',d=>d.steps.splice(7,1)],
  ['asymmetric lobes',d=>d.steps[6].ops[0].line.dir=[1,.1]],
]) test(`heart: rejects ${name} by construction or independent outline criteria`,()=>{
  const def=structuredClone(heart);change(def);
  let m;
  try {m=buildModel(def);} catch(e) {assert.ok(e instanceof FoldError);return;}
  assert.throws(()=>criteria(m),assert.AssertionError);
});
