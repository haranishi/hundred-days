import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng, hashString, mulberry32 } from '../../lib/rng.js';
import { fbm2, fbm3, hash3, tileNoise2, valueNoise2, valueNoise3 } from '../../lib/noise.js';
import { MAX_NODES, SAVE_NAME, validateLook, validateSkeleton } from '../../lib/contract.js';
import { makeSampleSkeleton } from '../fixtures/sample-skeleton.mjs';

test('乱数: 同じ種なら同じ列・違う種なら違う列・[0,1) の範囲', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  const c = mulberry32(8);
  const seqA = Array.from({ length: 50 }, a);
  assert.deepEqual(seqA, Array.from({ length: 50 }, b));
  assert.notDeepEqual(seqA, Array.from({ length: 50 }, c));
  assert.ok(seqA.every((v) => v >= 0 && v < 1));
});

test('乱数: fork は親の列を進めず、ラベルごとに独立し、同じラベルは同じ列', () => {
  const parent = createRng(123);
  const before = parent.state();
  const x1 = parent.fork('grow');
  const y = parent.fork('wind');
  assert.equal(parent.state(), before, 'fork が親の状態を動かした');
  const x2 = createRng(123).fork('grow');
  assert.equal(x1.next(), x2.next());
  assert.notEqual(createRng(123).fork('grow').next(), y.next());
  assert.notEqual(createRng(124).fork('grow').next(), createRng(123).fork('grow').next());
});

test('乱数: state / setState で途中から再開できる', () => {
  const r = createRng(99);
  r.next(); r.next();
  const saved = r.state();
  const expected = [r.next(), r.next(), r.next()];
  r.setState(saved);
  assert.deepEqual([r.next(), r.next(), r.next()], expected);
});

test('乱数: range・int・chance・pick・normal が範囲を守る', () => {
  const r = createRng(5);
  for (let i = 0; i < 500; i += 1) {
    const v = r.range(2, 3);
    assert.ok(v >= 2 && v < 3);
    const k = r.int(4, 6);
    assert.ok(Number.isInteger(k) && k >= 4 && k <= 6);
    assert.ok(['a', 'b'].includes(r.pick(['a', 'b'])));
  }
  const zs = Array.from({ length: 4000 }, () => r.normal());
  const mean = zs.reduce((s, v) => s + v, 0) / zs.length;
  assert.ok(Math.abs(mean) < 0.1, `平均 ${mean}`);
  assert.equal(r.chance(0), false);
  assert.equal(hashString('a'), hashString('a'));
  assert.notEqual(hashString('a'), hashString('b'));
});

test('ノイズ: 0〜1・決定的・連続（隣の点は近い値）', () => {
  for (let i = 0; i < 200; i += 1) {
    const x = i * 0.37;
    const y = i * 0.11;
    for (const v of [valueNoise2(x, y, 3), valueNoise3(x, y, x + y, 3), fbm2(x, y, 3), fbm3(x, y, x, 3), hash3(i, i + 1, 2, 3)]) {
      assert.ok(v >= 0 && v <= 1, `範囲外 ${v}`);
    }
    assert.equal(valueNoise2(x, y, 3), valueNoise2(x, y, 3));
    assert.ok(Math.abs(valueNoise2(x, y, 3) - valueNoise2(x + 1e-4, y, 3)) < 0.01);
  }
  assert.notEqual(valueNoise2(0.5, 0.5, 1), valueNoise2(0.5, 0.5, 2));
});

test('ノイズ: tileNoise2 は端がつながる（u=0 と u=1、v=0 と v=1 が同じ）', () => {
  for (let i = 0; i < 40; i += 1) {
    const t = i / 40;
    assert.ok(Math.abs(tileNoise2(0, t, 4, 9) - tileNoise2(1, t, 4, 9)) < 1e-9);
    assert.ok(Math.abs(tileNoise2(t, 0, 4, 9) - tileNoise2(t, 1, 4, 9)) < 1e-9);
  }
});

test('契約: 見本の骨格は契約を満たし、決まった種なら同じ', () => {
  const skel = makeSampleSkeleton({ seed: 4 });
  assert.deepEqual(validateSkeleton(skel), []);
  assert.ok(skel.count > 40 && skel.count <= MAX_NODES);
  assert.ok(skel.pads.count >= 5);
  assert.equal(skel.wires.length, 1);
  assert.deepEqual(makeSampleSkeleton({ seed: 4 }).start, skel.start);
  assert.notDeepEqual(makeSampleSkeleton({ seed: 5 }).end, skel.end);
});

test('契約: 壊れた骨格を、それぞれ見つける（変異）', () => {
  const broken = (edit) => { const s = makeSampleSkeleton({ seed: 2 }); edit(s); return validateSkeleton(s); };
  assert.ok(broken((s) => { s.parent[5] = 9; }).some((e) => /親が子より前/.test(e)));
  assert.ok(broken((s) => { s.parent[0] = 0; }).some((e) => /parent\[0\]/.test(e)));
  assert.ok(broken((s) => { s.start[3 * 4] += 0.5; }).some((e) => /ずれ/.test(e)));
  assert.ok(broken((s) => { s.quat[4 * 3 + 3] = 0.2; }).some((e) => /クォータニオン/.test(e)));
  assert.ok(broken((s) => { s.r1[2] = 0; }).some((e) => /半径/.test(e)));
  assert.ok(broken((s) => { s.r0[2] = s.r1[2] / 2; }).some((e) => /半径/.test(e)));
  assert.ok(broken((s) => { s.end[7] = NaN; }).some((e) => /有限/.test(e)));
  assert.ok(broken((s) => { s.flags[3] = 64; }).some((e) => /未知のビット/.test(e)));
  assert.ok(broken((s) => { s.ids[4] = s.ids[3]; }).some((e) => /重複/.test(e)));
  assert.ok(broken((s) => { s.pads.node[0] = 99999; }).some((e) => /pads\.node/.test(e)));
  assert.ok(broken((s) => { s.pads.density[0] = 2; }).some((e) => /density/.test(e)));
  assert.ok(broken((s) => { s.wires[0].nodes = Int32Array.from([0, 5]); }).some((e) => /一本の道/.test(e)));
  assert.ok(broken((s) => { s.ids = new Int32Array(3); }).some((e) => /ids/.test(e)));
  assert.ok(broken((s) => { s.chain[6] = s.chain[5]; s.chain[7] = s.chain[5]; s.parent[7] = 5; s.parent[6] = 5; }).length > 0);
  assert.ok(validateSkeleton(null).length > 0);
});

test('契約: 季節の見た目の検査と、保存名の約束', () => {
  const ok = { coverage: 1, flower: 0, bud: 0, fall: 0, petal: 0, leafAge: 0.5, color: [0.2, 0.5, 0.2], color2: [0.3, 0.6, 0.3], season: 'summer' };
  assert.deepEqual(validateLook(ok), []);
  assert.ok(validateLook({ ...ok, coverage: 1.2 }).length > 0);
  assert.ok(validateLook({ ...ok, season: 'x' }).length > 0);
  assert.ok(!/_KEY$/i.test(SAVE_NAME), 'localStorage の名前を `_KEY` で終えない');
});
