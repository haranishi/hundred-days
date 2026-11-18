import { describe, expect, it } from 'vitest';
import { ScoreBook, buildMatchResult, rankPlayers, titleFor } from '../../src/shared/rules/scoring';
import { MISDEED_IDS } from '../../src/shared/rules/misdeeds';
import { HEAT, SCORE } from '../../src/shared/rules/tuning';
import { createRng, streamRng } from '../../src/shared/rng';

describe('コンボ', () => {
  it('別の種類を4秒以内に続けると段が上がり、倍率が 1.0→1.2→1.5→2.0→3.0 になる', () => {
    const b = new ScoreBook();
    const kinds = ['bell', 'sweep', 'cart', 'pyramid', 'knock', 'bell'] as const;
    const mults = kinds.map((k, i) => b.award(k, 100, i * 1.0, false).multiplier);
    expect(mults).toEqual([1.0, 1.2, 1.5, 2.0, 3.0, 3.0]);
    expect(b.score).toBe(100 + 120 + 150 + 200 + 300 + 300);
  });

  it('同じ種類を続けると猶予だけが延び、段は上がらない', () => {
    const b = new ScoreBook();
    b.award('bell', 20, 0, false);
    b.award('sweep', 10, 1, false);
    const r1 = b.award('sweep', 10, 3, false);
    const r2 = b.award('sweep', 10, 6.5, false);
    expect(r1.level).toBe(1);
    expect(r2.level).toBe(1);
    expect(b.comboView(6.5).remaining).toBeCloseTo(SCORE.comboWindow);
  });

  it('猶予が切れると段は0に戻る', () => {
    const b = new ScoreBook();
    b.award('bell', 20, 0, false);
    b.award('sweep', 10, 1, false);
    // 猶予は最後の点から SCORE.comboWindow 秒（round2 で4→5秒）
    const end = 1 + SCORE.comboWindow;
    expect(b.comboView(end - 0.1).level).toBe(1);
    expect(b.comboView(end + 0.1).level).toBe(0);
    expect(b.award('cart', 10, end + 0.2, false).multiplier).toBe(1.0);
  });

  it('捕まると段と目立ち度が0に戻る', () => {
    const b = new ScoreBook();
    b.award('bell', 200, 0, false);
    b.award('sweep', 200, 1, false);
    expect(b.heat).toBeGreaterThan(0);
    b.onCaught();
    expect(b.comboView(1.5).level).toBe(0);
    expect(b.heat).toBe(0);
    expect(b.caught).toBe(1);
  });

  it('ラストスパートは1.5倍、コンボとかけ合わさる', () => {
    const b = new ScoreBook();
    expect(b.award('bell', 20, 0, true).points).toBe(30);
    expect(b.award('sweep', 10, 1, true).points).toBe(18); // 10×1.2×1.5
  });
});

describe('達成とボーナス', () => {
  it('初めての達成は +300（倍率なし）、2回目は何もしない', () => {
    const b = new ScoreBook();
    b.award('bell', 20, 0, false);
    const first = b.achieve('bell');
    expect(first?.bonus).toBe(300);
    expect(b.achieve('bell')).toBeNull();
    expect(b.score).toBe(320);
    expect(b.breakdown.bell).toEqual({ count: 1, points: 320 });
  });

  it('10個すべてで完全制覇 +3000、ひみつは +800', () => {
    const b = new ScoreBook();
    let last = null;
    for (const id of MISDEED_IDS) last = b.achieve(id);
    expect(last?.complete).toBe(true);
    expect(b.complete).toBe(true);
    expect(b.score).toBe(300 * 10 + 3000);
    expect(b.secret('secret-cart-strike')).toBe(800);
    expect(b.secret('secret-cart-strike')).toBeNull();
    expect(b.score).toBe(300 * 10 + 3000 + 800);
    // 完全制覇とひみつは内訳の行ではなく extras に入る（内訳＋extras＝点）
    expect(b.extras.map((e) => e.points)).toEqual([3000, 800]);
    const rows = Object.values(b.breakdown).reduce((n, r) => n + (r?.points ?? 0), 0);
    expect(rows + b.extras.reduce((n, e) => n + e.points, 0)).toBe(b.score);
  });
});

describe('目立ち度', () => {
  it('点÷10（1回最大25）上がり、2秒なにもしないと毎秒5下がる', () => {
    const b = new ScoreBook();
    b.award('bell', 20, 0, false);
    expect(b.heat).toBeCloseTo(2);
    b.award('pyramid', 500, 0.5, false); // 600点 → 25で頭打ち
    expect(b.heat).toBeCloseTo(27);
    b.tick(1, 1.5); // まだ2秒たっていない
    expect(b.heat).toBeCloseTo(27);
    b.tick(1, 3.0);
    expect(b.heat).toBeCloseTo(27 - HEAT.decayPerSecond);
  });
});

describe('称号と順位', () => {
  it('称号の境目', () => {
    expect(titleFor(0)).toBe('ちょっと迷惑なお客さん');
    expect(titleFor(1499)).toBe('ちょっと迷惑なお客さん');
    expect(titleFor(1500)).toBe('要注意人物');
    expect(titleFor(4000)).toBe('店長に顔を覚えられた');
    expect(titleFor(7000)).toBe('出入り禁止');
    expect(titleFor(10000)).toBe('伝説の迷惑客');
  });

  it('同点なら達成した数が多い人が勝ち。両方同じなら同じ順位で勝者が2人', () => {
    const a = rankPlayers([
      { slot: 0, score: 1000, achievedCount: 2 },
      { slot: 1, score: 1000, achievedCount: 3 },
      { slot: 2, score: 500, achievedCount: 9 },
    ]);
    expect(a.winners).toEqual([1]);
    expect(a.ranks.get(1)).toBe(1);
    expect(a.ranks.get(0)).toBe(2);
    expect(a.ranks.get(2)).toBe(3);
    const b = rankPlayers([
      { slot: 0, score: 800, achievedCount: 1 },
      { slot: 1, score: 800, achievedCount: 1 },
      { slot: 2, score: 100, achievedCount: 0 },
    ]);
    expect(b.winners.sort()).toEqual([0, 1]);
    expect(b.ranks.get(2)).toBe(3);
  });

  it('結果の組み立て', () => {
    const p0 = new ScoreBook();
    p0.award('bell', 20, 0, false);
    p0.achieve('bell');
    const p1 = new ScoreBook();
    p1.award('sweep', 10, 0, false);
    const r = buildMatchResult({
      duration: 120,
      damage: 0.25,
      players: [
        { slot: 0, kind: 'human', name: 'あなた', character: 'ch/character-female-b', book: p0 },
        { slot: 1, kind: 'cpu', name: 'CPU', character: 'ch/character-male-f', book: p1 },
      ],
    });
    expect(r.winnerSlots).toEqual([0]);
    expect(r.players[0]!.slot).toBe(0);
    expect(r.players[0]!.title).toBe('ちょっと迷惑なお客さん');
    expect(r.players[0]!.achieved).toEqual(['bell']);
    expect(r.players[1]!.rank).toBe(2);
    expect(r.aborted).toBe(false);
  });
});

describe('乱数', () => {
  it('同じ種なら同じ並び、系列が違えば別の並び', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
    expect(streamRng(42, 'props').next()).not.toBe(streamRng(42, 'cpu').next());
    const r = createRng(7);
    for (let i = 0; i < 100; i++) {
      const n = r.int(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});
