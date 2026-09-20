import test from 'node:test';
import assert from 'node:assert/strict';
import { WINDOW, findNote, judgeOffset, rank } from '../lib/judge.js';

test('判定の境目', () => {
  assert.equal(judgeOffset(0), 'perfect');
  assert.equal(judgeOffset(WINDOW.perfect), 'perfect', '境目は内側に入れる');
  assert.equal(judgeOffset(WINDOW.perfect + 0.001), 'good');
  assert.equal(judgeOffset(-WINDOW.good), 'good', '早い側も同じ幅');
  assert.equal(judgeOffset(WINDOW.good + 0.001), 'miss');
  assert.equal(judgeOffset(WINDOW.reach + 0.001), null, '届かない入力はどの打点のものでもない');
});

test('いちばん近い未処理の打点を選ぶ', () => {
  const notes = [{ time: 1 }, { time: 1.1 }, { time: 5 }];
  assert.equal(findNote(notes, 1.06, new Set()), 1, '近いほうを取る');
  assert.equal(findNote(notes, 1.06, new Set([1])), 0, '処理済みは飛ばして次に近いものへ');
  assert.equal(findNote(notes, 3, new Set()), -1, '届く範囲に無ければ選ばない');
  assert.equal(findNote(notes, 1.06, new Set([0, 1])), -1, '残りが遠ければ選ばない');
});

test('順位は敵船に届いた数（ドンピシャ）で決まる', () => {
  assert.equal(rank({ total: 10, perfect: 10, good: 0, miss: 0, whiff: 0 }).key, 'captain');
  assert.equal(rank({ total: 10, perfect: 8, good: 2, miss: 0, whiff: 0 }).key, 'mate');
  assert.equal(rank({ total: 10, perfect: 6, good: 2, miss: 2, whiff: 0 }).key, 'helm');
  assert.equal(rank({ total: 10, perfect: 4, good: 3, miss: 3, whiff: 0 }).key, 'crew');
  assert.equal(rank({ total: 10, perfect: 2, good: 5, miss: 3, whiff: 0 }).key, 'rookie');
  assert.equal(rank({ total: 10, perfect: 0, good: 9, miss: 1, whiff: 0 }).key, 'seasick');
});

/* 体験評価2周目の致命的な指摘：
   敵船を大破させた回と、1発も届かなかった回が、同じ「操舵手」・同じ助言だった。
   おしいをドンピシャと同じに数えていたため。物差しそのものが違っていた。 */
test('おしいばかりの回と、ドンピシャばかりの回は同じ順位にならない', () => {
  const landed = rank({ total: 31, perfect: 29, good: 0, miss: 2, whiff: 3 });
  const grazed = rank({ total: 31, perfect: 0, good: 29, miss: 2, whiff: 3 });
  assert.notEqual(landed.key, grazed.key);
  assert.notEqual(landed.note, grazed.note);
  assert.equal(grazed.key, 'seasick', '1発も届いていないなら、いちばん下');
});

/* 同じく2周目：から振り1回でキャプテンから落ちていた。連打とは別物なので段差にしない。 */
test('から振りが1回あっても、届いた数が同じなら順位は変わらない', () => {
  const clean = rank({ total: 31, perfect: 31, good: 0, miss: 0, whiff: 0 });
  const slipped = rank({ total: 31, perfect: 31, good: 0, miss: 0, whiff: 1 });
  assert.equal(clean.key, slipped.key);
});

test('助言は順位ごとに違う文になる', () => {
  const notes = [
    rank({ total: 10, perfect: 10, good: 0, miss: 0, whiff: 0 }).note,
    rank({ total: 10, perfect: 8, good: 0, miss: 0, whiff: 0 }).note,
    rank({ total: 10, perfect: 6, good: 0, miss: 4, whiff: 0 }).note,
    rank({ total: 10, perfect: 4, good: 0, miss: 6, whiff: 0 }).note,
    rank({ total: 10, perfect: 2, good: 0, miss: 8, whiff: 0 }).note,
    rank({ total: 10, perfect: 0, good: 0, miss: 10, whiff: 0 }).note
  ];
  assert.equal(new Set(notes).size, 6);
});

test('打つものが来なかったときは順位を付けない', () => {
  assert.equal(rank({ total: 0, perfect: 0, good: 0, miss: 0, whiff: 0 }).key, 'none');
});
