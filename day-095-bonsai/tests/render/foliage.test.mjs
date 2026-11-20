import { GFX_TIERS } from '../../lib/gfx.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_LEAF_CARDS,
  PAD_FLAT,
  applyLookColors,
  capBudgets,
  cardAppear,
  cardBudget,
  cardScale,
  leafCardGeometry,
  planFoliage,
  quatFromBasis,
  rotateQuat,
  visibleCardCount,
} from '../../lib/foliage.js';
import { makeSampleSkeleton } from '../fixtures/sample-skeleton.mjs';

const autumn = {
  coverage: 1, flower: 0, bud: 0, fall: 0.2, petal: 0, leafAge: 0.8,
  color: [0.85, 0.27, 0.16], color2: [0.88, 0.47, 0.16], season: 'autumn',
};

test('葉の板は中央が膨らみ、法線が一つに揃わない', () => {
  const geo = leafCardGeometry();
  assert.equal(geo.indices.length % 3, 0);
  let maxZ = -Infinity;
  let edgeZ = Infinity;
  const cols = 4;
  for (let i = 0; i < geo.positions.length / 3; i += 1) {
    const z = geo.positions[i * 3 + 2];
    const x = geo.positions[i * 3];
    maxZ = Math.max(maxZ, z);
    if (Math.abs(x) > 0.4) edgeZ = Math.min(edgeZ, z);
    assert.ok(Number.isFinite(geo.normals[i * 3]));
  }
  assert.ok(maxZ > edgeZ + 0.05, '板が平ら');
  const n0 = [geo.normals[0], geo.normals[1], geo.normals[2]];
  const mid = Math.floor(geo.positions.length / 6);
  const n1 = [geo.normals[mid * 3], geo.normals[mid * 3 + 1], geo.normals[mid * 3 + 2]];
  const dot = n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2];
  assert.ok(dot < 0.995, '法線が全部平行');
});

test('クォータニオンは +Z を指定した軸へ送る', () => {
  const q = quatFromBasis(1, 0, 0, 0, 0, 1, 0, -1, 0);
  const z = rotateQuat(q, [0, 0, 1]);
  assert.ok(Math.abs(z[0] - 0) < 1e-6 && Math.abs(z[1] + 1) < 1e-6 && Math.abs(z[2]) < 1e-6, JSON.stringify(z));
  const id = quatFromBasis(1, 0, 0, 0, 1, 0, 0, 0, 1);
  const p = rotateQuat(id, [0.2, -0.4, 0.5]);
  assert.ok(Math.abs(p[0] - 0.2) < 1e-6 && Math.abs(p[1] + 0.4) < 1e-6 && Math.abs(p[2] - 0.5) < 1e-6);
});

test('枚数: 基準半径で画質どおり、低画質は半分、全体は 6000 以下、density 0 は 0', () => {
  assert.equal(GFX_TIERS.low.padCards * 2, GFX_TIERS.high.padCards);
  assert.equal(GFX_TIERS.test.padCards, 6);
  assert.equal(PAD_FLAT, 0.45);
  assert.equal(cardBudget(0.36, 1, 'high'), GFX_TIERS.high.padCards);
  assert.equal(cardBudget(0.36, 1, 'mid'), GFX_TIERS.mid.padCards);
  assert.equal(cardBudget(0.36, 1, 'low'), GFX_TIERS.low.padCards);
  assert.equal(cardBudget(0.36, 1, 'test'), GFX_TIERS.test.padCards);
  assert.equal(cardBudget(0.36, 0, 'high'), 0);
  assert.ok(cardBudget(0.5, 1, 'high') >= cardBudget(0.3, 1, 'high'));
  assert.ok(cardBudget(0.36, 1, 'high') >= 60 && cardBudget(0.36, 1, 'high') <= 130);
  const capped = capBudgets(Array.from({ length: 400 }, () => GFX_TIERS.high.padCards), MAX_LEAF_CARDS);
  assert.ok(capped.reduce((s, n) => s + n, 0) <= MAX_LEAF_CARDS);
  assert.ok(capped.some((n) => n < GFX_TIERS.high.padCards));
  const skel = makeSampleSkeleton({ seed: 4 });
  const plan = planFoliage(skel, autumn, { gfx: 'high', species: 'maple' });
  assert.ok(plan.count > 0 && plan.count <= MAX_LEAF_CARDS);
  assert.equal(planFoliage(skel, autumn, { gfx: 'test' }).count < plan.count, true);
  skel.pads.density.fill(0);
  assert.equal(planFoliage(skel, autumn, { gfx: 'high' }).count, 0);
});

