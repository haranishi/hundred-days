// OWNER: chars-art
// 人体の部品と小道具の形。休みの姿勢（立って両腕を下ろした姿、正面 +Z）で置き、骨の重みを付けて builder へ足す。
// 関節の継ぎ目は、布（袖・袴・裾）や鎧（草摺・籠手）を包みの重みで曲げて隠す。
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Matrix4, SphereGeometry, Vector3 } from 'three';
import { COLOR, FACE_CONTOUR, FACE_SHAPE, HAKAMA_PLEATS, HEAD, KIMONO_COLLAR, LANTERN, LANTERN_GLOW, SURF, type FaceShape } from '../config';
import { B, type Dims } from '../rig';
import type { RegionName } from './atlas';
import type { BoneSegment, MeshBuilder, Skin, Surf } from './builder';
import { bentPlate, box, cyl, ellipsoid, lathe, loft, mat, ring, tube, type Ring } from './shapes';

export interface Ctx {
  b: MeshBuilder;
  /** 休みの姿勢での各骨の位置（base から見た）。 */
  W: readonly Vector3[];
  d: Dims;
}

const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);

/** 包みの重みで使う、骨ごとの線分。 */
export function boneSegments(W: readonly Vector3[]): BoneSegment[] {
  const s: BoneSegment[] = W.map((p) => ({ a: p.clone(), b: p.clone().add(v(0, 0.01, 0)) }));
  const set = (i: number, a: Vector3, b: Vector3) => (s[i] = { a: a.clone(), b: b.clone() });
  set(B.hips, W[B.hips].clone().add(v(0, -0.08, 0)), W[B.hips].clone().add(v(0, 0.03, 0)));
  set(B.spine, W[B.spine], W[B.chest]);
  set(B.chest, W[B.chest], W[B.neck]);
  set(B.neck, W[B.neck], W[B.head]);
  set(B.head, W[B.head], W[B.head].clone().add(v(0, 0.2, 0)));
  for (const [sh, ua, fa, hd, th, sn, ft] of [
    [B.shoulderL, B.upperArmL, B.foreArmL, B.handL, B.thighL, B.shinL, B.footL],
    [B.shoulderR, B.upperArmR, B.foreArmR, B.handR, B.thighR, B.shinR, B.footR],
  ] as const) {
    set(sh, W[sh], W[ua]);
    set(ua, W[ua], W[fa]);
    set(fa, W[fa], W[hd]);
    set(hd, W[hd], W[hd].clone().add(v(0, -0.15, 0)));
    set(th, W[th], W[sn]);
    set(sn, W[sn], W[ft]);
    set(ft, W[ft], W[ft].clone().add(v(0, -0.06, 0.12)));
  }
  return s;
}

/** 片側（左 +1、右 -1）の骨の番号。 */
export function sideBones(side: 1 | -1) {
  const L = side > 0;
  return {
    shoulder: L ? B.shoulderL : B.shoulderR,
    upperArm: L ? B.upperArmL : B.upperArmR,
    foreArm: L ? B.foreArmL : B.foreArmR,
    hand: L ? B.handL : B.handR,
    thigh: L ? B.thighL : B.thighR,
    shin: L ? B.shinL : B.shinR,
    foot: L ? B.footL : B.footR,
    sleeve: L ? B.sleeveL : B.sleeveR,
    sode: L ? B.sodeL : B.sodeR,
  };
}

interface Look {
  color: number;
  surf: Surf;
  region?: RegionName;
}

/** 頭の中心（休みの姿勢）。 */
export function headCenter(c: Ctx): Vector3 {
  return c.W[B.head].clone().add(v(0, c.d.headCenterUp, c.d.headCenterFwd));
}

export { HEAD } from '../config';

/** 頭の半球（front=true で顔の側）。あごを少し細く、後ろの下（うなじ）を少し引っ込める。 */
function headHalf(front: boolean, scale: number, shape: FaceShape): BufferGeometry {
  const g = new SphereGeometry(1, 14, 12, front ? 0 : Math.PI, Math.PI);
  const P = g.getAttribute('position');
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i);
    const y = P.getY(i);
    let z = P.getZ(i);
    const low = Math.max(0, -y);
    // r06-chars: 顎と頬だけに個人差を付け、頭頂の被り物の当たりを維持する。
    const cheek = Math.max(0, 1 - Math.abs(y - FACE_CONTOUR.cheekY) / FACE_CONTOUR.cheekSpan);
    x *= 1 - shape.jaw * low * low + shape.cheek * cheek * cheek;
    if (z < 0) z *= 1 - FACE_CONTOUR.napeInset * low;
    else z *= 1 + shape.chinForward * low;
    P.setXYZ(i, x * HEAD.rx * scale, y * HEAD.ry * scale, z * HEAD.rz * scale);
  }
  g.computeVertexNormals();
  return g;
}

