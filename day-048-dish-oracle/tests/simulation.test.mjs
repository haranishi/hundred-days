// 全料理を相手に占いを最後まで回して、REQUIREMENTS.md の合格ラインを守っているかを見る。
// 推理の計算やデータを壊すと、ここの成功率か問数が崩れる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, probabilityOf, contradictions, softShare } from '../lib/oracle.js';
import { DISHES } from '../lib/dishes.js';
import { mulberry32 } from '../lib/rng.js';
import { flip, playOut, playTruthfully, truthful } from './players.mjs';

const model = buildModel();
const ids = model.items.map(item => item.id);

test('正直に答える人：全料理を当て、平均12問以内', () => {
  const misses = [];
  let questions = 0;
  let games = 0;
  for (const id of ids) {
    for (const seed of [1, 2]) {
      const result = playTruthfully(model, id, seed);
      games++;
      questions += result.questions;
      if (!result.ok) misses.push(id);
    }
  }
  assert.deepEqual(misses, []);
  const average = questions / games;
  assert.ok(average <= 12, `平均 ${average.toFixed(1)} 問`);
});

test('明らかな事実はめったに間違えない人（事実3%・割れる質問15%を逆に答える）：90%以上当てる', () => {
  let hits = 0;
  let games = 0;
  for (const id of ids) {
    for (const seed of [1, 2, 3]) {
      const random = mulberry32(seed * 1009 + ids.indexOf(id));
      const result = playTruthfully(model, id, seed, (answerId, qid) => {
        const p = probabilityOf(model, id, qid);
        const clear = p <= 0.1 || p >= 0.9;
        return random() < (clear ? 0.03 : 0.15) ? flip(answerId) : answerId;
      });
      games++;
      if (result.ok) hits++;
    }
  }
  assert.ok(hits / games >= 0.9, `成功率 ${(hits / games * 100).toFixed(1)}%`);
});

// 負荷試験：明らかな事実まで1割の確率で逆に答える人。答えと食い違う料理を推測しない決まりと引き換えに、
// この人の成功率は下がる（決まりの前95%→2つ食い違えば推測しない79%→確率の低い推測は食い違い0・推測できる料理が
// 残らなければすぐ降参 63%）。一覧に無い料理で読み0%のまま質問が続く不満（体験評価2周目）を優先した
test('何でも1割逆に答える人（負荷試験）：60%以上当てる', () => {
  let hits = 0;
  let games = 0;
  for (const id of ids) {
    for (const seed of [1, 2, 3]) {
      const random = mulberry32(seed * 1009 + ids.indexOf(id));
      const result = playTruthfully(model, id, seed, (answerId) => (random() < 0.1 ? flip(answerId) : answerId));
      games++;
      if (result.ok) hits++;
    }
  }
  assert.ok(hits / games >= 0.6, `成功率 ${(hits / games * 100).toFixed(1)}%`);
});

test('人によって感じ方がずれる人（確率を±0.25揺らす）：95%以上当てる', () => {
  let hits = 0;
  let games = 0;
  for (const id of ids) {
    const random = mulberry32(ids.indexOf(id) + 77);
    const result = playOut(model, {
      seed: 9,
      answerFor: (qid) => truthful(Math.min(1, Math.max(0, probabilityOf(model, id, qid) + (random() - 0.5) * 0.5))),
      isTarget: (guess) => guess === id,
    });
    games++;
    if (result.ok) hits++;
  }
  assert.ok(hits / games >= 0.95, `成功率 ${(hits / games * 100).toFixed(1)}%`);
});

