import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DISHES } from '../lib/dishes.js';
import { QUESTIONS, QUESTION_BY_ID } from '../lib/questions.js';
import { buildModel, parseTags, katakanaScore } from '../lib/oracle.js';

test('料理の id と名前は重複しない', () => {
  assert.equal(new Set(DISHES.map(dish => dish.id)).size, DISHES.length);
  assert.equal(new Set(DISHES.map(dish => dish.name)).size, DISHES.length);
  assert.ok(DISHES.length >= 150, `料理が少なすぎる: ${DISHES.length}`);
});

test('料理には絵文字とよみがある', () => {
  for (const dish of DISHES) {
    assert.ok(dish.emoji.length > 0, dish.id);
    assert.ok(dish.kana.trim().length > 0, dish.id);
    assert.match(dish.id, /^[a-z]+$/, dish.id);
  }
});

test('特徴はすべて知っている質問で、確率は0〜1', () => {
  for (const dish of DISHES) {
    const tags = parseTags(dish.tags);
    for (const [key, value] of tags) {
      assert.ok(QUESTION_BY_ID.has(key), `${dish.id} の ${key}`);
      assert.notEqual(key, 'katakana', `${dish.id} は katakana を書かない`);
      assert.ok(value >= 0 && value <= 1, `${dish.id} の ${key}=${value}`);
    }
    assert.ok(tags.size >= 8, `${dish.id} の特徴が少ない（${tags.size}）`);
  }
});

test('特徴の書式違い・重複・範囲外は読み込みで止まる', () => {
  assert.throws(() => parseTags('hot hot'), /2回/);
  assert.throws(() => parseTags('hot:1.5'), /0〜1/);
  assert.throws(() => parseTags('Hot'), /書式/);
  assert.throws(() => buildModel(null, { dishes: [{ id: 'x', name: 'x', kana: 'x', emoji: 'x', tags: 'nosuch' }] }), /知らない特徴/);
});

test('質問は id が重複せず、base は0〜1、文は「？」で終わる', () => {
  assert.equal(new Set(QUESTIONS.map(question => question.id)).size, QUESTIONS.length);
  for (const question of QUESTIONS) {
    assert.ok(question.base >= 0 && question.base <= 1, question.id);
    assert.match(question.text, /？$/, question.id);
    assert.doesNotMatch(question.text, /^それは/, `${question.id}：「それは、」は画面側で付ける`);
  }
});

test('序盤に出さない質問は、名前・色・形・地方だけ', () => {
  const late = QUESTIONS.filter(question => question.late).map(question => question.id).sort();
  assert.deepEqual(late, ['brown', 'katakana', 'local', 'red', 'round', 'white', 'yellow']);
});

test('カタカナの質問は名前から決まる', () => {
  assert.equal(katakanaScore('カレーライス'), 1);
  assert.equal(katakanaScore('チキン南蛮'), 0.4);
  assert.equal(katakanaScore('親子丼'), 0);
  assert.equal(katakanaScore('まぜそば・油そば'), 0);
  assert.equal(katakanaScore(''), 0);
});

test('どの2品も、質問への答え方の合計差が2.5以上ある', () => {
  // 差が小さい2品は、正直に答えてもどちらか当てずっぽうになる。いちばん近い組（クロワッサンとベーグル）が2.6前後
  const model = buildModel();
  const n = model.items.length;
  let closest = { gap: Infinity };
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      let gap = 0;
      for (let q = 0; q < model.nQ; q++) gap += Math.abs(model.P[a * model.nQ + q] - model.P[b * model.nQ + q]);
      if (gap < closest.gap) closest = { gap, pair: `${model.items[a].name}／${model.items[b].name}` };
    }
  }
  assert.ok(closest.gap >= 2.5, `近すぎる2品: ${closest.pair}（${closest.gap.toFixed(2)}）`);
});

test('ソースに見えない文字（行区切り・ゼロ幅・BOM）が無い', () => {
  // 正規表現に行区切り文字が紛れ込むと、読み込みそのものが失敗する（制作中に一度起きた）
  const invisible = /[\u2028\u2029\u200B-\u200F\uFEFF]/u;
  const root = new URL('../', import.meta.url);
  for (const dir of ['.', 'lib', 'tests']) {
    for (const name of readdirSync(new URL(`${dir}/`, root))) {
      if (!/\.m?js$/.test(name)) continue;
      const text = readFileSync(new URL(`${dir}/${name}`, root), 'utf8');
      assert.doesNotMatch(text, invisible, `${dir}/${name}`);
    }
  }
});
