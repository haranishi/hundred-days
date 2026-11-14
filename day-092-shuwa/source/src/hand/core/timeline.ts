/**
 * 再生の計算（three.js に依存しない）。Keyframe 列 → 時刻ごとの手の状態。
 * 関節角度は線形、回転は球面線形、位置は Catmull-Rom 曲線で補間する。区間の速さの変化は「到着する側」の Keyframe の ease。
 * ただし止まる区間（続く Keyframe の位置が同じ）の両端では位置の曲線の接線を 0 にし、止まる間は手を動かさない（anchorTangent）。
 * 空中に字を書く軌跡（trace）があるときは、指定の指先が経路の上を進むように手全体の位置を決める（Keyframe の位置より優先）。
 */
import type { ContactPoint, Ease, HandTrack, Orientation, SignSpec, Vec3 } from '../types';
import { resolvePosition, type Side } from './body';
import { add, catmullRom, clamp, distance, hermite, lerpV, m3FromQuat, mulMV, quatFromM3, scale, slerp, sub, type M3, type Quat } from './math';
import { orientationMatrix } from './orient';
import { REST_POSE, lerpPose, solveHandshape } from './shapes';
import { PALM_CENTER, pointOf, skeleton, skeletonLandmarks, type HandPose } from './skeleton';

export const DEFAULT_ORIENT: Orientation = { palm: 'toViewer', fingers: 'up' };

export interface HandState {
  pose: HandPose;
  /** 手の座標→場の座標の回転（左手の鏡写しは含まない） */
  rot: M3;
  /** 手首の中心の位置（場の座標） */
  wrist: Vec3;
}

interface CKey {
  t: number;
  pose: HandPose;
  q: Quat;
  anchor: Vec3;
  ease: Ease;
}

export interface CompiledTrack {
  keys: CKey[];
  side: Side;
}

export interface CompiledTrace {
  tip: ContactPoint;
  tStart: number;
  tEnd: number;
  /** なめらかにした経路（場の座標）と、先頭からの道のり */
  path: Vec3[];
  cum: number[];
}

export interface CompiledSign {
  dominant: CompiledTrack;
  nonDominant?: CompiledTrack;
  trace?: CompiledTrace;
  duration: number;
  /** 動きのない形か（どちらの手もキーフレームが1つ・軌跡なし） */
  isStatic: boolean;
  warnings: string[];
}

export interface Frame {
  t: number;
  dominant: HandState;
  nonDominant?: HandState;
  /** 空中に字を書く跡（経路と、どこまで書いたか 0〜1） */
  trace?: { path: Vec3[]; progress: number };
}

export function ease(kind: Ease | undefined, u: number): number {
  const x = clamp(u, 0, 1);
  switch (kind) {
    case 'linear':
      return x;
    case 'out':
      return 1 - (1 - x) ** 3;
    default:
      return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  }
}

function compileTrack(track: HandTrack | undefined, side: Side, warnings: Set<string>): CompiledTrack {
  const kfs = [...(track?.keyframes ?? [])].sort((a, b) => a.t - b.t);
  let pose: HandPose = REST_POSE;
  let orient: Orientation = DEFAULT_ORIENT;
  let pos = undefined as Parameters<typeof resolvePosition>[0];
  const keys: CKey[] = kfs.map((k) => {
    if (k.shape) {
      const s = solveHandshape(k.shape);
      pose = s.pose;
      for (const w of s.warnings) warnings.add(w);
    }
    if (k.orient) orient = k.orient;
    if (k.pos) pos = k.pos;
    return { t: k.t, pose, q: quatFromM3(orientationMatrix(orient)), anchor: resolvePosition(pos, side), ease: k.ease ?? 'inOut' };
  });
  if (keys.length === 0) {
    keys.push({ t: 0, pose: REST_POSE, q: quatFromM3(orientationMatrix(DEFAULT_ORIENT)), anchor: resolvePosition(undefined, side), ease: 'inOut' });
  }
  return { keys, side };
}

function stateOfKey(k: CKey): HandState {
  const rot = m3FromQuat(k.q);
  return { pose: k.pose, rot, wrist: sub(k.anchor, mulMV(rot, PALM_CENTER)) };
}

/** 位置が同じとみなす距離（手のひらの長さ＝1 なので、0.000001 は髪の毛より十分細い） */
const SAME_POSITION = 1e-6;

/**
 * 位置の曲線の、i 番目の Keyframe での接線。ふつうは Catmull-Rom と同じ（前後の Keyframe を結ぶ向きの半分。両端は片側だけ）。
 * 止まる区間（隣の Keyframe と位置が同じ）の端では 0 にする。Catmull-Rom のままだと、止まる間に手が直前の動きの向きへ
 * 前後の移動量の約7%まで行き過ぎて戻り、次の動きの反対へ下がってから出ていく。触れて止まる場面（額・鼻・胸・反対の手）では
 * その間に手が 6〜8mm めり込んで見え、データの側で止まる区間の両端に 0.004 秒の短い区間を置いて避けていた（hand-r2 で直した）。
 * 接線を 0 にすると、止まる区間の中は位置が動かず、着く区間・離れる区間も止まる位置を通り越さない。
 */
function anchorTangent(keys: readonly CKey[], i: number): Vec3 {
  const k = keys[i]!;
  const prev = keys[i - 1], next = keys[i + 1];
  if ((prev && distance(prev.anchor, k.anchor) < SAME_POSITION) || (next && distance(next.anchor, k.anchor) < SAME_POSITION)) return [0, 0, 0];
  return scale(sub(next?.anchor ?? k.anchor, prev?.anchor ?? k.anchor), 0.5);
}

