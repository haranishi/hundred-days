/**
 * 形の仕様（HandshapeSpec）→ 関節角度（HandPose）。
 * 1. 指の状態と親指の置き方を表で角度にする 2. 交差と個別の上書き（adjust）を当てる 3. 可動域で丸める（丸めたら警告）
 * 4. 親指の置き場所・接触（touch / contacts）を逆運動学で合わせる（可動域つき・めり込み防止つき）
 * 表の数値は、開発用の一覧ページで撮った画像を見て決めた。変えたら一覧ページで全部の形を撮り直して確かめる。
 */
import type { ContactPoint, FingerName, FingerState, HandshapeSpec, JointAdjust, ThumbPlacement, Vec3 } from '../types';
import { solveLM } from './ik';
import { DEG, clamp, colY, colZ, dot, lerp, lerpV, madd, normalize, segmentDistance, sub } from './math';
import {
  DIM,
  FINGERS,
  contactGap,
  contactSphere,
  skeleton,
  type Bone,
  type FingerAngles,
  type HandPose,
  type HandSkeleton,
  type ThumbAngles,
} from './skeleton';
import { stableStringify } from './stable';

type ChainName = 'thumb' | FingerName;
type ThumbKey = keyof ThumbAngles;
type NamedPlacement = Exclude<ThumbPlacement, { touch: ContactPoint }>;

/** 可動域（度）。成人の自動運動の範囲より少し狭め（無理のない形だけを描くため） */
export const LIMITS = {
  thumb: {
    cmcFlex: [-35, 60],
    cmcAbd: [-15, 65],
    cmcRot: [-30, 60],
    mcp: [-10, 65],
    ip: [-15, 85],
  } as Record<ThumbKey, readonly [number, number]>,
  finger: { mcp: [-25, 95], pip: [-5, 110], dip: [-5, 85] } as Record<'mcp' | 'pip' | 'dip', readonly [number, number]>,
  /** spread は内部の向き（親指の側へ＋） */
  spread: { index: [-20, 25], middle: [-15, 15], ring: [-20, 15], pinky: [-30, 15] } as Record<FingerName, readonly [number, number]>,
};

export function limitOf(chain: ChainName, key: string): readonly [number, number] {
  if (chain === 'thumb') return LIMITS.thumb[key as ThumbKey];
  if (key === 'spread') return LIMITS.spread[chain];
  return LIMITS.finger[key as 'mcp' | 'pip' | 'dip'];
}

/** 指の状態→角度（度）。dip は pip の約2/3 */
export const FINGER_TABLE: Record<FingerState, { mcp: number; pip: number; dip: number }> = {
  extended: { mcp: 0, pip: 3, dip: 2 },
  bentMcp: { mcp: 88, pip: 0, dip: 0 },
  hooked: { mcp: 0, pip: 92, dip: 62 },
  curled: { mcp: 86, pip: 98, dip: 64 },
  half: { mcp: 35, pip: 45, dip: 30 },
};
const DIP_RATIO = 2 / 3;

/** 開きの角度（内部の向き＝親指の側へ＋） */
const NATURAL_SPREAD: Record<FingerName, number> = { index: 5, middle: 1, ring: -3, pinky: -8 };
const TOGETHER: Record<FingerName, number> = { index: -2, middle: 0, ring: 2, pinky: 4 };
const APART: Record<FingerName, number> = { index: 15, middle: 3, ring: -10, pinky: -20 };
/** 仕様の「開き」（中指から離れる向きが＋。中指だけは親指の側が＋）→ 内部の向き */
const ABD_SIGN: Record<FingerName, number> = { index: 1, middle: 1, ring: -1, pinky: -1 };

