import type { FingerName, Handedness, Vec3 } from '../hand/types';

export const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;
export const DIRECTIONS = ['toViewer', 'toSigner', 'up', 'down', 'viewerLeft', 'viewerRight'] as const;
export type Direction = typeof DIRECTIONS[number];
export type FingerState = 'extended' | 'bent' | 'curled';

/** 度。extended(0/3)、half(35/45)、hooked(0/92)、bentMcp(88/0)、curled(86/98)
 * を分ける中間値。landmarks()による境界と揺らぎの試験を参照。実際の手での精度保証ではない。 */
export const THRESHOLDS = {
  extendedMcp: 35, extendedPip: 35, curledMcp: 60, curledPip: 60,
  thumbFlex: 65,
} as const;

/** 分類境界から25度以上離れた目標だけを必須にする。
 * 関節・親指の比較許容幅と同じ幅を確保し、境界付近の形に厳密な分類を要求しない。
 * 合成21点の±2%（端も含む）で検証する値であり、実機の精度保証ではない。 */
export const CLASSIFICATION_MARGIN = 25;

export function stableFinger(finger: FingerFeature): boolean {
  return Math.min(
    Math.abs(finger.mcp - THRESHOLDS.extendedMcp), Math.abs(finger.mcp - THRESHOLDS.curledMcp),
    Math.abs(finger.pip - THRESHOLDS.extendedPip), Math.abs(finger.pip - THRESHOLDS.curledPip),
  ) >= CLASSIFICATION_MARGIN;
}

export interface FingerFeature { state: FingerState; mcp: number; pip: number }
export interface HandFeatures {
  fingers: Record<FingerName, FingerFeature>;
  thumb: {
    extended: boolean;
    flex: number;
    distances: Record<FingerName, number>;
    /** 手首・MCPの面から、手のひら側への距離（手のひら=1）。 */
    depth: number;
    front: boolean;
  };
  palm: Vec3;
  pointing: Vec3;
  palmAngles: Record<Direction, number>;
  pointingAngles: Record<Direction, number>;
}

const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: Vec3): Vec3 => { const n = length(v); return [v[0] / n, v[1] / n, v[2] / n]; };
export function angle(a: Vec3, b: Vec3): number {
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (length(a) * length(b))))) * 180 / Math.PI;
}
function angles(v: Vec3): Record<Direction, number> {
  const deg = (n: number) => Math.acos(Math.max(-1, Math.min(1, n))) * 180 / Math.PI;
  return { toViewer: deg(v[2]), toSigner: deg(-v[2]), up: deg(v[1]), down: deg(-v[1]), viewerLeft: deg(-v[0]), viewerRight: deg(v[0]) };
}

export function fingerState(mcp: number, pip: number): FingerState {
  if (mcp <= THRESHOLDS.extendedMcp && pip <= THRESHOLDS.extendedPip) return 'extended';
  if (mcp >= THRESHOLDS.curledMcp && pip >= THRESHOLDS.curledPip) return 'curled';
  return 'bent';
}

/** 場の座標を受け取る。左右は設定だけで決め、左はXを反転して右手として計算する。
 * 無効/退化した21点はnull。DOM、MediaPipe、描画に依存しない。 */
export function features(points: readonly Vec3[], dominant: Handedness = 'right'): HandFeatures | null {
  if (points.length !== 21 || points.some(p => p.length !== 3 || !p.every(Number.isFinite))) return null;
  const wrist = points[0]!;
  const mirror = dominant === 'left' ? -1 : 1;
  const relative = (i: number): Vec3 => {
    const p = points[i]!;
    return [(p[0] - wrist[0]) * mirror, p[1] - wrist[1], p[2] - wrist[2]];
  };
  const middle = relative(9), index = relative(5), pinky = relative(17);
  const scale = length(middle);
  // 右手の親指側(+X)→小指側(-X)の外積で、腹側(+Z)を得る。
  const normal: Vec3 = [index[1] * pinky[2] - index[2] * pinky[1], index[2] * pinky[0] - index[0] * pinky[2], index[0] * pinky[1] - index[1] * pinky[0]];
  if (scale < 1e-8 || length(normal) / (scale * scale) < 0.01) return null;
  const palm = unit(normal), pointing = unit(middle);
  const fingers = {} as Record<FingerName, FingerFeature>;
  const distances = {} as Record<FingerName, number>;
  const thumbTip = relative(4);
  for (let f = 0; f < FINGERS.length; f++) {
    const name = FINGERS[f]!, base = 5 + f * 4;
    const a = sub(points[base + 1]!, points[base]!);
    const b = sub(points[base + 2]!, points[base + 1]!);
    const c = sub(points[base + 3]!, points[base + 2]!);
    a[0] *= mirror; b[0] *= mirror;
    if (Math.min(length(a), length(b), length(c)) / scale < 0.01) return null;
    const mcp = angle(pointing, a), pip = angle(a, b);
    fingers[name] = { mcp, pip, state: fingerState(mcp, pip) };
    distances[name] = length(sub(thumbTip, relative(base + 3))) / scale;
  }
  const t0 = sub(points[2]!, points[1]!), t1 = sub(points[3]!, points[2]!), t2 = sub(points[4]!, points[3]!);
  if (Math.min(length(t0), length(t1), length(t2)) / scale < 0.01) return null;
  const flex = angle(t0, t1) + angle(t1, t2);
  const depth = dot(thumbTip, palm) / scale;
  return {
    fingers, thumb: { extended: flex <= THRESHOLDS.thumbFlex, flex, distances, depth, front: depth >= 0 },
    palm, pointing, palmAngles: angles(palm), pointingAngles: angles(pointing),
  };
}

export interface WorldPoint { x: number; y: number; z: number }
/** MediaPipeの未反転のworldLandmarks→場の座標。Y/Z反転、手首原点、手のひら=1。
 * Xは画像の右のまま。鏡写しはCSSだけ。outを渡せば21点のバッファを再利用できる。
 * 利き手の正規化はfeatures()が担当し、二重反転を防ぐ。 */
export function worldToScene(world: readonly WorldPoint[], out?: Vec3[]): Vec3[] {
  if (world.length !== 21) return [];
  const w = world[0]!, m = world[9]!;
  const scale = Math.hypot(m.x - w.x, m.y - w.y, m.z - w.z);
  if (!Number.isFinite(scale) || scale < 1e-8) return [];
  const result = out ?? Array.from({ length: 21 }, (): Vec3 => [0, 0, 0]);
  result.length = 21;
  for (let i = 0; i < 21; i++) {
    const p = world[i]!, q = result[i] ?? (result[i] = [0, 0, 0]);
    q[0] = (p.x - w.x) / scale;
    q[1] = -(p.y - w.y) / scale;
    q[2] = -(p.z - w.z) / scale;
  }
  return result;
}