/** 頭：前の半球に顔の絵（正面から投影）、後ろの半球は髪（または頭巾）の色。耳と鼻も付ける。 */
export function head(c: Ctx, o: { face: RegionName; back: Look; scale?: number; ears?: boolean; shape?: FaceShape }): Vector3 {
  const hc = headCenter(c);
  const s = o.scale ?? 1;
  const shape = o.shape ?? FACE_SHAPE.ashigaru;
  const m = mat(hc.x, hc.y, hc.z);
  c.b.add(headHalf(true, s, shape), {
    color: 0xffffff,
    // r07-chars: 覆面は専用IDで、目の開口の肌には織り目を乗せない。
    surf: o.face === 'facePlayer' ? { ...SURF.cloth, detail: 4 } : SURF.skin,
    skin: { bone: B.head },
    region: o.face,
    uv: { kind: 'front', cx: hc.x, cy: hc.y, w: HEAD.rx * 2 * s, h: HEAD.ry * 2 * s },
    matrix: m,
  });
  c.b.add(headHalf(false, s, shape), { color: o.back.color, surf: o.back.surf, skin: { bone: B.head }, matrix: m });
  if (o.ears !== false) {
    for (const side of [1, -1]) {
      c.b.add(ellipsoid(0.012, 0.026, 0.018, 6, 5), {
        color: COLOR.skin,
        surf: SURF.skin,
        skin: { bone: B.head },
        matrix: mat(hc.x + side * HEAD.rx * 0.97 * s, hc.y - 0.006, hc.z - 0.004),
      });
    }
    c.b.add(ellipsoid(...shape.nose, 6, 5), {
      color: COLOR.skin,
      surf: SURF.skin,
      skin: { bone: B.head },
      matrix: mat(hc.x, hc.y + shape.noseY, hc.z + HEAD.rz * FACE_CONTOUR.noseForward * s, -12, 0, 0),
    });
  }
  return hc;
}

/** 首。 */
export function neck(c: Ctx, look: Look, r = 0.047): void {
  const n = c.W[B.neck];
  const h = c.W[B.head];
  c.b.add(loft([ring(0, n.y - 0.05, n.z - 0.004, r * 1.1, r), ring(0, (n.y + h.y) / 2, n.z, r, r * 0.96), ring(0, h.y + 0.025, h.z - 0.01, r * 0.92, r * 0.9)], 10), {
    ...look,
    skin: { envelope: [B.chest, B.neck, B.head], sharp: 3 },
  });
}

/** 胴の断面 [高さ, 横の半径, 前後の半径, 前後のずれ]。 */
export type Section = readonly [number, number, number, number];

/** 胴（腰から首の付け根まで）。 */
export function torso(c: Ctx, sections: readonly Section[], look: Look, inflate = 0, seg = 18, uvScale = 0): void {
  const rings = sections.map(([y, rx, rz, z]) => ring(0, y, z, rx + inflate, rz + inflate));
  c.b.add(loft(rings, seg, { capStart: true, capEnd: true }), {
    ...look,
    skin: { envelope: [B.hips, B.spine, B.chest, B.neck], sharp: 3 },
    uv: uvScale > 0 ? { kind: 'cyl', cx: 0, cz: 0, scale: uvScale, y0: sections[sections.length - 1][0] } : undefined,
  });
}

/** 基本の胴の形（服や鎧の下地。人物ごとに太さを掛けて使う）。 */
export function baseTorso(sx = 1, sz = 1): Section[] {
  const t: [number, number, number, number][] = [
    [0.84, 0.13, 0.095, 0.0],
    [0.9, 0.152, 0.11, -0.006],
    [0.98, 0.146, 0.104, 0.0],
    [1.05, 0.136, 0.1, 0.006],
    [1.15, 0.148, 0.108, 0.01],
    [1.24, 0.162, 0.114, 0.01],
    [1.31, 0.166, 0.108, 0.0],
    [1.36, 0.152, 0.094, -0.008],
    [1.395, 0.105, 0.075, -0.012],
    [1.42, 0.058, 0.052, -0.012],
  ];
  return t.map(([y, rx, rz, z]) => [y, rx * sx, rz * sz, z] as const);
}

