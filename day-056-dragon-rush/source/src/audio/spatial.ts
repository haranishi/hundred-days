// OWNER: audio
// 空間の計算（Web Audio を使わない純粋な関数）：聞く位置、距離の減衰、左右の定位、空気の吸収、音速の遅れ、残響への送り。
// 聞く位置はカメラから竜へ寄せた点。竜の音は近くに、街の音は位置どおりに鳴る。左右はカメラの右向きで決める。
import { SPACE, type SpaceKind } from '../config/audio';
import type { P3 } from '../core/events';

export interface Listener {
  /** 距離を測る点（カメラと竜の間） */
  ear: P3;
  /** カメラの位置と右向き（単位ベクトル） */
  cam: P3;
  right: P3;
}

export interface Placement {
  /** 直接音の倍率（1 で素材のまま） */
  gain: number;
  /** 左右（-1〜1） */
  pan: number;
  lowpassHz: number;
  /** 音速の遅れ（秒）。竜自身の音と近い音は 0 */
  delay: number;
  /** 近・中・遠の残響へ送る倍率 */
  sends: [number, number, number];
  distance: number;
}

const dbToGain = (db: number): number => 10 ** (db / 20);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** カメラの世界行列（列優先の16個）と竜の位置から、聞く位置を作る。 */
export function listenerFrom(matrix: ArrayLike<number>, dragon: P3, lean = SPACE.listenerLean): Listener {
  const cam: P3 = [matrix[12], matrix[13], matrix[14]];
  const rl = Math.hypot(matrix[0], matrix[1], matrix[2]) || 1;
  const right: P3 = [matrix[0] / rl, matrix[1] / rl, matrix[2] / rl];
  const ear: P3 = [cam[0] + (dragon[0] - cam[0]) * lean, cam[1] + (dragon[1] - cam[1]) * lean, cam[2] + (dragon[2] - cam[2]) * lean];
  return { ear, cam, right };
}

/** 距離による減衰（dB）。ref までは 0、その先は倍ごとに -6dB×rolloff、minDb で止める。 */
export function distanceDb(d: number, ref: number): number {
  if (d <= ref) return 0;
  return Math.max(SPACE.minDb, -20 * SPACE.rolloff * Math.log10(d / ref));
}

/** 残響の近・中・遠の割合（和は 1）。境目の前後 ±30% で滑らかに渡す。 */
export function reverbWeights(d: number): [number, number, number] {
  const [a, b] = SPACE.reverbSplits;
  const t1 = smoothstep(a * 0.7, a * 1.3, d);
  const t2 = smoothstep(b * 0.7, b * 1.3, d);
  return [1 - t1, t1 * (1 - t2), t2];
}

/** 音源 src を、聞く位置 L でどう鳴らすか。space が ui なら空間を通さない。 */
export function place(src: P3 | null, L: Listener | null, space: SpaceKind, size = 1): Placement {
  if (space === 'ui' || !src || !L) return { gain: 1, pan: 0, lowpassHz: SPACE.nearHz, delay: 0, sends: [0, 0, 0], distance: 0 };
  const dx = src[0] - L.ear[0];
  const dy = src[1] - L.ear[1];
  const dz = src[2] - L.ear[2];
  const d = Math.hypot(dx, dy, dz);
  const ref = SPACE.refDistance * size;
  const gain = dbToGain(distanceDb(d, ref));
  // 左右：カメラから見た向きを右向きへ射影。近くて大きな音は広がって聞こえるので中央へ寄せる
  const cx = src[0] - L.cam[0];
  const cy = src[1] - L.cam[1];
  const cz = src[2] - L.cam[2];
  const cl = Math.hypot(cx, cy, cz) || 1;
  const side = (cx * L.right[0] + cy * L.right[1] + cz * L.right[2]) / cl;
  const pan = Math.max(-1, Math.min(1, side * SPACE.panWidth * Math.min(1, d / (SPACE.panNear * size))));
  const lowpassHz = Math.max(900, Math.min(20000, SPACE.nearHz / (1 + d / SPACE.halfDistance) ** 0.9));
  const delay = space === 'world' && d > SPACE.delayFrom ? d / SPACE.speedOfSound : 0;
  // 残響：直接音は倍ごとに -6dB 下がるので、送りを倍ごとに +3dB 戻して、残響だけは -3dB/倍で弱まるようにする
  const wet = Math.min(SPACE.wetMaxDb, SPACE.wetPerDoubling * Math.log2(Math.max(1, d / ref)));
  const w = space === 'self' ? ([1, 0, 0] as const) : reverbWeights(d);
  const sends: [number, number, number] = [
    w[0] * dbToGain(SPACE.sendDb.near + wet),
    w[1] * dbToGain(SPACE.sendDb.mid + wet),
    w[2] * dbToGain(SPACE.sendDb.far + wet),
  ];
  return { gain, pan, lowpassHz, delay, sends, distance: d };
}