/** 親指の置き方→付け根からの角度の目安（度）。置き場所の目標点へは逆運動学で寄せる */
export const THUMB_TABLE: Record<NamedPlacement | 'touch', ThumbAngles> = {
  alongside: { cmcFlex: 4, cmcAbd: 8, cmcRot: -8, mcp: 6, ip: 4 },
  acrossFront: { cmcFlex: 40, cmcAbd: 40, cmcRot: 25, mcp: 35, ip: 15 },
  tuckedUnder: { cmcFlex: 46, cmcAbd: 26, cmcRot: 35, mcp: 40, ip: 25 },
  extendedOut: { cmcFlex: -30, cmcAbd: 6, cmcRot: -15, mcp: 0, ip: 0 },
  extendedUp: { cmcFlex: -8, cmcAbd: 10, cmcRot: -5, mcp: 0, ip: 0 },
  foldedPalm: { cmcFlex: 52, cmcAbd: 18, cmcRot: 40, mcp: 45, ip: 30 },
  betweenIndexMiddle: { cmcFlex: 30, cmcAbd: 42, cmcRot: 20, mcp: 30, ip: 10 },
  touch: { cmcFlex: 25, cmcAbd: 45, cmcRot: 30, mcp: 20, ip: 15 },
};

/** 力を抜いた手（形を作る前の、再生の出発点に使う） */
export const REST_POSE: HandPose = {
  thumb: { cmcFlex: 0, cmcAbd: 18, cmcRot: 0, mcp: 10, ip: 10 },
  index: { mcp: 14, pip: 18, dip: 10, spread: 5 },
  middle: { mcp: 16, pip: 22, dip: 12, spread: 1 },
  ring: { mcp: 18, pip: 25, dip: 14, spread: -3 },
  pinky: { mcp: 20, pip: 28, dip: 16, spread: -8 },
};

export interface ContactReport {
  a: ContactPoint;
  b: ContactPoint;
  gap: number;
}

export interface SolvedShape {
  pose: HandPose;
  /** 可動域で丸めた・接触できなかった等（開発時に表示する） */
  warnings: string[];
  contacts: ContactReport[];
}

/** 接触していると見なす隙間の上限（手のひら単位） */
export const CONTACT_TOLERANCE = 0.02;
const CONTACT_TOL_INTERNAL = 0.008;
/** めり込みの許し（表面どうしがこの深さまで重なるのは押し当てに見えるので許す） */
const COLLIDE_TOL = 0.012;

const isFolded = (a: FingerAngles) => a.mcp > 40 && a.pip > 40;
const fingerOf = (p: ContactPoint): ChainName => p.split('.')[0] as ChainName;
const jointOf = (p: ContactPoint) => p.split('.')[1] as 'tip' | 'dip' | 'pip' | 'mcp';

function spreadFor(spec: HandshapeSpec['spread'], f: FingerName, mcp: number): number {
  if (spec === 'together') return TOGETHER[f];
  if (spec === 'apart') return APART[f];
  if (spec && typeof spec === 'object' && typeof spec[f] === 'number') return (spec[f] as number) * ABD_SIGN[f];
  // 指定なし: 自然な開き。握った指ほど開きを小さくする
  return NATURAL_SPREAD[f] * Math.max(0, 1 - Math.max(0, mcp) / 90);
}

function applyCross(pose: HandPose, cross: NonNullable<HandshapeSpec['cross']>) {
  const A = cross.front, B = cross.back;
  if (A === B) return;
  const xa = DIM.mcp[A][0], xb = DIM.mcp[B][0];
  // 交差する高さ: 前の指の末節（爪）のあたり（ら: 人差し指の爪の上に中指の腹を乗せる）
  const h = DIM.len[A][0] + DIM.len[A][1] + 0.35 * DIM.len[A][2];
  const tilt = (Math.atan(Math.abs(xa - xb) / 2 / h) / DEG) * 1.12;
  const s = xa > xb ? -1 : 1;
  pose[A].spread = s * tilt;
  pose[B].spread = -s * tilt;
  const sep = (DIM.rad[A][1] + DIM.rad[B][1]) / 2 + 0.006;
  const depth = Math.atan(sep / h) / DEG;
  pose[A].mcp += depth;
  pose[B].mcp -= depth;
  // 後ろの指は前の指の背に腹を乗せるように少し巻く（巻きすぎると前の指を突き抜ける）
  pose[B].pip += 18;
  pose[B].dip += 12;
}

