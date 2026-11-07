// frame() also returns the paper's own edge (outlineSegments) and a per-vertex layer tint (shade).
// Both are display-only; neither may leak into geometry or leave the paper.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel} from '../lib/model.js';
import {MODELS} from '../lib/models/index.js';
const samples=[0,.25,.5,.75,1];
for(const def of MODELS) {
  const model=buildModel(def);
  test(`${def.id}: outline segments follow the paper and stay inside the frame bounds`,()=>{
    for(let i=0;i<model.steps.length;i++) for(const t of samples) {
      const f=model.frame(i,t,{explode:1}),m=1e-6;
      assert.ok(f.outlineSegments.length>=4*6,`step ${i+1} t=${t}: the sheet edge has at least four pieces`);
      assert.ok(f.outlineSegments.every(Number.isFinite));
      for(let q=0;q<f.outlineSegments.length;q+=3) for(let c=0;c<3;c++) {
        const v=f.outlineSegments[q+c];
        assert.ok(v>=f.bounds.min[c]-m&&v<=f.bounds.max[c]+m,`step ${i+1} t=${t}: outline coordinate ${c}`);
      }
    }
  });
  test(`${def.id}: layer tint stays within the subtle range and is 1 for a single layer`,()=>{
    for(let i=0;i<model.steps.length;i++) for(const t of samples) {
      const f=model.frame(i,t,{explode:1});
      assert.equal(f.shade.length,f.triCount*9);
      for(const v of f.shade) assert.ok(v>=0.9-1e-6&&v<=1+1e-6,`step ${i+1} t=${t}: shade ${v}`);
    }
    // Step 1 starts as one flat sheet: nothing to tell apart, so no tint.
    assert.ok(model.frame(0,0).shade.every(v=>v===1));
  });
}
test('the outline of an untouched rectangular sheet lies on its four edges',()=>{
  const model=buildModel(MODELS.find(d=>d.id==='plane')),f=model.frame(0,0);
  const w=model.paper.width/2,h=model.paper.height/2;
  for(let q=0;q<f.outlineSegments.length;q+=3) {
    const x=Math.abs(f.outlineSegments[q]),z=Math.abs(f.outlineSegments[q+2]);
    assert.ok(Math.abs(x-w)<1e-6||Math.abs(z-h)<1e-6,`outline point ${q/3} is on an edge`);
  }
});
