// Crease lines are clipped against the refined mesh in paper space. A clip that
// keeps a point outside its triangle draws lines beyond the paper; the unit
// invariants on faces alone never noticed (found by looking at the first render).
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,inspectModel} from '../lib/model.js';
import {MODELS} from '../lib/models/index.js';
import {segmentTriangleInterval} from '../lib/math.js';
const samples=[0,.25,.5,.75,1];
for(const def of MODELS) {
  const model=buildModel(def),{compiled}=inspectModel(model);
  test(`${def.id}: every crease endpoint is a convex combination of its triangle`,()=>{
    compiled.forEach((step,i)=>step.creaseMap.forEach(({triangle,endpoints},j)=>endpoints.forEach(({w})=>{
      assert.ok(w.every(x=>x>=-1e-6&&x<=1+1e-6),`step ${i+1} crease ${j} triangle ${triangle}: weights ${w}`);
      assert.ok(Math.abs(w[0]+w[1]+w[2]-1)<1e-9);
    })));
  });
  test(`${def.id}: crease segments never leave the frame bounds`,()=>{
    for(let i=0;i<model.steps.length;i++) for(const t of samples) {
      const f=model.frame(i,t,{explode:1}),m=1e-6;
      for(let q=0;q<f.creaseSegments.length;q+=3) for(let c=0;c<3;c++) {
        const v=f.creaseSegments[q+c];
        assert.ok(v>=f.bounds.min[c]-m&&v<=f.bounds.max[c]+m,`step ${i+1} t=${t}: crease coordinate ${c}=${v} outside ${f.bounds.min[c]}..${f.bounds.max[c]}`);
      }
    }
  });
}
test('segmentTriangleInterval does not skip an edge when a signed distance is -1e-17',()=>{
  // The segment lies wholly outside the third edge, whose start value is a
  // rounding-error negative. The old code left it unclipped and returned [1,1].
  const triangle=[[0,0],[0.3607,0],[0.4191,0.5927]];
  assert.equal(segmentTriangleInterval([0.5,0.7071],[0.5,1.4142],triangle),null);
});