const FIXED_SEP = ':';

function applyAdjust(pose: HandPose, adjust: HandshapeSpec['adjust'], fixed: Set<string>) {
  if (!adjust) return;
  for (const [who, adj] of Object.entries(adjust) as Array<[ChainName, JointAdjust | undefined]>) {
    if (!adj) continue;
    if (who === 'thumb') {
      for (const k of ['cmcFlex', 'cmcAbd', 'cmcRot', 'mcp', 'ip'] as const) {
        const v = adj[k];
        if (typeof v === 'number') {
          pose.thumb[k] = v;
          fixed.add(`thumb${FIXED_SEP}${k}`);
        }
      }
      continue;
    }
    const fa = pose[who];
    for (const k of ['mcp', 'pip', 'dip'] as const) {
      const v = adj[k];
      if (typeof v === 'number') {
        fa[k] = v;
        fixed.add(`${who}${FIXED_SEP}${k}`);
      }
    }
    if (typeof adj.spread === 'number') {
      fa.spread = adj.spread * ABD_SIGN[who];
      fixed.add(`${who}${FIXED_SEP}spread`);
    }
  }
}

function clampPose(pose: HandPose, warnings: string[]) {
  const chains: ChainName[] = ['thumb', ...FINGERS];
  for (const c of chains) {
    const obj = pose[c] as unknown as Record<string, number>;
    for (const k of Object.keys(obj)) {
      const [lo, hi] = limitOf(c, k);
      const v = obj[k]!;
      const cv = clamp(v, lo, hi);
      if (cv !== v) {
        warnings.push(`${c}.${k} を ${round1(v)}° から可動域の ${cv}° に丸めました`);
        obj[k] = cv;
      }
    }
  }
}
const round1 = (v: number) => Math.round(v * 10) / 10;

/* ───────── 親指の置き場所の目標点（親指の先の丸みの中心をここへ寄せる） ───────── */

function frontNormal(b: Bone): Vec3 {
  // 握った指の中節の外側（甲の側＝腹の反対）
  const z = colZ(b.rot);
  return [-z[0], -z[1], -z[2]];
}