/** r06-chars: 胴と同じ断面・包みの重みを使う合わせ襟。左身頃（+X）を上へ重ねる。 */
export function kimonoCollar(c: Ctx, sections: readonly Section[], look: Look, inflate: number, detail: 'player' | 'ranmaru' | 'nobunaga'): void {
  const cfg = KIMONO_COLLAR;
  const style = cfg[detail];
  const surfaceZ = (x: number, y: number): number => {
    let a = sections[0];
    let b = a;
    for (const section of sections) {
      b = section;
      if (section[0] >= y) break;
      a = section;
    }
    const t = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (y - a[0]) / (b[0] - a[0])));
    const rx = a[1] + (b[1] - a[1]) * t + inflate;
    const rz = a[2] + (b[2] - a[2]) * t + inflate;
    return a[3] + (b[3] - a[3]) * t + rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
  };
  const strip = (side: 1 | -1, width: number, endY: number, layer: number, cloth: Look) => {
    const points: Vector3[] = [];
    for (let i = 0; i < cfg.path.length; i++) {
      const [x, y] = cfg.path[i];
      if (y >= endY) points.push(v(side * x, y));
      else {
        const [px, py] = cfg.path[i - 1];
        points.push(v(side * (px + (x - px) * (py - endY) / (py - y)), endY));
        break;
      }
    }
    const curve = new CatmullRomCurve3(points);
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= cfg.segments; i++) {
      const t = i / cfg.segments;
      const p = curve.getPoint(t);
      const dir = curve.getTangent(t);
      for (let j = 0; j <= cfg.across; j++) {
        const u = j / cfg.across;
        const offset = (u - 0.5) * width;
        const x = p.x - dir.y * offset;
        const y = p.y + dir.x * offset;
        const z = surfaceZ(x, y) + cfg.surfaceLift + layer * cfg.overlapLift + cfg.edgeRoll * Math.sin(u * Math.PI);
        pos.push(x, y, z);
        uv.push(u, t);
        if (i < cfg.segments && j < cfg.across) {
          const a = i * (cfg.across + 1) + j;
          const b = a + cfg.across + 1;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    c.b.add(g, { ...cloth, skin: { envelope: [B.hips, B.spine, B.chest, B.neck], sharp: cfg.skinSharp } });
  };
  for (const side of [-1, 1] as const) {
    const layer = side > 0 ? 2 : 0;
    strip(side, style.innerWidth, style.innerEndY, layer, { color: 'innerColor' in style ? style.innerColor : COLOR.white, surf: SURF.cloth });
    // 下になる右身頃は合わせ目で隠れる。両側を帯まで伸ばすと胸に不自然なXが出る。
    const endY = 'outerEndY' in style ? style.outerEndY : side > 0 ? cfg.path[cfg.path.length - 1][1] : style.innerEndY;
    strip(side, style.width, endY, layer + 1, look);
  }
}

/** 腕（肩から手首まで1本の筒。包みの重みで肘が曲がる）。r は [肩, 上腕, 肘, 前腕, 手首]。 */
export function arm(c: Ctx, side: 1 | -1, look: Look, r: readonly number[] = [0.05, 0.047, 0.04, 0.04, 0.029], shoulder?: { rise: number; inset: number }): void {
  const sb = sideBones(side);
  const ua = c.W[sb.upperArm];
  const fa = c.W[sb.foreArm];
  const hd = c.W[sb.hand];
  const rings: Ring[] = [
    // r07-chars: 小袖の内側にある腕の上端は袖より低く置く。他の人物の既存肩口は保持。
    ring(ua.x - side * (shoulder?.inset ?? 0.01), ua.y + (shoulder?.rise ?? 0.04), ua.z, r[0] * 0.7, r[0] * 0.7),
    ring(ua.x, ua.y, ua.z, r[0], r[0] * 0.95),
    ring(ua.x, (ua.y + fa.y) / 2, ua.z, r[1], r[1] * 0.95),
    ring(fa.x, fa.y, fa.z, r[2], r[2]),
    ring(fa.x, fa.y - (fa.y - hd.y) * 0.35, fa.z, r[3], r[3] * 0.9),
    ring(hd.x, hd.y + 0.012, hd.z, r[4] * 1.15, r[4] * 0.85),
  ];
  c.b.add(loft(rings, 10, { capStart: true, capEnd: true }), {
    ...look,
    skin: { envelope: [sb.shoulder, sb.upperArm, sb.foreArm, sb.hand], sharp: 4 },
  });
}

/** 袖（腕を包む太い筒）。from=0 は肩、to は前腕に沿った割合（1 で手首）。 */
export function sleeveTube(c: Ctx, side: 1 | -1, look: Look, rTop: number, rEnd: number, to: number, uvScale = 0, shoulderRise = 0.05): void {
  const sb = sideBones(side);
  const ua = c.W[sb.upperArm];
  const fa = c.W[sb.foreArm];
  const hd = c.W[sb.hand];
  const end = fa.clone().lerp(hd, to);
  const rings: Ring[] = [
    ring(ua.x - side * 0.03, ua.y + shoulderRise, ua.z, rTop * 0.75, rTop * 0.75),
    ring(ua.x + side * 0.004, ua.y, ua.z, rTop, rTop),
    ring(ua.x + side * 0.004, (ua.y + fa.y) / 2, ua.z, (rTop + rEnd) / 2 + 0.006, (rTop + rEnd) / 2 + 0.004),
    ring(fa.x, fa.y, fa.z, (rTop + rEnd) / 2, (rTop + rEnd) / 2),
    ring(end.x, end.y, end.z, rEnd, rEnd * 0.95),
  ];
  c.b.add(loft(rings, 12, { capStart: true }), {
    ...look,
    skin: { envelope: [sb.shoulder, sb.upperArm, sb.foreArm], sharp: 4 },
    uv: uvScale > 0 ? { kind: 'cyl', cx: ua.x, cz: ua.z, scale: uvScale, y0: ua.y + 0.05 } : undefined,
  });
}

/** 握った手（拳）。指の腹は掌の側（右手は +X、左手は -X）、親指は前（+Z）。 */
export function fist(c: Ctx, side: 1 | -1, look: Look): void {
  const sb = sideBones(side);
  const h = c.W[sb.hand];
  const inX = -side; // 掌の向き（体の中心側）
  c.b.add(ellipsoid(0.026, 0.046, 0.04, 10, 8), { ...look, skin: { bone: sb.hand }, matrix: mat(h.x + inX * 0.004, h.y - 0.045, h.z) });
  c.b.add(ellipsoid(0.03, 0.03, 0.043, 10, 8), { ...look, skin: { bone: sb.hand }, matrix: mat(h.x + inX * 0.012, h.y - 0.088, h.z) });
  c.b.add(ellipsoid(0.013, 0.03, 0.013, 6, 5), { ...look, skin: { bone: sb.hand }, matrix: mat(h.x + inX * 0.012, h.y - 0.06, h.z + 0.036, 20, 0, 0) });
}

/** 脚（腿の付け根から足首まで1本の筒）。r は [付け根, 腿, 膝, ふくらはぎ, 足首]。 */
export function leg(c: Ctx, side: 1 | -1, look: Look, r: readonly number[] = [0.085, 0.07, 0.052, 0.05, 0.033]): void {
  const sb = sideBones(side);
  const th = c.W[sb.thigh];
  const sn = c.W[sb.shin];
  const ft = c.W[sb.foot];
  const rings: Ring[] = [
    ring(th.x - side * 0.01, th.y + 0.06, th.z, r[0] * 0.8, r[0] * 0.8),
    ring(th.x, th.y, th.z, r[0], r[0] * 0.95),
    ring(th.x, (th.y + sn.y) / 2 + 0.03, th.z + 0.004, r[1], r[1]),
    ring(sn.x, sn.y, sn.z + 0.004, r[2], r[2]),
    ring(sn.x, sn.y - 0.12, sn.z - 0.008, r[3], r[3] * 1.05),
    ring(ft.x, ft.y + 0.035, ft.z - 0.004, r[4], r[4]),
  ];
  c.b.add(loft(rings, 10, { capStart: true, capEnd: true }), {
    ...look,
    skin: { envelope: [B.hips, sb.thigh, sb.shin, sb.foot], sharp: 4, bias: { [B.hips]: 0.5 } },
  });
}

/** 足（足袋）と、草鞋（わらじ）または草履の底。足首の真下が足の裏の基準点。 */
export function foot(c: Ctx, side: 1 | -1, tabi: Look, sole: 'waraji' | 'zori' | 'none'): void {
  const sb = sideBones(side);
  const f = c.W[sb.foot];
  const d = c.d;
  const x = f.x;
  const rings: Ring[] = [
    ring(x, 0.042, f.z - d.heel + 0.012, 0.026, 0.02),
    ring(x, 0.05, f.z - d.heel * 0.4, 0.036, 0.034),
    ring(x + side * 0.004, 0.045, f.z + 0.05, 0.04, 0.034),
    ring(x + side * 0.006, 0.03, f.z + d.toe * 0.82, 0.037, 0.024),
    ring(x + side * 0.006, 0.02, f.z + d.toe, 0.022, 0.014),
  ];
  c.b.add(loft(rings, 10, { capStart: true, capEnd: true, ref: v(1, 0, 0) }), { ...tabi, skin: { bone: sb.foot } });
  // 足首の筒（脚とのつなぎ目を隠す）
  c.b.add(cyl(0.036, 0.04, 0.07, 10), { ...tabi, skin: { envelope: [sb.shin, sb.foot], sharp: 3 }, matrix: mat(x, f.y + 0.0, f.z - 0.004) });
  if (sole === 'none') return;
  const len = d.heel + d.toe + 0.02;
  const zc = f.z + (d.toe - d.heel) / 2;
  c.b.add(box(0.085, 0.012, len, 2, 1, 4), {
    color: sole === 'waraji' ? COLOR.straw : 0x8a7350,
    surf: SURF.straw,
    region: 'straw',
    skin: { bone: sb.foot },
    matrix: mat(x + side * 0.004, 0.006, zc),
  });
  // 鼻緒（前から足の甲へ）
  c.b.add(tube([v(x + side * 0.004, 0.012, f.z + d.toe * 0.8), v(x + side * 0.03, 0.045, f.z + 0.03), v(x + side * 0.034, 0.012, f.z - 0.01)], 0.005, 4, 6), {
    color: sole === 'waraji' ? COLOR.rope : 0x2a2220,
    surf: SURF.cloth,
    skin: { bone: sb.foot },
  });
  c.b.add(tube([v(x - side * 0.03, 0.012, f.z + 0.0), v(x, 0.05, f.z + 0.02), v(x + side * 0.004, 0.012, f.z + d.toe * 0.8)], 0.005, 4, 6), {
    color: sole === 'waraji' ? COLOR.rope : 0x2a2220,
    surf: SURF.cloth,
    skin: { bone: sb.foot },
  });
}

/** 袴（左右の筒。上は腰に、下は脛に重みを寄せる）。 */
export function hakama(c: Ctx, look: Look, o: { waistY: number; hemY: number; hip: number; knee: number; hem: number; uvScale?: number; pleats?: number; pleatAmp?: number }): void {
  for (const side of [1, -1] as const) {
    const sb = sideBones(side);
    const th = c.W[sb.thigh];
    const sn = c.W[sb.shin];
    const rings: Ring[] = [
      ring(side * 0.05, o.waistY, 0.0, 0.12, 0.12),
      ring(side * 0.075, th.y + 0.02, 0, o.hip, o.hip * 0.96),
      ring(side * 0.09, (th.y + sn.y) / 2, 0.005, (o.hip + o.knee) / 2, (o.hip + o.knee) / 2 * 0.97),
      ring(side * 0.095, sn.y, 0.01, o.knee, o.knee * 0.96),
      ring(side * 0.095, (sn.y + o.hemY) / 2, 0.008, (o.knee + o.hem) / 2, (o.knee + o.hem) / 2 * 0.96),
      ring(side * 0.095, o.hemY, 0.005, o.hem, o.hem * 0.96),
    ];
    // r06-chars: ひだの山と谷を十分に標本化し、凹凸の陰影も実際の形へ合わせる。
    const seg = o.pleats ? o.pleats * HAKAMA_PLEATS.samples : 16;
    const g = loft(rings, seg, { capStart: false });
    if (o.pleats) pleat(g, o.pleats, o.pleatAmp ?? HAKAMA_PLEATS.defaultAmp, seg);
    c.b.add(g, {
      ...look,
      skin: { envelope: [B.hips, sb.thigh, sb.shin], sharp: 3, bias: { [B.hips]: 1.4 } },
      uv: o.uvScale ? { kind: 'cyl', cx: side * 0.09, cz: 0, scale: o.uvScale, y0: o.waistY } : undefined,
    });
  }
}

/** 筒の表面に縦のひだ（袴のひだ）を付ける。 */
function pleat(g: BufferGeometry, n: number, amp: number, seg: number): void {
  const P = g.getAttribute('position');
  const U = g.getAttribute('uv');
  const N = g.getAttribute('normal');
  for (let i = 0; i < P.count; i++) {
    const u = U.getX(i);
    const fade = Math.min(1, U.getY(i) / HAKAMA_PLEATS.waistFade);
    const k = Math.cos(u * Math.PI * 2 * n) * amp * fade * fade * (3 - 2 * fade);
    P.setXYZ(i, P.getX(i) + N.getX(i) * k, P.getY(i), P.getZ(i) + N.getZ(i) * k);
  }
  g.computeVertexNormals();
  // 円周のUVの継ぎ目は頂点が別なので、両端の法線を平均して背に陰の線が出るのを防ぐ。
  for (let i = 0; i < P.count; i += seg + 1) {
    const end = i + seg;
    const normal = v(N.getX(i) + N.getX(end), N.getY(i) + N.getY(end), N.getZ(i) + N.getZ(end)).normalize();
    N.setXYZ(i, normal.x, normal.y, normal.z);
    N.setXYZ(end, normal.x, normal.y, normal.z);
  }
}

/** 着物の裾（腰から足首まで、両脚を包む1本の筒）。 */
export function robeSkirt(c: Ctx, look: Look, o: { waistY: number; hemY: number; waist: [number, number]; hem: [number, number]; uvScale?: number }): void {
  const rings: Ring[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = o.waistY + (o.hemY - o.waistY) * t;
    const rx = o.waist[0] + (o.hem[0] - o.waist[0]) * Math.pow(t, 0.8);
    const rz = o.waist[1] + (o.hem[1] - o.waist[1]) * Math.pow(t, 0.8);
    rings.push(ring(0, y, 0.012 * t, rx, rz));
  }
  c.b.add(loft(rings, 22), {
    ...look,
    skin: { envelope: [B.hips, B.thighL, B.thighR, B.shinL, B.shinR], sharp: 3, bias: { [B.hips]: 1.2 } },
    uv: o.uvScale ? { kind: 'cyl', cx: 0, cz: 0, scale: o.uvScale, y0: o.waistY } : undefined,
  });
}

/**
 * 着物の裾を、左右の脚ごとの2枚に分けて作る（真ん中で重ねる）。1本の筒だと、座ったり崩れたりで脚が離れた時に
 * 股の間が引き伸ばされて崩れたので、袴と同じく片脚ずつに重みを寄せる。
 */
export function robeHalves(c: Ctx, look: Look, o: { waistY: number; hemY: number; waist: number; hip: number; knee: number; hem: number }): void {
  for (const side of [1, -1] as const) {
    const sb = sideBones(side);
    const th = c.W[sb.thigh];
    const sn = c.W[sb.shin];
    const rings: Ring[] = [
      ring(side * 0.035, o.waistY, 0.004, o.waist, o.waist * 0.82),
      ring(side * 0.06, th.y + 0.02, 0.0, o.hip, o.hip * 0.86),
      ring(side * 0.072, (th.y + sn.y) / 2, 0.006, (o.hip + o.knee) / 2, ((o.hip + o.knee) / 2) * 0.88),
      ring(side * 0.08, sn.y, 0.012, o.knee, o.knee * 0.9),
      ring(side * 0.084, (sn.y + o.hemY) / 2, 0.012, (o.knee + o.hem) / 2, ((o.knee + o.hem) / 2) * 0.9),
      ring(side * 0.088, o.hemY, 0.01, o.hem, o.hem * 0.9),
    ];
    c.b.add(loft(rings, 16), {
      ...look,
      skin: { envelope: [B.hips, sb.thigh, sb.shin], sharp: 3, bias: { [B.hips]: 1.3 } },
    });
  }
}

/** 帯（腰の帯）。 */
export function obi(c: Ctx, look: Look, y: number, h: number, rx: number, rz: number): void {
  c.b.add(loft([ring(0, y - h / 2, 0.004, rx, rz), ring(0, y + h / 2, 0.004, rx * 0.99, rz * 0.99)], 20), {
    ...look,
    skin: { envelope: [B.hips, B.spine], sharp: 3 },
  });
}

/** 体の表面に貼る小さな板（背の紋など）。中心・向き（Y 軸のまわりの角、度）・大きさ。 */
export function decal(c: Ctx, region: RegionName, at: Vector3, yawDeg: number, w: number, h: number, bend: number, skin: Skin, surf: Surf = SURF.cloth): void {
  c.b.add(bentPlate(w, h, 0, bend, 0, 6, 6), {
    color: 0xffffff,
    surf,
    region,
    uv: { kind: 'geom' },
    skin,
    matrix: mat(at.x, at.y + h / 2, at.z, 0, yawDeg, 0, 1, 1, 1, 'YXZ'),
  });
}

/** 草摺（腰から下がる板）。左右の腿へ少し重みを分けて、歩くと板が揺れる。 */
export function kusazuri(c: Ctx, look: Look, o: { y: number; rx: number; rz: number; count: number; w: number; h: number; tilt: number }): void {
  for (let i = 0; i < o.count; i++) {
    const ang = ((i + 0.5) / o.count) * Math.PI * 2; // 0 が正面。正面の真ん中には板を置かず、左右に分ける
    // 胴の楕円の上に置く（楕円の半径をその角で求める）
    const r = 1 / Math.hypot(Math.sin(ang) / o.rx, Math.cos(ang) / o.rz);
    const x = Math.sin(ang) * r;
    const z = Math.cos(ang) * r;
    const g = bentPlate(o.w, o.h, 0.012, 0.35, 0.18, 4, 3);
    c.b.add(g, {
      ...look,
      uv: { kind: 'geom', su: 0.5, sv: 0.5 },
      skin: {
        fn: (p) => {
          const t = Math.max(0, Math.min(1, (o.y - p.y) / o.h));
          const wl = 0.5 * t * t;
          if (p.x > 0.03) return [[B.hips, 1 - wl], [B.thighL, wl]];
          if (p.x < -0.03) return [[B.hips, 1 - wl], [B.thighR, wl]];
          return [[B.hips, 1 - wl], [B.thighL, wl / 2], [B.thighR, wl / 2]];
        },
      },
      matrix: mat(x, o.y, z, -o.tilt, (ang * 180) / Math.PI, 0, 1, 1, 1, 'YXZ'),
    });
  }
}

/** 胴（鎧の胴）。断面 [高さ, 横の半径, 前後の半径, 前後のずれ] を上から下へではなく下から上へ並べる。 */
export function dou(c: Ctx, sections: readonly Section[], look: Look): void {
  const rings = sections.map(([y, rx, rz, z]) => ring(0, y, z, rx, rz));
  c.b.add(loft(rings, 22, { capStart: false, capEnd: false }), {
    ...look,
    uv: look.region ? { kind: 'geom', su: 1, sv: 1 } : undefined,
    skin: { envelope: [B.hips, B.spine, B.chest], sharp: 3 },
  });
}

// ---------------------------------------------------------------- 小道具

/** 素槍（3m）。石突が原点、+Y が穂先。柄は黒漆、穂は鋼。 */
export function spear(c: Ctx): void {
  const o = c.W[B.spear];
  const sk: Skin = { bone: B.spear };
  const shaftLen = 2.74;
  c.b.add(loft([ring(o.x, o.y + 0.05, o.z, 0.0155), ring(o.x, o.y + shaftLen * 0.5, o.z, 0.0165), ring(o.x, o.y + shaftLen, o.z, 0.0145)], 8, { capStart: true, capEnd: true, ref: v(1, 0, 0) }), {
    color: COLOR.wood,
    surf: SURF.lacquerMatte,
    skin: sk,
  });
  // 石突（金具）
  c.b.add(loft([ring(o.x, o.y, o.z, 0.008), ring(o.x, o.y + 0.02, o.z, 0.015), ring(o.x, o.y + 0.065, o.z, 0.0165)], 8, { capStart: true, capEnd: true }), { color: COLOR.iron, surf: SURF.iron, skin: sk });
  // 口金（柄と穂のつなぎ）
  c.b.add(cyl(0.0175, 0.0175, 0.05, 8), { color: COLOR.brass, surf: SURF.brass, skin: sk, matrix: mat(o.x, o.y + shaftLen - 0.01, o.z) });
  // 穂（両刃のまっすぐな穂。断面は平たい菱形）
  const blade: Ring[] = [];
  const bl = 0.26;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const w = t < 0.12 ? 0.012 + t * 0.06 : 0.019 * Math.pow(1 - (t - 0.12) / 0.88, 0.65) + 0.0008;
    blade.push(ring(o.x, o.y + shaftLen + 0.015 + bl * t, o.z, w * 0.32, w));
  }
  c.b.add(loft(blade, 4, { capStart: true, capEnd: true, ref: v(1, 0, 0) }), { color: COLOR.steel, surf: SURF.steel, skin: sk });
}

