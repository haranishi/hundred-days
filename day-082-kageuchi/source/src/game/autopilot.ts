// OWNER: core
// 道順の台本を流す自動操作。読むのは window.__state の形（GameStateOut）だけ、書くのは window.__input の形（BotIO）だけ。
// 人と同じ入口から操作する：行きたい方へカメラを回し（look）、W を押す。しゃがみは C、当て身・討ち取りは E。
// 台本は JSON（tools/routes/*.json）。sim 単体のテスト（tests/route.test.ts）と、ブラウザの自動プレイ（tools/play.mjs）が同じ台本を流す。
import type { GameStateOut } from './state';

/** 条件：番兵の位置・向き・振る舞い、寺の構え、それらの組み合わせ。向きは度（0＝東・90＝南）で、[a, b] は a から時計回りに b まで。 */
export type Cond =
  | { guard: string; x?: [number, number]; z?: [number, number]; view?: [number, number]; state?: string; down?: boolean; sees?: boolean }
  | { phase: string }
  | { prompt: string }
  | { interaction: string; used: boolean }
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond };

export type RouteStep =
  | { do: 'goto'; x: number; z: number; move?: 'walk' | 'run' | 'crouch'; tol?: number; timeout?: number; note?: string }
  | { do: 'wait'; sec: number; note?: string }
  | { do: 'waitUntil'; until: Cond; timeout?: number; note?: string }
  | { do: 'tap'; code: string; note?: string }
  | { do: 'face'; deg: number; note?: string }
  | { do: 'end'; timeout?: number; note?: string };

export interface Route {
  name: string;
  note?: string;
  seed?: number;
  steps: RouteStep[];
}

export interface BotIO {
  down(code: string): void;
  up(code: string): void;
  tap(code: string): void;
  look(dx: number, dy: number): void;
}

const D2R = Math.PI / 180;

function wrapRad(a: number): number {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  else if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

function deg360(d: number): number {
  return ((d % 360) + 360) % 360;
}

function inArc(d: number, [a, b]: [number, number]): boolean {
  const x = deg360(d);
  const lo = deg360(a);
  const hi = deg360(b);
  return lo <= hi ? x >= lo && x <= hi : x >= lo || x <= hi;
}

export function evalCond(c: Cond, s: GameStateOut): boolean {
  if ('all' in c) return c.all.every((x) => evalCond(x, s));
  if ('any' in c) return c.any.some((x) => evalCond(x, s));
  if ('not' in c) return !evalCond(c.not, s);
  if ('phase' in c) return s.phase === c.phase;
  if ('prompt' in c) return s.player.prompt === c.prompt;
  if ('interaction' in c) return s.interactions.some((v) => v.id === c.interaction && v.used === c.used);
  const g = s.guards.find((x) => x.id === c.guard);
  if (!g) return false;
  if (c.x && (g.x < c.x[0] || g.x > c.x[1])) return false;
  if (c.z && (g.z < c.z[0] || g.z > c.z[1])) return false;
  if (c.view && !inArc(g.view, c.view)) return false;
  if (c.state !== undefined && g.state !== c.state) return false;
  if (c.down !== undefined && g.down !== c.down) return false;
  if (c.sees !== undefined && g.sees !== c.sees) return false;
  return true;
}

export class Autopilot {
  stepIdx = 0;
  status: 'running' | 'done' | 'failed' = 'running';
  failReason: string | null = null;
  readonly log: { t: number; step: number; text: string }[] = [];
  private stepStart = -1;
  private readonly held = new Set<string>();
  private lastToggle = -1;

  constructor(
    readonly route: Route,
    private readonly io: BotIO,
    private readonly lookSens: number,
  ) {}

  private hold(code: string, on: boolean): void {
    if (on && !this.held.has(code)) {
      this.io.down(code);
      this.held.add(code);
    } else if (!on && this.held.has(code)) {
      this.io.up(code);
      this.held.delete(code);
    }
  }

  releaseAll(): void {
    for (const c of [...this.held]) this.hold(c, false);
  }

  private next(s: GameStateOut, text: string): void {
    this.log.push({ t: s.t, step: this.stepIdx, text });
    this.stepIdx++;
    this.stepStart = -1;
    this.releaseAll();
    if (this.stepIdx >= this.route.steps.length) this.status = 'done';
  }

  private fail(s: GameStateOut, why: string): void {
    this.failReason = `手順 ${this.stepIdx}（${JSON.stringify(this.route.steps[this.stepIdx])}）: ${why}`;
    this.log.push({ t: s.t, step: this.stepIdx, text: `失敗: ${why}` });
    this.status = 'failed';
    this.releaseAll();
  }

  /** 毎コマ（または毎刻み）呼ぶ。 */
  update(s: GameStateOut): void {
    if (this.status !== 'running') return;
    if (s.outcome === 'caught') {
      this.fail(s, `捕まった（${s.reason?.guardName ?? '?'}）`);
      return;
    }
    const step = this.route.steps[this.stepIdx];
    if (this.stepStart < 0) this.stepStart = s.t;
    const elapsed = s.t - this.stepStart;
    switch (step.do) {
      case 'goto': {
        const p = s.player;
        const dx = step.x - p.x;
        const dz = step.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d <= (step.tol ?? 0.3)) {
          this.next(s, `着いた (${step.x}, ${step.z})${step.note ? ` ${step.note}` : ''}`);
          return;
        }
        if (elapsed > (step.timeout ?? 60)) {
          this.fail(s, `(${step.x}, ${step.z}) に着かない（残り ${d.toFixed(2)}m）`);
          return;
        }
        // 行きたい方へカメラを回す（人がマウスで向きを合わせるのと同じ）
        const want = Math.atan2(dz, dx);
        const delta = wrapRad(want - s.camera.yaw * D2R);
        if (Math.abs(delta) > 1e-4) this.io.look(delta / this.lookSens, 0);
        const move = step.move ?? 'walk';
        const wantCrouch = move === 'crouch';
        if (p.crouch !== wantCrouch && s.t - this.lastToggle > 0.25) {
          this.io.tap('KeyC');
          this.lastToggle = s.t;
        }
        this.hold('KeyW', true);
        this.hold('ShiftLeft', move === 'run');
        return;
      }
      case 'wait':
        if (elapsed >= step.sec) this.next(s, `待った ${step.sec} 秒`);
        return;
      case 'waitUntil':
        if (evalCond(step.until, s)) {
          this.next(s, `条件が立った${step.note ? ` ${step.note}` : ''}`);
          return;
        }
        if (elapsed > (step.timeout ?? 60)) this.fail(s, '条件が立たない');
        return;
      case 'tap':
        this.io.tap(step.code);
        this.next(s, `押した ${step.code}`);
        return;
      case 'face': {
        const delta = wrapRad(step.deg * D2R - s.camera.yaw * D2R);
        if (Math.abs(delta) > 1e-4) this.io.look(delta / this.lookSens, 0);
        this.next(s, `向いた ${step.deg}°`);
        return;
      }
      case 'end':
        if (s.outcome === 'win') {
          this.next(s, '討ち取った');
          return;
        }
        if (elapsed > (step.timeout ?? 10)) this.fail(s, '討ち取れていない');
        return;
    }
  }
}