function placementTarget(kind: NamedPlacement, s: HandSkeleton, pose: HandPose): Vec3 | null {
  const rt = DIM.thumbRad[2];
  switch (kind) {
    case 'alongside': {
      // 人差し指の付け根の横（親指側）に沿わせ、先は握った人差し指の背の高さまで
      // 親指をほぼまっすぐにしたまま届く高さ（握った人差し指の背の少し上）にする
      const b = s.index.bones[0];
      const mid = lerpV(b.start, b.end, 0.55);
      // 伸ばした人差し指なら、付け根の少し上（手のひらの横に沿わせる。親指の長さで届く高さ）
      const top = isFolded(pose.index) ? Math.max(mid[1], b.end[1] + 0.06) : DIM.mcp.index[1] + 0.05;
      return [DIM.mcp.index[0] + b.radius + rt - 0.004, top, Math.max(0.04, mid[2] * 0.8)];
    }
    case 'acrossFront': {
      const folded = FINGERS.filter((f) => isFolded(pose[f]));
      const at = (f: FingerName): { p: Vec3; n: Vec3; r: number } => {
        const b = s[f].bones[1];
        return { p: lerpV(b.start, b.end, 0.55), n: frontNormal(b), r: b.radius };
      };
      let p: Vec3, n: Vec3, r: number;
      if (folded.includes('index') && folded.includes('middle')) {
        ({ p, n, r } = at('middle'));
      } else if (folded.length >= 2) {
        // 親指に近い方の握った指の上（次の指へ少し寄せる）。小指まで渡すと親指が届かない
        const a = at(folded[0]!), c = at(folded[1]!);
        p = lerpV(a.p, c.p, 0.3);
        n = normalize(lerpV(a.n, c.n, 0.3));
        r = lerp(a.r, c.r, 0.3);
      } else if (folded.length === 1) {
        ({ p, n, r } = at(folded[0]!));
      } else {
        return placementTarget('foldedPalm', s, pose);
      }
      return madd(p, n, r + rt - 0.006);
    }
    case 'tuckedUnder': {
      // 曲げた人差し指・中指の先の下（手首の側）、手のひらの面の前
      const a = contactSphere(s, 'index.tip'), b = contactSphere(s, 'middle.tip');
      const c = lerpV(a.center, b.center, 0.5);
      if (c[1] > 1.25) return placementTarget('foldedPalm', s, pose);
      return [c[0] + 0.03, c[1] - (a.radius + rt) * 0.85, Math.max(DIM.palmHalf + rt, c[2] - 0.05)];
    }
    case 'foldedPalm':
      return [DIM.mcp.ring[0] + 0.03, 0.66, DIM.palmHalf + rt + 0.004];
    case 'betweenIndexMiddle': {
      if (isFolded(pose.index) && isFolded(pose.middle)) {
        const p = lerpV(s.index.joints[1], s.middle.joints[1], 0.5);
        const n = normalize(lerpV(frontNormal(s.index.bones[1]), frontNormal(s.middle.bones[1]), 0.5));
        return madd(p, n, 0.04);
      }
      const p = lerpV(DIM.mcp.index, DIM.mcp.middle, 0.5);
      return [p[0], p[1] + 0.12, DIM.palmHalf];
    }
    default:
      return null;
  }
}

/** 置き場所ごとの、親指の先の骨（末節）の向きの目安（手の座標）。先の位置だけだと親指が斜めに立つことがあるため */
const PLACEMENT_DIR: Partial<Record<NamedPlacement, Vec3>> = {
  alongside: normalize([0.05, 1, 0.1]),
  acrossFront: normalize([-1, -0.12, -0.15]),
  tuckedUnder: normalize([-1, 0.15, 0]),
  foldedPalm: normalize([-0.9, 0.45, 0]),
};

/**
 * 親指で触れる時の、付け根からの角度の目安。触れる指によって親指の出し方が違う。
 * 人差し指の先に触れる形は、残りの指を伸ばしていれば横から輪を作り（め：相手に輪が見える）、
 * 残りの指も丸めていれば前へ向かい合わせる（お：小指の側から輪が見える）。
 */
function touchPref(target: ContactPoint, pose: HandPose): ThumbAngles {
  const f = fingerOf(target);
  if (f === 'index') {
    const othersOpen = pose.middle.mcp < 25 && pose.middle.pip < 30;
    return othersOpen
      ? { cmcFlex: -14, cmcAbd: 28, cmcRot: 18, mcp: 24, ip: 32 }
      : { cmcFlex: 18, cmcAbd: 50, cmcRot: 30, mcp: 16, ip: 26 };
  }
  if (f === 'middle') return { cmcFlex: 14, cmcAbd: 44, cmcRot: 35, mcp: 18, ip: 18 };
  if (f === 'ring') return { cmcFlex: 30, cmcAbd: 46, cmcRot: 45, mcp: 20, ip: 15 };
  if (f === 'pinky') return { cmcFlex: 45, cmcAbd: 46, cmcRot: 55, mcp: 25, ip: 15 };
  return THUMB_TABLE.touch;
}

/* ───────── 逆運動学の組み立て ───────── */

interface Dof {
  chain: ChainName;
  key: string;
  pref: number;
  weight: number;
}

function coreSegment(b: Bone, distal: boolean): [Vec3, Vec3] {
  return distal ? [b.start, madd(b.end, colY(b.rot), -b.radius)] : [b.start, b.end];
}

