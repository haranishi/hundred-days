import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { CHOICE_COUNT, LEAD_PREFS, LEAD_TOWN_COUNT, QUESTION_COUNT, buildRound, formatScore, planPrefCodes, score } from '../lib/quiz.js';
import { mulberry32 } from '../lib/rng.js';
import { REGIONS, regionOfPref } from '../lib/regions.js';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const townsByPref = { '05': read('towns/05.json'), '06': read('towns/06.json') };

/* 47県ぶんの形は重いので、出題の理屈を見るテストでは名前とコードだけの県を使う */
const allPrefs = REGIONS.flatMap((region) =>
  region.prefs.map((code) => ({ code, name: `県${code}`, region: region.id, shape: { rings: [[0, 0, 1000, 0, 1000, 1000, 0, 1000]] } }))
);

const codes = (items) => items.map((item) => item.code);

/* 全国モードは10県を重複なく引くので、県が2つしかない固定データでは試せない。
   形の要らないテストでは、47県ぶんの軽い町データを組み立てて使う */
const townsEverywhere = Object.fromEntries(
  allPrefs.map((pref) => [
    pref.code,
    {
      pref: pref.code,
      prefName: pref.name,
      items: Array.from({ length: 6 }, (_, i) => ({
        code: `${pref.code}2${String(i).padStart(2, '0')}`,
        name: `${pref.name}の町${i}`,
        pos: [100 + i * 30, 200, 100 + i * 20],
        shape: { rings: [[0, 0, 1000, 0, 1000, 1000, 0, 1000]] }
      }))
    }
  ])
);

test('都道府県モードは重複しない10問を作る', () => {
  const round = buildRound({ mode: 'pref', prefs: allPrefs, rng: mulberry32(7) });
  assert.equal(round.mode, 'pref');
  assert.equal(round.questions.length, QUESTION_COUNT);
  const answers = codes(round.questions.map((question) => question.answer));
  assert.equal(new Set(answers).size, QUESTION_COUNT);
});

test('4択は必ず4件・重複なし・答えを含む', () => {
  for (const seed of [1, 2, 3, 99, 12345]) {
    for (const round of [
      buildRound({ mode: 'pref', prefs: allPrefs, rng: mulberry32(seed) }),
      buildRound({ mode: 'town', prefs: allPrefs, townsByPref, prefCode: '05', rng: mulberry32(seed) })
    ]) {
      for (const question of round.questions) {
        assert.equal(question.choices.length, CHOICE_COUNT);
        assert.equal(new Set(codes(question.choices)).size, CHOICE_COUNT);
        assert.equal(new Set(question.choices.map((choice) => choice.name)).size, CHOICE_COUNT);
        assert.ok(question.choices.some((choice) => choice.code === question.answer.code));
      }
    }
  }
});

test('市区町村モードの誤答候補は同じ県から出る', () => {
  const round = buildRound({ mode: 'town', prefs: allPrefs, townsByPref, prefCode: '05', rng: mulberry32(4) });
  assert.equal(round.prefCode, '05');
  const inPref = new Set(codes(townsByPref['05'].items));
  for (const question of round.questions) {
    assert.equal(question.prefName, '秋田県');
    for (const choice of question.choices) assert.ok(inPref.has(choice.code), `${choice.name} は秋田県の町ではない`);
  }
});

test('都道府県モードの誤答は同じ地方が2つ、別の地方が1つ', () => {
  for (const seed of [11, 22, 33]) {
    const round = buildRound({ mode: 'pref', prefs: allPrefs, rng: mulberry32(seed) });
    for (const question of round.questions) {
      const region = regionOfPref(question.answer.code).id;
      const wrong = question.choices.filter((choice) => choice.code !== question.answer.code);
      const same = wrong.filter((choice) => regionOfPref(choice.code).id === region).length;
      // 北海道のように1県しかない地方は同じ地方から出せないので、上限として見る
      const available = REGIONS.find((item) => item.id === region).prefs.length - 1;
      assert.equal(same, Math.min(2, available), `${question.answer.name} の同地方の誤答が合わない`);
    }
  }
});

test('全国モードは町を重複させず、選択肢はその問の県から出る', () => {
  const round = buildRound({ mode: 'town-all', prefs: allPrefs, townsByPref: townsEverywhere, rng: mulberry32(5) });
  assert.equal(round.questions.length, QUESTION_COUNT);
  const answers = codes(round.questions.map((question) => question.answer));
  assert.equal(new Set(answers).size, QUESTION_COUNT);
  for (const question of round.questions) {
    const inPref = new Set(codes(townsEverywhere[question.prefCode].items));
    for (const choice of question.choices) assert.ok(inPref.has(choice.code));
  }
});

