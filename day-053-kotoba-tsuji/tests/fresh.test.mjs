// v2-r3：最近出た言葉を避ける seed 選び（lib/fresh.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickFreshSeed, answersOf } from '../lib/fresh.js';
import { generatePuzzle } from '../lib/generator.js';
import { hashSeed } from '../lib/rng.js';
import { createStore, RECENT_MAX } from '../lib/storage.js';
import { WORDS } from './fixtures/words-fixture.js';
import { WORDS as REAL } from '../data/words.js';

const overlap = (level, seed, words, recent) => answersOf(generatePuzzle({ level, seed, words })).filter((a) => recent.includes(a)).length;
const candidates = (tag, n = 8) => Array.from({ length: n }, (_, k) => hashSeed(`${tag}-${k}`).toString(36));

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('pickFreshSeed：同じ引数なら同じ結果。候補が無ければ null、recent が空なら先頭の候補', () => {
  const seeds = candidates('a');
  const recent = answersOf(generatePuzzle({ level: 2, seed: seeds[0], words: WORDS }));
  const a = pickFreshSeed({ level: 2, words: WORDS, seeds, recent });
  assert.equal(pickFreshSeed({ level: 2, words: [...WORDS], seeds: [...seeds], recent: [...recent] }), a);
  assert.ok(seeds.includes(a));
  assert.equal(pickFreshSeed({ level: 2, words: WORDS, seeds: [], recent }), null);
  assert.equal(pickFreshSeed({ level: 2, words: WORDS, seeds }), seeds[0]);
  assert.equal(pickFreshSeed({ level: 2, words: WORDS, seeds, recent: [] }), seeds[0]);
});

test('pickFreshSeed：recent との重なりが最も少ない候補を選び、同点は先の候補', () => {
  for (const level of [1, 2, 3]) {
    for (let t = 0; t < 20; t++) {
      const seeds = candidates(`b${level}-${t}`);
      // 先頭の候補の答えを recent に積んでおく：先頭は選ばれにくくなる
      const recent = answersOf(generatePuzzle({ level, seed: seeds[0], words: WORDS }));
      const counts = seeds.map((s) => overlap(level, s, WORDS, recent));
      const want = seeds[counts.indexOf(Math.min(...counts))];
      assert.equal(pickFreshSeed({ level, words: WORDS, seeds, recent }), want, `${level} ${t}`);
    }
  }
});

test('storage：recent は新しい順・重複は前へ詰め直し・最大60件。読めない保存でも例外を出さない', () => {
  const mem = memory();
  const store = createStore(mem);
  assert.deepEqual(store.getRecent(), []);
  assert.deepEqual(store.pushRecent(['ねこ', 'いぬ']), ['ねこ', 'いぬ']);
  assert.deepEqual(store.pushRecent(['うし', 'ねこ', 'うし', '', 3]), ['うし', 'ねこ', 'いぬ']);
  assert.deepEqual(JSON.parse(mem.getItem('kotoba-tsuji.recent.v1')), ['うし', 'ねこ', 'いぬ']);
  const many = Array.from({ length: 70 }, (_, i) => `w${i}`);
  const after = store.pushRecent(many);
  assert.equal(RECENT_MAX, 60);
  assert.equal(after.length, 60);
  assert.deepEqual(after.slice(0, 2), ['w0', 'w1']);
  assert.deepEqual(store.getRecent(), after);
  mem.setItem('kotoba-tsuji.recent.v1', '{broken');
  assert.deepEqual(store.getRecent(), []);
  mem.setItem('kotoba-tsuji.recent.v1', JSON.stringify(['ねこ', 1, null, 'ねこ', 'いぬ']));
  assert.deepEqual(store.getRecent(), ['ねこ', 'いぬ']);
  const denied = createStore({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } });
  assert.deepEqual(denied.getRecent(), []);
  assert.deepEqual(denied.pushRecent(['ねこ']), ['ねこ']);
});

// 一人前を20局続ける。局ごとに8つの候補 seed を作り、recent を使うなら pickFreshSeed、使わないなら先頭の候補を選ぶ。
// 重なった問＝それより前の局に出た答えと同じ答えの数（20局の中で）。recent は storage と同じく新しい順・最大60件
function session(level, words, useRecent, tag = 'real') {
  const store = createStore(memory());
  const seen = new Set();
  let repeats = 0;
  let windowHits = 0;
  for (let g = 0; g < 20; g++) {
    const seeds = candidates(`${tag}-${g}`);
    const recent = store.getRecent();
    const seed = useRecent ? pickFreshSeed({ level, words, seeds, recent }) : seeds[0];
    const answers = answersOf(generatePuzzle({ level, seed, words }));
    for (const a of answers) {
      if (seen.has(a)) repeats++;
      if (recent.includes(a)) windowHits++;
      seen.add(a);
    }
    store.pushRecent(answers);
  }
  return { repeats, windowHits };
}

test('real：一人前を20局続けると、recent を使うほうが重なった問が少ない', (t) => {
  const without = session(2, REAL, false);
  const withRecent = session(2, REAL, true);
  t.diagnostic(`重なった問（160問中）：使わない ${without.repeats}・使う ${withRecent.repeats}／直近60件との重なり：使わない ${without.windowHits}・使う ${withRecent.windowHits}`);
  assert.ok(withRecent.repeats < without.repeats, `${withRecent.repeats} ≥ ${without.repeats}`);
  assert.ok(withRecent.windowHits < without.windowHits);
});
