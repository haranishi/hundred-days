import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,FoldError} from '../lib/model.js';
import {MODELS} from '../lib/models/index.js';
import {planeCriteria,swanCriteria} from './model.test.mjs';
const cases=[
  ['shift a wing crease',0,d=>{d.marks.WR[0]+=.02;}],
  ['reverse the moving half',0,d=>{d.steps[3].ops[0].moving='BR';}],
  ['remove the wing layer selection',0,d=>{delete d.steps[4].ops[0].select;}],
  ['remove the head layer selection',1,d=>{delete d.steps[4].ops[0].select;}],
  ['replace neck between with auto',1,d=>{d.steps[3].ops[0].stack='auto';}],
  ['replace head between with auto',1,d=>{d.steps[4].ops[0].stack='auto';}],
  ['open one wing in the wrong direction',0,d=>{d.steps[8].ops[1].degrees=90;}],
  ['stand the swan upside down',1,d=>{d.steps[5].ops[0].degrees=-90;}],
];
for(const [name,index,mutate] of cases) test(`mutation: ${name} is rejected by construction or numerical shape criteria`,()=>{
  const d=structuredClone(MODELS.find(d=>d.id===['plane','swan'][index]));mutate(d);
  let m;
  try { m=buildModel(d); } catch(e) { assert.ok(e instanceof FoldError);assert.ok(e.step>0);return; }
  assert.throws(()=>[planeCriteria,swanCriteria][index](m),assert.AssertionError);
});