test('全国モードは県も重複させない（「毎問ちがう県から」と画面に書いてある）', () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const round = buildRound({ mode: 'town-all', prefs: allPrefs, townsByPref: townsEverywhere, rng: mulberry32(seed) });
    const used = round.questions.map((question) => question.prefCode);
    assert.equal(used.length, QUESTION_COUNT);
    assert.equal(new Set(used).size, QUESTION_COUNT, `種 ${seed} で県が重複した: ${used.join(',')}`);
    // 先に読む県（planPrefCodes）と、実際に出題に使う県が一致していること
    assert.deepEqual(planPrefCodes({ mode: 'town-all', prefs: allPrefs, rng: mulberry32(seed) }), used, `種 ${seed}`);
  }
});

test('都道府県モードの1問目は、形に特徴のある県から出す', () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const round = buildRound({ mode: 'pref', prefs: allPrefs, rng: mulberry32(seed) });
    assert.ok(LEAD_PREFS.includes(round.questions[0].answer.code), `種 ${seed} の1問目が ${round.questions[0].answer.code}`);
  }
  // 特徴的な県が1つも無いデータでも落ちない（テスト用の小さなデータなど）
  const small = allPrefs.filter((pref) => !LEAD_PREFS.includes(pref.code)).slice(0, 12);
  assert.equal(buildRound({ mode: 'pref', prefs: small, rng: mulberry32(1) }).questions.length, QUESTION_COUNT);
});

test('市区町村モードの1問目は、県内で大きい町から出す', () => {
  const items = townsByPref['05'].items;
  const big = new Set(
    [...items].sort((a, b) => b.pos[2] - a.pos[2]).slice(0, LEAD_TOWN_COUNT).map((item) => item.code)
  );
  assert.equal(big.size, LEAD_TOWN_COUNT);
  for (let seed = 1; seed <= 100; seed += 1) {
    const round = buildRound({ mode: 'town', prefs: allPrefs, townsByPref, prefCode: '05', rng: mulberry32(seed) });
    assert.ok(big.has(round.questions[0].answer.code), `種 ${seed} の1問目が ${round.questions[0].answer.name}`);
  }
});

test('同じ種なら同じ出題になる', () => {
  const one = buildRound({ mode: 'pref', prefs: allPrefs, rng: mulberry32(31) });
  const two = buildRound({ mode: 'pref', prefs: allPrefs, rng: mulberry32(31) });
  assert.deepEqual(
    one.questions.map((question) => codes(question.choices)),
    two.questions.map((question) => codes(question.choices))
  );
  const other = buildRound({ mode: 'pref', prefs: allPrefs, rng: mulberry32(32) });
  assert.notDeepEqual(codes(one.questions.map((q) => q.answer)), codes(other.questions.map((q) => q.answer)));
});

test('先に読む県コードは、出題が実際に使う県と一致する', () => {
  const prefs = allPrefs;
  const planned = planPrefCodes({ mode: 'town-all', prefs, rng: mulberry32(77) });
  const round = buildRound({ mode: 'town-all', prefs, townsByPref: townsEverywhere, rng: mulberry32(77) });
  assert.equal(planned.length, QUESTION_COUNT);
  assert.deepEqual(round.questions.map((question) => question.prefCode), planned);
  assert.deepEqual(planPrefCodes({ mode: 'town', prefCode: '05', rng: mulberry32(1) }), ['05']);
  assert.deepEqual(planPrefCodes({ mode: 'pref', prefs, rng: mulberry32(1) }), []);
});

test('在庫が4件に満たない県は例外にする', () => {
  const thin = { '05': { pref: '05', prefName: '秋田県', items: townsByPref['05'].items.slice(0, 3) } };
  assert.throws(() => buildRound({ mode: 'town', prefs: allPrefs, townsByPref: thin, prefCode: '05', rng: mulberry32(1) }));
  assert.throws(() => buildRound({ mode: 'town', prefs: allPrefs, townsByPref: {}, prefCode: '05', rng: mulberry32(1) }));
});

test('在庫より多い問数を求められたら、あるぶんだけ出す', () => {
  const round = buildRound({ mode: 'town', prefs: allPrefs, townsByPref, prefCode: '05', rng: mulberry32(2), count: 20 });
  assert.equal(round.questions.length, townsByPref['05'].items.length);
});

test('正解1点・ヒント付きの正解0.5点・不正解0点', () => {
  assert.equal(score([{ correct: true, hinted: false }]), 1);
  assert.equal(score([{ correct: true, hinted: true }]), 0.5);
  assert.equal(score([{ correct: false, hinted: true }]), 0);
  assert.equal(score([]), 0);
  assert.equal(
    score([
      { correct: true, hinted: false },
      { correct: true, hinted: true },
      { correct: false, hinted: false }
    ]),
    1.5
  );
});

test('点数は整数なら小数を出さない', () => {
  assert.equal(formatScore(8.5), '8.5');
  assert.equal(formatScore(9), '9');
  assert.equal(formatScore(0), '0');
  assert.equal(formatScore(10), '10');
});
