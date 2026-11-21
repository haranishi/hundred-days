import test from 'node:test';
import assert from 'node:assert/strict';
import { CURVE_INFO, TOOL_IDS } from '../../lib/contract.js';
import { buildKnife, knifePose } from '../../lib/knife.js';
import aji from '../../lib/procedures/aji.js';
import { fakeAnatomy as anatomy } from '../fixtures/fake-anatomy.js';

const sub = (a, b) => a.map((x, k) => x - b[k]);
const dot = (a, b) => a.reduce((s, x, k) => s + x * b[k], 0);
const cross = ([a, b, c], [x, y, z]) => [b*z - c*y, c*x - a*z, a*y - b*x];
const length = v => Math.hypot(...v);
const unit = v => v.map(x => x / length(v));
const distance = (a, b) => length(sub(a, b));
const near = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `${a} と ${b}`);
const vecNear = (a, b, eps) => a.forEach((x, k) => near(x, b[k], eps));

function rotate(q, v) {
  const xyz = q.slice(0, 3);
  const c = cross(xyz, v).map(x => 2 * x);
  const d = cross(xyz, c);
  return v.map((x, k) => x + q[3] * c[k] + d[k]);
}

// 実装の弧長表を使わず、一端から線分を測り直して正解の接触点を作る。
function track(curve, side) {
  const points = anatomy.curve(curve, side).points;
  const lengths = points.slice(1).map((p, i) => distance(p, points[i]));
  const total = lengths.reduce((a, b) => a + b, 0);
  function at(t) {
    let d = total * t;
    for (let i = 0; i < lengths.length; i++) {
      if (d <= lengths[i]) return points[i].map((x, k) => x + (points[i + 1][k] - x) * d / lengths[i]);
      d -= lengths[i];
    }
    return points.at(-1);
  }
  return { total, at };
}

test('アジの全ての切りで101時点の接触点が弧長に一致し、位置と向きが連続する', () => {
  for (const cut of aji.steps.flatMap(step => step.cuts ?? [])) {
    const guide = track(cut.curve, cut.side);
    let prev;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100, blade = knifePose(anatomy, cut, t);
      assert.ok([...blade.pos, ...blade.quat].every(Number.isFinite));
      vecNear(blade.pos, guide.at(t));
      near(length(blade.quat), 1);
      if (prev) {
        assert.ok(distance(prev.pos, blade.pos) <= guide.total * 0.010001, cut.curve);
        assert.ok(dot(blade.quat, prev.quat) > 0.93, cut.curve);
      }
      prev = blade;
    }
  }
});

test('全契約カーブで点と線だけの解剖も使え、弧長の両端で行き過ぎない', () => {
  const minimal = { point: anatomy.point, curve: anatomy.curve, SL: anatomy.SL };
  for (const [curve, info] of Object.entries(CURVE_INFO)) {
    for (const side of info.sides ? ['L', 'R'] : [null]) {
      const cut = { curve, side, motion: 'push', angleDeg: 0 };
      const path = anatomy.curve(curve, side).points;
      vecNear(knifePose(minimal, cut, -1).pos, path[0]);
      vecNear(knifePose(minimal, cut, 2).pos, path.at(-1));
      const blade = knifePose(minimal, cut, 0.4);
      near(length(blade.quat), 1);
      assert.deepEqual(knifePose(minimal, cut, 0.4), blade);
    }
  }
});

test('表面では立てた刃が接線と体表法線を含み、引く・押すと刃元・切っ先が入れ替わる', () => {
  const guide = track('dorsalCut', 'L');
  const t = unit(sub(guide.at(1), guide.at(0)));
  const n = anatomy.surface(0.5, 1.21).n;
  const x = [1, 0, 0], y = [0, 1, 0];
  for (const [motion, lead, forward] of [['pull', 'heel', -1], ['push', 'tip', 1], ['press', 'mid', 1], ['pull', undefined, -1]]) {
    const cut = { curve: 'dorsalCut', side: 'L', tool: 'deba', motion, lead, angleDeg: 0 };
    const q = knifePose(anatomy, cut, 0.5).quat;
    near(dot(rotate(q, x), t), forward);
    vecNear(rotate(q, y), n);
    cut.angleDeg = 25;
    const tilted = knifePose(anatomy, cut, 0.5).quat;
    near(dot(rotate(tilted, y), n), Math.cos(25 * Math.PI / 180));
    near(dot(rotate(tilted, [0, -1, 0]), n), -Math.cos(25 * Math.PI / 180));
  }
});

test('うろこ取りは峰が先行し、寝かせた峰が表面から指定の角度で上がる', () => {
  const angle = 12, curve = 'scaleSweep';
  const t = [-1, 0, 0], n = anatomy.surface(0.5, 0.12).n;
  const q = knifePose(anatomy, { curve, side: 'L', tool: 'scaler', motion: 'scrape', angleDeg: angle }, 0.5).quat;
  const spine = rotate(q, [0, 1, 0]);
  near(dot(spine, t), Math.cos(angle * Math.PI / 180));
  near(dot(spine, n), Math.sin(angle * Math.PI / 180));
});

