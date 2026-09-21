import test from 'node:test';
import assert from 'node:assert/strict';
import { heatRgb, heatFill, heatContrast, contrastRatio, relativeLuminance, BACKDROP } from '../lib/heat-color.js';
test('輝度の計算が既知の値と合う', () => {
  assert.equal(relativeLuminance([255, 255, 255]), 1);
  assert.equal(relativeLuminance([0, 0, 0]), 0);
  assert.ok(Math.abs(contrastRatio([255, 255, 255], [0, 0, 0]) - 21) < 1e-9);
});
test('熱0.3で背景比3以上、熱1.0で8以上', () => {
  assert.ok(heatContrast(.3) >= 3, String(heatContrast(.3)));
  assert.ok(heatContrast(1) >= 8, String(heatContrast(1)));
  // キャンバスの素の地色（背景画像が無い側）でも下回らない。
  assert.ok(heatContrast(.3, [9, 20, 38]) >= 3);
  assert.ok(heatContrast(1, [9, 20, 38]) >= 8);
});
test('熱が上がるほど輝度も上がる', () => {
  const steps = [0, .1, .3, .5, .7, 1].map(h => relativeLuminance(heatRgb(h)));
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] > steps[i - 1]);
  assert.ok(heatContrast(.5) > 3 && heatContrast(.4) > 3);
});
test('範囲外は両端に丸め、CSSの色として書ける', () => {
  assert.deepEqual(heatRgb(-1), heatRgb(0));
  assert.deepEqual(heatRgb(4), heatRgb(1));
  assert.deepEqual(heatRgb(NaN), heatRgb(0));
  assert.equal(heatFill(1), 'rgb(255,140,90)');
  assert.deepEqual(BACKDROP, [6, 11, 25]);
});
