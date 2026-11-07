// Findings of the independent engine review (2026-11-06) that are cheap to refuse at build time.
// The others (layer validator vs split faces, stale rank after fold+unfold, stacked `outside`)
// are recorded as known limits in engine-notes.md; no shipped model reaches them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,FoldError} from '../lib/model.js';
import {MODELS} from '../lib/models/index.js';
const tray=MODELS.find(d=>d.id==='tray');
const paper={width:1,height:1};
test('a drive whose drivers disagree is refused at build time, not while playing',()=>{
  const def=structuredClone(tray);def.steps.length=4;
  def.steps[3].ops[0].groups.forEach((g,i)=>{g.degrees=i%2?-120:-90;});
  assert.throws(()=>buildModel(def),e=>e instanceof FoldError&&e.step===4&&['DRIVE_BRANCH_JUMP','DRIVE_CONSTRAINT'].includes(e.code));
});
test('the shipped symmetric drive walks without a jump',()=>{
  assert.doesNotThrow(()=>buildModel(structuredClone(tray)));
});
test('a non-finite paper rotation is rejected instead of producing NaN geometry',()=>{
  for(const rotationDeg of [NaN,Infinity]) assert.throws(()=>buildModel({id:'bad',paper:{...paper,rotationDeg},steps:[{ops:[{type:'tag',rect:[0,0,1,1],add:[]}]}]}),FoldError);
});
test('a zero-degree hinge has no arrow, so no NaN direction reaches the viewer',()=>{
  const model=buildModel({id:'zero',paper,steps:[{ops:[{type:'hinge',axis:{through:['B','T']},degrees:0}]}]});
  for(const g of model.steps[0].guides) assert.ok(g.arrow.head.direction.every(Number.isFinite));
});
test('an empty step reports its own step number and operation 0',()=>{
  const op={type:'crease',line:{through:['T','B']},moving:'BR',mode:'valley'};
  assert.throws(()=>buildModel({id:'e',paper,steps:[{ops:[op,{...op,line:{through:['L','R']},moving:'TL'}]},{ops:[]}]}),
    e=>e instanceof FoldError&&e.step===2&&e.op===0);
});
