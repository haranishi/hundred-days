import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import { NODE_FLAG } from '../../lib/contract.js';
import { AT_END, AT_START, chainControls, parallelFrames, sampleControls } from '../../lib/tree-curve.js';
import {
  GROW_SECONDS,
  buildTreeBuffers,
  easeOutCubic,
  growthArray,
  nearestRing,
  scarColor,
  sidesForOrder,
} from '../../lib/tree-mesh.js';
import { makeSampleSkeleton } from '../fixtures/sample-skeleton.mjs';

function finite(array, name) {
  for (let i = 0; i < array.length; i += 1) {
    assert.ok(Number.isFinite(array[i]), `${name}[${i}] が有限でない`);
  }
}

function triangleNormal(built, t) {
  const ia = built.index[t * 3];
  const ib = built.index[t * 3 + 1];
  const ic = built.index[t * 3 + 2];
  const ax = built.position[ib * 3] - built.position[ia * 3];
  const ay = built.position[ib * 3 + 1] - built.position[ia * 3 + 1];
  const az = built.position[ib * 3 + 2] - built.position[ia * 3 + 2];
  const bx = built.position[ic * 3] - built.position[ia * 3];
  const by = built.position[ic * 3 + 1] - built.position[ia * 3 + 1];
  const bz = built.position[ic * 3 + 2] - built.position[ia * 3 + 2];
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

test('曲線: 制御点を通り、直線は直線のまま、枠は接線と直交する', () => {
  const straight = sampleControls({
    x: [0, 0, 0], y: [0, 0.4, 0.8], z: [0, 0, 0], r: [0.1, 0.08, 0.05],
    node: [0, 0, 0], at: [AT_START, 0, AT_END],
  }, 0);
  assert.ok(straight.count >= 3);
  for (let i = 0; i < straight.count; i += 1) {
    assert.ok(Math.abs(straight.pos[i * 3]) < 1e-4 && Math.abs(straight.pos[i * 3 + 2]) < 1e-4, '直線が横へ膨らんだ');
  }
  const end = straight.pos[(straight.count - 1) * 3 + 1];
  assert.ok(Math.abs(end - 0.8) < 1e-4, '終点を通らない');
  const frames = parallelFrames(straight.pos, straight.count);
  const n0x = frames.nx[0];
  const n0z = frames.nz[0];
  const n1x = frames.nx[straight.count - 1];
  const n1z = frames.nz[straight.count - 1];
  assert.ok(n0x * n1x + n0z * n1z > 0.99, 'まっすぐな幹で枠がねじれた');
  for (let i = 0; i < straight.count; i += 1) {
    const dot = frames.tx[i] * frames.nx[i] + frames.ty[i] * frames.ny[i] + frames.tz[i] * frames.nz[i];
    assert.ok(Math.abs(dot) < 1e-4, '枠が接線に垂直でない');
  }
});

test('幹: 見本の骨格は有限・添字内・先細り・角数・根張り・予算を満たす', () => {
  const skel = makeSampleSkeleton({ seed: 4 });
  const built = buildTreeBuffers(skel, { species: 'maple' });
  assert.ok(built.vertexCount > 100);
  assert.equal(built.index.length % 3, 0);
  assert.ok(built.triangleCount < 200000);
  finite(built.position, 'position');
  finite(built.normal, 'normal');
  finite(built.color, 'color');
  let maxIndex = 0;
  for (let i = 0; i < built.index.length; i += 1) {
    assert.ok(built.index[i] >= 0 && built.index[i] < built.vertexCount);
    if (built.index[i] > maxIndex) maxIndex = built.index[i];
  }
  assert.ok(maxIndex < built.vertexCount);
  for (let i = 0; i < skel.count; i += 1) {
    const hit = nearestRing(built, skel.end[i * 3], skel.end[i * 3 + 1], skel.end[i * 3 + 2]);
    assert.ok(hit.dist < 0.03, `節${i} の終点が中心線から ${hit.dist}`);
  }
  let trunkStart = null;
  let trunkEnd = null;
  for (let i = 0; i < built.ringCount; i += 1) {
    if (built.ringNode[i] !== 0) continue;
    if (built.ringAt[i] === AT_START) trunkStart = built.ringRadius[i];
    if (built.ringAt[i] === AT_END) trunkEnd = built.ringRadius[i];
  }
  assert.ok(trunkStart > trunkEnd, '根元が先より太くない');
  assert.ok(Math.abs(trunkEnd - skel.r1[0]) < 0.01, '先端の半径が r1 と違う');
  const orders = new Set();
  for (let i = 0; i < skel.count; i += 1) orders.add(skel.order[i]);
  for (const order of orders) {
    const node = skel.order.indexOf(order);
    let seen = 0;
    for (let i = 0; i < built.ringCount; i += 1) {
      if (built.ringNode[i] === node && built.ringAt[i] === AT_END) {
        assert.equal(built.ringSides[i], sidesForOrder(order), `order ${order} の角数が違う`);
        seen += 1;
      }
    }
    assert.ok(seen > 0);
  }
  assert.ok(built.nebariCount >= 5 && built.nebariCount <= 7, `根張り ${built.nebariCount}`);
  const again = buildTreeBuffers(skel, { species: 'maple' });
  assert.equal(again.nebariCount, built.nebariCount);
  assert.equal(again.vertexCount, built.vertexCount);
  let low = 0;
  for (let i = 0; i < built.vertexCount; i += 1) {
    const y = built.position[i * 3 + 1];
    const horiz = Math.hypot(built.position[i * 3], built.position[i * 3 + 2]);
    if (y < 0.05 && horiz > skel.r0[0] * 0.8) low += 1;
  }
  assert.ok(low > 10, '土際に広がる根張りが無い');
  let outward = 0;
  const samples = Math.min(40, built.triangleCount);
  for (let t = 0; t < samples; t += 1) {
    const n = triangleNormal(built, t * Math.floor(built.triangleCount / samples));
    const ia = built.index[t * Math.floor(built.triangleCount / samples) * 3];
    const vn = [built.normal[ia * 3], built.normal[ia * 3 + 1], built.normal[ia * 3 + 2]];
    if (n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2] > 0) outward += 1;
  }
  assert.ok(outward > samples * 0.8, '三角形の表が外を向いていない');
});