const ADJACENT: Array<[FingerName, FingerName]> = [
  ['index', 'middle'],
  ['middle', 'ring'],
  ['ring', 'pinky'],
];

/** めり込みの残差（めり込んだ深さ。めり込みが無ければ 0）。残差の数は常に同じにする */
function collisionResiduals(s: HandSkeleton, involved: Set<ChainName>, exclude: Set<string>, w: number, out: number[]) {
  const push = (b1: Bone, d1: boolean, b2: Bone, d2: boolean) => {
    const [p1, q1] = coreSegment(b1, d1), [p2, q2] = coreSegment(b2, d2);
    const pen = b1.radius + b2.radius - COLLIDE_TOL - segmentDistance(p1, q1, p2, q2);
    out.push(pen > 0 ? w * pen : 0);
  };
  for (const tb of [1, 2] as const) {
    for (const f of FINGERS) {
      if (!involved.has('thumb') && !involved.has(f)) continue;
      for (const fb of [0, 1, 2] as const) {
        if (exclude.has(`thumb${tb}-${f}${fb}`)) {
          out.push(0);
          continue;
        }
        push(s.thumb.bones[tb], tb === 2, s[f].bones[fb], fb === 2);
      }
    }
  }
  for (const [f1, f2] of ADJACENT) {
    if (!involved.has(f1) && !involved.has(f2)) continue;
    for (const b1 of [1, 2] as const) for (const b2 of [1, 2] as const) push(s[f1].bones[b1], b1 === 2, s[f2].bones[b2], b2 === 2);
  }
  if (involved.has('thumb')) {
    // 親指が手のひらの面に沈まない
    const pts: Array<[Vec3, number]> = [
      [s.thumb.joints[2], s.thumb.bones[2].radius],
      [contactSphere(s, 'thumb.tip').center, s.thumb.bones[2].radius],
    ];
    for (const [p, r] of pts) {
      const inside = p[0] > -0.42 && p[0] < 0.3 && p[1] > 0.12 && p[1] < 0.96;
      const pen = DIM.palmHalf + r - COLLIDE_TOL - p[2];
      out.push(inside && pen > 0 ? w * pen : 0);
    }
  }
}

function excludeForContact(a: ContactPoint, b: ContactPoint, out: Set<string>) {
  for (const [p, q] of [
    [a, b],
    [b, a],
  ] as const) {
    if (fingerOf(p) !== 'thumb' || fingerOf(q) === 'thumb') continue;
    const f = fingerOf(q) as FingerName;
    const j = jointOf(q);
    const bones = j === 'tip' ? [1, 2] : j === 'dip' ? [1, 2] : j === 'pip' ? [0, 1] : [0];
    for (const tb of [1, 2]) for (const fb of bones) out.add(`thumb${tb}-${f}${fb}`);
  }
}

function setDof(pose: HandPose, d: Dof, deg: number) {
  (pose[d.chain] as unknown as Record<string, number>)[d.key] = deg;
}

function clonePose(p: HandPose): HandPose {
  return {
    thumb: { ...p.thumb },
    index: { ...p.index },
    middle: { ...p.middle },
    ring: { ...p.ring },
    pinky: { ...p.pinky },
  };
}

interface Problem {
  target: Vec3 | null;
  contacts: Array<[ContactPoint, ContactPoint]>;
  dofs: Dof[];
  coupledDip: Set<FingerName>;
  exclude: Set<string>;
  regScale: number;
  placement: NamedPlacement | null;
}

/**
 * 逆運動学を解く。starts に出発点のずらし（度）を渡すと、それぞれから解いて残差の一番小さい解を選ぶ
 * （親指は付け根の向き次第で、握った指の内側へ潜る局所解に落ちることがあるため）。
 */
