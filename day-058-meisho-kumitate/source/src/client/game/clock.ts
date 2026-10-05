// ひとり・ふたりのゲームの時計。端末の時計（performance.now）を元に、
// - 速さを変えられる（?speed=8 なら8倍で進む。自動テスト用）
// - 止められる（タブが隠れたとき・「やめる」の確認中）。止まっている間は時刻が進まない
// 時刻は戻らない（止めて再開しても、止めた時点の続きから進む）。

export class PausableClock {
  private readonly source: () => number
  readonly speed: number
  /** 最後に動き出した実時刻 */
  private base: number
  /** 最後に動き出す前までに進んだゲームの時刻 */
  private acc = 0
  /** 止めている理由（どれか1つでもあれば止まる） */
  private readonly reasons = new Set<string>()

  constructor(speed = 1, source: () => number = () => performance.now()) {
    this.speed = Number.isFinite(speed) && speed > 0 ? speed : 1
    this.source = source
    this.base = source()
  }

  now(): number {
    return this.reasons.size > 0 ? this.acc : this.acc + (this.source() - this.base) * this.speed
  }

  get paused(): boolean {
    return this.reasons.size > 0
  }

  pause(reason: string): void {
    if (this.reasons.has(reason)) return
    if (this.reasons.size === 0) this.acc = this.now()
    this.reasons.add(reason)
  }

  resume(reason: string): void {
    if (!this.reasons.delete(reason)) return
    if (this.reasons.size === 0) this.base = this.source()
  }

  /** 止めている間だけ、ゲームの時刻を ms だけ進める（自動テストのスクリーンショット用）。動いているときは何もしない */
  advanceWhilePaused(ms: number): void {
    if (this.reasons.size === 0 || !Number.isFinite(ms) || ms <= 0) return
    this.acc += ms
  }

  /** ゲームの時間（ミリ秒）を実時間に直す */
  toRealMs(gameMs: number): number {
    return gameMs / this.speed
  }
}
