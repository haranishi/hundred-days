/**
 * 手の立体: 指の骨ごとのカプセル・手のひら・親指の付け根のふくらみ・爪（甲の側）・手首・袖口。
 * どの部品も形を変えない剛体なので、毎コマは位置と向きを更新するだけ（作り直さない）。
 */
import {
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  Shape,
  SphereGeometry,
  Vector2,
  type Material,
} from 'three';
import type { FingerName, Vec3 } from '../types';
import { forearmDirection } from '../core/forearm';
import { cross, dot, lerpV, mulMV, normalize, sub, type M3 } from '../core/math';
import { DIM, skeleton, type HandSkeleton } from '../core/skeleton';
import type { HandState } from '../core/timeline';
import { materials } from './materials';

type ChainName = 'thumb' | FingerName;
const CHAINS: ChainName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

const geoCache = new Map<string, BufferGeometry>();
function cached(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const capsuleGeo = (r: number, len: number) =>
  cached(`cap:${r.toFixed(4)}:${len.toFixed(4)}`, () => new CapsuleGeometry(r, Math.max(len, 0.001), 6, 18, 1));
const sphereGeo = () => cached('sphere', () => new SphereGeometry(1, 24, 16));
const cylinderGeo = () => cached('cyl', () => new CylinderGeometry(1, 1, 1, 28, 1, false));

/**
 * 手のひら: 外形（手の座標の XY）をふくらませた「まくら形」。縁は厚みの半分を半径とする丸み、甲はゆるく盛り上げる。
 * 押し出し（ExtrudeGeometry）だと平らな面が細長い三角形に割れ、なめらかな法線で陰影の筋が出たため、
 * 中心から放射状の格子で作る（外形は中心から見て凸に近いので、放射状の線は外形と1回だけ交わる）。
 */
const PALM_OUTLINE: Array<[number, number]> = [
  [-0.3, 0.03],
  [-0.385, 0.28],
  [-0.41, 0.56],
  [-0.4, 0.78],
  [-0.365, 0.885],
  [-0.26, 0.95],
  [-0.14, 0.99],
  [0.03, 1.025],
  [0.2, 1.0],
  [0.3, 0.95],
  [0.335, 0.86],
  [0.342, 0.62],
  [0.322, 0.36],
  [0.275, 0.12],
  [0.2, 0.0],
  [-0.05, -0.04],
];
const PALM_CENTER_XY: [number, number] = [-0.03, 0.5];

function palmGeometry(): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(PALM_OUTLINE[0]![0], PALM_OUTLINE[0]![1]);
  shape.splineThru([...PALM_OUTLINE.slice(1), PALM_OUTLINE[0]!].map(([x, y]) => new Vector2(x, y)));
  const poly = shape.getSpacedPoints(240);
  const [cx, cy] = PALM_CENTER_XY;
  /** 中心から角度 th の向きに、外形まで何 */
  const reach = (th: number): number => {
    const dx = Math.cos(th), dy = Math.sin(th);
    let best = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
      const ex = q.x - p.x, ey = q.y - p.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const wx = p.x - cx, wy = p.y - cy;
      const t = (wx * ey - wy * ex) / den;
      const u = (wx * dy - wy * dx) / den;
      if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
    }
    return best;
  };
  const h = DIM.palmHalf;
  const NT = 112, K = 9, M = 12;
  // 1本の放射線に沿った断面: 表（手のひら側）の面 → 縁の半円 → 甲の面
  const profile: Array<{ rho: number; rim: number; z: number }> = [];
  for (let k = 0; k <= K; k++) profile.push({ rho: k / K, rim: 0, z: h });
  for (let m = 1; m < M; m++) {
    const ph = Math.PI / 2 - (Math.PI * m) / M;
    profile.push({ rho: 1, rim: Math.cos(ph), z: h * Math.sin(ph) });
  }
  for (let k = K; k >= 0; k--) {
    const rho = k / K;
    profile.push({ rho, rim: 0, z: -h * (1 + 0.16 * (1 - rho * rho) ** 2) });
  }
  const pos: number[] = [];
  for (let i = 0; i < NT; i++) {
    const th = (i / NT) * Math.PI * 2;
    const R = Math.max(reach(th) - h, 0.02);
    const dx = Math.cos(th), dy = Math.sin(th);
    for (const pr of profile) {
      const r = pr.rho * R + pr.rim * h;
      pos.push(cx + dx * r, cy + dy * r, pr.z);
    }
  }
  const rows = profile.length;
  const idx: number[] = [];
  for (let i = 0; i < NT; i++) {
    const i2 = (i + 1) % NT;
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j, b = i2 * rows + j, c = i2 * rows + j + 1, d = i * rows + j + 1;
      idx.push(a, d, b, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const palmGeo = () => cached('palm', palmGeometry);

const THENAR_SCALE = new Matrix4().makeScale(0.165, 0.27, 0.125);

/** 3x3 の回転と位置を Matrix4 に書き込む（毎コマ new しない） */
function setM4(m: Matrix4, rot: M3, pos: Vec3): Matrix4 {
  return m.set(rot[0], rot[3], rot[6], pos[0], rot[1], rot[4], rot[7], pos[1], rot[2], rot[5], rot[8], pos[2], 0, 0, 0, 1);
}

function withOutline(geo: BufferGeometry, mat: Material, outline: Material): Group {
  const g = new Group();
  g.add(new Mesh(geo, mat), new Mesh(geo, outline));
  return g;
}

/** 基準の向きを y に、もう1つの目安 z を直交させた回転 */
function basis(y: Vec3, zHint: Vec3): M3 {
  const Y = normalize(y);
  let Z = sub(zHint, [Y[0] * dot(zHint, Y), Y[1] * dot(zHint, Y), Y[2] * dot(zHint, Y)]);
  if (Math.hypot(...Z) < 1e-6) Z = Math.abs(Y[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  Z = normalize(Z);
  const X = normalize(cross(Y, Z));
  return [X[0], X[1], X[2], Y[0], Y[1], Y[2], Z[0], Z[1], Z[2]];
}

export interface RigOptions {
  /** 左手として描く（手の座標の X を反転） */
  mirrored: boolean;
  /** 袖口を描くか（上半身つきの時は腕が描くので不要） */
  cuff: boolean;
}

export class HandRig {
  /** 場の座標: 手首の位置・手の向き */
  readonly group = new Group();
  /** 場の座標: 前腕と袖口 */
  readonly cuff = new Group();
  private readonly inner = new Group();
  private readonly bones: Record<ChainName, Group[]>;
  private readonly thenar: Group;
  private readonly forearm: Group;
  private readonly opts: RigOptions;
  /** 肌・爪・輪郭線の面と、ふだんの材質・縁でぼかす材質（setEdgeFade で入れ替える） */
  private readonly fadeable: Array<{ mesh: Mesh; normal: Material; faded: Material }> = [];

  constructor(opts: RigOptions) {
    this.opts = opts;
    const M = materials();
    this.group.add(this.inner);
    if (opts.mirrored) this.inner.scale.set(-1, 1, 1);

    this.inner.add(withOutline(palmGeo(), M.skin, M.outline));

    // 手首（手のひらと前腕をつなぐ）
    const wrist = withOutline(capsuleGeo(0.2, 0.3), M.skin, M.outline);
    wrist.scale.set(1.3, 1, 0.78);
    wrist.position.set(0.0, -0.06, -0.01);
    this.inner.add(wrist);

    this.thenar = withOutline(sphereGeo(), M.skin, M.outline);
    this.inner.add(this.thenar);

    const s0 = skeleton({
      thumb: { cmcFlex: 0, cmcAbd: 0, cmcRot: 0, mcp: 0, ip: 0 },
      index: { mcp: 0, pip: 0, dip: 0, spread: 0 },
      middle: { mcp: 0, pip: 0, dip: 0, spread: 0 },
      ring: { mcp: 0, pip: 0, dip: 0, spread: 0 },
      pinky: { mcp: 0, pip: 0, dip: 0, spread: 0 },
    });
    this.bones = {} as Record<ChainName, Group[]>;
    for (const c of CHAINS) {
      this.bones[c] = s0[c].bones.map((b, i) => {
        const g = new Group();
        const len = Math.hypot(b.end[0] - b.start[0], b.end[1] - b.start[1], b.end[2] - b.start[2]);
        const capLen = i === 2 ? len - b.radius : len;
        const cap = withOutline(capsuleGeo(b.radius, capLen), M.skin, M.outline);
        cap.position.set(0, capLen / 2, 0);
        g.add(cap);
        if (i === 2) {
          // 爪: 末節の甲の側（腹は +Z なので −Z の側）
          const nail = withOutline(sphereGeo(), M.nail, M.outline);
          const r = b.radius;
          nail.scale.set(r * 0.66, len * 0.36, r * 0.34);
          nail.position.set(0, len - r - len * 0.12, -r * 0.8);
          nail.rotation.x = -0.12;
          g.add(nail);
        }
        this.inner.add(g);
        return g;
      });
    }

    // 前腕と袖口（場の座標で、手首から体の方へ）
    this.forearm = new Group();
    const arm = withOutline(capsuleGeo(0.2, 0.55), M.skin, M.outline);
    arm.scale.set(1.25, 1, 0.82);
    arm.position.set(0, -0.3, 0);
    const band = withOutline(cylinderGeo(), M.sleeveRim, M.sleeveOutline);
    band.scale.set(0.37, 0.16, 0.3);
    band.position.set(0, -0.4, 0);
    const sleeve = withOutline(cylinderGeo(), M.sleeve, M.sleeveOutline);
    sleeve.scale.set(0.355, 1.6, 0.285);
    sleeve.position.set(0, -1.28, 0);
    this.forearm.add(arm, band, sleeve);
    this.cuff.add(this.forearm);
    this.cuff.visible = opts.cuff;

    const pairs = new Map<Material, Material>([
      [M.skin, M.skinFaded],
      [M.nail, M.nailFaded],
      [M.outline, M.outlineFaded],
    ]);
    for (const root of [this.group, this.cuff]) {
      root.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        const faded = pairs.get(o.material as Material);
        if (faded) this.fadeable.push({ mesh: o, normal: o.material as Material, faded });
      });
    }
  }

  /**
   * 手（肌・爪・輪郭線）も、袖と同じく画像の縁でぼかすか。小さな画像で、形を作る前に休めている反対の手だけに使う
   * （おはようの左手が画像の下の縁で切れて、肌の切れ端が残った。hand-r3）。形を見せる手は枠の内側に収めてあるので使わない
   */
  setEdgeFade(on: boolean) {
    for (const f of this.fadeable) f.mesh.material = on ? f.faded : f.normal;
  }

  setCuffVisible(v: boolean) {
    this.cuff.visible = v;
  }

  update(h: HandState) {
    const s = skeleton(h.pose);
    this.group.matrixAutoUpdate = false;
    setM4(this.group.matrix, h.rot, h.wrist);
    this.group.matrixWorldNeedsUpdate = true;
    for (const c of CHAINS) {
      const chain = s[c];
      chain.bones.forEach((b, i) => {
        const g = this.bones[c][i]!;
        g.matrixAutoUpdate = false;
        setM4(g.matrix, b.rot, b.start);
        g.matrixWorldNeedsUpdate = true;
      });
    }
    this.updateThenar(s);
    if (this.cuff.visible) this.updateCuff(h);
  }

  private updateThenar(s: HandSkeleton) {
    const cmc = s.thumb.joints[0], mcp = s.thumb.joints[1];
    const axis = normalize(sub(mcp, cmc));
    // 中手骨の中ほどから、手のひらの中心の方へ寄せたところにふくらみを置く
    let c = lerpV(lerpV(cmc, mcp, 0.42), [0.07, 0.38, 0.03], 0.42);
    c = [c[0], c[1], Math.max(c[2], 0.03)];
    const rot = basis(axis, [0, 0, 1]);
    this.thenar.matrixAutoUpdate = false;
    setM4(this.thenar.matrix, rot, c).multiply(THENAR_SCALE);
    this.thenar.matrixWorldNeedsUpdate = true;
  }

  private updateCuff(h: HandState) {
    // 前腕の向き: ひじ（肩→手首の逆運動学）の方へ、手首の曲がる範囲で（core/forearm.ts）。右腕なら表す人の右下・後ろへ向かう
    const f = forearmDirection(h, this.opts.mirrored ? 'nonDominant' : 'dominant');
    const palm = mulMV(h.rot, [0, 0, 1]);
    const rot = basis([-f[0], -f[1], -f[2]], palm);
    this.cuff.matrixAutoUpdate = false;
    setM4(this.cuff.matrix, rot, h.wrist);
    this.cuff.matrixWorldNeedsUpdate = true;
  }
}
