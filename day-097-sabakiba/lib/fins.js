import { loft, samples, tube, joinGeometries, sectionVertex, namedMesh, bandAngle, bodyRing } from './loft.js';

// 根元と先を結ぶ鰭条の間を膜でつなぎます。両面と側縁があり、真上からも厚みが見えます。
function fin(group, name, rayAt, count, thickness, materials, q) {
  const rays = samples(count, rayAt);
  const rings = rays.map(({root, tip}) => [
    [root, 1], [tip, 0.26], [tip, -0.26], [root, -1],
  ].map(([p, scale]) => ({ p: [p[0], p[1], p[2] + scale * thickness], tag: 0 })));
  group.add(namedMesh(name, loft(rings, { capTag: 0 }), materials.fin ?? materials.skin));
  const rods = rays.slice(1, -1).map(({root, tip}) => {
    const start = root.slice(), end = tip.slice();
    start[2] += thickness * 0.82; end[2] += thickness * 0.18;
    return tube([start, end], [thickness * 0.75, thickness * 0.37], q >= 10 ? 5 : 4, 0);
  });
  if (rods.length) group.add(namedMesh(name + 'のすじ', joinGeometries(rods), materials.ray ?? materials.bone));
}

function medianFin(group, a, data, up, name, m, q) {
  const start = data.origin / 100, end = data.end / 100, direction = up ? 1 : -1;
  const long = (data.softRays ?? 0) > 8, count = Math.max(6, (data.spines ?? 0) + (data.softRays ?? 7));
  fin(group, name, t => {
    const s = start + (end - start) * t;
    const root = a.flank(s, direction), peak = long ? 0.11 : 0.23;
    const envelope = t < peak ? Math.sin(t / peak * Math.PI / 2)
      : (1 - (t - peak) / (1 - peak)) ** (long ? 0.64 : 1.45);
    const height = (0.025 + envelope * 0.975) * data.height / 100 * a.SL;
    return { root, tip: [root[0] + height * (long ? 0.45 : 0.32), root[1] + direction * height, 0] };
  }, count + 2, a.SL * 0.0019, m, q);
}

export function addMedianFins(group, a, species, stations, m, q) {
  const fins = species.fins ?? {};
  for (const [i, data] of (fins.dorsal ?? []).entries()) medianFin(group, a, data, true, `第${i + 1}背ビレ`, m, q);
  if (fins.anal) medianFin(group, a, fins.anal, false, '尻ビレ', m, q);
  for (const [side, count] of Object.entries(fins.finlets ?? {})) {
    for (let i = 0; i < count; i++) {
      const origin = 84 + i * 13 / count;
      medianFin(group, a, { origin, end: origin + 7 / count, height: 1.7, softRays: 3 }, side === 'dorsal', '小離ビレ', m, q);
    }
  }
  fin(group, '尾ビレ', t => a.caudalRay(2 * t - 1), 2 * q + 1, a.finThickness, m, q);
  const trunk = stations.filter(s => s >= a.head && s <= a.tail);
  const stockParts = [], recess = new Map();
  for (const direction of [1, -1]) {
    const rings = trunk.map(center => {
      const ring = [];
      for (const inward of [false, true]) {
        for (const j of (inward ? [1, 0, -1] : [-1, 0, 1])) {
          const phi = direction * Math.PI / 2 + j * bandAngle;
          ring.push(sectionVertex(a, center, s => {
            const v = a.surface(s, phi), pr = a.profile(s);
            if (inward) {
              v.p[1] -= direction * Math.min(a.skinT + 0.010 * a.SL, (direction > 0 ? pr.top : pr.bottom) * 0.3);
              v.p[2] *= 0.86;
            }
            const tag = !inward && j < 1 ? 0 : 4;
            return { p: v.p, n: inward ? undefined : v.n, nTag: 0, tag, uv: [s, (phi / (2 * Math.PI) + 1) % 1] };
          }));
        }
      }
      return ring;
    });
    stockParts.push(loft(rings, { caps: [true, false], materialForTag: { 4: 1, 3: 2 } }));
    recess.set(direction > 0 ? q : 3 * q, rings.at(-1).slice(3).reverse());
  }
  // 尾柄の蓋に皮の帯の断面をくり抜きます。帯と尾柄の接合部には内部の蓋が残りません。
  const rows = stations.filter(s => s >= a.tail).map(s => bodyRing(a, s, q));
  const front = rows[0].flatMap((v, j) => recess.get(j) ?? [v]);
  stockParts.push(loft(rows, { flip: true, capContours: [front], materialForTag: {3: 2} }));
  group.add(namedMesh('尾柄とヒレの付け根の皮', joinGeometries(stockParts, true), [m.skin, m.flesh, m.cap]));
}

export function addPairedFins(group, a, species, m, q) {
  const fins = species.fins ?? {};
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? 1 : -1;
    for (const pelvic of [false, true]) {
      const data = (pelvic ? fins.pelvic : fins.pectoral) ?? {};
      const base = (pelvic ? data.origin ?? 31 : data.base ?? 28) / 100;
      const length = (data.length ?? (pelvic ? 11 : 23)) / 100;
      fin(group, pelvic ? '腹ビレ' + side : '胸ビレ' + side, t => {
        const ratio = pelvic ? -0.82 - t * 0.10 : 0.13 - t * 0.32;
        const root = a.flank(base - t * 0.012, ratio, side);
        const reach = length * (0.04 + 0.96 * Math.sin((1 - t) * Math.PI / 2) ** 1.6);
        const endS = base + reach;
        const target = a.flank(endS, pelvic ? -0.92 : 0.36 - 0.48 * t, side);
        target[2] = sign * (Math.max(Math.abs(target[2]), Math.abs(root[2])) + a.SL * (0.004 + 0.020 * (1 - t)));
        if (pelvic) target[1] -= a.SL * 0.026 * (1 - t);
        return { root, tip: target };
      }, q + 2, 0.0018 * a.SL, m, q);
    }
  }
}
