// 進み具合の保存：壊れた JSON・使えない保存先・知らない面IDで落ちない。stars は大きい方・best は小さい方。お手本では保存しない。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_NAME, emptyProgress, parseProgress, loadProgress, saveProgress, levelRecord, recordClear, withMuted, withLetterKeys, firstOpenIndex, allCleared, sanitizeProgress, totalStars,
} from '../lib/progress.js';

const memory = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
};
const broken = () => ({ getItem: () => { throw new Error('使えない'); }, setItem: () => { throw new Error('容量超過'); } });

describe('保存の名前と既定値', () => {
  it('STORAGE_NAME は hakokageKaito.v1 で、「_KEY」で終わらない（gitleaks の誤検知を避ける）', () => {
    assert.equal(STORAGE_NAME, 'hakokageKaito.v1');
    assert.equal(STORAGE_NAME.endsWith('_KEY'), false);
    assert.equal(/_KEY\b/.test(STORAGE_NAME), false);
  });

  it('既定値：音は鳴る・文字のキーは使う・記録なし', () => {
    assert.deepEqual(emptyProgress(), { muted: false, letterKeys: true, levels: {} });
    assert.deepEqual(loadProgress(memory()), emptyProgress());
    assert.deepEqual(loadProgress(null), emptyProgress());
  });
});

describe('壊れたデータでも落ちず、既定値で遊べる', () => {
  it('壊れた JSON・空文字・JSON でない値・配列・数字', () => {
    for (const text of ['{', '', 'null', '[]', '123', '"x"', 'undefined', '{"levels":']) {
      assert.deepEqual(parseProgress(text), emptyProgress(), text);
    }
  });

  it('使えない保存先（読むと例外・書くと例外）', () => {
    assert.deepEqual(loadProgress(broken()), emptyProgress());
    assert.equal(saveProgress(broken(), emptyProgress()), false);
    assert.equal(saveProgress(null, emptyProgress()), false);
  });

  it('知らない面ID・型の違う値・範囲外の星は捨てる', () => {
    const raw = {
      muted: 'yes',
      letterKeys: 0,
      levels: {
        L1: { stars: 3, best: 10 },
        L9: { stars: 3, best: 10 },
        X: { stars: 1, best: 1 },
        L2: { stars: 4, best: 10 },
        L3: { stars: 2, best: 0 },
        L4: { stars: 'a', best: 'b' },
        L5: [1, 2],
        L6: null,
        L7: { stars: 1, best: 2.5 },
        L8: { stars: 2, best: 31 },
      },
    };
    const s = sanitizeProgress(raw);
    assert.deepEqual(s.levels, { L1: { stars: 3, best: 10 }, L8: { stars: 2, best: 31 } });
    assert.equal(s.muted, false);
    assert.equal(s.letterKeys, true);
  });

  it('保存した形をそのまま読み戻せる', () => {
    const store = memory();
    const data = { muted: true, letterKeys: false, levels: { L1: { stars: 3, best: 10 }, L3: { stars: 2, best: 23 } } };
    assert.equal(saveProgress(store, data), true);
    assert.deepEqual(loadProgress(store), data);
    assert.deepEqual(Object.keys(store.data), [STORAGE_NAME]);
  });
});

describe('成功の記録：stars は大きい方、best は小さい方', () => {
  it('初めての成功', () => {
    const next = recordClear(emptyProgress(), 'L1', 2, 14);
    assert.deepEqual(levelRecord(next, 'L1'), { stars: 2, best: 14 });
  });

  it('星は大きい方を残し、手数は小さい方を残す（別々に決まる）', () => {
    let d = recordClear(emptyProgress(), 'L1', 2, 14);
    d = recordClear(d, 'L1', 1, 12); // 星は下がらない・手数は縮む
    assert.deepEqual(levelRecord(d, 'L1'), { stars: 2, best: 12 });
    d = recordClear(d, 'L1', 3, 15); // 星は上がる・手数は伸びない
    assert.deepEqual(levelRecord(d, 'L1'), { stars: 3, best: 12 });
  });

  it('元のデータを書き換えない', () => {
    const base = emptyProgress();
    const next = recordClear(base, 'L2', 3, 16);
    assert.deepEqual(base, emptyProgress());
    assert.notEqual(next, base);
  });

  it('お手本では保存しない（demo のとき、データはそのまま）', () => {
    const base = emptyProgress();
    assert.equal(recordClear(base, 'L1', 3, 10, { demo: true }), base);
  });

  it('知らない面ID・不正な星・不正な手数は記録しない', () => {
    const base = emptyProgress();
    assert.equal(recordClear(base, 'L99', 3, 10), base);
    assert.equal(recordClear(base, 'L1', 0, 10), base);
    assert.equal(recordClear(base, 'L1', 4, 10), base);
    assert.equal(recordClear(base, 'L1', 3, 0), base);
    assert.equal(recordClear(base, 'L1', 3, 1.5), base);
  });

  it('音と文字のキーの切替は、記録を変えずに設定だけを変える', () => {
    const d = recordClear(emptyProgress(), 'L1', 3, 10);
    assert.deepEqual(withMuted(d, true), { ...d, muted: true });
    assert.deepEqual(withLetterKeys(d, false), { ...d, letterKeys: false });
  });
});

describe('起動する面と全面クリア', () => {
  it('星の無い面のうち一番若い面（0から数える）。全部に星があれば面1', () => {
    assert.equal(firstOpenIndex(emptyProgress()), 0);
    let d = emptyProgress();
    d = recordClear(d, 'L1', 3, 10);
    d = recordClear(d, 'L2', 1, 30);
    assert.equal(firstOpenIndex(d), 2);
    d = recordClear(d, 'L4', 3, 18); // 面3は飛ばしている
    assert.equal(firstOpenIndex(d), 2);
    for (const [i, id] of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'].entries()) d = recordClear(d, id, 1, 40 + i);
    assert.equal(firstOpenIndex(d), 0);
    assert.equal(allCleared(d), true);
  });

  it('全部に星が付くまでは allCleared が false', () => {
    let d = emptyProgress();
    for (const id of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']) d = recordClear(d, id, 3, 10);
    assert.equal(allCleared(d), false);
    d = recordClear(d, 'L8', 3, 10);
    assert.equal(allCleared(d), true);
  });

  it('星の合計：記録が無ければ0、全面★3なら24。面ごとの星（大きい方）を足す', () => {
    assert.equal(totalStars(emptyProgress()), 0);
    let d = emptyProgress();
    d = recordClear(d, 'L1', 3, 10);
    d = recordClear(d, 'L2', 2, 20);
    d = recordClear(d, 'L2', 1, 30); // 小さい星では下がらない
    assert.equal(totalStars(d), 5);
    for (const id of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8']) d = recordClear(d, id, 3, 10);
    assert.equal(totalStars(d), 24);
  });
});