/** 刀の鞘と、納まった柄（腰に差す）。鞘の口が原点で、柄は前上へ、鞘は後ろ下へ。length は刀身の長さ。 */
export function sheathedSword(c: Ctx, length: number, tsukaLen: number, saya: number): void {
  const o = c.W[B.sheath];
  // 鞘の向き（休みの姿勢で、腰の左を前上から後ろ下へ）
  // r00-shape: 指摘「鞘が後ろへ水平に長く突き出る」 下がりの角 約20° → 約31°
  const dir = v(0.1, -0.6, -1).normalize();
  const up = v(0, 1, 0);
  const side = v().crossVectors(up, dir).normalize();
  const nrm = v().crossVectors(dir, side).normalize();
  const pt = (s: number, curve: number) => o.clone().addScaledVector(dir, s).addScaledVector(nrm, curve);
  const rings: Ring[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = pt(length * 1.04 * t, 0.025 * Math.sin(Math.PI * t) * 0.6);
    rings.push({ c: p, rx: 0.014 * (1 - 0.15 * t), rz: 0.02 * (1 - 0.2 * t) });
  }
  c.b.add(loft(rings, 8, { capStart: true, capEnd: true, ref: side }), { color: saya, surf: SURF.lacquer, skin: { bone: B.sheath } });
  // 鯉口の金具と、柄（抜けば隠す）
  const hiltSkin: Skin = { bone: B.hilt };
  const tsuba = o.clone().addScaledVector(dir, -0.008);
  c.b.add(cyl(0.034, 0.034, 0.007, 12), { color: COLOR.iron, surf: SURF.iron, skin: hiltSkin, matrix: alignY(tsuba, dir) });
  const hr: Ring[] = [];
  for (let i = 0; i <= 3; i++) {
    const t = i / 3;
    hr.push({ c: o.clone().addScaledVector(dir, -0.012 - tsukaLen * t), rx: 0.013, rz: 0.0165 * (1 - 0.08 * Math.sin(Math.PI * t)) });
  }
  c.b.add(loft(hr, 8, { capStart: true, capEnd: true, ref: side }), { color: 0xffffff, surf: SURF.cloth, region: 'tsukaIto', uv: { kind: 'geom', su: 1, sv: 1 }, skin: hiltSkin });
  c.b.add(ellipsoid(0.014, 0.012, 0.017, 8, 6), { color: COLOR.iron, surf: SURF.iron, skin: hiltSkin, matrix: alignY(o.clone().addScaledVector(dir, -0.012 - tsukaLen), dir) });
}