test('変異: 節の長さを無視すると、動かした終点を管が追わない', () => {
  const skel = makeSampleSkeleton({ seed: 3 });
  let index = -1;
  for (let i = skel.count - 1; i >= 0; i -= 1) {
    let child = false;
    for (let j = 0; j < skel.count; j += 1) if (skel.parent[j] === i) child = true;
    if (!child) { index = i; break; }
  }
  assert.ok(index >= 0);
  const place = (lateral) => {
    const out = makeSampleSkeleton({ seed: 3 });
    const sx = out.start[index * 3];
    const sy = out.start[index * 3 + 1];
    const sz = out.start[index * 3 + 2];
    let dx = out.end[index * 3] - sx;
    let dy = out.end[index * 3 + 1] - sy;
    let dz = out.end[index * 3 + 2] - sz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    // 見本の末端は 0.2 より短い。伸ばしてから、枝と直交する向きへずらす。
    // ずらす向きが枝と同じだと、古い終点が新しい管の上に残って試験が意味を失う。
    const reach = Math.max(len, 0.42);
    let px = -dz;
    let pz = dx;
    if (Math.hypot(px, pz) < 0.2) { px = 1; pz = 0; }
    const pn = Math.hypot(px, pz);
    out.end[index * 3] = sx + dx * reach + (px / pn) * lateral;
    out.end[index * 3 + 1] = sy + dy * reach;
    out.end[index * 3 + 2] = sz + dz * reach + (pz / pn) * lateral;
    return out;
  };
  const base = place(0);
  const moved = place(0.45);
  const built = buildTreeBuffers(moved);
  const end = [moved.end[index * 3], moved.end[index * 3 + 1], moved.end[index * 3 + 2]];
  const old = [base.end[index * 3], base.end[index * 3 + 1], base.end[index * 3 + 2]];
  const atNew = nearestRing(built, end[0], end[1], end[2]);
  const atOld = nearestRing(built, old[0], old[1], old[2]);
  assert.ok(atNew.dist < 0.05, `新しい終点を追っていない ${atNew.dist}`);
  assert.ok(atOld.dist > 0.2, `古い終点に残っている ${atOld.dist}（長さを無視している）`);
});

