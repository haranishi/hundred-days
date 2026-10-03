// OWNER: dragon
// 撮影のコマ撮り（?film）と性能計測で使う、時刻から決まる竜の動き：クリップを進め、羽ばたき・尾・首の揺れを足し、向きに沿って前へ進める。
// 遊びの中の動きは dragon.ts の applyIntent（意図から作る）で、これは使わない。
import type { DragonPose } from '../config/dragon';

export interface FlightMotion {
  speed: number;
  flapAmplitude: number;
  flapHz: number;
}

/** t 秒後の姿勢：クリップの時刻を t だけ進め、翼の付け根・尾・首に時刻の正弦を足す。 */
export function animatedPose(base: DragonPose, motion: FlightMotion, t: number): DragonPose {
  const w = 2 * Math.PI * motion.flapHz * t;
  return {
    ...base,
    time: base.time + t,
    wingFlap: base.wingFlap + motion.flapAmplitude * Math.sin(w),
    tailSwing: base.tailSwing + 6 * Math.sin(w * 0.5 + 0.8),
    tailLift: base.tailLift + 3 * Math.sin(w + 1.6),
    neckPitch: base.neckPitch + 2.5 * Math.sin(w + 2.4),
  };
}

/** 向き（yaw、+z が 0）に沿って t 秒進んだ距離の (dx, dz)。 */
export function forwardOffset(yawDeg: number, speed: number, t: number): [number, number] {
  const a = (yawDeg * Math.PI) / 180;
  return [Math.sin(a) * speed * t, Math.cos(a) * speed * t];
}
