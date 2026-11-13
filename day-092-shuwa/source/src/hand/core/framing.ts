/**
 * カメラの置き方（three.js に依存しない）。
 * viewer＝見る人の位置から（正面、少し上から）。self＝表す人の側（後ろ・上）から自分の手を見る（手だけの表示。上半身つきは render/stage.ts）。
 * self は鏡写しにしない: 表す人の後ろから見るので、自分の右手は画面の右に出る。
 */
import type { Handedness, Perspective, Vec3 } from '../types';
import { BODY } from './body';
import { add, clamp, colY, distance, dot, m3FromQuat, mulMV, scale, sub } from './math';
import { REST_POSE } from './shapes';
import { handPointsInField, sampleSign, type CompiledSign, type HandState } from './timeline';

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 指先が相手の方へどれだけ向くか（利き手の Keyframe のうち一番大きい、指先の向きの +Z 成分。−1〜1） */
export function forwardness(c: CompiledSign): number {
  let f = -1;
  for (const k of c.dominant.keys) f = Math.max(f, colY(m3FromQuat(k.q))[2]);
  return f;
}

/**
 * 自分から見る視点の向き（度。手だけの表示）。forward は forwardness（指先が相手の方へ向く度合い）。
 *
 * 基本は手の真後ろ・上 40°（表す人の肩越しに、自分の手を後ろから見る）。指先が相手の方へ向く形（そ・は・のばす音）だけ、
 * 表す人の目の側（体の中心の側）へ 35° 回り込み、少し高く（46°）する。決めた理由（hand-r2 で全部の指文字を候補の視点で並べて比べた）:
 *  - 以前の視点（体の中心の側へ 17°・上 26°）は、め の伸ばした3本が並ぶ向きと視線がそろって1本に見え、そ・は は袖が手前にかぶった
 *  - 真後ろ・上 40° なら め の3本が分かれ、指先が下を向く形（す・な・ね・ふ・へ・ま）も読める。ただし そ は相手の方を指す人差し指が
 *    視線とほぼ重なり（約8°）、こぶしの陰に隠れる
 *  - 実際の目の位置（体の中心の側へ約 36°・上 約 48°）からは そ の人差し指が見えるが、め の3本は重なる
 *  1つの向きで両方は満たせないので、相手の方を指す形だけ目の側から見る。視点は語ごとに1回決め、再生中は動かさない
 */
export function selfAngles(dominant: Handedness, forward = -1): { yaw: number; pitch: number } {
  const s = smoothstep(0.4, 0.7, forward);
  const yaw = 180 - 35 * s;
  return { yaw: dominant === 'left' ? 0 - yaw : yaw, pitch: 40 + 6 * s };
}

/**
 * 上半身つきを自分から見る視点の向き（度）: 利き手の肩の後ろ上（真後ろから利き手の側へ 20°・上 28°）。
 * 以前は頭の後ろ上から見て頭と首を消していたので、首のない胴に見えた（使い心地の評価の指摘。hand-r2）。
 * 肩越しに見れば、表す人の後ろにいることが頭の後ろ姿で分かる。頭と胴は薄く透かして描き、その向こうの手を隠さない（render/body-rig.ts）
 */
export function bodySelfAngles(dominant: Handedness): { yaw: number; pitch: number } {
  return { yaw: dominant === 'left' ? 160 : -160, pitch: 28 };
}

/**
 * 手だけを描く時の枠の半径の下限（握った形を大きくしすぎない）。以前は全部の形を半径 1.22 に固定していたが、
 * 開いた手の指先や手のひらの縁がはみ出して、小さな画像ごとに枠の切れ方が違った（使い心地の評価の指摘。hand-r2 で形ごとに収めるよう変えた）
 */
