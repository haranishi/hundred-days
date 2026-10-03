// OWNER: core
// 固定刻みのループ。シミュレーションは常に同じ刻み（step 秒）で進め、
// 描画は実時間に合わせる。撮影と計測では実時間を止め、1コマずつ手で進める。
// r02-controls（バグ B2）：1コマで進める刻みは maxSubSteps までに抑え、進めきれなかった分は捨てずに次のコマへ持ち越す
// （旧は上限に達したら残りを捨て、重いコマが続くとゲームが実時間より遅れた）。持ち越しは maxBacklog 秒までにして、
// タブを離れた後などに何秒も早送りしないようにする。

export interface LoopHooks {
  /** 固定刻みで呼ばれる。dt は常に step と同じ。 */
  update(dt: number, simTime: number): void;
  /** 描画。alpha は次の刻みまでの割合（補間用、手動進行では 1）。 */
  render(alpha: number, frameDt: number): void;
}

export interface LoopOptions {
  step: number;
  /** 1コマで進める刻みの上限 */
  maxSubSteps: number;
  /** 持ち越せる遅れの上限（シミュレーションの秒。既定は maxSubSteps 刻みの2コマ分） */
  maxBacklog?: number;
  /** 実時間に対するシミュレーションの速さ（自動プレイの早回し。既定 1） */
  timeScale?: number;
}

export type LoopMode = 'realtime' | 'manual';

export class FixedStepLoop {
  readonly step: number;
  private readonly maxSubSteps: number;
  private readonly maxBacklog: number;
  private readonly timeScale: number;
  private accumulator = 0;
  private lastTime = -1;
  private rafId = 0;
  private running = false;
  private simTimeValue = 0;
  private frameCountValue = 0;

  constructor(
    private readonly hooks: LoopHooks,
    options: LoopOptions,
  ) {
    this.step = options.step;
    this.maxSubSteps = options.maxSubSteps;
    this.maxBacklog = options.maxBacklog ?? options.step * options.maxSubSteps * 2;
    this.timeScale = options.timeScale ?? 1;
  }

  get simTime(): number {
    return this.simTimeValue;
  }

  get frameCount(): number {
    return this.frameCountValue;
  }

  /** シミュレーション時刻を決め打ちする（撮影の固定用）。 */
  setSimTime(t: number): void {
    this.simTimeValue = t;
    this.accumulator = 0;
  }

  /** 実時間で回す。 */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = -1;
    const tick = (now: number): void => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);
      this.advanceRealtime(now / 1000);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** 実時間の経過 seconds を固定刻みに割って進める。テストからも呼べる。 */
  advanceRealtime(nowSeconds: number): void {
    if (this.lastTime < 0) this.lastTime = nowSeconds;
    const frameDt = Math.min(0.25, Math.max(0, nowSeconds - this.lastTime));
    this.lastTime = nowSeconds;
    this.accumulator += frameDt * this.timeScale;
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSubSteps) {
      this.simTimeValue += this.step;
      this.hooks.update(this.step, this.simTimeValue);
      this.accumulator -= this.step;
      steps++;
    }
    // 進めきれなかった分は次のコマへ持ち越す（上限を超えた分だけ捨てる）
    if (this.accumulator > this.maxBacklog) this.accumulator = this.maxBacklog;
    this.frameCountValue++;
    this.hooks.render(this.accumulator / this.step, frameDt);
  }

  /** 手動で1コマ進める（実時間は見ない）。 */
  stepManual(steps = 1): void {
    for (let i = 0; i < steps; i++) {
      this.simTimeValue += this.step;
      this.hooks.update(this.step, this.simTimeValue);
    }
    this.frameCountValue++;
    this.hooks.render(1, this.step * steps);
  }

  /** 時刻を進めずに描画だけ繰り返す（影や AO を落ち着かせる用）。 */
  renderStill(): void {
    this.frameCountValue++;
    this.hooks.render(1, 0);
  }
}
