// OWNER: chars-art
// ばねと減衰の小さな道具。位置と速度の両方を連続に保つので、目標が1コマで跳んでも動きは滑らかになる。
// smoothDamp・wrapAngle・KickSpring は本人の別プロジェクト dragon-rampage の src/core/springs.ts から写した（HARNESS.md で許可）。
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

/** 角度（ラジアン）を (-π, π] に畳む。 */
export function wrapAngle(a: number): number {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  else if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/** 角度の smoothDamp。目標との差を (-π, π] に畳んでから寄せるので、±π をまたいでも遠回りしない。 */
export function smoothDampAngle(s: Damped, target: number, smoothTime: number, dt: number, maxSpeed = Infinity): number {
  const t = s.value + wrapAngle(target - s.value);
  return smoothDamp(s, t, smoothTime, dt, maxSpeed);
}

/**
 * 減衰の弱いばね（行き過ぎて戻る）。周波数 hz と減衰比 zeta（1 で臨界、0.3〜0.6 でゆれて戻る）で指定し、
 * 大きな刻みでも安定するよう内部で細かく刻む。target を与えると、そこへ向かって揺れながら寄る。
 */
export class KickSpring {
  value = 0;
  velocity = 0;

  constructor(
    public hz: number,
    public zeta: number,
  ) {}

  kick(velocity: number): void {
    this.velocity += velocity;
  }

  /** target へ向かうばね。force は外から加える加速度（慣性の遅れなど）。 */
  update(dt: number, target = 0, force = 0): number {
    const w = 2 * Math.PI * this.hz;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -w * w * (this.value - target) - 2 * this.zeta * w * this.velocity + force;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  reset(value = 0): void {
    this.value = value;
    this.velocity = 0;
  }
}

/**
 * 吊るした物の振り子（小さな角度の近似を使わない2軸）。支点の加速度（体の座標系の前・横）を受けて、
 * 前後の振れ pitch と左右の振れ roll を返す。length は支点から重心まで（m）。
 */
export class Pendulum {
  pitch = 0;
  roll = 0;
  vp = 0;
  vr = 0;

  constructor(
    public length: number,
    public zeta: number,
    public gravity = 9.8,
    /** 振れの大きさの上限（rad）。吊り紐は竿や手に当たるので、それ以上は振れない。 */
    public limit = 1.1,
  ) {}

  /** ax・az は支点の加速度（m/s²、体の横・前）。ay は上下（上向き正）。 */
  update(dt: number, ax: number, ay: number, az: number): void {
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    const g = Math.max(2, this.gravity + ay);
    const w0 = Math.sqrt(g / this.length);
    for (let i = 0; i < steps; i++) {
      // 支点が前へ加速すると、吊るした物は後ろへ振れる（pitch は前へ振れるのを正にする）
      const ap = -(g / this.length) * Math.sin(this.pitch) - (az / this.length) * Math.cos(this.pitch) - 2 * this.zeta * w0 * this.vp;
      const ar = -(g / this.length) * Math.sin(this.roll) - (ax / this.length) * Math.cos(this.roll) - 2 * this.zeta * w0 * this.vr;
      this.vp += ap * h;
      this.vr += ar * h;
      this.pitch += this.vp * h;
      this.roll += this.vr * h;
    }
    // 吊り紐は竿に当たるので、振れの大きさに上限を置く
    const lim = this.limit;
    if (this.pitch > lim) (this.pitch = lim), (this.vp = Math.min(0, this.vp));
    if (this.pitch < -lim) (this.pitch = -lim), (this.vp = Math.max(0, this.vp));
    if (this.roll > lim) (this.roll = lim), (this.vr = Math.min(0, this.vr));
    if (this.roll < -lim) (this.roll = -lim), (this.vr = Math.max(0, this.vr));
  }

  reset(): void {
    this.pitch = this.roll = this.vp = this.vr = 0;
  }
}