/** Y 軸を dir に向けて p に置く行列。 */
function alignY(p: Vector3, dir: Vector3): Matrix4 {
  const m = new Matrix4();
  const y = dir.clone().normalize();
  const x = Math.abs(y.x) < 0.9 ? v(1, 0, 0) : v(0, 0, 1);
  const z = v().crossVectors(x, y).normalize();
  x.crossVectors(y, z).normalize();
  m.makeBasis(x, y, z).setPosition(p);
  return m;
}

/** 抜いた刀（右手の握りが原点。+Z が切っ先、-Z が柄頭）。刃は指の向き（-Y）。 */
export function drawnSword(c: Ctx, length: number, tsukaLen: number): void {
  const o = c.W[B.blade];
  const sk: Skin = { bone: B.blade };
  const z0 = 0.045; // 鍔の位置（握りの少し先）
  c.b.add(cyl(0.035, 0.035, 0.007, 12), { color: COLOR.iron, surf: SURF.iron, skin: sk, matrix: mat(o.x, o.y, o.z + z0, 90, 0, 0) });
  c.b.add(box(0.012, 0.026, 0.03), { color: COLOR.brass, surf: SURF.brass, skin: sk, matrix: mat(o.x, o.y - 0.002, o.z + z0 + 0.018) });
  // 刀身：反りを少し付け、峰（+Y）は厚く、刃（-Y）は薄い
  const rings: Ring[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = t < 0.93 ? 0.0135 * (1 - 0.25 * t) : 0.0135 * 0.75 * Math.max(0.05, (1 - t) / 0.07);
    const sori = 0.02 * Math.sin(Math.PI * t * 0.9);
    rings.push({ c: v(o.x, o.y + sori, o.z + z0 + 0.03 + length * t), rx: 0.0032 * (1 - 0.3 * t) + 0.0004, rz: w });
  }
  // ロフトの線が +Z 向きなので、楕円の rx の軸は X（刀身の厚み）、rz の軸が Y（刀身の幅）
  c.b.add(loft(rings, 6, { capStart: true, capEnd: true, ref: v(1, 0, 0) }), { color: COLOR.steel, surf: SURF.steel, skin: sk });
  const hr: Ring[] = [];
  for (let i = 0; i <= 3; i++) {
    const t = i / 3;
    hr.push({ c: v(o.x, o.y, o.z + z0 - 0.004 - tsukaLen * t), rx: 0.013, rz: 0.0165 });
  }
  c.b.add(loft(hr, 8, { capStart: true, capEnd: true, ref: v(1, 0, 0) }), { color: 0xffffff, surf: SURF.cloth, region: 'tsukaIto', uv: { kind: 'geom' }, skin: sk });
  c.b.add(ellipsoid(0.014, 0.017, 0.013, 8, 6), { color: COLOR.iron, surf: SURF.iron, skin: sk, matrix: mat(o.x, o.y, o.z + z0 - 0.004 - tsukaLen) });
}

