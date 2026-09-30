import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRank, hintAllowance, rankOrder, RANKS } from '../lib/rank.js';
import { LEVELS } from '../lib/levels.js';

const key = (levelId, seconds, hintsLetters, gaveUp = false) => computeRank({ levelId, seconds, hintsLetters, gaveUp }).key;

test('rank：助太刀の許容は埋める字に対する割合（大関 b×0.1・関脇 b×0.25・小結 b×0.5 の切り捨て）', () => {
  assert.deepEqual(LEVELS.map((lv) => lv.blanks), [1, 7, 15]);
  assert.deepEqual(hintAllowance(1), { ozeki: 0, sekiwake: 0, komusubi: 0 });
  assert.deepEqual(hintAllowance(2), { ozeki: 0, sekiwake: 1, komusubi: 3 });
  assert.deepEqual(hintAllowance(3), { ozeki: 1, sekiwake: 3, komusubi: 7 });
});

test('rank：手習い（埋める字1・parSec 30）は1字でも教われば前頭', () => {
  assert.equal(key(1, 30, 0), 'yokozuna'); // 比 1.0 ちょうど
  assert.equal(key(1, 31, 0), 'ozeki');
  assert.equal(key(1, 45, 0), 'ozeki'); // 比 1.5 ちょうど
  assert.equal(key(1, 46, 0), 'sekiwake');
  assert.equal(key(1, 75, 0), 'sekiwake'); // 比 2.5 ちょうど
  assert.equal(key(1, 76, 0), 'komusubi');
  assert.equal(key(1, 99999, 0), 'komusubi');
  assert.equal(key(1, 5, 1), 'maegashira'); // 助太刀1字
  assert.equal(key(1, 5, 0, true), 'munen');
});

test('rank：一人前（埋める字7・parSec 150）', () => {
  assert.equal(key(2, 150, 0), 'yokozuna');
  assert.equal(key(2, 151, 0), 'ozeki');
  assert.equal(key(2, 10, 1), 'sekiwake'); // 大関の許容は0字
  assert.equal(key(2, 375, 1), 'sekiwake'); // 比 2.5 ちょうど
  assert.equal(key(2, 376, 1), 'komusubi');
  assert.equal(key(2, 10, 3), 'komusubi');
  assert.equal(key(2, 10, 4), 'maegashira');
});

test('rank：免許皆伝（埋める字15・parSec 360）で助太刀1字・比1.2なら大関', () => {
  assert.equal(key(3, 360 * 1.2, 1), 'ozeki');
  assert.equal(key(3, 360, 0), 'yokozuna');
  assert.equal(key(3, 540, 1), 'ozeki'); // 比 1.5 ちょうど
  assert.equal(key(3, 541, 1), 'sekiwake');
  assert.equal(key(3, 10, 2), 'sekiwake');
  assert.equal(key(3, 900, 3), 'sekiwake'); // 比 2.5 ちょうど
  assert.equal(key(3, 901, 3), 'komusubi');
  assert.equal(key(3, 10, 7), 'komusubi');
  assert.equal(key(3, 10, 8), 'maegashira');
});

test('rank：腕前ごとの parSec（v2 の仮の値）で比をとる', () => {
  assert.deepEqual(LEVELS.map((lv) => lv.parSec), [30, 150, 360]);
  for (const lv of LEVELS) {
    assert.equal(key(lv.id, lv.parSec, 0), 'yokozuna');
    assert.equal(key(lv.id, lv.parSec + 1, 0), 'ozeki');
  }
});

test('rank：label と line は docs/COPY.md の文', () => {
  assert.deepEqual(computeRank({ levelId: 1, seconds: 10, hintsLetters: 0 }), {
    key: 'yokozuna', label: '横綱', line: '天下無双！ 江戸じゅうの評判でござる。',
  });
  assert.deepEqual(computeRank({ levelId: 1, seconds: 60, hintsLetters: 0, gaveUp: true }), {
    key: 'munen', label: '無念', line: '無念…。されど、答えを知るのも修行のうち。',
  });
  assert.deepEqual(RANKS.map((r) => r.label), ['横綱', '大関', '関脇', '小結', '前頭']);
  assert.ok(rankOrder('yokozuna') < rankOrder('maegashira'));
  assert.equal(rankOrder('munen'), Infinity);
});
