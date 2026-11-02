// OWNER: core
// 画面の流れ：タイトル → ステージ選択 → 説明 → 遊ぶ → 討ち取り演出 → 結果。捕まったら「討たれた」。Esc で一時停止。
// R は読み込み直さずに sim を作り直す（格子と問い合わせはステージごとに一度だけ作ってあるので速い）。
// タイトル・選択・説明の背景では、プレイヤーのいない sim（気づかない番兵）を回して、寺が動いて見えるようにする。
import { CAPTURE, rankOf, type Rank } from '../config/rules';
import { Sim } from '../sim/sim';
import type { SimEvent, SimInput } from '../sim/types';
import type { StageDef } from '../stage/types';
import type { Screen } from './state';

export interface GameOptions {
  stage: StageDef;
  seed: number;
  god: boolean;
}

export interface ResultInfo {
  time: number;
  discoveries: number;
  takedowns: number;
  stonesUsed: number;
  rank: Rank;
}

type EventListener = (e: SimEvent) => void;
type ScreenListener = (to: Screen, from: Screen) => void;

export class Game {
  screen: Screen = 'title';
  sim: Sim;
  readonly stage: StageDef;
  seed: number;
  god: boolean;
  /** 遊びを始めた回数（R で増える）。 */
  attempt = 0;
  private attract: Sim;
  private readonly eventListeners = new Set<EventListener>();
  private readonly screenListeners = new Set<ScreenListener>();

  constructor(opts: GameOptions) {
    this.stage = opts.stage;
    this.seed = opts.seed;
    this.god = opts.god;
    this.attract = this.makeAttract();
    this.sim = this.attract;
  }

  private makeAttract(): Sim {
    return new Sim(this.stage, { seed: this.seed, oblivious: true, hidePlayer: true });
  }

  /** sim の出来事を購読する（画面・音）。戻り値で解除。 */
  onEvent(fn: EventListener): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  onScreen(fn: ScreenListener): () => void {
    this.screenListeners.add(fn);
    return () => this.screenListeners.delete(fn);
  }

  setScreen(to: Screen): void {
    const from = this.screen;
    if (from === to) return;
    this.screen = to;
    for (const fn of this.screenListeners) fn(to, from);
  }

  toTitle(): void {
    this.sim = this.attract;
    this.setScreen('title');
  }

  toSelect(): void {
    this.sim = this.attract;
    this.setScreen('select');
  }

  toBriefing(): void {
    this.sim = this.attract;
    this.setScreen('briefing');
  }

  /** 遊びを始める（やり直しも同じ）。新しい sim を作る。 */
  startPlay(): void {
    this.attempt++;
    this.sim = new Sim(this.stage, { seed: this.seed, god: this.god });
    const from = this.screen;
    this.screen = 'play';
    for (const fn of this.screenListeners) fn('play', from);
  }

  restart(): void {
    this.startPlay();
  }

  pause(): void {
    if (this.screen === 'play') this.setScreen('pause');
  }

  resume(): void {
    if (this.screen === 'pause') this.setScreen('play');
  }

  /** いまの画面で sim を進めるか（一時停止・結果・討たれた後は止める）。 */
  get running(): boolean {
    return this.screen === 'play' || this.screen === 'finale' || this.screen === 'title' || this.screen === 'select' || this.screen === 'briefing';
  }

  /** 固定刻みを 1 つ進め、出来事を配り、結末に応じて画面を移す。 */
  tick(input: SimInput): void {
    if (!this.running) return;
    this.sim.step(input);
    const evs = this.sim.drainEvents();
    if (this.sim !== this.attract) for (const e of evs) for (const fn of this.eventListeners) fn(e);
    const s = this.sim;
    if (this.screen === 'play' && s.outcome === 'win') this.setScreen('finale');
    else if (this.screen === 'finale' && (s.finale ?? 0) >= 1) this.setScreen('result');
    else if (this.screen === 'play' && s.outcome === 'caught' && s.t - s.outcomeT >= CAPTURE.toScreen) this.setScreen('gameover');
  }

  result(): ResultInfo {
    const st = this.sim.stats;
    return { time: st.endTime, discoveries: st.discoveries, takedowns: st.takedowns, stonesUsed: st.stonesUsed, rank: rankOf(st.discoveries, st.takedowns) };
  }
}