test('内側では切っ先が接線を向き、腹骨の刃先は腹側、中骨沿いの刃先は背側を向く', () => {
  for (const side of ['L', 'R']) {
    for (const curve of ['boneCut', 'ribStrip']) {
      const guide = track(curve, side);
      const tangent = unit(sub(guide.at(1), guide.at(0)));
      const q = knifePose(anatomy, { curve, side, tool: 'deba', motion: 'slice', lead: 'heel', angleDeg: 8 }, 0.3).quat;
      vecNear(rotate(q, [1, 0, 0]), tangent);
      const edge = rotate(q, [0, -1, 0]);
      assert.ok(curve === 'ribStrip' ? edge[1] < -0.9 : edge[1] > 0.9);
      near(edge[2], (side === 'L' ? 1 : -1) * Math.sin(8 * Math.PI / 180));
    }
    const q = knifePose(anatomy, { curve: 'pinBoneLine', side, tool: 'tweezers', motion: 'pluck', angleDeg: 23 }, 0.5).quat;
    const handle = rotate(q, [-1, 0, 0]);
    assert.ok(handle[0] < -0.9);
    assert.ok(side === 'L' ? handle[2] < 0 : handle[2] > 0);
  }
});

function vertices(geometry) {
  const p = geometry.getAttribute('position');
  return Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)]);
}

function geometryCheck(geometry, name) {
  const p = vertices(geometry), normal = geometry.getAttribute('normal');
  assert.equal(normal.count, p.length);
  p.forEach((v, i) => {
    assert.ok(v.every(Number.isFinite), name);
    near(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)), 1, 1e-5);
  });
  const indices = geometry.index?.array ?? p.map((_, i) => i);
  const edges = new Map();
  const keys = p.map(v => v.map(x => Math.round(x * 1e5)).join(','));
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
    assert.ok(length(cross(sub(p[b], p[a]), sub(p[c], p[a]))) > 1e-9, name);
    volume += dot(p[a], cross(p[b], p[c])) / 6;
    for (const [j, k] of [[a, b], [b, c], [c, a]]) {
      const dir = keys[j] < keys[k] ? 1 : -1;
      const key = dir === 1 ? keys[j] + '/' + keys[k] : keys[k] + '/' + keys[j];
      const e = edges.get(key) ?? { count: 0, balance: 0 };
      e.count++;
      e.balance += dir;
      edges.set(key, e);
    }
  }
  assert.ok(volume > 0, name + ' の体積');
  for (const e of edges.values()) assert.deepEqual(e, { count: 2, balance: 0 }, name + ' の辺');
  return indices.length / 3;
}

test('7種の道具の模型は法線・正の体積・閉じた面を持ち、外接箱が実寸の範囲で各3,000三角形以内', () => {
  for (const tool of TOOL_IDS) {
    const g = buildKnife(tool);
    assert.equal(g.isGroup, true);
    assert.equal(g.userData.tool, tool);
    g.updateMatrixWorld(true);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    let triangles = 0;
    g.traverse(m => {
      if (!m.isMesh) return;
      triangles += geometryCheck(m.geometry, tool + '/' + m.name);
      const mat = m.matrixWorld.elements;
      for (const [x, y, z] of vertices(m.geometry)) {
        for (let k = 0; k < 3; k++) {
          const v = mat[k] * x + mat[k + 4] * y + mat[k + 8] * z + mat[k + 12];
          lo[k] = Math.min(lo[k], v);
          hi[k] = Math.max(hi[k], v);
        }
      }
    });
    assert.ok(triangles > 0 && triangles <= 3000, tool);
    const [lengthCm, height, width] = sub(hi, lo);
    const range = { deba: [26, 31], yanagi: [35, 40], petty: [22, 26], shears: [12, 18], tweezers: [8, 11], scaler: [14, 18], thumb: [5, 7] }[tool];
    assert.ok(lengthCm >= range[0] && lengthCm <= range[1], tool);
    assert.ok(height > 0.5 && height < 7 && width > 0.25 && width < 3, tool);
  }
  assert.throws(() => buildKnife('spoon'), RangeError);
});

test('3種類の刃は指定の刃渡りと高さ、原点で交わる両面の面取り、木柄・口金・鋲を持つ', () => {
  for (const [tool, length, height] of [['deba', 16, 5], ['yanagi', 24, 3.2], ['petty', 13, 2.6]]) {
    const g = buildKnife(tool), blade = g.getObjectByName('blade');
    const geo = blade.geometry;
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    near(box.min.x, -length / 2); near(box.max.x, length / 2);
    near(box.min.y, 0); near(box.max.y, height, 1e-6);
    assert.ok(box.min.z < 0 && box.max.z > 0);
    const v = vertices(geo).filter(p => p[0] === 0);
    assert.ok(v.some(p => p[1] === 0 && p[2] === 0));
    for (const side of [-1, 1]) assert.ok(v.some(p => p[1] > 0 && p[1] < height / 2 && side * p[2] > 0));
    assert.ok(blade.material.every(m => m.metalness > 0.7));
    assert.ok(g.getObjectByName('handle').material.roughness > blade.material[0].roughness);
    assert.ok(g.getObjectByName('ferrule'));
    assert.equal(g.children.filter(m => m.name === 'rivet').length, 2);
  }
});
