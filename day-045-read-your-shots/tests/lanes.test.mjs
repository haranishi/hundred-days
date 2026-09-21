import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../lib/lanes.js';
const heat = (lane, n) => Array.from({length:12}, (_, i) => i === lane ? n : 0);
test('12レーンの両端と境界', () => { assert.equal(L.laneAt(-1),0); assert.equal(L.laneAt(40),1); assert.equal(L.laneAt(480),11); });
test('居場所は50標本まで', () => { let h=[]; for(let i=0;i<60;i++) h=L.rememberPosition(h,i); assert.equal(h.length,50); assert.equal(h[0],10); });
test('未発射・開始直後は熱も読まれ度も0', () => { assert.equal(L.readLevel([]),0); assert.deepEqual(L.heatOf([]),Array(12).fill(0)); });
test('生の熱1で読まれ度10、上限6で正規化熱1、位置集中込みで100', () => { assert.equal(L.readLevel(heat(4,1)),10); assert.equal(L.heatOf(heat(4,6))[4],1); assert.equal(L.readLevel(heat(4,8),Array(15).fill(180)),100); });
test('移動して撃ち分けると集中連射より低い', () => { assert.ok(L.readLevel(Array(12).fill(1),[24,456,24,456]) < L.readLevel(heat(4,8),Array(15).fill(180))); });
test('時定数3秒で熱が減衰し読まれ度が下がる', () => { const h=heat(4,6), next=L.decayHeat(h,3); assert.equal(next[4],6*Math.exp(-1)); assert.ok(L.readLevel(next)<L.readLevel(h)); });
test('位置集中は標準偏差と15標本の立ち上がり', () => { assert.equal(L.posConcentration([]),0); assert.equal(L.posConcentration([200]),1/15); assert.equal(L.posConcentration(Array(15).fill(200)),1); assert.equal(L.posConcentration([90,390]),0); assert.equal(L.posConcentration([165,315]),.5*2/15); });
test('予測位置は実座標の減衰重心', () => { assert.equal(L.predictedX([],123),123); assert.ok(L.predictedX([40,440])>240); assert.ok(Math.abs(L.predictedX([120,120])-120)<1e-10); });
test('ひるみ確率は0.15から0.75', () => { assert.equal(L.flinchProbability(0),.15); assert.equal(L.flinchProbability(1),.75); });
test('講評は最大熱・居場所・動きの少なさ', () => { assert.deepEqual([0,3,5,8,11].map(L.laneName),['左端','左','中央','右','右端']); assert.equal(L.review(heat(11,2),Array(15).fill(450)),'右端から撃ちすぎ。居場所も右端寄りで、動きが少ない。'); assert.match(L.review([],[]),/撃ち癖はまだ薄い/); assert.doesNotMatch(L.review(heat(3,1),[24,456]),/動きが少ない/); });
test('読まれ度の危険域は40/70/90で切り替わる', () => { assert.deepEqual([0,39,40,69,70,89,90,100].map(L.readBand),['calm','calm','warm','warm','hot','hot','critical','critical']); });

test('同じ場所に居続けた熱いレーンはボーナスにならない', () => {
  assert.equal(L.outsmarted(L.heatOf(heat(3,6)),3),false);
});
test('熱い場所から離れたレーンは最大熱の半分未満ならボーナス', () => {
  const h=heat(3,1);h[4]=.4;
  assert.equal(L.outsmarted(h,4),true);
  h[4]=.5;assert.equal(L.outsmarted(h,4),false);
});
test('開始直後の全レーン0ではボーナスにならない', () => {
  for(let lane=0;lane<12;lane++)assert.equal(L.outsmarted(Array(12).fill(0),lane),false);
});