export const HAND_RADIUS_MIN = 1.15;
/** 21点から手の表面までのゆとり（指・親指の太さと手のひらの厚み。いちばん太い親指の付け根で 0.12） */
const SURFACE = 0.12;
/** 枠の縁との隙間（手だけ・上半身つき） */
const GAP_HAND = 0.08;
const GAP_BODY = 0.3;
/** 21点に足す、手の外形の点（手の座標・右手）: 手のひらの縁（小指の側・親指の側・付け根の並び）と、手首のふくらみの下の縁 */
const HAND_EDGE: Vec3[] = [
  [-0.41, 0.56, 0],
  [-0.385, 0.885, 0],
  [0.342, 0.62, 0],
  [-0.3, 0.03, 0],
  [0.275, 0.12, 0],
  [0, -0.3, 0],
  [0.24, -0.22, 0],
  [-0.24, -0.22, 0],
];

/** 手の外形を代表する点（場の座標）。mirror＝左手として描く手 */
function handOutline(h: HandState, mirror: boolean): Vec3[] {
  const pts = handPointsInField(h, mirror);
  for (const p of HAND_EDGE) pts.push(add(h.wrist, mulMV(h.rot, mirror ? [0 - p[0], p[1], p[2]] : p)));
  return pts;
}

export interface Bounds {
  center: Vec3;
  radius: number;
}

/**
 * 視点の基準の向き（度）。yaw=真上から見て +Z からの回り角（+X 側が＋。180 が表す人の側の真後ろ）、pitch=上から見下ろす角。
 * sign を渡すと、自分から見る視点を形に合わせる（selfAngles）。渡さなければ基本の向き
 */
export function baseAngles(p: Perspective, dominant: Handedness, sign?: CompiledSign): { yaw: number; pitch: number } {
  // 見る人は表す人の体の正面に立つので、利き手側（右手なら見る人の左）にある手を少し右から見ることになる。
  // 真正面だと指の前後が重なって読みにくいため、その角度（10°）を残す
  if (p === 'viewer') return { yaw: dominant === 'left' ? -10 : 10, pitch: 7 };
  return selfAngles(dominant, sign ? forwardness(sign) : -1);
}

/** ドラッグで回せる範囲（度）: 左右 ±180・上下 ±60 */
export function clampDrag(yaw: number, pitch: number): { yaw: number; pitch: number } {
  return { yaw: clamp(yaw, -180, 180), pitch: clamp(pitch, -60, 60) };
}

/** 見る向き（枠の中心からカメラへ。長さ1）。yaw・pitch は度（baseAngles と同じ） */
export function viewDirection(yawDeg: number, pitchDeg: number): Vec3 {
  const y = (yawDeg * Math.PI) / 180, p = (clamp(pitchDeg, -85, 85) * Math.PI) / 180;
  return [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
}

export function cameraPosition(b: Bounds, yawDeg: number, pitchDeg: number, fovDeg: number): Vec3 {
  const dist = b.radius / Math.sin((fovDeg * Math.PI) / 360);
  return add(b.center, scale(viewDirection(yawDeg, pitchDeg), dist));
}

/**
 * 形と動きの全体が入る範囲（球）。カメラはこの球が画面の縦に収まる距離に置くので、どの向きから見ても（ドラッグで回しても）切れない。
 *  - 手だけ: 手の外形（21点・手のひらの縁・手首のふくらみ）と空中に書く跡が入る球。形ごとに収める（半径の下限 HAND_RADIUS_MIN）。
 *    前腕と袖は入れない（どの形も、袖は枠の外へ抜ける形でそろえる）
 *  - 上半身つき: 両手と頭（顔の表情を見せる）が入る球。胴の下・肩・ひじは枠で切れてよい。以前は胴の下と肩まで入れていて
 *    人物が小さく、あいさつの人差し指を曲げる動きが見えにくかった（使い心地の評価の指摘。hand-r2）
 * 左利きの時は場全体を X で反転して描くので、中心も反転する。
 */
export function signBounds(c: CompiledSign, dominant: Handedness, withBody: boolean): Bounds {
  const pts: Vec3[] = [];
  const n = c.isStatic ? 1 : 24;
  const nonActiveFrom = nonDominantActiveFrom(c);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? c.duration : (c.duration * i) / (n - 1);
    const f = sampleSign(c, t);
    pts.push(...handOutline(f.dominant, false));
    if (f.nonDominant && t >= nonActiveFrom) pts.push(...handOutline(f.nonDominant, true));
  }
  if (c.nonDominant && Number.isFinite(nonActiveFrom)) pts.push(...handOutline(sampleSign(c, nonActiveFrom).nonDominant!, true));
  if (c.trace) pts.push(...c.trace.path);
  if (withBody) pts.push(...headOutline());
  return mirrorFor(sphereAround(pts, withBody), dominant);
}