function runProblem(base: HandPose, pb: Problem, starts: Array<Partial<ThumbAngles>> = [{}]): HandPose {
  let best: { pose: HandPose; cost: number } | null = null;
  // ずらすのは動かす変数だけ（adjust で固定した関節はそのまま）
  const free = new Set(pb.dofs.filter((d) => d.chain === 'thumb').map((d) => d.key));
  for (const st of starts) {
    const b = clonePose(base);
    for (const [k, v] of Object.entries(st) as Array<[ThumbKey, number]>) {
      if (!free.has(k)) continue;
      const [lo, hi] = LIMITS.thumb[k];
      b.thumb[k] = clamp(b.thumb[k] + v, lo, hi);
    }
    const r = runOnce(b, pb);
    if (!best || r.cost < best.cost) best = r;
  }
  return best!.pose;
}

function runOnce(base: HandPose, pb: Problem): { pose: HandPose; cost: number } {
  if (pb.dofs.length === 0) return { pose: base, cost: 0 };
  const pose = clonePose(base);
  const involved = new Set<ChainName>(pb.dofs.map((d) => d.chain));
  const x0 = pb.dofs.map((d) => ((pose[d.chain] as unknown as Record<string, number>)[d.key] ?? 0) * DEG);
  const lo = pb.dofs.map((d) => limitOf(d.chain, d.key)[0] * DEG);
  const hi = pb.dofs.map((d) => limitOf(d.chain, d.key)[1] * DEG);
  const apply = (x: number[]) => {
    pb.dofs.forEach((d, i) => setDof(pose, d, x[i]! / DEG));
    for (const f of pb.coupledDip) pose[f].dip = clamp(pose[f].pip * DIP_RATIO, LIMITS.finger.dip[0], LIMITS.finger.dip[1]);
  };
  const residual = (x: number[]): number[] => {
    apply(x);
    const s = skeleton(pose);
    const out: number[] = [];
    if (pb.target) {
      const tip = contactSphere(s, 'thumb.tip').center;
      const d = sub(tip, pb.placement ? placementTarget(pb.placement, s, pose) ?? pb.target : pb.target);
      out.push(3 * d[0], 3 * d[1], 3 * d[2]);
      const want = pb.placement ? PLACEMENT_DIR[pb.placement] : undefined;
      if (want) {
        const dir = colY(s.thumb.bones[2].rot);
        out.push(0.35 * (dir[0] - want[0]), 0.35 * (dir[1] - want[1]), 0.35 * (dir[2] - want[2]));
      }
    }
    for (const [a, b] of pb.contacts) {
      out.push(6 * contactGap(s, a, b));
      const A = contactSphere(s, a), B = contactSphere(s, b);
      const ab = normalize(sub(B.center, A.center));
      // 指先どうしは腹どうしで触れるように（向きの目安。弱く効かせる）
      out.push(A.pad ? 0.12 * (1 - dot(A.pad, ab)) : 0);
      out.push(B.pad ? 0.12 * (1 + dot(B.pad, ab)) : 0);
    }
    collisionResiduals(s, involved, pb.exclude, 4, out);
    pb.dofs.forEach((d, i) => out.push(d.weight * pb.regScale * (x[i]! - d.pref)));
    return out;
  };
  const r = solveLM(x0, lo, hi, residual, { maxIter: 140 });
  apply(r.x);
  return { pose, cost: r.cost };
}

/** 親指と指のいちばん深いめり込み（接触の相手の部分は除く） */
function thumbPenetration(s: HandSkeleton, exclude: Set<string>): { depth: number; where: string } {
  let worst = { depth: 0, where: '' };
  for (const tb of [1, 2] as const) {
    for (const f of FINGERS) {
      for (const fb of [0, 1, 2] as const) {
        if (exclude.has(`thumb${tb}-${f}${fb}`)) continue;
        const b1 = s.thumb.bones[tb], b2 = s[f].bones[fb];
        const [p1, q1] = coreSegment(b1, tb === 2), [p2, q2] = coreSegment(b2, fb === 2);
        const d = b1.radius + b2.radius - segmentDistance(p1, q1, p2, q2);
        if (d > worst.depth) worst = { depth: d, where: f };
      }
    }
  }
  return worst;
}

