import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange } from '../lib/arrange.js';
import { LEVELS, PROPS } from '../lib/catalog.js';
import { decodeChallenge, encodeChallenge, makeChoices, pickVanished, planGame, roomOf, titleFor } from '../lib/rules.js';
import { manifest } from './helpers.mjs';

test('消える物は、むずかしさの組から選ばれ、1ゲームで重ならない', () => {
  for (const level of Object.keys(LEVELS)) {
    for (let seed = 1; seed <= 150; seed++) {
      const rounds = planGame(manifest, arrange, seed, level);
      assert.equal(rounds.length, 3);
      const ids = rounds.map(r => r.vanished);
      assert.equal(new Set(ids).size, 3, `${level} ${seed}: ${ids}`);
      for (const id of ids) assert.ok(LEVELS[level].pool.includes(PROPS[id].size), `${level} に ${id}`);
    }
  }
});

test('続く2問は、できるだけ別の部屋から消える', () => {
  let same = 0;
  let pairs = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rounds = planGame(manifest, arrange, seed, 'normal');
    for (let i = 1; i < rounds.length; i++) {
      pairs++;
      if (rounds[i].room === rounds[i - 1].room) same++;
    }
  }
  assert.ok(same / pairs < 0.05, `同じ部屋が続いた割合 ${(same / pairs).toFixed(3)}`);
});

test('候補は決まった数で、消えた物を1つだけ含み、残りは家にある別の物', () => {
  for (const level of Object.keys(LEVELS)) {
    for (let seed = 1; seed <= 100; seed++) {
      for (const r of planGame(manifest, arrange, seed, level)) {
        assert.equal(r.choices.length, LEVELS[level].choices[r.round]);
        assert.equal(new Set(r.choices).size, r.choices.length);
        assert.equal(r.choices.filter(c => c === r.vanished).length, 1);
        for (const c of r.choices) assert.ok(r.arrangement[c], `${c} は家に無い`);
      }
    }
  }
});

test('候補は、消えた物と同じ大きさの組を優先し、同じ部屋の物も混ぜる', () => {
  let sameRoom = 0;
  let total = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const arrangement = arrange(manifest, seed, 1);
    const vanished = pickVanished({ arrangement, level: 'normal', seed, round: 1 });
    const choices = makeChoices({ arrangement, level: 'normal', seed, round: 1, vanished });
    const sameSize = choices.filter(c => PROPS[c].size === PROPS[vanished].size).length;
    assert.ok(sameSize >= 5, `同じ組が ${sameSize} 個`);
    total++;
    if (choices.some(c => c !== vanished && roomOf(arrangement, c) === roomOf(arrangement, vanished))) sameRoom++;
  }
  assert.ok(sameRoom / total >= 0.8, `同じ部屋の候補が入った割合 ${sameRoom / total}`);
});

test('候補の並び順に、正解の位置の偏りが無い', () => {
  const at = new Array(6).fill(0);
  for (let seed = 1; seed <= 600; seed++) {
    const r = planGame(manifest, arrange, seed, 'normal')[1];
    at[r.choices.indexOf(r.vanished)]++;
  }
  for (const n of at) assert.ok(n > 60 && n < 140, `正解の位置の数 ${at}`);
});

test('1ゲームの中で、候補の数が減らずに増えていく（歯応えが上がる）', () => {
  for (const level of Object.values(LEVELS)) {
    const counts = level.choices;
    assert.equal(counts.length, 3);
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1], `${level.name}: ${counts}`);
    assert.ok(counts[2] > counts[0], `${level.name} は3問目の方が候補が多い`);
  }
});

test('挑戦リンクは むずかしさと種 だけを運び、壊れたリンクは受け付けない', () => {
  assert.equal(encodeChallenge('hard', 42), '#c-h-42');
  assert.deepEqual(decodeChallenge('#c-n-999999'), { level: 'normal', seed: 999999 });
  assert.deepEqual(decodeChallenge(encodeChallenge('easy', 5)), { level: 'easy', seed: 5 });
  for (const bad of ['', '#', '#c-x-1', '#c-n-0', '#c-n-1234567', '#c-n-12a', '#c-n-1<script>']) assert.equal(decodeChallenge(bad), null, bad);
});

test('結果の呼び名', () => {
  assert.equal(titleFor(3, 3), '名探偵');
  assert.equal(titleFor(2, 3), 'するどい目');
  assert.equal(titleFor(1, 3), 'あと少し');
  assert.equal(titleFor(0, 3), 'また挑戦');
});
