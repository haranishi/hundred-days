// OWNER: core
// ばねと減衰の小さな道具。本人の別プロジェクト dragon-rampage の src/core/springs.ts から写した（smoothDamp と damped）。
// 位置と速度の両方を連続に保つので、目標が1コマで跳んでも動きは滑らかになる。
// 臨界減衰の式は Game Programming Gems 4「Critically Damped Ease-In/Ease-Out Smoothing」（Unity の SmoothDamp と同じ近似）。

export interface Damped {
  value: number;
  velocity: number;
}

export function damped(value = 0): Damped {
  return { value, velocity: 0 };
}

/** 行き過ぎずに最短で target へ近づける（smoothTime は目標までのおよその秒数）。 */
export function smoothDamp(s: Damped, target: number, smoothTime: number, dt: number, maxSpeed = Infinity): number {
  if (dt <= 0) return s.value;
  const st = Math.max(1e-4, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const maxChange = maxSpeed * st;
  const change = Math.max(-maxChange, Math.min(maxChange, s.value - target));
  const goal = s.value - change;
  const temp = (s.velocity + omega * change) * dt;
  s.velocity = (s.velocity - omega * temp) * decay;
  let out = goal + (change + temp) * decay;
  // 目標を行き過ぎたら止める
  if (target - s.value > 0 === out > target) {
    out = target;
    s.velocity = (out - target) / dt;
  }
  s.value = out;
  return out;
}

/** 値をその場に置き直す（速度も 0）。 */
export function snap(s: Damped, value: number): void {
  s.value = value;
  s.velocity = 0;
}
