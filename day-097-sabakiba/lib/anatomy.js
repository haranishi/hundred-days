import { CURVE_INFO } from './contract.js';
import { clamp01, makeProfile } from './profile.js';

const HALF_PI = Math.PI / 2;
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { const u = clamp01(t); return u * u * (3 - 2 * u); };
const unit = (v) => { const length = Math.hypot(...v); return v.map(k => k / length); };
const signedPower = (x, power) => Math.abs(x) < 1e-14 ? 0 : Math.sign(x) * Math.abs(x) ** power;

export function createAnatomy(species, { segments = 44 } = {}) {
  const shape = species.shape ?? {};
  const TL = species.sizeCm.typical, SL = TL / (shape.TL_over_SL ?? 1.16);
  const profile = makeProfile(shape, species.family, SL);
  const fins = species.fins ?? {}, dorsal = fins.dorsal ?? [];
  const opercle = (shape.opercleEdge ?? shape.headLength ?? 27.5) / 100;
  const eyeS = (shape.eyePos ?? (shape.headLength ?? 27.5) * ((shape.snout ?? 31) + (shape.eyeDia ?? 22.6) / 2) / 100) / 100;
  const vent = (species.vent ?? 50) / 100, cavityEnd = (species.cavityEnd ?? vent * 100) / 100;
  const skinT = 0.05, wallT = 0.012 * SL, stripT = 0.014 * SL;
  const diameter = species.vertebraDia ?? shape.vertebraDia;
  const peak = profile((shape.maxDepthPos ?? 40) / 100);
  const radius = diameter == null ? 0.0125 * SL : (peak.top + peak.bottom) * diameter / 200;

  function coordinates(s, phi, pr) {
    const sin = Math.sin(phi), cos = Math.cos(phi), up = sin >= 0;
    const exponent = up ? pr.nTop : pr.nBottom;
    return [s * SL, pr.axisY + (up ? pr.top : pr.bottom) * signedPower(sin, 2 / exponent),
      pr.half * signedPower(cos, 2 / exponent)];
  }
  function surface(s, phi) {
    s = clamp01(s);
    const pr = profile(s), p = coordinates(s, phi, pr);
    if (s === 0) return { p, n: [-1, 0, 0] };
    const sin = Math.sin(phi), cos = Math.cos(phi);
    const exponent = sin >= 0 ? pr.nTop : pr.nBottom;
    const ny = signedPower(sin, 2 - 2 / exponent) / (sin >= 0 ? pr.top : pr.bottom);
    const nz = signedPower(cos, 2 - 2 / exponent) / pr.half;
    // 圧縮した超楕円の勾配と、長さ方向の接線との直交から x 成分を得ます。
    const delta = Math.min(0.00002, s / 2), a = s - delta, b = Math.min(1, s + delta);
    const pa = coordinates(a, phi, profile(a)), pb = coordinates(b, phi, profile(b));
    const nx = -(ny * (pb[1] - pa[1]) + nz * (pb[2] - pa[2])) / ((b - a) * SL);
    return { p, n: unit([nx, ny, nz]) };
  }
  function flank(s, ratio, side = 'L') {
    const pr = profile(s), n = ratio >= 0 ? pr.nTop : pr.nBottom;
    const phi = Math.asin(signedPower(Math.max(-1, Math.min(1, ratio)), n / 2));
    return coordinates(s, side === 'R' ? Math.PI - phi : phi, pr);
  }
  const headCutTop = flank(opercle + 0.01, 1), headCutBottom = flank(opercle - 0.04, -1);
  const headSlope = (headCutTop[0] - headCutBottom[0]) / (headCutTop[1] - headCutBottom[1]);
  const head = (headCutTop[0] - headSlope * headCutTop[1]) / SL, tail = 0.94, tailSlope = 0.14;
  function cutPlane(name) {
    if (name === 'head') return { point: [...headCutTop], normal: unit([1, -headSlope, 0]) };
    if (name === 'tail') return { point: [tail * SL, 0, 0], normal: unit([1, -tailSlope, 0]) };
    throw new RangeError(`切断面「${name}」はありません。`);
  }
  // 切断面の近傍だけ駅を傾けます。頭と身、皮と帯も同じ面と輪郭の交点を使います。
  function stationOnSection(center, ordinate) {
    const slope = headSlope * smooth(1 - Math.abs(center - head) / 0.12)
      + tailSlope * smooth(1 - Math.abs(center - tail) / 0.05);
    if (slope === 0) return center;
    let s = center;
    for (let i = 0; i < 15; i++) {
      const next = clamp01(center + slope * ordinate(s) / SL);
      if (Math.abs(s - next) < 1e-13) return next;
      s = next;
    }
    return s;
  }
  function spineRadius(s) {
    const pr = profile(s);
    return Math.min(radius, pr.half * 0.58, pr.top * 0.43, pr.bottom * 0.43);
  }
  function groove(s, height) {
    const r = spineRadius(s);
    return Math.max(0.35 * r, Math.sqrt(Math.max(0, r * r - height * height)));
  }
  // 高さをそろえた外弧・腹壁・腹骨層。深さは体軸から背または腹への距離です。
  function filletSection(s, isDorsal) {
    const pr = profile(s), n = isDorsal ? pr.nTop : pr.nBottom, r = spineRadius(s);
    const width = Math.max(pr.half - skinT, pr.half * 0.5);
    const h = isDorsal ? pr.top : pr.bottom, height = Math.max(h - skinT, h * 0.5);
    const rim = 0.35 * r, limit = height * (1 - (rim / width) ** n) ** (1 / n);
    const widthAt = (d) => width * Math.max(0, 1 - (d / height) ** n) ** (1 / n);
    const roof = Math.min(1.06 * r, 0.90 * limit);
    const floor = Math.max(roof + 0.25 * (limit - roof), limit - Math.min(wallT * 0.85, limit * 0.15));
    const extent = smooth((cavityEnd - s) / Math.max(0.02, (cavityEnd - head) * 0.40));
    function wall(d) {
      const seam = Math.max(rim, Math.sqrt(Math.max(0, r * r - d * d)));
      const t = (d - roof) / (floor - roof);
      const bulge = extent * smooth(t / 0.16) * smooth((1 - t) / 0.22);
      const room = Math.max(0, widthAt(d) - seam);
      const outerWall = Math.max(room * 0.30, room - wallT);
      const layer = Math.min(outerWall * 0.58, stripT);
      return { seam, boundary: seam + outerWall * bulge, inside: seam + (outerWall - layer) * bulge };
    }
    return { axisY: pr.axisY, height, width, n, r, limit, roof, floor, widthAt, wall };
  }

  const base = profile(1), tailLength = TL - SL, fork = clamp01(fins.caudal?.forkDepth ?? 0.72);
  const finHeight = Math.max(base.top, base.bottom) * 0.75 + tailLength * 0.87;
  const finThickness = 0.003 * SL;
  function caudalRay(t) {
    return { root: [SL, base.axisY + t * (t < 0 ? base.bottom : base.top), 0],
      tip: [SL + tailLength * (1 - fork + fork * Math.abs(t)), base.axisY + t * finHeight, 0] };
  }
  function inside(p) {
    if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) return false;
    const [x, y, z] = p, eps = SL * 1e-7;
    if (x < -eps || x > TL + eps) return false;
    if (x > SL + eps) {
      const u = (x - SL) / tailLength, dy = y - base.axisY;
      const outer = mix(dy >= 0 ? base.top : base.bottom, finHeight, u);
      const inner = fork > 0 ? Math.max(0, (u - 1 + fork) / fork) * finHeight : 0;
      if (Math.abs(dy) > outer + eps || Math.abs(dy) < inner - eps) return false;
      // 同じ高さを通る鰭条を逆算し、先端に向かって薄くなる膜の厚みを求めます。
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) {
        const t = (lo + hi) / 2, ray = Math.abs(dy) / mix(dy >= 0 ? base.top : base.bottom, finHeight, t);
        if (t * (1 - fork + fork * ray) < u) lo = t;
        else hi = t;
      }
      return Math.abs(z) <= finThickness * (1 - 0.74 * (lo + hi) / 2) + eps;
    }
    const pr = profile(x / SL), dy = y - pr.axisY;
    if (pr.half < eps) return Math.hypot(dy, z) < eps;
    const n = dy >= 0 ? pr.nTop : pr.nBottom;
    return (Math.abs(dy) / (dy >= 0 ? pr.top : pr.bottom)) ** n + (Math.abs(z) / pr.half) ** n <= 1 + 2e-6;
  }
  const dorsalStart = (dorsal[0]?.origin ?? 34) / 100, dorsalEnd = (dorsal.at(-1)?.end ?? 90) / 100;
  const analStart = (fins.anal?.origin ?? 53) / 100, analEnd = (fins.anal?.end ?? 90) / 100;
  const axial = (s) => [s * SL, profile(s).axisY, 0];
  const anchors = {
    snout: axial(0), eye: flank(eyeS, 0.20), mouth: flank(0.014, shape.mouth === 'inferior' ? -0.12 : 0.12),
    opercleTop: flank(opercle - 0.015, 0.78), opercleBottom: flank(opercle - 0.044, -0.78),
    headCutTop, headCutBottom, pectoralBase: flank((fins.pectoral?.base ?? 28) / 100, -0.03),
    pelvicBase: flank((fins.pelvic?.origin ?? 31) / 100, -0.83), cavityStart: [head * SL, profile(head).axisY - spineRadius(head), 0],
    vent: flank(vent, -1), dorsalFinStart: flank(dorsalStart, 1), dorsalFinEnd: flank(dorsalEnd, 1),
    analFinStart: flank(analStart, -1), analFinEnd: flank(analEnd, -1), peduncle: axial(1),
    tailTip: caudalRay(1).tip, spineHeadEnd: axial(head), bodyCenter: axial(0.50),
  };
  function point(name) {
    if (!Object.hasOwn(anchors, name)) throw new RangeError(`目印「${name}」はありません。`);
    return [...anchors[name]];
  }
  const count = Math.max(32, Math.round(segments) || 44);
  const sample = (fn) => Array.from({ length: count }, (_, i) => fn(i / (count - 1)));
  function curve(name, side) {
    const info = Object.hasOwn(CURVE_INFO, name) && CURVE_INFO[name];
    if (!info) throw new RangeError(`線「${name}」はありません。`);
    if (info.sides && side !== 'L' && side !== 'R') throw new RangeError(`線「${name}」には左右の指定が必要です。`);
    const sign = side === 'R' ? -1 : 1, outer = ratio => s => flank(s, ratio, side);
    const atPlane = (center, fn) => stationOnSection(center, s => fn(s)[1]);
    const span = (fn, start, end) => sample(t => fn(mix(start, end, t)));
    const fromHead = (fn, end) => span(fn, atPlane(head, fn), end ?? atPlane(tail, fn));
    const inner = (s, height, z) => [s * SL, profile(s).axisY + height, z * sign];
    let points;
    switch (name) {
      case 'headCut':
        points = sample(t => {
          const phi = HALF_PI - sign * t * Math.PI;
          const at = s => coordinates(s, phi, profile(s));
          return at(atPlane(head, at));
        }); break;
      case 'dorsalMidline': points = fromHead(outer(1), 1); break;
      case 'ventralMidline': points = fromHead(outer(-1), 1); break;
      case 'lateralLine': points = fromHead(outer(0.15), 1); break;
      case 'scaleSweep': points = span(outer(0), 1, opercle); break;
      case 'scuteRow': points = span(outer(0.15), 1, Math.max((species.scutes?.from ?? 0) / 100, 0.53)); break;
      case 'bellySlit': points = span(outer(-1), vent, headCutBottom[0] / SL); break;
      case 'kidneyLine': points = fromHead(s => inner(s, -spineRadius(s), 0), vent); break;
      case 'dorsalCut': points = fromHead(outer(0.88)); break;
      case 'ventralCut': points = span(outer(-0.85), vent, atPlane(tail, outer(-0.85))); break;
      case 'boneCut': points = fromHead(s => inner(s, 0, spineRadius(s))); break;
      case 'tailCut': {
        const sec = filletSection(tail, true), lower = filletSection(tail, false);
        points = sample(t => {
          const h = mix(sec.limit * 0.98, -lower.limit * 0.98, t);
          return inner(tail, h, groove(tail, h));
        }); break;
      }
      case 'ribStrip':
      case 'handOpen':
        points = fromHead(s => {
          const d = profile(s).bottom * (name === 'ribStrip' ? 0.55 : 0.40);
          const wall = filletSection(s, false).wall(d);
          return inner(s, -d, name === 'ribStrip' ? wall.boundary : wall.inside);
        }, vent); break;
      case 'pinBoneLine': points = fromHead(s => inner(s, 0.35 * spineRadius(s), groove(s, 0.35 * spineRadius(s)))); break;
      case 'skinPeel': points = fromHead(outer(0)).reverse(); break;
      case 'sliceLine': case 'lateralSplit': points = fromHead(outer(0)); break;
      case 'chiaiTrim': points = fromHead(outer(-0.12)); break;
      case 'dorsalOpen':
        points = fromHead(s => {
          const pr = profile(s), z = Math.min(0.15, pr.half * 0.7);
          return [s * SL, pr.axisY + pr.top * (1 - (z / pr.half) ** pr.nTop) ** (1 / pr.nTop), z];
        }); break;
      case 'boneLift': points = fromHead(axial, 1); break;
      case 'engawaCut': points = span(outer(0.96), dorsalStart, dorsalEnd); break;
    }
    return { points, onSurface: !info.inner };
  }
  // 箱は吻から尾端までを取り、背・尻・対になったヒレの張り出しも含めます。
  const dorsalHeight = Math.max(0, ...dorsal.map(f => f.height ?? 0)) / 100 * SL;
  const bounds = { min: [0, -Math.max(finHeight, peak.bottom + (fins.anal?.height ?? 9) / 100 * SL), -peak.half - SL * 0.04],
    max: [TL, Math.max(finHeight, peak.top + dorsalHeight), peak.half + SL * 0.04] };
  return { SL, TL, bounds, profile, surface, inside, point, curve, cutPlane, stationOnSection, flank, spineRadius,
    groove, filletSection, caudalRay, finThickness, skinT, wallT, stripT, head, tail, cavityEnd, vent };
}
