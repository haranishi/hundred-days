import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheet,cloneSheet,splitLine,locate,makeLocator} from '../lib/sheet.js';
import {VERTEX_EPS} from '../lib/math.js';

function same(sheet,points) {
  const indexed=makeLocator(sheet);
  for(const uv of points) {
    let expected;
    try {expected=locate(sheet,uv);} catch {
      assert.throws(()=>indexed(uv),/Point outside paper/);continue;
    }
    const actual=indexed(uv);
    assert.equal(actual.tri,expected.tri,`triangle at ${uv}`);
    assert.deepEqual(actual.w,expected.w,`weights at ${uv}`);
  }
}
test('locator preserves source order and exact weights at cuts, vertices and tolerated edges',()=>{
  const sheet=createSheet({width:1,height:1});
  for(let k=1;k<10;k++) {
    splitLine(sheet,[k/10-.5,0],[0,1]);
    splitLine(sheet,[0,k/10-.5],[1,0]);
  }
  const points=sheet.vertices.map(v=>v.uv);
  for(const tri of sheet.triangles) for(let k=0;k<3;k++) {
    const a=sheet.vertices[tri.v[k]].uv,b=sheet.vertices[tri.v[(k+1)%3]].uv;
    const mid=a.map((v,i)=>(v+b[i])/2);
    points.push(mid,...[-1,1].map(sign=>mid.map(v=>v+sign*VERTEX_EPS/100)));
  }
  for(let i=0;i<=40;i++) for(let j=0;j<=40;j++) points.push([i/40,j/40]);
  points.push([-.25,.5],[1.25,.5],[.5,-.25],[.5,1.25],[-VERTEX_EPS/2,.5],
    [1+VERTEX_EPS/2,.5],[NaN,0],[Infinity,0]);
  same(cloneSheet(sheet),points);
});
test('locator handles winding, overlapping ties and degenerate triangles without changing selection',()=>{
  const sheet=createSheet({width:2,height:3});
  sheet.triangles.unshift({...sheet.triangles[0],v:[0,0,1]});
  sheet.triangles[1].v.reverse();
  sheet.triangles.push({...sheet.triangles[1],v:sheet.triangles[1].v.slice()});
  same(sheet,[[0,0],[1,1.5],[2,3],[1,.1],[.1,2],[-1e-10,1],[2.1,3.1]]);
});
test('locator on a clone remains valid when the working sheet is cut and moved',()=>{
  const sheet=createSheet({width:1,height:1}),snapshot=cloneSheet(sheet),indexed=makeLocator(snapshot);
  const expected=locate(snapshot,[.5,.5]);
  splitLine(sheet,[0,0],[0,1]);sheet.vertices[0].uv[0]=10;
  assert.deepEqual(indexed([.5,.5]),expected);
});
