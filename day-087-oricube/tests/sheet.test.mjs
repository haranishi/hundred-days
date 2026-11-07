import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheet,splitLine,paperPoint} from '../lib/sheet.js';
import {distance,rotate,signedArea,overlapArea} from '../lib/math.js';
test('initial mesh has shared vertices, front up and rotated paper coordinates',()=>{
  const s=createSheet({width:1,height:1,rotationDeg:45});
  assert.equal(s.vertices.length,4);
  assert.deepEqual(s.triangles.map(t=>t.v),[[0,1,2],[0,2,3]]);
  assert.ok(Math.abs(paperPoint(s,[0,0])[0])<1e-9);
  assert.ok(paperPoint(s,[0,0])[2]>.7);
});
test('line cutting conserves UV area and welds intersections across triangles',()=>{
  const s=createSheet({width:1,height:1});
  splitLine(s,[0,0],[0,1]);
  assert.equal(s.vertices.length,7);
  assert.equal(s.triangles.length,6);
  const area=s.triangles.reduce((a,t)=>a+signedArea(t.v.map(i=>s.vertices[i].uv)),0);
  assert.ok(Math.abs(area-1)<1e-12);
  assert.equal(s.vertices.filter(v=>distance(v.uv,[.5,.5])<1e-9).length,1);
});
test('marks use barycentric UV coordinates after cutting and rigid motion',()=>{
  const s=createSheet({width:1,height:1});
  splitLine(s,[0,0],[0,1]);
  for(const v of s.vertices) if(v.p[0]>0) v.p=rotate(v.p,[0,0,0],[0,0,1],Math.PI/2);
  assert.ok(distance(paperPoint(s,[.75,.25]),[0,.25,.25])<1e-12);
});
test('overlap uses polygon area rather than bounding boxes or edge contacts',()=>{
  const a=[[0,0],[1,0],[0,1]];
  assert.equal(overlapArea(a,[[1,0],[1,1],[0,1]]),0);
  assert.ok(Math.abs(overlapArea(a,a)-.5)<1e-12);
});
