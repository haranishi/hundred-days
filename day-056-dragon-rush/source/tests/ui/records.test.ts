// OWNER: tests
// 自己ベスト（r02-controls）：怪獣ごとに最高と前回を覚え、結果の画面で前回との差と更新を出す。壊れた保存でも遊べる。
import { describe, expect, it } from 'vitest';
import { loadRecords, parseRecords, recordRun, submitRun, type KeyValueStore } from '../../src/ui/records';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('自己ベストの記録', () => {
  it('初回は比べる相手が無く、2回目から前回との差と更新が出る', () => {
    const store = memoryStore();
    const first = recordRun('kurenairyu', { yen: 100e8, destruction: 0.05, maxCombo: 10 }, store);
    expect(first.bestBefore).toBeNull();
    expect(first.diffLast).toBeNull();
    expect(first.newBest).toEqual({ yen: false, destruction: false, maxCombo: false });
    const second = recordRun('kurenairyu', { yen: 150e8, destruction: 0.04, maxCombo: 12 }, store);
    expect(second.bestBefore).toEqual({ yen: 100e8, destruction: 0.05, maxCombo: 10 });
    expect(second.diffLast!.yen).toBe(50e8);
    expect(second.diffLast!.destruction).toBeCloseTo(-0.01);
    expect(second.newBest).toEqual({ yen: true, destruction: false, maxCombo: true });
    const rec = loadRecords(store).monsters.kurenairyu;
    expect(rec.best).toEqual({ yen: 150e8, destruction: 0.05, maxCombo: 12 });
    expect(rec.last).toEqual({ yen: 150e8, destruction: 0.04, maxCombo: 12 });
    expect(rec.plays).toBe(2);
  });

  it('怪獣ごとに別の欄に覚える（後の周で3体に広げる）', () => {
    const store = memoryStore();
    recordRun('kurenairyu', { yen: 1, destruction: 0.1, maxCombo: 1 }, store);
    recordRun('raiyoku', { yen: 2, destruction: 0.2, maxCombo: 2 }, store);
    const file = loadRecords(store);
    expect(Object.keys(file.monsters).sort()).toEqual(['kurenairyu', 'raiyoku']);
    expect(file.monsters.raiyoku.best!.yen).toBe(2);
  });

  it('壊れた保存・読めない環境では空の記録から始め、比べだけを返す', () => {
    expect(parseRecords('{oops')).toEqual({ version: 1, monsters: {} });
    expect(parseRecords(JSON.stringify({ version: 1, monsters: { a: { best: { yen: 'x' } } } })).monsters.a.best).toBeNull();
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const r = recordRun('kurenairyu', { yen: 5, destruction: 0.01, maxCombo: 3 }, broken);
    expect(r.plays).toBe(1);
    const { file } = submitRun({ version: 1, monsters: {} }, 'kurenairyu', { yen: 5, destruction: 0.01, maxCombo: 3 });
    expect(file.monsters.kurenairyu.best).toEqual({ yen: 5, destruction: 0.01, maxCombo: 3 });
  });
});