export function sampleTrack(track: CompiledTrack, t: number): HandState {
  const keys = track.keys;
  const first = keys[0]!;
  if (keys.length === 1 || t <= first.t) return stateOfKey(first);
  const last = keys[keys.length - 1]!;
  if (t >= last.t) return stateOfKey(last);
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1]!.t) i++;
  const a = keys[i]!, b = keys[i + 1]!;
  const e = ease(b.ease, (t - a.t) / (b.t - a.t || 1));
  const rot = m3FromQuat(slerp(a.q, b.q, e));
  const anchor = hermite(a.anchor, b.anchor, anchorTangent(keys, i), anchorTangent(keys, i + 1), e);
  return { pose: lerpPose(a.pose, b.pose, e), rot, wrist: sub(anchor, mulMV(rot, PALM_CENTER)) };
}

/** 点の列をなめらかな経路にする（区間ごとに Catmull-Rom で細かく刻む） */
function smoothPath(pts: Vec3[]): Vec3[] {
  if (pts.length <= 1) return pts.slice();
  const out: Vec3[] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2;
    for (let k = 0; k < 16; k++) out.push(catmullRom(p0, p1, p2, p3, k / 16));
  }
  out.push(pts[n - 1]!);
  return out;
}

/** 経路の上で、道のりの割合 s（0〜1）の点 */
export function pointAlong(tr: { path: Vec3[]; cum: number[] }, s: number): Vec3 {
  const total = tr.cum[tr.cum.length - 1] ?? 0;
  if (tr.path.length === 0) return [0, 0, 0];
  if (total <= 0) return tr.path[0]!;
  const d = clamp(s, 0, 1) * total;
  let i = 1;
  while (i < tr.cum.length - 1 && tr.cum[i]! < d) i++;
  const d0 = tr.cum[i - 1]!, d1 = tr.cum[i]!;
  return lerpV(tr.path[i - 1]!, tr.path[i]!, d1 > d0 ? (d - d0) / (d1 - d0) : 0);
}

export function compileSign(spec: SignSpec): CompiledSign {
  const warnings = new Set<string>();
  const dominant = compileTrack(spec.hands.dominant, 'dominant', warnings);
  const nonDominant = spec.hands.nonDominant ? compileTrack(spec.hands.nonDominant, 'nonDominant', warnings) : undefined;
  const lastT = (tr?: CompiledTrack) => (tr ? tr.keys[tr.keys.length - 1]!.t : 0);
  let trace: CompiledTrace | undefined;
  if (spec.trace && spec.trace.points.length > 0) {
    const tip = spec.trace.tip ?? 'index.tip';
    let pts = spec.trace.points.map((p) => [p[0], p[1], p[2]] as Vec3);
    if (spec.trace.relativeTo === 'tipStart') {
      const st = sampleTrack(dominant, spec.trace.tStart);
      const origin = add(st.wrist, mulMV(st.rot, pointOf(skeleton(st.pose), tip)));
      pts = pts.map((p) => add(origin, p));
    }
    const path = smoothPath(pts);
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1]! + distance(path[i - 1]!, path[i]!));
    trace = { tip, tStart: spec.trace.tStart, tEnd: Math.max(spec.trace.tEnd, spec.trace.tStart), path, cum };
  }
  const duration = Math.max(spec.duration ?? 0, lastT(dominant), lastT(nonDominant), trace?.tEnd ?? 0);
  const isStatic = dominant.keys.length <= 1 && (!nonDominant || nonDominant.keys.length <= 1) && !trace;
  return { dominant, nonDominant, trace, duration, isStatic, warnings: [...warnings] };
}

export function sampleSign(c: CompiledSign, t: number): Frame {
  const dominant = sampleTrack(c.dominant, t);
  const nonDominant = c.nonDominant ? sampleTrack(c.nonDominant, t) : undefined;
  let trace: Frame['trace'];
  if (c.trace) {
    const span = c.trace.tEnd - c.trace.tStart;
    const s = span > 0 ? ease('inOut', (t - c.trace.tStart) / span) : t >= c.trace.tStart ? 1 : 0;
    const p = pointAlong(c.trace, s);
    const tipLocal = pointOf(skeleton(dominant.pose), c.trace.tip);
    dominant.wrist = sub(p, mulMV(dominant.rot, tipLocal));
    trace = { path: c.trace.path, progress: s };
  }
  return { t, dominant, nonDominant, trace };
}

/** 動きのない形を「力を抜いた手から形を作る」動きにする（「もう一度」で形の作り方を見せるため） */
export function formationOf(c: CompiledSign, seconds = 0.9): CompiledSign {
  const mk = (tr: CompiledTrack): CompiledTrack => {
    const k = tr.keys[0]!;
    return { side: tr.side, keys: [{ ...k, t: 0, pose: REST_POSE }, { ...k, t: seconds, ease: 'inOut' }] };
  };
  return {
    ...c,
    dominant: mk(c.dominant),
    nonDominant: c.nonDominant ? mk(c.nonDominant) : undefined,
    duration: seconds,
    isStatic: false,
  };
}

/** 手の21点を場の座標で（mirror=左手として描く手） */
export function handPointsInField(h: HandState, mirror: boolean): Vec3[] {
  return skeletonLandmarks(skeleton(h.pose)).map((p) => {
    const q: Vec3 = mirror ? [0 - p[0], p[1], p[2]] : p;
    return add(h.wrist, mulMV(h.rot, q));
  });
}
