// 見本の骨格（スナップショット）。契約（lib/contract.js の validateSkeleton）を満たす小さな木を、決まった種から作る。
// 描画の担当は、本物の木のモデル（lib/tree.js）が出来るまで、これで描画の試験・調整ができる。
// 本物のモデルと違い、育たない・切れない・曲がらない。形は雑でよい（契約を守ることだけが目的）。
import { createRng } from '../../lib/rng.js';
import { NODE_FLAG } from '../../lib/contract.js';

const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const norm = (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); };
const axisAngle = (axis, angle) => { const s = Math.sin(angle / 2); const l = Math.hypot(...axis) || 1; return [axis[0] / l * s, axis[1] / l * s, axis[2] / l * s, Math.cos(angle / 2)]; };
const rotate = (q, v) => {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
};

export function makeSampleSkeleton({ seed = 1, trunkNodes = 14, primaries = 5, nodeLen = 0.22 } = {}) {
  const rng = createRng(seed);
  const list = []; // { parent, order, chain, q (world), start, end, len, flags }
  let chainCount = 0;
  const add = (parent, order, chain, localQ, len) => {
    const pq = parent < 0 ? [0, 0, 0, 1] : list[parent].q;
    const q = norm(mul(pq, localQ));
    const start = parent < 0 ? [0, 0, 0] : list[parent].end;
    const dir = rotate(q, [0, 1, 0]);
    list.push({ parent, order, chain, q, start, end: [start[0] + dir[0] * len, start[1] + dir[1] * len, start[2] + dir[2] * len], len, flags: 0 });
    return list.length - 1;
  };

  const trunkChain = chainCount++;
  let prev = -1;
  const trunk = [];
  for (let i = 0; i < trunkNodes; i += 1) {
    const sway = Math.sin(i * 0.7) * 0.16;
    prev = add(prev, 0, trunkChain, axisAngle([0, 0, 1], i === 0 ? 0 : sway), nodeLen * (1 - i * 0.02));
    trunk.push(prev);
  }
  const tips = [];
  for (let k = 0; k < primaries; k += 1) {
    const base = trunk[Math.min(trunk.length - 2, 3 + Math.round(k * (trunkNodes - 6) / Math.max(1, primaries - 1)))];
    const chain = chainCount++;
    const azimuth = k * 2.4 + rng.range(-0.3, 0.3);
    let p = base;
    const members = [];
    for (let j = 0; j < 6; j += 1) {
      const lean = j === 0 ? 1.15 : rng.range(-0.12, 0.1) + (j > 3 ? -0.05 : 0.04);
      const turn = axisAngle([Math.cos(azimuth), 0, Math.sin(azimuth)], 0);
      const bend = j === 0 ? mul(axisAngle([0, 1, 0], azimuth), axisAngle([1, 0, 0], lean)) : mul(turn, axisAngle([Math.cos(azimuth + 1.57), 0, Math.sin(azimuth + 1.57)], lean * 0.25));
      p = add(p, 1, chain, norm(bend), nodeLen * (1.05 - j * 0.07));
      members.push(p);
      if (j === 3) {
        const twigChain = chainCount++;
        let t = p;
        for (let m = 0; m < 3; m += 1) {
          t = add(t, 2, twigChain, norm(mul(axisAngle([0, 1, 0], 0.8 + k), axisAngle([1, 0, 0], m === 0 ? 0.9 : rng.range(-0.1, 0.1)))), nodeLen * 0.55);
        }
        tips.push({ node: t, radius: 0.28 });
      }
    }
    tips.push({ node: p, radius: 0.42 });
    if (k === 0) list[members[0]].flags |= NODE_FLAG.WIRED, members.slice(1).forEach((i) => { list[i].flags |= NODE_FLAG.WIRED; });
  }

  const n = list.length;
  const childRadiusSq = new Float64Array(n);
  const r0 = new Float32Array(n);
  const r1 = new Float32Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    const base = childRadiusSq[i] > 0 ? Math.sqrt(childRadiusSq[i]) : 0.018;
    r1[i] = Math.max(0.018, base);
    r0[i] = r1[i] * 1.06 + (list[i].order === 0 && i === 0 ? 0.04 : 0);
    if (list[i].parent >= 0) childRadiusSq[list[i].parent] += r0[i] * r0[i];
  }

  const skel = {
    count: n,
    ids: new Int32Array(n), parent: new Int32Array(n), order: new Uint8Array(n), chain: new Int32Array(n),
    start: new Float32Array(3 * n), end: new Float32Array(3 * n), quat: new Float32Array(4 * n),
    r0, r1, flags: new Uint8Array(n), fresh: new Float32Array(n), scarAge: new Float32Array(n),
  };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  list.forEach((node, i) => {
    skel.ids[i] = 1000 + i; skel.parent[i] = node.parent; skel.order[i] = node.order; skel.chain[i] = node.chain; skel.flags[i] = node.flags;
    skel.start.set(node.start, 3 * i); skel.end.set(node.end, 3 * i); skel.quat.set(node.q, 4 * i);
    for (let a = 0; a < 3; a += 1) { min[a] = Math.min(min[a], node.start[a] - r0[i], node.end[a] - r1[i]); max[a] = Math.max(max[a], node.start[a] + r0[i], node.end[a] + r1[i]); }
  });
  const m = tips.length;
  skel.pads = { count: m, node: new Int32Array(m), center: new Float32Array(3 * m), normal: new Float32Array(3 * m), radius: new Float32Array(m), density: new Float32Array(m), seed: new Uint32Array(m) };
  tips.forEach((tip, k) => {
    const node = list[tip.node];
    const dir = rotate(node.q, [0, 1, 0]);
    const normal = norm([dir[0] * 0.3, dir[1] * 0.3 + 1, dir[2] * 0.3]);
    skel.pads.node[k] = tip.node;
    skel.pads.center.set([node.end[0] + dir[0] * 0.12, node.end[1] + dir[1] * 0.12, node.end[2] + dir[2] * 0.12], 3 * k);
    skel.pads.normal.set(normal, 3 * k);
    skel.pads.radius[k] = tip.radius; skel.pads.density[k] = 1; skel.pads.seed[k] = rng.int(1, 0x7fffffff);
    for (let a = 0; a < 3; a += 1) { min[a] = Math.min(min[a], skel.pads.center[3 * k + a] - tip.radius); max[a] = Math.max(max[a], skel.pads.center[3 * k + a] + tip.radius); }
  });
  skel.bounds = { min, max, center: min.map((v, a) => (v + max[a]) / 2) };
  const wired = list.map((node, i) => (node.flags & NODE_FLAG.WIRED ? i : -1)).filter((i) => i >= 0);
  skel.wires = wired.length ? [{ nodes: Int32Array.from(wired), age: 2 }] : [];
  return skel;
}
