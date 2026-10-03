// OWNER: core
// ばねと減衰の小さな道具。位置と速度の両方を連続に保つので、目標が1コマで跳んでも動きは滑らかになる。
// 臨界減衰ODE y'' + 2ωy' + ω²y = 0 の解析解から実装。第三者のSmoothDampコードは使わない。

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
  const frequency = 2 / Math.max(1e-4, smoothTime);
  const offset = s.value - target;
  const slope = s.velocity + frequency * offset;
  const attenuation = Math.exp(-frequency * dt);
  const position = target + (offset + slope * dt) * attenuation;
  const velocity = (s.velocity - frequency * slope * dt) * attenuation;
  // 動く目標でも行き過ぎない。速度制限は最終変位を1刻みの上限に収める。
  const crossed = offset !== 0 && offset * (position - target) <= 0;
  const step = crossed ? target - s.value : position - s.value;
  const limit = Math.max(0, maxSpeed) * dt;
  const limited = Math.max(-limit, Math.min(limit, step));
  s.value += limited;
  s.velocity = Math.abs(step) > limit ? limited / dt : crossed ? 0 : velocity;
  return s.value;
}

/** 角度（ラジアン）を (-π, π] に畳む。 */
export function wrapAngle(a: number): number {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  else if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/** current を target へ最大 maxDelta だけ近づける。 */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

/** 角度を最大 maxDelta（ラジアン）だけ target へ回す。 */
export function approachAngle(current: number, target: number, maxDelta: number): number {
  const diff = wrapAngle(target - current);
  if (Math.abs(diff) <= maxDelta) return target;
  return wrapAngle(current + Math.sign(diff) * maxDelta);
}

/**
 * 減衰の弱いばね（行き過ぎて戻る）。衝撃の画角・沈み込みのように「初速を与えて戻す」動きに使う。
 * 周波数 hz と減衰比 zeta（1 で臨界、0.3〜0.6 でゆれて戻る）で指定し、大きな刻みでも安定するよう内部で細かく刻む。
 */
export class KickSpring {
  value = 0;
  velocity = 0;

  constructor(
    private readonly hz: number,
    private readonly zeta: number,
  ) {}

  kick(velocity: number): void {
    this.velocity += velocity;
  }

  update(dt: number): number {
    const w = 2 * Math.PI * this.hz;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -w * w * this.value - 2 * this.zeta * w * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  reset(): void {
    this.value = 0;
    this.velocity = 0;
  }
}
