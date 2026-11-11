import { describe, it, expect } from 'vitest';
import { buildMinMaxPyramid, createCdlod, morphXZ } from '../../src/render/terrain/cdlod.js';

const SIZE = 6144;
const LEAF = 24;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 小さな格子の仮の山（区画の高さの範囲だけに使う）
function makePyramid() {
  const grid = 256;
  const cell = SIZE / grid;
  const h = new Float32Array(grid * grid);
  for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
    const x = (i / grid - 0.5) * 2;
    const z = (j / grid - 0.5) * 2;
    h[j * grid + i] = 1500 * Math.max(0, 1 - Math.hypot(x, z)) + 80 * Math.sin(i * 0.21) * Math.cos(j * 0.17);
  }
  return { heights: h, pyr: buildMinMaxPyramid(h, { grid, cell, size: SIZE, leaf: LEAF }) };
}

function selectAll(lod, pyr, cam, hAGL, planes = null) {
  const out = { data: new Float32Array(lod.maxNodes * 4), level: new Uint8Array(lod.maxNodes) };
  const n = lod.select(cam, hAGL, planes, pyr, out);
  const nodes = [];
  for (let i = 0; i < n; i++) nodes.push({ x: out.data[i * 4], z: out.data[i * 4 + 1], s: out.data[i * 4 + 2], mid: out.data[i * 4 + 3], L: out.level[i] });
  return nodes;
}

const key = (v) => Math.round(v * 1000);

// 区画の1辺に並ぶ頂点を寄せた後の位置（辺に沿う座標）の集合
function edgeSet(node, quads, edge, lo, hi, lod, cam, hAGL) {
  const set = new Set();
  const spacing = node.s / quads;
  const o = { x: 0, z: 0 };
  for (let i = 0; i <= quads; i++) {
    let x; let z;
    if (edge === 'W') { x = node.x; z = node.z + i * spacing; }
    else if (edge === 'E') { x = node.x + node.s; z = node.z + i * spacing; }
    else if (edge === 'N') { x = node.x + i * spacing; z = node.z; }
    else { x = node.x + i * spacing; z = node.z + node.s; }
    morphXZ(x, z, node.L, spacing, cam, hAGL, lod, o);
    const along = edge === 'W' || edge === 'E' ? o.z : o.x;
    const across = edge === 'W' || edge === 'E' ? o.x : o.z;
    const fixed = edge === 'W' ? node.x : edge === 'E' ? node.x + node.s : edge === 'N' ? node.z : node.z + node.s;
    // 辺の上の頂点は、辺から離れてはいけない
    if (Math.abs(across - fixed) > 1e-6) throw new Error(`辺から離れた: ${across} vs ${fixed}`);
    if (along >= lo - 1e-6 && along <= hi + 1e-6) set.add(key(along));
  }
  return set;
}

function checkCracks(nodes, quads, lod, cam, hAGL) {
  let pairs = 0;
  let maxDiff = 0;
  for (let a = 0; a < nodes.length; a++) {
    const A = nodes[a];
    for (let b = a + 1; b < nodes.length; b++) {
      const B = nodes[b];
      let eA = null; let eB = null; let lo = 0; let hi = 0;
      if (Math.abs(A.x + A.s - B.x) < 1e-6) { eA = 'E'; eB = 'W'; lo = Math.max(A.z, B.z); hi = Math.min(A.z + A.s, B.z + B.s); }
      else if (Math.abs(B.x + B.s - A.x) < 1e-6) { eA = 'W'; eB = 'E'; lo = Math.max(A.z, B.z); hi = Math.min(A.z + A.s, B.z + B.s); }
      else if (Math.abs(A.z + A.s - B.z) < 1e-6) { eA = 'S'; eB = 'N'; lo = Math.max(A.x, B.x); hi = Math.min(A.x + A.s, B.x + B.s); }
      else if (Math.abs(B.z + B.s - A.z) < 1e-6) { eA = 'N'; eB = 'S'; lo = Math.max(A.x, B.x); hi = Math.min(A.x + A.s, B.x + B.s); }
      if (!eA || hi - lo < 1e-6) continue;
      pairs++;
      maxDiff = Math.max(maxDiff, Math.abs(A.L - B.L));
      const sa = edgeSet(A, quads, eA, lo, hi, lod, cam, hAGL);
      const sb = edgeSet(B, quads, eB, lo, hi, lod, cam, hAGL);
      if (sa.size !== sb.size) return { ok: false, why: `頂点の数が違う L${A.L}/L${B.L}: ${sa.size} vs ${sb.size}`, pairs };
      for (const v of sa) if (!sb.has(v)) return { ok: false, why: `位置が違う L${A.L}/L${B.L}: ${v / 1000}`, pairs };
    }
  }
  return { ok: true, pairs, maxDiff };
}