/** 手提灯：右手の竿（+Z へ伸びる）と、竿の先に吊るす丸い提灯（紙は内から光る）。 */
export function lantern(c: Ctx): void {
  const g = c.W[B.lanternPole];
  const len = LANTERN.poleLen;
  c.b.add(loft([ring(g.x, g.y, g.z - 0.04, 0.0075), ring(g.x, g.y, g.z + len, 0.006)], 6, { capStart: true, capEnd: true, ref: v(1, 0, 0) }), {
    color: COLOR.bamboo,
    surf: SURF.wood,
    skin: { bone: B.lanternPole },
  });
  const t = c.W[B.lantern];
  const sk: Skin = { bone: B.lantern };
  // 吊り紐と鉤
  c.b.add(cyl(0.0025, 0.0025, 0.04, 4), { color: COLOR.rope, surf: SURF.cloth, skin: sk, matrix: mat(t.x, t.y - 0.02, t.z) });
  const top = t.y - 0.04;
  const H = LANTERN.paperH;
  const R = LANTERN.paperR;
  // 上下の黒い輪（漆の口）
  c.b.add(cyl(0.062, 0.066, 0.025, 14), { color: COLOR.lacquer, surf: SURF.lacquer, skin: sk, matrix: mat(t.x, top - 0.0125, t.z) });
  c.b.add(cyl(0.066, 0.062, 0.022, 14), { color: COLOR.lacquer, surf: SURF.lacquer, skin: sk, matrix: mat(t.x, top - 0.025 - H - 0.011, t.z) });
  // 紙の胴（丸く膨らむ）。中心が竿の先から LANTERN.hang 下に来るようにする
  const prof: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const s = i / 10;
    const y = -H * s;
    const r = 0.064 + (R - 0.064) * Math.sin(Math.PI * s);
    prof.push([r, y]);
  }
  const body = lathe(prof.reverse(), 20);
  c.b.add(body, {
    color: COLOR.paper,
    surf: { r: SURF.paper.r, m: 0, e: LANTERN_GLOW },
    region: 'paper',
    uv: { kind: 'geom' },
    skin: sk,
    matrix: mat(t.x, top - 0.025, t.z),
  });
}

