// OWNER: core
// タッチ操作の純粋な計算（DOM を持たない）。単体試験（tests/touchMath.test.ts）で直接確かめる。
//   stickFromDrag：指の動き（原点からの差）→ 移動の量（-1〜1）と走り。不感帯 → 距離に比例 → 外側の輪で走る（ヒステリシス）
//   AimButton：小石ボタンの状態機械（idle／hold／latched）。時刻は引数で受ける
//   LookDrag：視点ドラッグ。小さい動き（タップ）は無視する
// 2026-11-03 スマホ対応で新設。数値は src/config/touch.ts だけに置く。
import { TOUCH } from '../config/touch';

export interface StickOut {
  /** 右が正（-1〜1）。 */
  x: number;
  /** 前（画面の上）が正（-1〜1）。 */
  y: number;
  /** 0〜1。不感帯の内側は 0、半径 R で 1。 */
  mag: number;
  run: boolean;
  /** つまみの位置（原点からの CSS px。knobMax×R で切る）。 */
  knobX: number;
  knobY: number;
}

/** 画面の高さに合わせた半径 R（CSS px）。基準の高さより低い画面では比例して縮める。 */
export function stickRadius(viewHeight: number, s = TOUCH.stick): number {
  const r = viewHeight < s.refHeight ? (s.radius * viewHeight) / s.refHeight : s.radius;
  return Math.max(s.minRadius, r);
}

/**
 * 指の動き（原点からの差。CSS px、dy は下が正）から、移動の量を出す。
 * wasRunning は前のコマで走っていたか（走りの入りと出の距離を変えて、輪の縁でちらつかせない）。
 */
export function stickFromDrag(dx: number, dy: number, R: number, wasRunning: boolean, s = TOUCH.stick): StickOut {
  const d = Math.hypot(dx, dy);
  const kmax = s.knobMax * R;
  const k = d > kmax ? kmax / d : 1;
  const knobX = dx * k;
  const knobY = dy * k;
  const dead = s.deadZone * R;
  if (d <= dead || d < 1e-9) return { x: 0, y: 0, mag: 0, run: false, knobX, knobY };
  const mag = Math.min(1, (d - dead) / Math.max(1e-9, R - dead));
  const run = wasRunning ? d >= s.runExit * R : d >= s.runEnter * R;
  return { x: (dx / d) * mag, y: (-dy / d) * mag, mag, run, knobX, knobY };
}

/** 原点（触れた所）を、画面の縁から（R＋余白）以上離す。 */
export function clampOrigin(x: number, y: number, R: number, width: number, height: number, s = TOUCH.stick): { x: number; y: number } {
  const m = R + s.edgeMargin;
  const cx = width > 2 * m ? Math.min(width - m, Math.max(m, x)) : width / 2;
  const cy = height > 2 * m ? Math.min(height - m, Math.max(m, y)) : height / 2;
  return { x: cx, y: cy };
}

export type AimState = 'idle' | 'hold' | 'latched';
/**
 * 状態機械が求める入力の変化。
 *   down：Q を押す（ねらい始め）／ up：Q を離す（投げる）／ cancel：先に「やめる」を立ててから Q を離す（投げない）／ none：何もしない
 */
export type AimEffect = 'down' | 'up' | 'cancel' | 'none';

/** 小石ボタンの状態機械（design.md の図の6遷移）。 */
export class AimButton {
  state: AimState = 'idle';
  private t0 = 0;
  private x0 = 0;
  private y0 = 0;
  private moved = 0;

  constructor(private readonly s = TOUCH.stone) {}

  /** 小石ボタンを押した。idle なら（小石が残っていれば）ねらい始め、latched なら投げる。 */
  press(t: number, x: number, y: number, stones: number): AimEffect {
    if (this.state === 'latched') {
      this.state = 'idle';
      return 'up';
    }
    if (this.state === 'hold') return 'none';
    if (stones <= 0) return 'none';
    this.state = 'hold';
    this.t0 = t;
    this.x0 = x;
    this.y0 = y;
    this.moved = 0;
    return 'down';
  }

  /** 押している指が動いた（動いた最大の距離を覚える）。 */
  move(x: number, y: number): void {
    if (this.state !== 'hold') return;
    this.moved = Math.max(this.moved, Math.hypot(x - this.x0, y - this.y0));
  }

  /** 小石ボタンから指を離した。長押しか、動かしていれば投げる。ちょん押しなら、ねらいを保つ。 */
  release(t: number, x?: number, y?: number): AimEffect {
    if (this.state !== 'hold') return 'none';
    if (x !== undefined && y !== undefined) this.move(x, y);
    if (t - this.t0 >= this.s.holdMs || this.moved >= this.s.moveSlop) {
      this.state = 'idle';
      return 'up';
    }
    this.state = 'latched';
    return 'none';
  }

  /** やめる・pointercancel・ページが隠れた・blur・小石が0・遊ぶ画面を出た：投げずに idle へ。 */
  cancel(): AimEffect {
    if (this.state === 'idle') return 'none';
    this.state = 'idle';
    return 'cancel';
  }
}

/** 視点ドラッグ：触れた所から tapSlop 以上動くまでは何も出さない。動き出したら、前の位置からの差を出す。 */
export class LookDrag {
  private sx = 0;
  private sy = 0;
  private lx = 0;
  private ly = 0;
  private live = false;

  constructor(private readonly slop: number = TOUCH.look.tapSlop) {}

  start(x: number, y: number): void {
    this.sx = this.lx = x;
    this.sy = this.ly = y;
    this.live = false;
  }

  move(x: number, y: number): { dx: number; dy: number } {
    if (!this.live) {
      if (Math.hypot(x - this.sx, y - this.sy) < this.slop) return { dx: 0, dy: 0 };
      this.live = true;
    }
    const d = { dx: x - this.lx, dy: y - this.ly };
    this.lx = x;
    this.ly = y;
    return d;
  }
}