/** 逆運動学の出発点のずらし（親指の付け根。度） */
const THUMB_STARTS: Array<Partial<ThumbAngles>> = [{}, { cmcAbd: 25 }, { cmcAbd: -12, mcp: 18 }, { cmcFlex: 15, cmcAbd: 15, cmcRot: 20 }];

const cache = new Map<string, SolvedShape>();

/** 形の仕様を関節角度にする（同じ仕様は記憶した結果を返す） */
export function solveHandshape(shape: HandshapeSpec): SolvedShape {
  const key = stableStringify(shape);
  const hit = cache.get(key);
  if (hit) return hit;
  const res = solveUncached(shape);
  cache.set(key, res);
  return res;
}

function solveUncached(shape: HandshapeSpec): SolvedShape {
  const warnings: string[] = [];
  const pose: HandPose = clonePose(REST_POSE);
  for (const f of FINGERS) {
    const t = FINGER_TABLE[shape.fingers[f]] ?? FINGER_TABLE.extended;
    pose[f] = { mcp: t.mcp, pip: t.pip, dip: t.dip, spread: spreadFor(shape.spread, f, t.mcp) };
  }
  if (shape.cross) applyCross(pose, shape.cross);
  const placement = shape.thumb;
  const touch = typeof placement === 'object' && placement ? placement.touch : null;
  const named: NamedPlacement | null = touch ? null : (placement as NamedPlacement);
  pose.thumb = { ...(touch ? touchPref(touch, pose) : (THUMB_TABLE[named!] ?? THUMB_TABLE.alongside)) };
  const fixed = new Set<string>();
  applyAdjust(pose, shape.adjust, fixed);
  clampPose(pose, warnings);

  const contacts: Array<[ContactPoint, ContactPoint]> = [];
  if (touch) contacts.push(['thumb.tip', touch]);
  for (const c of shape.contacts ?? []) contacts.push([c[0], c[1]]);

  const exclude = new Set<string>();
  for (const [a, b] of contacts) excludeForContact(a, b, exclude);

  const dofsFor = (chains: Set<ChainName>, partnerWeight: number): { dofs: Dof[]; coupled: Set<FingerName> } => {
    const dofs: Dof[] = [];
    const coupled = new Set<FingerName>();
    for (const c of chains) {
      if (c === 'thumb') {
        for (const k of ['cmcFlex', 'cmcAbd', 'cmcRot', 'mcp', 'ip'] as const) {
          if (fixed.has(`thumb${FIXED_SEP}${k}`)) continue;
          dofs.push({ chain: 'thumb', key: k, pref: pose.thumb[k] * DEG, weight: 0.12 });
        }
        continue;
      }
      for (const k of ['mcp', 'pip', 'spread'] as const) {
        if (fixed.has(`${c}${FIXED_SEP}${k}`)) continue;
        dofs.push({ chain: c, key: k, pref: pose[c][k] * DEG, weight: partnerWeight });
      }
      if (!fixed.has(`${c}${FIXED_SEP}pip`) && !fixed.has(`${c}${FIXED_SEP}dip`)) coupled.add(c);
    }
    return { dofs, coupled };
  };

  let solved = pose;
  if (named && named !== 'extendedOut' && named !== 'extendedUp') {
    const s0 = skeleton(pose);
    const target = placementTarget(named, s0, pose);
    const { dofs, coupled } = dofsFor(new Set<ChainName>(['thumb']), 0.3);
    solved = runProblem(solved, { target, contacts: [], dofs, coupledDip: coupled, exclude, regScale: 1, placement: named }, THUMB_STARTS);
    const s1 = skeleton(solved);
    const t1 = placementTarget(named, s1, solved);
    if (t1) {
      const miss = Math.hypot(...sub(contactSphere(s1, 'thumb.tip').center, t1));
      if (miss > 0.06) warnings.push(`親指の先が置き場所（${named}）から ${miss.toFixed(3)} 離れています`);
    }
  }
  if (contacts.length > 0) {
    // まず親指（と contacts に名前のある指）だけで合わせ、届かなければ touch の相手の指も動かす
    const chains = new Set<ChainName>();
    if (touch) chains.add('thumb');
    for (const [a, b] of shape.contacts ?? []) chains.add(fingerOf(a)).add(fingerOf(b));
    let st = dofsFor(chains, 0.3);
    solved = runProblem(solved, { target: null, contacts, dofs: st.dofs, coupledDip: st.coupled, exclude, regScale: 1, placement: null }, THUMB_STARTS);
    const worst = () => Math.max(...contacts.map(([a, b]) => Math.abs(contactGap(skeleton(solved), a, b))));
    if (worst() > CONTACT_TOL_INTERNAL) {
      const all = new Set<ChainName>(chains);
      for (const [a, b] of contacts) all.add(fingerOf(a)).add(fingerOf(b));
      st = dofsFor(all, 0.3);
      solved = runProblem(solved, { target: null, contacts, dofs: st.dofs, coupledDip: st.coupled, exclude, regScale: 1, placement: null });
    }
    if (worst() > CONTACT_TOL_INTERNAL) {
      // 形の目安への引き戻しを弱めて、接触を優先する
      solved = runProblem(solved, { target: null, contacts, dofs: st.dofs, coupledDip: st.coupled, exclude, regScale: 0.15, placement: null });
    }
  }

  const s = skeleton(solved);
  const pen = thumbPenetration(s, exclude);
  if (pen.depth > 0.03) warnings.push(`親指が ${pen.where} に ${pen.depth.toFixed(3)} めり込んでいます`);
  const reports: ContactReport[] = contacts.map(([a, b]) => ({ a, b, gap: contactGap(s, a, b) }));
  for (const r of reports) {
    if (r.gap > CONTACT_TOLERANCE) warnings.push(`${r.a} と ${r.b} が ${r.gap.toFixed(3)} 離れています（接触できませんでした）`);
    if (r.gap < -0.05) warnings.push(`${r.a} と ${r.b} が ${(-r.gap).toFixed(3)} めり込んでいます`);
  }
  return { pose: solved, warnings, contacts: reports };
}

