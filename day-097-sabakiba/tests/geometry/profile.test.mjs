import test from 'node:test';
import assert from 'node:assert/strict';
import { pchip, profileFromKeyMeasures, makeProfile } from '../../lib/profile.js';

test('不等間隔の補間が各駅を通り、平坦部と極値を越えません', () => {
  const xs = [0, 0.04, 0.45, 0.51, 1], ys = [1, 4, 4, -2, 2];
  const at = pchip(xs, ys);
  xs.forEach((x, i) => assert.equal(at(x), ys[i]));
  for (let i = 1; i < xs.length; i++) {
    for (let k = 1; k < 100; k++) {
      const value = at(xs[i - 1] + k / 100 * (xs[i] - xs[i - 1]));
      assert.ok(value >= Math.min(ys[i], ys[i - 1]) - 1e-12 && value <= Math.max(ys[i], ys[i - 1]) + 1e-12);
    }
  }
  assert.equal(pchip([1, 3], [2, 6])(2), 4);
});

test('紡錘形の体高・体幅は指定位置で一度だけ最大になり、吻は平方根状に始まります', () => {
  const profile = makeProfile({ maxDepth: 25.1, maxDepthPos: 40, maxWidth: 12, peduncleDepth: 4, belly: 0.9 }, 'round', 20);
  const at = s => profile(s).top + profile(s).bottom;
  assert.ok(Math.abs(at(0.40) - 5.02) < 1e-12);
  assert.ok(Math.abs(profile(0.36).half - 1.2) < 1e-12);
  assert.ok(Math.abs(at(1) - 0.8) < 1e-12);
  assert.equal(at(0), 0);
  assert.ok(Math.abs(at(0.000004) / at(0.000001) - 2) < 0.01);
  for (let i = 1; i <= 1000; i++) {
    const s = i / 1000;
    assert.ok((at(s) - at(s - 0.001)) * (i <= 400 ? 1 : -1) >= -1e-12);
    assert.ok((profile(s).half - profile(s - 0.001).half) * (i <= 360 ? 1 : -1) >= -1e-12);
  }
  // 頭が肩より膨らまず、断面の変化が隣の駅で折れません。
  assert.ok(at(0.117) / at(0.40) < 0.68);
  for (const {s} of profileFromKeyMeasures({})) {
    if (s < 0.01 || s > 0.99) continue;
    const h = 1e-6;
    assert.ok(Math.abs(at(s + h) + at(s - h) - 2 * at(s)) / h < 0.01);
  }
});

test('平たい魚の既定値は体高45%・半厚3%で、断面の指数を使い分けます', () => {
  const stations = profileFromKeyMeasures({}, 'flat');
  assert.ok(Math.abs(Math.max(...stations.map(p => p.top + p.bottom)) - 0.45) < 1e-12);
  assert.equal(Math.max(...stations.map(p => p.half)), 0.03);
  assert.equal(stations[0].nTop, 2);
  assert.equal(stations.at(-1).nBottom, 2.6);
});
