import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MISSING_COLOR, fitProjection, nearestCode, rampColor, rankRatio } from '../lib/map.js';

const POINTS = {
  a: [130, 30],   // 南西
  b: [140, 40],   // 北東
  c: [135, 35],   // まんなか
};

describe('投影', () => {
  it('全点がキャンバスの内側に収まり、北ほど上・東ほど右', () => {
    const { toXY } = fitProjection(POINTS, 400, 400, 10);
    const [ax, ay] = toXY(...POINTS.a);
    const [bx, by] = toXY(...POINTS.b);
    for (const v of [ax, ay, bx, by]) assert.ok(v >= 0 && v <= 400);
    assert.ok(bx > ax, '東が右');
    assert.ok(by < ay, '北が上');
  });
  it('縦長キャンバスでも横長キャンバスでも比率を保つ（引き伸ばさない）', () => {
    const p1 = fitProjection(POINTS, 800, 400);
    const p2 = fitProjection(POINTS, 400, 800);
    const d = (proj) => {
      const [ax, ay] = proj.toXY(...POINTS.a);
      const [bx, by] = proj.toXY(...POINTS.b);
      return (bx - ax) / (ay - by);
    };
    assert.ok(Math.abs(d(p1) - d(p2)) < 1e-9);
  });
});

describe('順位→色', () => {
  it('1位が1.0・最下位が0.0・中間は比例', () => {
    assert.equal(rankRatio(1, 1741), 1);
    assert.equal(rankRatio(1741, 1741), 0);
    assert.ok(Math.abs(rankRatio(871, 1741) - 0.5) < 0.001);
    assert.equal(rankRatio(null, 1741), null);
  });
  it('色は両端で止まり、nullはnull・欠測はグレー定数', () => {
    assert.equal(rampColor(0), 'rgb(207, 224, 214)');
    assert.equal(rampColor(1), 'rgb(18, 53, 44)');
    assert.equal(rampColor(1.5), 'rgb(18, 53, 44)');
    assert.equal(rampColor(null), null);
    assert.match(MISSING_COLOR, /^rgba?\(/);
  });
  it('こい方が必ず暗い（単一色相・明→暗の並び）', () => {
    const luma = (css) => {
      const [r, g, b] = css.match(/\d+/g).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    let prev = Infinity;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const l = luma(rampColor(t));
      assert.ok(l < prev, `t=${t}で明るさが逆転`);
      prev = l;
    }
  });
});

describe('タップ判定', () => {
  it('しきい値内の最近傍を返し、遠ければnull', () => {
    const xy = new Map([['a', [100, 100]], ['b', [200, 200]]]);
    assert.equal(nearestCode(xy, 104, 103, 12), 'a');
    assert.equal(nearestCode(xy, 150, 150, 12), null);
  });
});
