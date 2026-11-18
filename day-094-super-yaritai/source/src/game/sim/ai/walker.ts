/**
 * 格子の道をたどって歩く道具（店員・客・CPU が使う）。
 */
import type { NavGrid, P2 } from '../nav/grid';

export class Walker {
  path: P2[] = [];
  i = 0;
  goal: P2 | null = null;

  /** 道を引き直す。見つからなければ false */
  setGoal(nav: NavGrid, from: P2, goal: P2): boolean {
    const p = nav.findPath(from, goal);
    this.goal = goal;
    this.path = p ?? [];
    this.i = 0;
    return p !== null;
  }

  clear(): void {
    this.path = [];
    this.i = 0;
    this.goal = null;
  }

  get done(): boolean {
    return this.i >= this.path.length;
  }

  /** 次に向かう点（近づいたら次へ進む）。着いていたら null */
  next(pos: P2, arrive = 0.35): P2 | null {
    while (this.i < this.path.length) {
      const wp = this.path[this.i]!;
      const last = this.i === this.path.length - 1;
      if (Math.hypot(wp.x - pos.x, wp.z - pos.z) < (last ? arrive : 0.4)) this.i++;
      else return wp;
    }
    return null;
  }
}

/** pos を wp へ speed で dt だけ寄せる（行き過ぎない）。動いた向き（yaw）を返す。動かなければ null */
export function stepToward(pos: { x: number; z: number }, wp: P2, speed: number, dt: number): number | null {
  const dx = wp.x - pos.x;
  const dz = wp.z - pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return null;
  const k = Math.min(1, (speed * dt) / d);
  pos.x += dx * k;
  pos.z += dz * k;
  return Math.atan2(dx, dz);
}