/** 床几（折りたたみの腰掛け）。横から見て X に組んだ脚と、前後の横木に張った座面。 */
export function stool(c: Ctx, seatY: number): void {
  const o = c.W[B.stool];
  const sk: Skin = { bone: B.stool };
  const hw = 0.2;
  const hd = 0.16;
  const legLook = { color: COLOR.lacquer, surf: SURF.lacquer, skin: sk };
  for (const sx of [1, -1]) {
    const x = o.x + sx * hw;
    c.b.add(tube([v(x, 0.0, o.z - hd), v(x, seatY, o.z + hd)], 0.014, 6, 2), legLook);
    c.b.add(tube([v(x, 0.0, o.z + hd), v(x, seatY, o.z - hd)], 0.014, 6, 2), legLook);
    c.b.add(cyl(0.02, 0.02, 0.03, 8), { color: COLOR.brass, surf: SURF.brass, skin: sk, matrix: mat(x, seatY / 2, o.z, 0, 0, 90) });
  }
  for (const sz of [1, -1]) {
    c.b.add(cyl(0.016, 0.016, hw * 2 + 0.06, 8), { ...legLook, matrix: mat(o.x, seatY, o.z + sz * hd, 0, 0, 90) });
    c.b.add(cyl(0.013, 0.013, hw * 2 + 0.04, 8), { ...legLook, matrix: mat(o.x, 0.013, o.z + sz * hd, 0, 0, 90) });
  }
  // 座面（たるんだ革）
  const seat = bentPlate(hw * 2, hd * 2 + 0.02, 0.008, 0, 0, 4, 4);
  const P = seat.getAttribute('position');
  for (let i = 0; i < P.count; i++) {
    const zz = P.getY(i) + hd + 0.01; // 板の縦を前後に使う
    const sag = -0.03 * Math.sin((Math.PI * (zz + hd + 0.01)) / (hd * 2 + 0.02));
    P.setXYZ(i, P.getX(i), sag + P.getZ(i), zz);
  }
  seat.computeVertexNormals();
  c.b.add(seat, { color: COLOR.seat, surf: SURF.silk, skin: sk, matrix: mat(o.x, seatY + 0.012, o.z) });
}

/** 投げる小石。 */
export function pebble(c: Ctx): void {
  const o = c.W[B.pebble];
  c.b.add(ellipsoid(0.022, 0.017, 0.02, 7, 5), { color: 0x6d6a66, surf: { r: 0.8, m: 0 }, skin: { bone: B.pebble }, matrix: mat(o.x, o.y, o.z) });
}
