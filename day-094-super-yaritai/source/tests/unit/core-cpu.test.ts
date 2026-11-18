/**
 * CPU のライバルの3段階（docs/03 の表）。店員・客がいる本番と同じ店で、2分の点が目安に近いことを確かめる。
 * 目安：やさしい約2,500・ふつう約5,000・本気約8,000（試験は±40%。数値の調整は tuning.ts の CPU で）。
 */
import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/game/sim/Simulation';
import { CpuBrain } from '../../src/game/sim/ai/cpu';
import { CPU, MATCH } from '../../src/shared/rules/tuning';
import { streamRng } from '../../src/shared/rng';
import type { CpuLevel } from '../../src/shared/view';

const TARGET: Record<CpuLevel, number> = { easy: 2500, normal: 5000, hard: 8000 };

async function play(level: CpuLevel, seed: number): Promise<{ score: number; kinds: number; caught: number }> {
  const sim = await Simulation.create({
    seed,
    players: [
      { slot: 0, kind: 'human', name: 'あなた', character: 'ch/character-female-b' },
      { slot: 1, kind: 'cpu', name: 'CPU', character: 'ch/character-male-f', speedScale: CPU[level].speed },
    ],
  });
  sim.setController(1, new CpuBrain(level, streamRng(seed, 'cpu')));
  // 自分は入口の角でじっとしている
  sim.teleport(0, -16.5, 12.5);
  sim.runFor(MATCH.countdown + MATCH.duration + 0.2);
  expect(sim.phase).toBe('ended');
  const b = sim.avatars[1]!.book;
  const out = { score: b.score, kinds: b.achieved.length, caught: b.caught };
  expect(sim.result()!.players.find((p) => p.slot === 1)!.score).toBe(b.score);
  sim.dispose();
  return out;
}

describe('CPUのライバル（3段階）', () => {
  for (const level of ['easy', 'normal', 'hard'] as const) {
    it(`${level}：2分で目安の±40%に入る`, async () => {
      const runs = [await play(level, 11), await play(level, 22)];
      const avg = runs.reduce((n, r) => n + r.score, 0) / runs.length;
      console.info(level, JSON.stringify(runs), 'avg', avg);
      expect(avg).toBeGreaterThan(TARGET[level] * 0.6);
      expect(avg).toBeLessThan(TARGET[level] * 1.4);
      // ふつうは全部の悪事を回る（docs/06：2分で4種類以上を達成）
      if (level === 'normal') for (const r of runs) expect(r.kinds).toBeGreaterThanOrEqual(4);
    }, 300_000);
  }
});