/**
 * 小さな画像で、空中に書く跡（の・り・ん・のばす音）を見せるために枠を広げてよい倍率（手だけの球の半径に対して）の上限。
 * 跡が入るまで、少しずつ広げる（TRACE_SHOWN）。跡を全部入れると の は手が約3分の2の大きさになり（半径 1.34→2.03）、
 * 跡を入れないと の の跡が指先の上の短い線だけになって ひ・1 と見分けにくかった（hand-r3 で撮って見比べた）。
 * 上限まで広げるのは の だけ（指先の上へ跡が伸びるため）。のばす音・ん は 1.05 倍以内で足りる
 */
export const THUMB_TRACE_MAX_SPREAD = 1.3;
/** 跡の長さのうち、これだけの割合が枠の内側（TRACE_INNER より中）に入ったら広げるのをやめる */
const TRACE_SHOWN = 2 / 3;
/** 枠の半径に対して「見える」とみなす所（画面の上で、枠の中心からの距離）。小さな画像の縁のぼかし（画像の一辺の 0.2）が半分の濃さになる辺り */
const TRACE_INNER = 0.8;

/**
 * 小さな画像の枠（hand-r3）。手だけの形は、描く時点 t の手を、動きのない形と同じ決まりで収める。
 * 以前は大きな表示と同じ signBounds（動き全体と空中に書く跡が入る球）だったので、動く形の手が小さく、動いた先に寄った
 * （半濁音は上へ、小さい字・促音は奥へ、のばす音は跡の下の端へ。見た目の採点 第2周の指摘）。小さな画像は止まった1枚の絵なので、
 * その時点の手が、ほかの札と同じ大きさで真ん中に来るようにする。動きのない形は今までと同じ枠になる（時点が1つしかないため）。
 * 空中に書く跡は、跡の 2/3 が見えるまで枠を少しずつ（上限 THUMB_TRACE_MAX_SPREAD 倍）広げ、手が枠に収まる所まで中心を跡の方へ寄せる。
 * 入り切らない分は、画像の縁で袖と同じくぼかして消す（render/materials.ts の edgeFade）。perspective は跡の見え方を測る向きだけに使う。
 * 上半身つきは大きな表示と同じ枠（両手の動きと頭が入る球）のまま。
 */
export function thumbnailBounds(
  c: CompiledSign,
  t: number,
  dominant: Handedness,
  withBody: boolean,
  perspective: Perspective = 'viewer',
  maxSpread = THUMB_TRACE_MAX_SPREAD,
): Bounds {
  if (withBody) return signBounds(c, dominant, true);
  const f = sampleSign(c, t);
  const hand = handOutline(f.dominant, false);
  if (f.nonDominant && t >= nonDominantActiveFrom(c)) hand.push(...handOutline(f.nonDominant, true));
  const own = sphereAround(hand, false);
  // その時点までに書いた跡（小さな画像に描く分。時点を省いた既定は最後なので全部）
  const tr = c.trace;
  const written = tr && f.trace ? f.trace.progress * tr.cum[tr.cum.length - 1]! : 0;
  const trail = tr ? tr.path.filter((_, i) => tr.cum[i]! <= written + 1e-9) : [];
  if (trail.length < 2) return mirrorFor(own, dominant);
  const all = sphereAround([...hand, ...trail], false);
  // 見る向き（右利きの場の座標。枠の中心からカメラへ）。跡が見えるかは、この向きに直交する面（画面）の上の距離で測る
  // （のばす音は跡が手より相手の側にあり、奥行きの差まで数えると広げすぎた）
  const a = baseAngles(perspective, 'right', c);
  const view = viewDirection(a.yaw, a.pitch);
  let b = own;
  for (let k = 1; ; k = Math.min(maxSpread, k + 0.02)) {
    b = spread(own, all, hand, k);
    if (b.radius >= all.radius || trailShown(trail, b, view) >= TRACE_SHOWN || k >= maxSpread) break;
  }
  return mirrorFor(b, dominant);
}

