// OWNER: tests
// 点数：被害額は種類と体積から、破壊率は体積の割合、連鎖は間を置かずに壊すと伸び、倍率は切れた後ゆっくり戻る。怒りは満タンで1回だけ知らせる。
import { describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { BUILDING_RULES, COMBO, RAGE, STAGES } from '../../src/config/gameplay';
import { ScoreKeeper, multiplierFor } from '../../src/gameplay/score';
import { generateCity } from '../../src/world/city';

const city = generateCity(CITY_CONFIG);
const house = city.buildings.find((b) => b.kind === 'house')!;
const tower = city.buildings.find((b) => b.kind === 'glassTower')!;

describe('被害総額と破壊率', () => {
  it('崩落まで進めた建物は、体積×単価がちょうど1棟ぶん加算される（連鎖なし）', () => {
    const s = new ScoreKeeper(city);
    for (const stage of [1, 2, 3, 4]) s.onStage(house.id, stage, false);
    expect(s.yen).toBeCloseTo(house.volume * BUILDING_RULES.house.pricePerM3, 3);
    expect(s.destruction).toBeCloseTo(house.volume / s.totalVolume, 9);
  });

  it('段階ごとの重みの差分だけ足す（ひびだけなら1割）', () => {
    const s = new ScoreKeeper(city);
    s.onStage(tower.id, 1, false);
    expect(s.destroyedVolume).toBeCloseTo(tower.volume * STAGES.destroyedWeight[1], 6);
  });

  it('街全体の値段は兆円の桁になる', () => {
    const s = new ScoreKeeper(city);
    expect(s.totalValue).toBeGreaterThan(5e11);
    expect(s.totalValue).toBeLessThan(5e12);
  });
});

describe('連鎖と倍率', () => {
  it('間を置かずに壊すと連鎖が伸び、倍率が上がる（上限あり）', () => {
    const s = new ScoreKeeper(city);
    for (let i = 0; i < 5; i++) {
      s.onStage(house.id, 1, true);
      s.tick(0.5);
    }
    expect(s.combo).toBe(5);
    expect(s.maxCombo).toBe(5);
    expect(s.multiplier).toBeCloseTo(multiplierFor(5), 9);
    expect(multiplierFor(10_000)).toBeCloseTo(1 + COMBO.multiplierStep * COMBO.multiplierCap, 9);
  });

  it('倍率は被害額に掛かる（竜の直接の攻撃だけ）', () => {
    const a = new ScoreKeeper(city);
    const b = new ScoreKeeper(city);
    for (let i = 0; i < 9; i++) {
      a.onStage(house.id, 1, true);
      b.onStage(house.id, 1, true);
    }
    const before = [a.yen, b.yen];
    a.onStage(tower.id, 2, true);
    b.onStage(tower.id, 2, false);
    expect((a.yen - before[0]) / (b.yen - before[1])).toBeCloseTo(multiplierFor(10), 6);
  });

  it('window 秒たつと連鎖は 0 に戻り、倍率は即座にではなく、ゆっくり 1 へ減っていく', () => {
    const s = new ScoreKeeper(city);
    for (let i = 0; i < 20; i++) s.onStage(house.id, 1, true);
    const peak = s.multiplier;
    let broke = false;
    for (let t = 0; t < COMBO.windowSeconds + 0.05; t += 0.05) broke = s.tick(0.05) || broke;
    expect(broke).toBe(true);
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(20);
    // 切れた直後はまだ高い
    expect(s.multiplier).toBeGreaterThan(1.5);
    let last = s.multiplier;
    for (let i = 0; i < 40; i++) {
      s.tick(0.05);
      expect(s.multiplier).toBeLessThanOrEqual(last + 1e-12);
      last = s.multiplier;
    }
    expect(s.multiplier).toBe(1);
    expect(peak).toBeGreaterThan(2.5);
  });
});

describe('怒り', () => {
  it('壊すとたまり、満タンになった1回だけ知らせる。使うと 0 に戻る', () => {
    const s = new ScoreKeeper(city);
    let fullCount = 0;
    for (let i = 0; i < 200 && !s.rageFull; i++) {
      const r = s.onStage(tower.id, 4, true);
      if (r.rageFull) fullCount++;
    }
    expect(s.rage).toBe(RAGE.max);
    const again = s.onStage(tower.id, 4, true);
    expect(again.rageFull).toBe(false);
    expect(fullCount).toBe(1);
    expect(s.spendRage()).toBe(true);
    expect(s.rage).toBe(0);
    expect(s.spendRage()).toBe(false);
  });

  it('燃え広がりで壊れた分は、たまり方が小さい', () => {
    const a = new ScoreKeeper(city);
    const b = new ScoreKeeper(city);
    a.onStage(tower.id, 4, true);
    b.onStage(tower.id, 4, false);
    expect(b.rage).toBeCloseTo(a.rage * RAGE.fireFactor, 9);
  });
});
