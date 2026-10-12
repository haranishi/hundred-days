// 保存：壊れたJSON・使えない保存先・知らない面IDでも落ちない。記録の積み方。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_NAME, emptyProgress, parseProgress, loadProgress, saveProgress, sanitizeProgress,
  recordRun, withMuted, levelRecord, startIndex,
} from '../lib/progress.js';
import { LEVELS } from '../lib/levels-data.js';

const IDS = LEVELS.map((L) => L.id);

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

describe('読み込み', () => {
  it('保存名は teikokuGohan.v1', () => {
    assert.equal(STORAGE_NAME, 'teikokuGohan.v1');
  });

  it('壊れたJSON・JSONでない値・形のちがう値は「記録なし」', () => {
    for (const text of ['{', 'not json', '', '[]', '42', 'null', '"x"', '{"levels":[1,2]}', '{"levels":{"L1":"★"}}']) {
      assert.deepStrictEqual(parseProgress(text, IDS), emptyProgress(), text);
    }
    assert.deepStrictEqual(parseProgress(null, IDS), emptyProgress());
  });

  it('保存先が無い・読むと例外を投げる場合も落ちない', () => {
    assert.deepStrictEqual(loadProgress(null, IDS), emptyProgress());
    const throwing = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
    assert.deepStrictEqual(loadProgress(throwing, IDS), emptyProgress());
    assert.equal(saveProgress(throwing, emptyProgress()), false);
    assert.equal(saveProgress(null, emptyProgress()), false);
  });

  it('知らない面IDは捨て、知っている面の値は範囲に収める', () => {
    const raw = {
      muted: true,
      levels: {
        L99: { stars: 3, best: 1, tries: 1, usedSample: false },
        L1: { stars: 9, best: -4, tries: 2.5, usedSample: 'yes' },
        L2: { stars: 2, best: 11, tries: 4, usedSample: true },
      },
    };
    assert.deepStrictEqual(sanitizeProgress(raw, IDS), {
      muted: true,
      levels: {
        L1: { stars: 0, best: null, tries: 0, usedSample: false },
        L2: { stars: 2, best: 11, tries: 4, usedSample: true },
      },
    });
    // 知らない面IDの記録を引いても既定値が返る
    assert.deepStrictEqual(levelRecord(emptyProgress(), 'L99'), { stars: 0, best: null, tries: 0, usedSample: false });
  });
});

describe('記録', () => {
  it('発車ごとに tries+1。クリアなら星は最大値、best は最短、usedSample は一度でも見本でクリアしたら true', () => {
    let p = emptyProgress();
    p = recordRun(p, 'L1', { cleared: false });
    assert.deepStrictEqual(p.levels.L1, { stars: 0, best: null, tries: 1, usedSample: false });
    p = recordRun(p, 'L1', { cleared: true, stars: 2, finish: 8 });
    p = recordRun(p, 'L1', { cleared: true, stars: 1, finish: 7, usedSample: true });
    p = recordRun(p, 'L1', { cleared: true, stars: 3, finish: 7 });
    assert.deepStrictEqual(p.levels.L1, { stars: 3, best: 7, tries: 4, usedSample: true });
  });

  it('元の progress は変えない', () => {
    const p = emptyProgress();
    const q = recordRun(p, 'L2', { cleared: true, stars: 3, finish: 10 });
    assert.deepStrictEqual(p, emptyProgress());
    assert.equal(q.levels.L2.stars, 3);
  });

  it('保存して読み直すと同じ（音の切り替えも残る）', () => {
    const storage = memoryStorage();
    const p = withMuted(recordRun(emptyProgress(), 'L3', { cleared: true, stars: 2, finish: 15 }), true);
    assert.equal(saveProgress(storage, p), true);
    assert.ok(storage.data[STORAGE_NAME]);
    assert.deepStrictEqual(loadProgress(storage, IDS), p);
  });

  it('最初に開くのは、まだクリアしていない最初の面（全部クリア済みなら面1）', () => {
    assert.equal(startIndex(LEVELS, emptyProgress()), 0);
    const p = recordRun(recordRun(emptyProgress(), 'L1', { cleared: true, stars: 1, finish: 9 }), 'L2', { cleared: false });
    assert.equal(startIndex(LEVELS, p), 1);
    let all = emptyProgress();
    for (const id of IDS) all = recordRun(all, id, { cleared: true, stars: 3, finish: 1 });
    assert.equal(startIndex(LEVELS, all), 0);
  });
});