/** 手だけの球（own）を k 倍まで広げ、中心を全体の球（all）の方へ、手がはみ出さない所まで寄せる */
function spread(own: Bounds, all: Bounds, hand: Vec3[], k: number): Bounds {
  const radius = Math.min(all.radius, own.radius * k);
  if (radius >= all.radius) return all;
  const at = (s: number) => add(own.center, scale(sub(all.center, own.center), s));
  const fits = (s: number) => hand.every((p) => distance(p, at(s)) + SURFACE + GAP_HAND <= radius);
  let lo = 0, hi = 1;
  if (fits(1)) lo = 1;
  else {
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2;
      if (fits(m)) lo = m;
      else hi = m;
    }
  }
  return { center: at(lo), radius };
}

/** 跡の長さのうち、画面の上で枠の内側（中心から半径の TRACE_INNER 倍より中）に入る割合。view は見る向き（長さ1） */
function trailShown(path: Vec3[], b: Bounds, view: Vec3): number {
  let total = 0, shown = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, q = path[i]!;
    const len = distance(a, q);
    total += len;
    const d = sub(scale(add(a, q), 0.5), b.center);
    const across = sub(d, scale(view, dot(d, view)));
    if (Math.hypot(across[0], across[1], across[2]) <= TRACE_INNER * b.radius) shown += len;
  }
  return total > 0 ? shown / total : 1;
}

/**
 * 反対の手が形を作り始める時刻。それより前（力を抜いた手で、おなかの前などに休めている間）は枠に入れない
 * （おはよう・こんにちはの左手。休めている手は枠の下で切れてよい）
 */
function nonDominantActiveFrom(c: CompiledSign): number {
  return c.nonDominant?.keys.find((k) => k.pose !== REST_POSE)?.t ?? Infinity;
}

/** 時刻 t に、反対の手が形を作る前で休めているか（小さな画像で、休めている手を袖と同じく縁でぼかすのに使う） */
export function nonDominantResting(c: CompiledSign, t: number): boolean {
  return !!c.nonDominant && t < nonDominantActiveFrom(c);
}

/** 頭（顔）の外形を代表する点（上半身つきの枠に入れる） */
function headOutline(): Vec3[] {
  const hc = BODY.headCenter, hr = BODY.headRadius;
  return [
    [hc[0], hc[1] + hr[1], hc[2]],
    [hc[0], hc[1] - hr[1], hc[2]],
    [hc[0] - hr[0], hc[1], hc[2]],
    [hc[0] + hr[0], hc[1], hc[2]],
    [hc[0], hc[1], hc[2] + hr[2]],
  ];
}

/** 点の集まりが入る球（中心は外接する箱の中心）。表面のゆとりと縁との隙間を足す（右利きの場の座標） */
function sphereAround(pts: Vec3[], withBody: boolean): Bounds {
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k]!, p[k]!);
    hi[k] = Math.max(hi[k]!, p[k]!);
  }
  const center: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  let far = 0;
  for (const p of pts) far = Math.max(far, distance(p, center));
  const radius = withBody ? far + SURFACE + GAP_BODY : Math.max(HAND_RADIUS_MIN, far + SURFACE + GAP_HAND);
  return { center, radius };
}

/** 左利きの時は場全体を X で反転して描くので、中心も反転する */
function mirrorFor(b: Bounds, dominant: Handedness): Bounds {
  return dominant === 'left' ? { center: [0 - b.center[0], b.center[1], b.center[2]], radius: b.radius } : b;
}