/** 2つの形の関節角度を線形に補間する */
export function lerpPose(a: HandPose, b: HandPose, t: number): HandPose {
  const L = (x: number, y: number) => x + (y - x) * t;
  const f = (p: FingerAngles, q: FingerAngles): FingerAngles => ({
    mcp: L(p.mcp, q.mcp),
    pip: L(p.pip, q.pip),
    dip: L(p.dip, q.dip),
    spread: L(p.spread, q.spread),
  });
  return {
    thumb: {
      cmcFlex: L(a.thumb.cmcFlex, b.thumb.cmcFlex),
      cmcAbd: L(a.thumb.cmcAbd, b.thumb.cmcAbd),
      cmcRot: L(a.thumb.cmcRot, b.thumb.cmcRot),
      mcp: L(a.thumb.mcp, b.thumb.mcp),
      ip: L(a.thumb.ip, b.thumb.ip),
    },
    index: f(a.index, b.index),
    middle: f(a.middle, b.middle),
    ring: f(a.ring, b.ring),
    pinky: f(a.pinky, b.pinky),
  };
}

/** すべての関節が可動域の中にあるか（試験用） */
export function poseWithinLimits(p: HandPose, eps = 1e-6): boolean {
  const chains: ChainName[] = ['thumb', ...FINGERS];
  return chains.every((c) =>
    Object.entries(p[c] as unknown as Record<string, number>).every(([k, v]) => {
      const [lo, hi] = limitOf(c, k);
      return v >= lo - eps && v <= hi + eps;
    }),
  );
}
