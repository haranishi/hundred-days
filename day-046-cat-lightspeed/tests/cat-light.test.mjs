import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAT_EMISSIVE_MAX,catEmissiveIntensity } from '../lib/cat-light.js';
test('猫の発光は全速度域と範囲外でも上限0.16を超えない',()=>{
  assert.equal(CAT_EMISSIVE_MAX,.16);
  for(const level of [-Infinity,-1,0,.55,.7,1,2,Infinity,NaN]){
    const value=catEmissiveIntensity(level);assert.ok(value>=0&&value<=.16);
  }
  for(let i=0;i<=1000;i++)assert.ok(catEmissiveIntensity(i/1000)<=.16);
});
test('低速では発光せず、高速では暖色を残す弱い発光にする',()=>{
  assert.equal(catEmissiveIntensity(0),0);assert.equal(catEmissiveIntensity(.55),0);
  assert.ok(catEmissiveIntensity(.8)>0);assert.equal(catEmissiveIntensity(1),.16);
});

import { CAT_WHITEN_MAX,CAT_HALO_OPACITY_MAX,CAT_HALO_SCALE_MAX,catLightAppearance } from '../lib/cat-light.js';
test('輪の不透明度0.24・倍率1.18・白寄せ18%を上限として固定する',()=>{
  assert.equal(CAT_WHITEN_MAX,.18);assert.equal(CAT_HALO_OPACITY_MAX,.24);assert.equal(CAT_HALO_SCALE_MAX,1.18);
  for(const value of [-Infinity,-1,0,.65,.99,1,2,Infinity,NaN]){
    const light=catLightAppearance(value,value);
    assert.ok(light.haloOpacity>=0&&light.haloOpacity<=.24);
    assert.ok(light.haloScale>=1&&light.haloScale<=1.18);
    assert.ok(light.whiten>=0&&light.whiten<=.18);
  }
});
test('白寄せは光速99%超で始まり、減速すれば元へ戻る',()=>{
  for(const ratio of [0,.9,.99])assert.equal(catLightAppearance(1,ratio).whiten,0);
  assert.ok(Math.abs(catLightAppearance(1,.995).whiten-.09)<1e-12);
  assert.equal(catLightAppearance(1,1).whiten,.18);
  assert.equal(catLightAppearance(1,.98).whiten,0);
  assert.deepEqual(catLightAppearance(0,0),{haloOpacity:0,haloScale:1,whiten:0});
  assert.deepEqual(catLightAppearance(1,1),{haloOpacity:.24,haloScale:1.18,whiten:.18});
});
