import { bodyRing, ellipsoid, loft, namedMesh, samples, tube } from './loft.js';
import { addPairedFins } from './fins.js';

export function addHead(group, a, species, stations, m, q) {
  group.add(namedMesh('頭と切り口', loft(stations.map(s => bodyRing(a, s, q)), {
    flip: true, caps: [false, true], materialForTag: { 3: 1 },
  }), [m.skin, m.cap]));
  const shape = species.shape ?? {}, headLength = (shape.headLength ?? 27.5) / 100;
  const eye = a.point('eye'), radius = a.SL * headLength * (shape.eyeDia ?? 22.6) / 200;
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? 1 : -1;
    // 眼球の後半は頬の中に埋め、虹彩の中央に瞳孔と小さな映り込みを重ねます。
    const centers = species.family === 'flat' ? (side === 'L' ? [eye, a.flank(eye[0] / a.SL + 0.035, 0.63)] : []) : [eye];
    for (const [i, center] of centers.entries()) {
      const depth = species.family === 'flat' ? Math.min(radius, center[2] / 1.2) : radius;
      const drawEye = (name, dx, dy, dz, axes, mat) => group.add(namedMesh(name + side + (i ? '2' : ''),
        ellipsoid([center[0] + dx * radius, center[1] + dy * radius, sign * (center[2] + dz * depth)],
          [axes[0] * radius, axes[1] * radius, axes[2] * depth], q + 1, 2 * q, 0), mat));
      drawEye('虹彩', 0, 0, -0.31, [1, 0.98, 0.82], m.iris ?? m.bone);
      drawEye('瞳孔', -0.04, 0.01, 0.32, [0.62, 0.64, 0.25], m.eye ?? m.organ);
      drawEye('目の光', -0.21, 0.27, 0.54, [0.12, 0.11, 0.044], m.glint ?? m.bone);
    }
    const mouthLength = headLength * (shape.mouthLength ?? 38) / 100;
    const mouthStart = shape.jawProjection ? shape.jawProjection / 100 : 0.001;
    const mouth = samples(q + 3, t => {
      const rise = shape.mouth === 'superior' ? 0.30 : shape.mouth === 'inferior' ? -0.30 : 0;
      return a.flank(mouthStart + t * mouthLength, rise * (1 - t) - 0.30 * Math.sin(t * Math.PI / 2), side);
    });
    group.add(namedMesh('口の溝' + side, tube(mouth, mouth.map((_, i) =>
      a.SL * (0.00045 + 0.00125 * Math.sin(Math.PI * i / (mouth.length - 1)))), 5, 0), m.dark ?? m.organ));
    function plate(t, phi) {
      const ratio = -0.80 + t * 1.64;
      const cut = a.stationOnSection(a.head, s => a.flank(s, ratio, side)[1]);
      const back = cut - 0.008 - 0.018 * (2 * t - 1) ** 2;
      const bulge = t === 0 || t === 1 ? 0 : Math.sin(Math.PI * t);
      const s = back - headLength * 0.35 * bulge * (1 - Math.cos(phi)) / 2;
      const p = a.flank(s, ratio, side);
      p[2] += sign * a.SL * (0.00065 + 0.0043 * bulge * Math.sin(phi));
      const pr = a.profile(s), n = ratio >= 0 ? pr.nTop : pr.nBottom;
      const theta = Math.asin(Math.sign(ratio) * Math.abs(ratio) ** (n / 2));
      const angle = sign > 0 ? theta : Math.PI - theta;
      return { p, tag: 0, uv: [s, (angle / (2 * Math.PI) + 1) % 1] };
    }
    const rows = samples(2 * q + 1, t => Array.from({length: 2 * q}, (_, j) => plate(t, j * Math.PI / q)));
    group.add(namedMesh('鰓蓋' + side, loft(rows, { caps: [false, false] }), m.skin));
    const rim = samples(2 * q + 1, t => plate(t, 0).p);
    group.add(namedMesh('鰓蓋の縁' + side, tube(rim, rim.map((_, j) =>
      a.SL * (0.0004 + 0.0008 * Math.sin(j * Math.PI / (rim.length - 1)))), 5, 0), m.dark ?? m.organ));
    if (species.look?.patterns?.includes('opercleSpot')) {
      const p = plate(0.87, 1.1).p, r = a.SL * 0.009;
      group.add(namedMesh('鰓蓋の斑点' + side, ellipsoid(p, [r, r * 0.78, r * 0.5], 5, q, 0), m.dark ?? m.organ));
    }
  }
  addPairedFins(group, a, species, m, q);
}