test('配置: 扁平な体積・外向き・同じ種なら同じ位置。殻や球にすると落ちる', () => {
  const skel = makeSampleSkeleton({ seed: 6 });
  const a = planFoliage(skel, autumn, { gfx: 'test', species: 'maple' });
  const b = planFoliage(skel, autumn, { gfx: 'test', species: 'maple' });
  assert.deepEqual(a.position, b.position);
  let axial = 0;
  let lateral = 0;
  let outward = 0;
  let inner = 0;
  let upper = 0;
  let lower = 0;
  for (let i = 0; i < a.count; i += 1) {
    const p = a.padIndex[i];
    const cx = skel.pads.center[p * 3];
    const cy = skel.pads.center[p * 3 + 1];
    const cz = skel.pads.center[p * 3 + 2];
    const ox = a.position[i * 3] - cx;
    const oy = a.position[i * 3 + 1] - cy;
    const oz = a.position[i * 3 + 2] - cz;
    const radius = skel.pads.radius[p];
    const nx = skel.pads.normal[p * 3];
    const ny = skel.pads.normal[p * 3 + 1];
    const nz = skel.pads.normal[p * 3 + 2];
    const along = ox * nx + oy * ny + oz * nz;
    axial += Math.abs(along);
    const lx = ox - nx * along;
    const ly = oy - ny * along;
    const lz = oz - nz * along;
    const side = Math.hypot(lx, ly, lz);
    lateral += side;
    assert.ok(side <= radius * 1.22, '水平方向にはみ出す');
    assert.ok(Math.abs(along) <= radius * 0.7, '高さが雲を超える');
    if (side < radius * 0.55) inner += 1;
    if (along >= 0) upper += 1;
    else lower += 1;
    const facing = rotateQuat([a.quat[i * 4], a.quat[i * 4 + 1], a.quat[i * 4 + 2], a.quat[i * 4 + 3]], [0, 0, 1]);
    const out = Math.hypot(ox, oy, oz) || 1;
    const dot = (facing[0] * ox + facing[1] * oy + facing[2] * oz) / out;
    if (dot > 0.65) outward += 1;
    assert.ok(a.scale[i * 3] <= 0.22, '葉が大きすぎる');
  }
  assert.ok(axial < lateral * 0.62, `扁平でない axial ${axial} lateral ${lateral}`);
  assert.ok(axial > lateral * 0.18, '厚みが無い');
  assert.ok(inner > a.count * 0.16, '殻だけで中が空');
  assert.ok(upper > lower, '天面より下側が多い');
  assert.ok(outward > a.count * 0.85, 'カードが外を向いていない');
});

test('coverage: 0 で 0 枚、1 で全部、上げると増えるだけ。無視すると落ちる', () => {
  const skel = makeSampleSkeleton({ seed: 5 });
  const plan = planFoliage(skel, autumn, { gfx: 'low', species: 'maple' });
  assert.ok(plan.count > 8);
  assert.equal(visibleCardCount(plan, 0), 0);
  assert.equal(visibleCardCount(plan, 1), plan.count);
  let prev = 0;
  for (const cover of [0, 0.2, 0.45, 0.7, 1]) {
    const n = visibleCardCount(plan, cover);
    assert.ok(n >= prev, `coverage ${cover} で減った`);
    prev = n;
  }
  const mid = visibleCardCount(plan, 0.5);
  assert.ok(mid > 0 && mid < plan.count, '半分でも全部出る（しきい値を無視している）');
  for (let i = 0; i < plan.count; i += 1) {
    assert.equal(cardAppear(plan.threshold[i], 0), 0);
    assert.equal(cardAppear(plan.threshold[i], 1), 1);
    const hidden = cardScale(plan, i, { ...autumn, coverage: 0, bud: 0 });
    assert.equal(hidden[0], 0);
  }
  const shown = cardScale(plan, 0, { ...autumn, coverage: 1, bud: 0.8 });
  const full = cardScale(plan, 0, { ...autumn, coverage: 1, bud: 0 });
  assert.ok(shown[1] < full[1], '芽でも大きさが変わらない');
});

