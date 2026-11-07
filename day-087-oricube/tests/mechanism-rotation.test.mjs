import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,inspectModel} from '../lib/model.js';
import {createSheet,cloneSheet} from '../lib/sheet.js';
import {applyOp} from '../lib/ops.js';
import {distance,dot,sub,cross,unit} from '../lib/math.js';

function fixture({axis,angle=90,mode='valley',gap=.004,turn,preTurn=false,reverse=false}={}) {
  const sign=(mode==='valley'?1:-1)*(preTurn?-1:1);
  return {id:'opening-rotation',paper:{width:1,height:1,layerGap:gap},steps:[{ops:[
    ...(preTurn?[{type:'turn',axis:'vertical'}]:[]),
    {type:'fold',line:{through:['B','T']},moving:'BR',mode},
    {type:'tag',rect:[0,0,.5,1],add:['pin']},
    ...(turn?[{type:'turn',axis:turn}]:[]),
    ...(axis?[{type:'hinge',axis:{through:axis},degrees:angle}]:[]),
  ]},{ops:[{type:'mechanism',pin:{tags:['pin']},
    hinges:[{line:{through:reverse?['T','B']:['B','T']},degrees:90*sign}]}]}]};
}
function build(options) {
  const model=buildModel(fixture(options)),info=inspectModel(model);
  return {info,record:info.raw[1].groups[0].records[0]};
}
const baselines=new Map();
function baseline(options) {
  const key=JSON.stringify(options);
  if(!baselines.has(key)) baselines.set(key,build(options));
  return baselines.get(key);
}
function congruent(a,b) {
  assert.equal(a.record.mechanism.path.core.hinges[0].degrees,b.record.mechanism.path.core.hinges[0].degrees);
  for(const t of [0,.001,.13,.5,.77,.999,1]) {
    const pa=a.info.pose(1,t),pb=b.info.pose(1,t);
    assert.equal(pa.p.length,pb.p.length);
    for(let i=0;i<pa.p.length;i++) for(let j=0;j<i;j++)
      assert.ok(Math.abs(distance(pa.p[i],pa.p[j])-distance(pb.p[i],pb.p[j]))<=1e-9);
    for(const value of [a,b]) {
      const pose=value.record.mechanism.path.at(t);
      assert.ok(pose.closure<=1e-9);assert.ok(pose.residual<=1e-9);
    }
    // Layer sidedness must follow the material front even after it turns over.
    for(const [i,tri] of a.info.fine.triangles.entries()) {
      const normal=p=>unit(cross(sub(p[tri.v[1]],p[tri.v[0]]),sub(p[tri.v[2]],p[tri.v[0]])));
      assert.ok(Math.abs(dot(pa.offsets[i],normal(pa.p))-dot(pb.offsets[i],normal(pb.p)))<=1e-9);
    }
  }
}
for(const [name,axis] of [['x',['BL','B']],['z',['B','T']],['oblique',['BL','T']]])
  for(const angle of [90,180,-90]) test(`mechanism: ${name} rotation ${angle} preserves opening and closure`,()=>{
    for(const gap of [.004,0]) for(const mode of ['valley','mountain'])
      for(const reverse of [false,true]) for(const preTurn of [false,true]) for(const turn of [undefined,'horizontal']) {
        const options={gap,mode,reverse,preTurn,turn};
        congruent(baseline(options),build({...options,axis,angle}));
      }
  });
for(const turn of ['vertical','horizontal']) test(`mechanism: ${turn} turn preserves the signed opening`,()=>{
  for(const gap of [.004,0]) for(const mode of ['valley','mountain']) for(const preTurn of [false,true]) {
    const options={gap,mode,preTurn};
    congruent(baseline(options),build({...options,turn}));
  }
});
test('mechanism: a temporary crease restores unit-gap layer order and leaves its snapshot intact',()=>{
  const s=createSheet({width:1,height:1});
  applyOp(s,{type:'fold',line:{through:['B','T']},moving:'BR',mode:'valley'},0);
  const before=cloneSheet(s),order=before.triangles.map(t=>t.layerOrder.slice());
  applyOp(s,{type:'crease',line:{through:['B','T']},moving:'BR',mode:'mountain'},0);
  assert.deepEqual(s.triangles.map(t=>t.layerOrder),order);
  applyOp(s,{type:'hinge',axis:{through:['B','T']},degrees:90},0);
  assert.deepEqual(before.triangles.map(t=>t.layerOrder),order);
});