describe('区画の高さの範囲', () => {
  it('親の範囲は子の範囲を含む', () => {
    const { pyr } = makePyramid();
    expect(pyr.levels).toBe(9);
    for (let L = 1; L < pyr.levels; L++) {
      const n = pyr.nodesPerSide0 >> L;
      const pn = n * 2;
      for (let z = 0; z < n; z += Math.max(1, n >> 3)) for (let x = 0; x < n; x += Math.max(1, n >> 3)) {
        const k = z * 2 * pn + x * 2;
        expect(pyr.mins[L][z * n + x]).toBeLessThanOrEqual(pyr.mins[L - 1][k]);
        expect(pyr.maxs[L][z * n + x]).toBeGreaterThanOrEqual(pyr.maxs[L - 1][k + pn + 1]);
      }
    }
  });
});

describe('区画の選び方', () => {
  const { pyr } = makePyramid();
  const lod = createCdlod({ size: SIZE, leaf: LEAF, levels: 9, baseRange: 72, maxNodes: 4096 });

  it('条件を満たさない baseRange は断る', () => {
    expect(() => createCdlod({ size: SIZE, leaf: LEAF, levels: 9, baseRange: 50 })).toThrow();
  });

  it('全域を重なりなく覆う', () => {
    const r = rng(11);
    for (let t = 0; t < 12; t++) {
      const cam = { x: (r() - 0.5) * SIZE * 0.98, y: 0, z: (r() - 0.5) * SIZE * 0.98 };
      const nodes = selectAll(lod, pyr, cam, t % 3 === 0 ? 400 * r() : 2);
      let area = 0;
      const n0 = SIZE / LEAF;
      const cover = new Uint8Array(n0 * n0);
      for (const nd of nodes) {
        area += nd.s * nd.s;
        const ix = Math.round((nd.x + SIZE / 2) / LEAF);
        const iz = Math.round((nd.z + SIZE / 2) / LEAF);
        const m = Math.round(nd.s / LEAF);
        for (let z = 0; z < m; z++) for (let x = 0; x < m; x++) cover[(iz + z) * n0 + ix + x]++;
      }
      expect(area).toBe(SIZE * SIZE);
      let bad = 0;
      for (let i = 0; i < cover.length; i++) if (cover[i] !== 1) bad++;
      expect(bad).toBe(0);
      expect(nodes.length).toBeLessThan(900);
    }
  });

  it('カメラの近くは葉の段になる', () => {
    const cam = { x: 100.3, y: 0, z: -250.7 };
    const nodes = selectAll(lod, pyr, cam, 2);
    const near = nodes.filter((nd) => cam.x >= nd.x && cam.x < nd.x + nd.s && cam.z >= nd.z && cam.z < nd.z + nd.s);
    expect(near.length).toBe(1);
    expect(near[0].L).toBe(0);
    expect(near[0].s).toBe(LEAF);
  });

  for (const quads of [32, 16]) {
    it(`寄せた後の共有辺の頂点が一致する（格子 ${quads}）`, () => {
      const r = rng(5 + quads);
      let totalPairs = 0;
      for (let t = 0; t < 10; t++) {
        const cam = { x: (r() - 0.5) * SIZE * 0.9, y: 0, z: (r() - 0.5) * SIZE * 0.9 };
        const hAGL = t % 4 === 0 ? 600 * r() : 1.5 + r() * 6;
        const nodes = selectAll(lod, pyr, cam, hAGL);
        const res = checkCracks(nodes, quads, lod, cam, hAGL);
        if (!res.ok) throw new Error(`すき間: ${res.why}（cam=${cam.x.toFixed(1)},${cam.z.toFixed(1)} hAGL=${hAGL.toFixed(1)}）`);
        expect(res.maxDiff).toBeLessThanOrEqual(1);
        totalPairs += res.pairs;
      }
      expect(totalPairs).toBeGreaterThan(2000);
    });
  }

  it('視錐台の外の区画を選ばず、中の区画を落とさない', () => {
    const cam = { x: 300, y: 1200, z: 200 };
    // 半空間 x >= 300 だけを残す6平面（残り5つは常に通る）
    const planes = new Float32Array([1, 0, 0, -300, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const culled = selectAll(lod, pyr, cam, 3, planes);
    for (const nd of culled) expect(nd.x + nd.s).toBeGreaterThanOrEqual(300);
    const all = selectAll(lod, pyr, cam, 3).filter((nd) => nd.x + nd.s >= 300);
    expect(culled.length).toBe(all.length);
  });

  it('1回の選び直しが十分に速い', () => {
    const out = { data: new Float32Array(lod.maxNodes * 4), level: new Uint8Array(lod.maxNodes) };
    const cam = { x: 10, y: 0, z: 20 };
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 200; i++) { cam.x = 10 + i * 3; n = lod.select(cam, 2, null, pyr, out); }
    const ms = (performance.now() - t0) / 200;
    expect(n).toBeGreaterThan(50);
    expect(ms).toBeLessThan(1.5);
  });
});
