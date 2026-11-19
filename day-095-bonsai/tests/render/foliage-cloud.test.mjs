import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../../vendor/three.js';
import {
  applyLookColors,
  cardBudget,
  createCoreMesh,
  leafCardGeometry,
  padCoreGeometry,
  planFoliage,
  rotateQuat,
  writeCoreInstances,
} from '../../lib/foliage.js';
import { makeSampleSkeleton } from '../fixtures/sample-skeleton.mjs';

const autumn = {
  coverage: 1, flower: 0, bud: 0, fall: 0.2, petal: 0, leafAge: 0.8,
  color: [0.85, 0.27, 0.16], color2: [0.88, 0.47, 0.16], season: 'autumn',
};

function fakeMesh(n) {
  return {
    count: n,
    instanceMatrix: { array: new Float32Array(n * 16), needsUpdate: false },
    instanceColor: {
      values: new Float32Array(n * 3),
      needsUpdate: false,
      setXYZ(i, r, g, b) {
        this.values[i * 3] = r;
        this.values[i * 3 + 1] = g;
        this.values[i * 3 + 2] = b;
      },
    },
  };
}

test('芯: 高画質はパッドごとに扁平な楕円、test は置かない。葉が無いと畳む', () => {
  const skel = makeSampleSkeleton({ seed: 3 });
  const high = planFoliage(skel, autumn, { gfx: 'high', species: 'maple' });
  const low = planFoliage(skel, autumn, { gfx: 'test', species: 'maple' });
  assert.equal(high.core.count, skel.pads.count);
  assert.equal(low.core.count, 0);
  for (let p = 0; p < high.core.count; p += 1) {
    const width = high.core.scale[p * 3];
    const height = high.core.scale[p * 3 + 1];
    const depth = high.core.scale[p * 3 + 2];
    assert.ok(height < width * 0.5, '芯が球のまま');
    assert.ok(Math.abs(width - depth) < 1e-5);
    assert.ok(width > skel.pads.radius[p] * 1.4 && width < skel.pads.radius[p] * 1.9);
    const yAxis = rotateQuat(high.core.quat.subarray(p * 4, p * 4 + 4), [0, 1, 0]);
    const nx = skel.pads.normal[p * 3];
    const ny = skel.pads.normal[p * 3 + 1];
    const nz = skel.pads.normal[p * 3 + 2];
    const dot = yAxis[0] * nx + yAxis[1] * ny + yAxis[2] * nz;
    assert.ok(Math.abs(dot) > 0.98, '芯の短い軸がパッドの法線を向いていない');
  }
  const mesh = fakeMesh(high.core.count);
  writeCoreInstances(mesh, high, { coverage: 0 });
  assert.equal(mesh.count, 0, '落葉でも芯が残る');
  writeCoreInstances(mesh, high, { coverage: 1 });
  assert.equal(mesh.count, high.core.count);
  const full = Math.hypot(mesh.instanceMatrix.array[0], mesh.instanceMatrix.array[5], mesh.instanceMatrix.array[10]);
  writeCoreInstances(mesh, high, { coverage: 0.2 });
  const partial = Math.hypot(mesh.instanceMatrix.array[0], mesh.instanceMatrix.array[5], mesh.instanceMatrix.array[10]);
  assert.ok(partial > 0 && partial < full * 0.5, '芯が coverage を無視して一気に出る');
  assert.ok(mesh.instanceColor.values[0] < 0.25, '芯が明るい葉色のまま');
});

test('黒松: 房は十字の針、天面は立ち上がり、縁は倒れる', () => {
  assert.ok(cardBudget(0.55, 0.8, 'high') >= 80 && cardBudget(0.55, 0.8, 'high') <= 130);
  assert.equal(cardBudget(0.55, 0.8, 'low'), Math.round(cardBudget(0.55, 0.8, 'high') / 2));
  const skel = makeSampleSkeleton({ seed: 9 });
  for (let p = 0; p < skel.pads.count; p += 1) {
    skel.pads.radius[p] = 0.55;
    skel.pads.density[p] = 0.85;
  }
  const plan = planFoliage(skel, autumn, { gfx: 'high', species: 'pine' });
  const per = new Map();
  let topY = 0;
  let topN = 0;
  let rimY = 0;
  let rimN = 0;
  let crossed = 0;
  let pairs = 0;
  let faceSum = 0;
  let faceN = 0;
  const cam = [0.325, 0.309, 0.894];
  for (let i = 0; i < plan.count; i += 1) {
    per.set(plan.padIndex[i], (per.get(plan.padIndex[i]) || 0) + 1);
    assert.ok(plan.scale[i * 3] >= 0.22 && plan.scale[i * 3] <= 0.32, `房の幅 ${plan.scale[i * 3]}`);
    assert.ok(plan.scale[i * 3 + 2] < plan.scale[i * 3] * 0.12, '針が厚く、切れ端が面になる');
    const up = rotateQuat(plan.quat.subarray(i * 4, i * 4 + 4), [0, 1, 0]);
    if (plan.layer[i] === 1) { topY += up[1]; topN += 1; }
    if (plan.layer[i] >= 2) { rimY += up[1]; rimN += 1; }
    if (i % 2 === 1) {
      pairs += 1;
      const prev = i - 1;
      const dx = plan.position[i * 3] - plan.position[prev * 3];
      const dy = plan.position[i * 3 + 1] - plan.position[prev * 3 + 1];
      const dz = plan.position[i * 3 + 2] - plan.position[prev * 3 + 2];
      assert.ok(Math.hypot(dx, dy, dz) < 0.03, '十字の2枚が離れている');
      const n0 = rotateQuat(plan.quat.subarray(prev * 4, prev * 4 + 4), [0, 0, 1]);
      const n1 = rotateQuat(plan.quat.subarray(i * 4, i * 4 + 4), [0, 0, 1]);
      const dot = n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2];
      if (Math.abs(dot) < 0.25) crossed += 1;
      if (plan.layer[i] === 1) {
        const d0 = Math.abs(n0[0] * cam[0] + n0[1] * cam[1] + n0[2] * cam[2]);
        const d1 = Math.abs(n1[0] * cam[0] + n1[1] * cam[1] + n1[2] * cam[2]);
        faceSum += Math.max(d0, d1);
        faceN += 1;
      }
    }
  }
  for (const n of per.values()) assert.ok(n >= 160 && n <= 260, `パッドの房 ${n}`);
  assert.ok(topN > 0 && rimN > 0);
  assert.ok(topY / topN > 0.75, '天面の針が立ち上がっていない');
  assert.ok(rimY / rimN < topY / topN - 0.35, '縁の針が倒れていない');
  assert.ok(crossed > pairs * 0.9, '房が十字になっていない');
  // 法線を一周させると、良い方の面でも平均は 0.8 前後で頭打ちになる。
  assert.ok(faceN > 0);
  assert.ok(faceSum / faceN > 0.84, `天面がカメラを向いていない ${faceSum / faceN}`);
});