test('切り口: CUT の節にだけ円盤が出て、古くなると樹皮の色へ寄る', () => {
  const plain = makeSampleSkeleton({ seed: 2 });
  assert.equal(buildTreeBuffers(plain).cutCount, 0);
  const cut = makeSampleSkeleton({ seed: 2 });
  const tip = cut.count - 1;
  cut.flags[tip] |= NODE_FLAG.CUT;
  cut.scarAge[tip] = 0;
  const fresh = buildTreeBuffers(cut, { species: 'maple' });
  assert.equal(fresh.cutCount, 1);
  assert.equal(fresh.cuts[0].node, tip);
  finite(fresh.cutPosition, 'cut');
  for (let i = 0; i < fresh.cutIndex.length; i += 1) {
    assert.ok(fresh.cutIndex[i] < fresh.cutPosition.length / 3);
  }
  const young = scarColor(0, 'maple');
  const aged = scarColor(20, 'maple');
  const lum = (c) => c[0] * 0.3 + c[1] * 0.5 + c[2] * 0.2;
  assert.ok(lum(young) > lum(aged) + 0.1, '古くなっても切り口が明るい');
  assert.ok(Math.abs(young[0] - aged[0]) > 0.05);
});

test('自然な枝先: 節の終点で先端半径を保ち、その先は段階的に丸く閉じる', () => {
  for (const [order, radius] of [[0, 0.06], [3, 0.018]]) {
    const skel = makeSampleSkeleton({ trunkNodes: 1, primaries: 0, nodeLen: 0.5 });
    skel.order[0] = order;
    skel.r0[0] = 0.08;
    skel.r1[0] = radius;
    const built = buildTreeBuffers(skel, { nebari: false });
    const yEnd = skel.end[1];
    assert.ok(Math.abs(built.ringRadius[built.ringCount - 1] - radius) < 1e-6, '終点の輪を細くしすぎた');
    const levels = new Map();
    for (let i = 0; i < built.vertexCount; i += 1) {
      const [x, y, z] = built.position.subarray(i * 3, i * 3 + 3);
      if (y <= yEnd + 1e-6) continue;
      levels.set(y, Math.max(levels.get(y) ?? 0, Math.hypot(x, z)));
      const n = built.normal.subarray(i * 3, i * 3 + 3);
      assert.ok(n[1] > 0 && Math.abs(Math.hypot(...n) - 1) < 1e-5, '先の法線が滑らかでない');
    }
    const cap = [...levels].sort(([a], [b]) => a - b);
    assert.ok(cap.length >= 3, '円盤や円錐のまま閉じている');
    assert.ok(cap.every(([, r], i) => r < (i === 0 ? radius : cap[i - 1][1])), '先に向かって細くならない');
    const [yPole, rPole] = cap.at(-1);
    assert.ok(rPole < 1e-6);
    const axialRatio = (yPole - yEnd) / radius;
    assert.ok(order === 0 ? Math.abs(axialRatio - 1) < 1e-6 : axialRatio > 1.1 && axialRatio < 1.4,
      '太い先は半球に、細い先は少し尖らせる');

    const edges = new Map();
    for (let i = 0; i < built.index.length; i += 3) {
      const corners = built.index.subarray(i, i + 3);
      corners.forEach((a, k) => {
        const b = corners[(k + 1) % 3];
        const key = `${Math.min(a, b)},${Math.max(a, b)}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      });
    }
    const open = [...edges].filter(([, uses]) => uses === 1);
    assert.equal(open.length, sidesForOrder(order), '根元以外に穴がある');
    assert.ok(open.every(([edge]) => edge.split(',').every((vertex) => Number(vertex) < sidesForOrder(order))));
  }
});

test('剪定された先端: 樹皮の丸いかぶせは付かず、切り口の頂点は同じ平面に乗る', () => {
  const skel = makeSampleSkeleton({ trunkNodes: 1, primaries: 0, nodeLen: 0.5 });
  skel.flags[0] |= NODE_FLAG.CUT;
  const built = buildTreeBuffers(skel, { nebari: false });
  assert.equal(built.cutCount, 1);
  assert.ok(built.position.every((value, i) => i % 3 !== 1 || value <= skel.end[1] + 1e-6));
  assert.ok(built.cutPosition.every((value, i) => i % 3 !== 1 || Math.abs(value - skel.end[1] - 0.004) < 1e-6));
});

function rootRings(built) {
  const roots = [];
  for (let i = 0; i < built.ringCount; i += 1) {
    if (built.ringNode[i] !== -1) continue;
    if (built.ringAt[i] === AT_START) roots.push([]);
    roots.at(-1).push({ center: Array.from(built.ringCenter.subarray(i * 3, i * 3 + 3)), radius: built.ringRadius[i] });
  }
  return roots;
}

test('根張り: 5〜7本の低いS字の根は細りながら土へ潜り、剪定で形が変わらない', () => {
  const skel = makeSampleSkeleton({ seed: 11 });
  const roots = rootRings(buildTreeBuffers(skel, { seed: 11 }));
  assert.ok(roots.length >= 5 && roots.length <= 7);
  skel.pads.seed[0] = 12345;
  assert.deepEqual(rootRings(buildTreeBuffers(skel, { seed: 11 })), roots);
  assert.notDeepEqual(rootRings(buildTreeBuffers(skel, { seed: 12 })), roots);
  for (const rings of roots) {
    const start = rings[0];
    const end = rings.at(-1);
    assert.ok(start.radius >= 0.07 && start.radius <= 0.10);
    assert.ok(Math.abs(end.radius - 0.012) < 1e-6 && end.center[1] + end.radius < 0);
    const [dx, , dz] = end.center.map((value, axis) => value - start.center[axis]);
    let length = 0;
    const lateral = [];
    rings.forEach(({ center: [x, y, z], radius }, i) => {
      assert.ok(y >= -0.030001 && y <= -0.009999, '土に埋まるはずの根の中心が浮いた');
      assert.ok(!i || radius < rings[i - 1].radius, '先より手前が細い');
      if (i) length += Math.hypot(x - rings[i - 1].center[0], y - rings[i - 1].center[1], z - rings[i - 1].center[2]);
      lateral.push(((x - start.center[0]) * dz - (z - start.center[2]) * dx) / Math.hypot(dx, dz));
    });
    assert.ok(length >= 0.45 && length <= 0.9, `根の長さ ${length}`);
    assert.ok(Math.max(...lateral) > 0.01 && Math.min(...lateral) < -0.01, '根が水平にS字を描かない');
  }
});

test('幹の裾: 地表で1.25倍、0.125の高さでその半分だけ広がり、0.25で元の太さに戻る', () => {
  const skel = makeSampleSkeleton({ trunkNodes: 1, primaries: 0, nodeLen: 0.5 });
  const raw = sampleControls(chainControls(skel, [0]), 0);
  const built = buildTreeBuffers(skel, { nebari: false });
  for (const [i, scale] of [1.25, 1.125, 1, 1, 1].entries()) {
    const [x, , z] = built.position.subarray(i * sidesForOrder(0) * 3);
    assert.ok(Math.abs(Math.hypot(x, z) - raw.rad[i] * scale) < 1e-6,
      `高さ ${raw.pos[i * 3 + 1]} の裾の広がりが違う`);
  }
});

test('成長: 動きの軽減は fresh を即時にし、途中は ease-out で半分より先へ進む', () => {
  const skel = makeSampleSkeleton({ seed: 1 });
  skel.fresh[skel.count - 1] = 1;
  const held = growthArray(skel, { animate: true, reducedMotion: false, elapsed: 0 });
  const reduced = growthArray(skel, { animate: true, reducedMotion: true, elapsed: 0 });
  const mid = growthArray(skel, { animate: true, reducedMotion: false, elapsed: GROW_SECONDS * 0.5 });
  const done = growthArray(skel, { animate: true, reducedMotion: false, elapsed: GROW_SECONDS });
  assert.equal(held[skel.count - 1], 0);
  assert.equal(held[0], 1, 'fresh でない節まで縮めた');
  assert.equal(reduced[skel.count - 1], 1);
  assert.ok(mid[skel.count - 1] > 0.5);
  assert.equal(done[skel.count - 1], 1);
  assert.ok(easeOutCubic(0.5) > 0.5);
  const grown = buildTreeBuffers(skel, { growth: held });
  const full = buildTreeBuffers(skel);
  const tip = skel.count - 1;
  const at = [skel.end[tip * 3], skel.end[tip * 3 + 1], skel.end[tip * 3 + 2]];
  assert.ok(nearestRing(full, at[0], at[1], at[2]).dist < 0.04);
  assert.ok(nearestRing(grown, at[0], at[1], at[2]).dist > 0.05, 'fresh=0 でも先端が残っている');
});

test('節2000の作り直し時間を計測する（開発機の目標25ms）', (t) => {
  const n = 2000;
  const skel = {
    count: n,
    ids: new Int32Array(n),
    parent: new Int32Array(n),
    order: new Uint8Array(n),
    chain: new Int32Array(n),
    start: new Float32Array(n * 3),
    end: new Float32Array(n * 3),
    r0: new Float32Array(n),
    r1: new Float32Array(n),
    flags: new Uint8Array(n),
    fresh: new Float32Array(n),
    scarAge: new Float32Array(n),
    pads: { count: 0, seed: new Uint32Array(0) },
    wires: [],
  };
  const trunkNodes = 24;
  for (let i = 0; i < n; i += 1) {
    const trunk = i < trunkNodes;
    const branch = Math.floor((i - trunkNodes) / 8);
    const parent = !trunk && (i - trunkNodes) % 8 === 0 ? 3 + branch % (trunkNodes - 3) : i - 1;
    const angle = branch * 2.4 + i * 0.03;
    skel.parent[i] = parent;
    skel.order[i] = trunk ? 0 : 2;
    skel.chain[i] = trunk ? 0 : 1 + branch;
    if (parent >= 0) skel.start.set(skel.end.subarray(parent * 3, parent * 3 + 3), i * 3);
    skel.end[i * 3] = skel.start[i * 3] + (trunk ? Math.sin(i) * 0.01 : Math.sin(angle) * 0.15);
    skel.end[i * 3 + 1] = skel.start[i * 3 + 1] + (trunk ? 0.16 : 0.04);
    skel.end[i * 3 + 2] = skel.start[i * 3 + 2] + (trunk ? 0 : Math.cos(angle) * 0.15);
    skel.r0[i] = 0.06;
    skel.r1[i] = 0.05;
  }
  buildTreeBuffers(skel);
  let best = Infinity;
  for (let i = 0; i < 4; i += 1) {
    const t0 = performance.now();
    const built = buildTreeBuffers(skel);
    best = Math.min(best, performance.now() - t0);
    assert.equal(built.vertexCount > 0, true);
  }
  t.diagnostic(`節2000 の暖機後最短 ${best.toFixed(2)} ms`);
  // 共有CIでも過負荷による失敗を抑え、時間が桁違いに増える回帰を検出する。
  assert.ok(best < 250, `最短 ${best.toFixed(2)}ms`);
});
