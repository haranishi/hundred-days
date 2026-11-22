import test from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR_NAMES, CURVE_INFO, CURVE_NAMES } from '../../lib/contract.js';
import { createAnatomy } from '../../lib/anatomy.js';
import aji from '../../lib/species/aji.js';

const a = createAnatomy(aji, { segments: 12 });
const near = (x, y, tol = 1e-7) => assert.ok(Math.abs(x - y) <= tol, `${x} ≠ ${y}`);
const dot = (a, b) => a.reduce((v, x, i) => v + x * b[i], 0);
const sub = (a, b) => a.map((x, i) => x - b[i]);

test('全目印が魚の内側にあり、標準体長と二叉の尾の先を区別できます', () => {
  for (const name of ANCHOR_NAMES) assert.ok(a.inside(a.point(name)), name);
  near(a.point('snout')[0], 0);
  near(a.point('peduncle')[0], a.SL);
  near(a.point('tailTip')[0], a.TL);
  assert.equal(a.inside([a.TL, 0, 0]), false);
  assert.equal(a.inside([-0.1, 0, 0]), false);
  assert.equal(a.inside([a.SL / 2, 0, 2]), false);
  const copy = a.point('eye');
  copy[0] = 0;
  assert.ok(a.point('eye')[0] > 0);
});

test('全カーブの内外・進行方向・左右と折れ線の長さが契約と一致します', () => {
  const backwards = ['scaleSweep', 'scuteRow', 'bellySlit', 'skinPeel'];
  for (const name of CURVE_NAMES) {
    const info = CURVE_INFO[name], sides = info.sides ? ['L', 'R'] : [null];
    for (const side of sides) {
      const { points, onSurface } = a.curve(name, side);
      assert.equal(onSurface, !info.inner);
      assert.ok(points.length >= 32);
      let length = 0;
      for (const [i, p] of points.entries()) {
        assert.ok(a.inside(p), `${name} ${p}`);
        if (i) length += Math.hypot(...sub(p, points[i - 1]));
        if (side) assert.ok(p[2] * (side === 'R' ? -1 : 1) >= -1e-8, name);
        const pr = a.profile(p[0] / a.SL), y = p[1] - pr.axisY, n = y >= 0 ? pr.nTop : pr.nBottom;
        const level = (Math.abs(y) / (y >= 0 ? pr.top : pr.bottom)) ** n + (Math.abs(p[2]) / pr.half) ** n;
        if (onSurface) near(level, 1);
        else assert.ok(level < 1, name);
      }
      assert.ok(length > 0.1, name);
      const first = points[0], last = points.at(-1);
      if (name === 'headCut' || name === 'tailCut') assert.ok(first[1] > last[1], name);
      else assert.ok((last[0] - first[0]) * (backwards.includes(name) ? -1 : 1) > 0, name);
    }
  }
});

test('頭の左右の切り線は背腹の目印を通る平面上にあります', () => {
  const plane = a.cutPlane('head');
  near(Math.hypot(...plane.normal), 1);
  near(a.point('headCutTop')[0] / a.SL, 0.285);
  near(a.point('headCutBottom')[0] / a.SL, 0.235);
  for (const side of ['L', 'R']) {
    const {points} = a.curve('headCut', side);
    for (const p of points) near(dot(sub(p, plane.point), plane.normal), 0);
    near(Math.hypot(...sub(points[0], a.point('headCutTop'))), 0);
    near(Math.hypot(...sub(points.at(-1), a.point('headCutBottom'))), 0);
  }
});

test('表面の法線は接線に直交し、外側を向きます', () => {
  for (const s of [0.002, 0.07, 0.23, 0.40, 0.67, 0.97]) {
    for (let i = 0; i < 32; i++) {
      const phi = i * Math.PI / 16, { p, n } = a.surface(s, phi);
      near(Math.hypot(...n), 1);
      const tangent = sub(a.surface(s, phi + 1e-5).p, a.surface(s, phi - 1e-5).p);
      near(dot(n, tangent) / Math.hypot(...tangent), 0, 1e-5);
      assert.ok(!a.inside(p.map((v, j) => v + 0.002 * n[j])));
    }
  }
});

test('背・腹・体幅の輪郭は尾柄への変曲点を滑らかに通ります', () => {
  for (const phi of [0, Math.PI / 2, -Math.PI / 2]) {
    const angles = Array.from({length: 970}, (_, i) => Math.asin(a.surface((i + 30) / 1000, phi).n[0]) * 180 / Math.PI);
    const peak = angles.indexOf(Math.max(...angles));
    assert.ok(peak > 560 && peak < 750);
    let extremum = angles[0];
    for (let i = 1; i < angles.length; i++) {
      // 駅をまたぐ接線の折れと、緩い変曲点に生じる細かな補間のうねりを別々に測ります。
      assert.ok(Math.abs(angles[i] - angles[i-1]) < 0.5);
      if (i <= peak) { extremum = Math.max(extremum, angles[i]); assert.ok(extremum - angles[i] < 0.25); }
      else { extremum = Math.min(extremum, angles[i]); assert.ok(angles[i] - extremum < 0.25); }
    }
  }
  const pr = a.profile(0.40);
  assert.ok(pr.half * 2 / (pr.top + pr.bottom) > 0.45 && pr.half * 2 / (pr.top + pr.bottom) < 0.50);
});
