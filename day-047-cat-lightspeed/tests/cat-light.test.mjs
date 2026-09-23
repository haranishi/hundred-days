import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catEmissiveIntensity,catLightAppearance } from '../lib/cat-light.js';
// v2 fixed the caps (emissive 0.16, halo 0.24, whitening 18%). v3 lets the cat turn into light,
// so only the ranges stay here; the v3 whitening schedule lives in v3-light.test.mjs.
const odd=[-Infinity,-1,0,.55,.7,.9,.99,.999,1,2,Infinity,NaN];
test('発光と白化はどんな入力でも有限で、発光は0以上・白化は0〜1',()=>{
  for(const level of odd)for(const ratio of odd){
    const emissive=catEmissiveIntensity(level,ratio),whiten=catLightAppearance(level,ratio).whiten;
    assert.ok(Number.isFinite(emissive)&&emissive>=0,JSON.stringify({level,ratio,emissive}));
    assert.ok(Number.isFinite(whiten)&&whiten>=0&&whiten<=1,JSON.stringify({level,ratio,whiten}));
  }
});
test('止まっているとき（level 0・光速比0）は発光も白化もしない',()=>{
  assert.equal(catEmissiveIntensity(0),0);assert.equal(catEmissiveIntensity(0,0),0);
  assert.equal(catLightAppearance(0,0).whiten,0);
});
