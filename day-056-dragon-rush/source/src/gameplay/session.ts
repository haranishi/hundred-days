// OWNER: gameplay
// 1回の遊びの段階：始まる前（クリック待ち）→ 遊んでいる → 一時停止 → 結果。時間切れで結果へ移る。
import { SESSION } from '../config/gameplay';

export type Phase = 'ready' | 'playing' | 'paused' | 'result';

export class Session {
  phase: Phase = 'ready';
  /** 遊んでいる時間（秒）。一時停止中と結果の後は進まない */
  elapsed = 0;

  constructor(readonly duration = SESSION.durationSeconds) {}

  get timeLeft(): number {
    return Math.max(0, this.duration - this.elapsed);
  }

  start(): boolean {
    if (this.phase !== 'ready') return false;
    this.phase = 'playing';
    this.elapsed = 0;
    return true;
  }

  pause(): boolean {
    if (this.phase !== 'playing') return false;
    this.phase = 'paused';
    return true;
  }

  resume(): boolean {
    if (this.phase !== 'paused') return false;
    this.phase = 'playing';
    return true;
  }

  /** 時間を進める。この呼び出しで時間切れになったら true。 */
  update(dt: number): boolean {
    if (this.phase !== 'playing') return false;
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    if (this.elapsed < this.duration) return false;
    this.phase = 'result';
    return true;
  }

  /** やり直し：時間を戻し、すぐ遊べる状態にする。 */
  restart(): void {
    this.phase = 'playing';
    this.elapsed = 0;
  }
}