test('黒松の芯は色を書かず影だけ残す。紅葉の芯は見える', () => {
  const skel = makeSampleSkeleton({ seed: 3 });
  const pine = planFoliage(skel, autumn, { gfx: 'high', species: 'pine' });
  const maple = planFoliage(skel, autumn, { gfx: 'high', species: 'maple' });
  const pineMesh = createCoreMesh(THREE, pine, { castShadow: true });
  const mapleMesh = createCoreMesh(THREE, maple, { castShadow: true });
  assert.equal(pineMesh.castShadow, true);
  assert.equal(pineMesh.material.colorWrite, false, '黒松の芯を塗ると平たい皿になる');
  assert.equal(pineMesh.material.depthWrite, false, '見えない芯が針を隠す');
  assert.equal(mapleMesh.castShadow, true);
  assert.equal(mapleMesh.material.colorWrite, true, '紅葉の芯まで消えている');
  assert.equal(mapleMesh.material.depthWrite, true);
});

test('紅葉: 下縁の葉は黒に近づけず、ほつれは少ない', () => {
  const skel = makeSampleSkeleton({ seed: 7, primaries: 6 });
  const plan = planFoliage(skel, autumn, { gfx: 'high', species: 'maple' });
  let fringe = 0;
  let rimMin = Infinity;
  let top = 0;
  let topN = 0;
  let low = 0;
  let lowN = 0;
  for (let i = 0; i < plan.count; i += 1) {
    if (plan.layer[i] === 3) fringe += 1;
    const p = plan.padIndex[i];
    const along = (plan.position[i * 3] - skel.pads.center[p * 3]) * skel.pads.normal[p * 3]
      + (plan.position[i * 3 + 1] - skel.pads.center[p * 3 + 1]) * skel.pads.normal[p * 3 + 1]
      + (plan.position[i * 3 + 2] - skel.pads.center[p * 3 + 2]) * skel.pads.normal[p * 3 + 2];
    if (plan.layer[i] === 1) { top += plan.shade[i]; topN += 1; }
    if (along < 0 || plan.layer[i] >= 2) {
      low += plan.shade[i];
      lowN += 1;
      rimMin = Math.min(rimMin, plan.shade[i]);
    }
  }
  assert.ok(fringe / plan.count < 0.03, `ほつれが多すぎる ${fringe / plan.count}`);
  assert.ok(rimMin >= 0.68, `下縁が暗すぎる ${rimMin}`);
  assert.ok(topN > 0 && lowN > 0);
  assert.ok(low / lowN < top / topN, '下縁が天面より明るい');
});

test('予算: 三角形は 20 万未満、色の更新は 3ms 未満。しきい値の平均は後ろほど高い', () => {
  const geo = leafCardGeometry();
  const core = padCoreGeometry();
  const cardTris = geo.indices.length / 3;
  assert.ok(cardTris * 6000 + (core.indices.length / 3) * 140 < 200000, '三角形が多すぎる');
  assert.ok(cardTris <= 16, 'カードが細かすぎて影が穴になる');
  const skel = makeSampleSkeleton({ seed: 12, primaries: 8 });
  const plan = planFoliage(skel, autumn, { gfx: 'high', species: 'maple' });
  const t0 = performance.now();
  for (let i = 0; i < 20; i += 1) applyLookColors(plan, autumn);
  const ms = (performance.now() - t0) / 20;
  assert.ok(ms < 3, `色の更新 ${ms.toFixed(2)} ms`);
  const early = [];
  const late = [];
  const byPad = new Map();
  for (let i = 0; i < plan.count; i += 1) {
    const list = byPad.get(plan.padIndex[i]) || [];
    list.push(plan.threshold[i]);
    byPad.set(plan.padIndex[i], list);
  }
  for (const list of byPad.values()) {
    const mid = Math.floor(list.length / 2);
    early.push(list.slice(0, mid).reduce((s, v) => s + v, 0) / mid);
    late.push(list.slice(mid).reduce((s, v) => s + v, 0) / (list.length - mid));
  }
  const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
  assert.ok(mean(late) > mean(early) + 0.2, 'しきい値が枚の順に上がらない');
  const moved = planFoliage(skel, { ...autumn, color: [0.1, 0.2, 0.1], color2: [0.2, 0.3, 0.1] }, { gfx: 'high', species: 'maple' });
  assert.deepEqual(moved.position, plan.position);
  assert.notDeepEqual(moved.color, plan.color);
});