test('色: sRGB を線形にし、上面より下面が暗く、芽は淡い', () => {
  const skel = makeSampleSkeleton({ seed: 8 });
  const plan = planFoliage(skel, autumn, { gfx: 'test', species: 'maple' });
  applyLookColors(plan, autumn);
  let min = Infinity;
  let max = 0;
  let top = 0;
  let topN = 0;
  let bottom = 0;
  let bottomN = 0;
  for (let i = 0; i < plan.count; i += 1) {
    const r = plan.color[i * 3];
    min = Math.min(min, r);
    max = Math.max(max, r);
    assert.ok(r > 0.02 && r < 0.85, `赤が範囲外 ${r}`);
    const p = plan.padIndex[i];
    const along = (plan.position[i * 3] - skel.pads.center[p * 3]) * skel.pads.normal[p * 3]
      + (plan.position[i * 3 + 1] - skel.pads.center[p * 3 + 1]) * skel.pads.normal[p * 3 + 1]
      + (plan.position[i * 3 + 2] - skel.pads.center[p * 3 + 2]) * skel.pads.normal[p * 3 + 2];
    if (plan.layer[i] === 1) { top += r; topN += 1; }
    if (along < 0) { bottom += r; bottomN += 1; }
  }
  assert.ok(max < 0.78, 'sRGB のまま掛けている');
  assert.ok(max - min > 0.04, '色が均一');
  assert.ok(topN > 0 && bottomN > 0);
  assert.ok(bottom / bottomN < top / topN, '下面が上面より明るいか同じ');
  const bud = { ...autumn, bud: 1, color: [0.2, 0.4, 0.15], color2: [0.25, 0.45, 0.2] };
  const leafy = planFoliage(skel, autumn, { gfx: 'test', species: 'maple' });
  const budded = planFoliage(skel, bud, { gfx: 'test', species: 'maple' });
  let budL = 0;
  let leafL = 0;
  for (let i = 0; i < leafy.count; i += 1) {
    leafL += leafy.color[i * 3] + leafy.color[i * 3 + 1];
    budL += budded.color[i * 3] + budded.color[i * 3 + 1];
  }
  assert.ok(budL > leafL, '芽の色が淡くない');
});

test('梅は花カードを持ち、flower 0 では花が見えない', () => {
  const skel = makeSampleSkeleton({ seed: 2 });
  const look = { ...autumn, coverage: 1, flower: 1, color: [0.4, 0.6, 0.3], color2: [0.5, 0.7, 0.4] };
  const plan = planFoliage(skel, look, { gfx: 'low', species: 'plum' });
  let flowers = 0;
  for (let i = 0; i < plan.count; i += 1) if (plan.kind[i] === 1) flowers += 1;
  assert.ok(flowers > 0, '花が無い');
  assert.equal(visibleCardCount(plan, 0, { flower: 0, kind: 1 }), 0);
  assert.ok(visibleCardCount(plan, 0, { flower: 1, kind: 1 }) > 0);
  const maple = planFoliage(skel, look, { gfx: 'low', species: 'maple' });
  let mapleFlowers = 0;
  for (let i = 0; i < maple.count; i += 1) if (maple.kind[i] === 1) mapleFlowers += 1;
  assert.equal(mapleFlowers, 0);
});
