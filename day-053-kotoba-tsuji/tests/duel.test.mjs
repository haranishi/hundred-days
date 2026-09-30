// 果たし合いの決着（勝ち・負け・引き分け・降参）、返し状の共有文、続きの一局に差出人の秒を持てること
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duelOutcome, returnShareText } from '../lib/ui/copy.js';
import { createStore } from '../lib/storage.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('決着：秒だけで比べ、勝ち・負け・引き分け・降参の文を返す', () => {
  assert.deepEqual(duelOutcome({ mine: 100, theirs: 192 }), { key: 'win', text: '果たし合い、そなたの勝ちでござる！（差出人 3分12秒・そなた 1分40秒）' });
  assert.deepEqual(duelOutcome({ mine: 200, theirs: 6 }), { key: 'lose', text: '無念、差出人の勝ちじゃ。次こそ討ち取るべし。（差出人 6秒・そなた 3分20秒）' });
  assert.deepEqual(duelOutcome({ mine: 192, theirs: 192 }), { key: 'draw', text: '引き分けにござる。好敵手とはこのことよな。（ともに 3分12秒）' });
  assert.deepEqual(duelOutcome({ mine: 5, theirs: 192, gaveUp: true }), { key: 'giveup', text: '果たし合いは差出人の勝ち。されど、また挑めばよい。' });
});

test('返し状の共有文', () => {
  assert.equal(returnShareText({ mine: 100, theirs: 192 }), '『ことば辻』の果たし状、1分40秒で受けて立ったでござる。差出人は3分12秒。いざ、もう一番！');
});

test('続きの一局に差出人の秒を持てる。不正な値や無いときは duel を返さない', () => {
  const store = createStore(memory());
  const base = { level: 2, seed: 'k3f9a2', game: { v: 1 } };
  assert.equal(store.saveCurrent({ ...base, duel: { theirs: 192 } }), true);
  assert.deepEqual(store.getCurrent(), { ...base, duel: { theirs: 192 } });
  store.saveCurrent({ ...base, duel: { theirs: 0 } });
  assert.deepEqual(store.getCurrent(), base);
  store.saveCurrent({ ...base, duel: { theirs: 86400 } });
  assert.deepEqual(store.getCurrent(), base);
  store.saveCurrent(base);
  assert.equal('duel' in store.getCurrent(), false);
});
