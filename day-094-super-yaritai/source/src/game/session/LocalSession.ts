/**
 * ひとりで遊ぶ試合（GameSession の Local 版）。自分＝slot 0、CPUのライバル＝slot 1。
 * 物理もCPUもこの端末で回す。部屋の主（Host）は第2波でこれと同じ Simulation を使い、参加者の入力を足す。
 */
import { PLAYER_CHARACTERS, type GameSession } from '../../client/contracts';
import type { InputState } from '../../shared/input';
import { CPU, MATCH } from '../../shared/rules/tuning';
import { streamRng } from '../../shared/rng';
import type { CpuLevel, MatchResult, ModelKey, WorldStatic, WorldView } from '../../shared/view';
import { CpuBrain } from '../sim/ai/cpu';
import { Simulation } from '../sim/Simulation';

export interface LocalOptions {
  level: CpuLevel;
  character: ModelKey;
  seed?: number;
  duration?: number;
  playerName?: string;
}

export class LocalSession implements GameSession {
  readonly mode = 'solo' as const;
  readonly mySlot = 0;
  readonly world: WorldStatic;
  readonly level: CpuLevel;

  private constructor(readonly sim: Simulation, level: CpuLevel) {
    this.world = sim.statics;
    this.level = level;
  }

  static async create(opts: LocalOptions): Promise<LocalSession> {
    const seed = opts.seed ?? (Date.now() >>> 0);
    const pick = streamRng(seed, 'match');
    const others = PLAYER_CHARACTERS.filter((c) => c.key !== opts.character);
    const rival = pick.pick(others.length ? others : PLAYER_CHARACTERS);
    const sim = await Simulation.create({
      seed,
      duration: opts.duration ?? MATCH.duration,
      players: [
        { slot: 0, kind: 'human', name: opts.playerName ?? 'あなた', character: opts.character },
        // 名前はキャラの名前だけ（CPU であることと強さは、画面が kind と強さから出す）
        { slot: 1, kind: 'cpu', name: rival.label, character: rival.key, speedScale: CPU[opts.level].speed },
      ],
    });
    sim.setController(1, new CpuBrain(opts.level, streamRng(seed, 'cpu')));
    return new LocalSession(sim, opts.level);
  }

  update(dt: number, input: InputState): WorldView {
    this.sim.setInput(this.mySlot, input);
    this.sim.advance(dt);
    return this.sim.view(this.mySlot);
  }

  result(): MatchResult | null {
    return this.sim.result();
  }

  dispose(): void {
    this.sim.dispose();
  }
}