test('2品のあいだで気分が揺れる人：最初の推測は中央値20問以内で、ほぼどちらかの料理', () => {
  const firstGuesses = [];
  let eitherHits = 0;
  const trials = 200;
  for (let seed = 1; seed <= trials; seed++) {
    const random = mulberry32(seed);
    const a = ids[Math.floor(random() * ids.length)];
    const b = ids[Math.floor(random() * ids.length)];
    const lean = 0.5 + random() * 0.3;
    let guessed = null;
    const result = playOut(model, {
      seed,
      answerFor: (qid) => truthful(lean * probabilityOf(model, a, qid) + (1 - lean) * probabilityOf(model, b, qid) + (random() - 0.5) * 0.2),
      isTarget: (id) => { guessed ??= id; return true; },
    });
    firstGuesses.push(result.firstGuessAt);
    if (guessed === a || guessed === b) eitherHits++;
  }
  firstGuesses.sort((x, y) => x - y);
  const median = firstGuesses[Math.floor(firstGuesses.length / 2)];
  assert.ok(median <= 20, `最初の推測の中央値 ${median} 問`);
  assert.ok(eitherHits / trials >= 0.9, `どちらかを推測 ${(eitherHits / trials * 100).toFixed(0)}%`);
});

test('でたらめに答えても、占いは必ず終わる', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const random = mulberry32(seed);
    const result = playOut(model, {
      seed,
      answerFor: () => ['yes', 'probably', 'unknown', 'probablyNot', 'no'][Math.floor(random() * 5)],
      isTarget: () => random() < 0.3,
    });
    assert.ok(result.questions <= 25);
  }
});

test('一覧に無い料理を思い浮かべた人に、答えと食い違う料理を推測せず、25問を待たずに参りました', () => {
  // その料理を一覧から抜いたモデルで遊ばせて再現する（3品に1品）。確率の低い推測（基準0.85未満）は食い違い0に限る
  let guesses = 0;
  let questions = 0;
  let games = 0;
  const bad = [];
  ids.forEach((id, index) => {
    if (index % 3) return;
    const without = buildModel(null, { dishes: DISHES.filter(dish => dish.id !== id) });
    let wrong = [];
    const result = playOut(without, {
      seed: 7,
      answerFor: (qid) => truthful(probabilityOf(model, id, qid)),
      isTarget: () => false,
      onGuess: (guess, game, step) => {
        guesses++;
        const count = contradictions(without, game, guess);
        if (count >= 2 || (step.p < 0.85 && count > 0)) wrong.push(`${guess}(食い違い${count}・確率${step.p.toFixed(2)})`);
      },
    });
    questions += result.questions;
    games++;
    if (wrong.length) bad.push(`${id}→${wrong.join(',')}`);
  });
  assert.deepEqual(bad, [], `推測${guesses}回`);
  assert.ok(questions / games <= 20, `降参まで平均${(questions / games).toFixed(1)}問（読み0%のまま聞き続けている）`);
});

test('気分が揺れて「たぶん」「わからない」が多い人には、提案として推測する（画面は「迷っていたなら」と添える）', () => {
  // 2品のあいだで揺れる人。答えの半分以上が「たぶん」「わからない」になりやすい
  let flagged = 0;
  const firsts = [];
  const trials = 120;
  for (let seed = 1; seed <= trials; seed++) {
    const random = mulberry32(seed);
    const a = ids[Math.floor(random() * ids.length)];
    const b = ids[Math.floor(random() * ids.length)];
    const lean = 0.5 + random() * 0.3;
    let first = null;
    playOut(model, {
      seed,
      answerFor: (qid) => truthful(lean * probabilityOf(model, a, qid) + (1 - lean) * probabilityOf(model, b, qid) + (random() - 0.5) * 0.2),
      isTarget: () => true,
      onGuess: (guess, game, step) => {
        if (first) return;
        first = step;
        firsts.push(game.answers.length);
        if (step.suggest) {
          flagged++;
          assert.ok(softShare(game) >= 0.5, '「たぶん」が半分未満なのに提案扱い');
        }
      },
    });
  }
  firsts.sort((x, y) => x - y);
  // 決まりを外すと、提案として出るのは最後の推測だけ（1割未満）になる
  assert.ok(flagged / trials >= 0.3, `提案として出た回 ${flagged}/${trials}`);
  assert.ok(firsts[Math.floor(trials / 2)] <= 16, `最初の推測の中央値 ${firsts[Math.floor(trials / 2)]}問`);
});
