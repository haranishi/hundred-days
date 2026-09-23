import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANSWERS, LIMITS, TUNING, buildModel, newGame, answer, undo, reject, posterior, nextStep, ranking,
  likelihood, guessThreshold, deciders, probabilityOf, scoreQuestions, contradictions, reading,
} from '../lib/oracle.js';
import { QUESTIONS } from '../lib/questions.js';
import { truthful } from './players.mjs';

const model = buildModel();
const sum = (values) => values.reduce((total, value) => total + value, 0);

test('答えは5段階で、はい→いいえの順', () => {
  assert.deepEqual(ANSWERS.map(entry => entry.label), ['はい', 'たぶんそう', 'わからない', 'たぶん違う', 'いいえ']);
});

test('尤度：一致で1、正反対でも下駄が残り、近いほど大きい', () => {
  assert.equal(likelihood(1, 1), 1);
  assert.equal(likelihood(0, 0), 1);
  assert.equal(likelihood(0, 1), TUNING.floor);
  assert.ok(likelihood(0.75, 1) > likelihood(0.5, 1));
  assert.ok(likelihood(0.5, 1) > likelihood(0.25, 1));
});

test('事後確率は合計1。「わからない」は何も変えない', () => {
  const start = posterior(model, newGame(1));
  assert.ok(Math.abs(sum(start) - 1) < 1e-9);
  const unknown = posterior(model, answer(newGame(1), 'hot', 'unknown'));
  assert.deepEqual([...unknown], [...start]);
  const hot = posterior(model, answer(newGame(1), 'hot', 'yes'));
  assert.ok(Math.abs(sum(hot) - 1) < 1e-9);
  assert.ok(hot[model.index.get('ramen')] > hot[model.index.get('somen')]);
});

test('外れた推測の料理は確率0になり、二度と推測されない', () => {
  const game = reject(newGame(1), 'curry');
  assert.equal(posterior(model, game)[model.index.get('curry')], 0);
  assert.notEqual(ranking(model, posterior(model, game))[0].id, 'curry');
  assert.equal(reject(game, 'curry'), game);
});

test('知らない答え・同じ質問への2回目の答えは受け付けない', () => {
  assert.throws(() => answer(newGame(1), 'hot', 'maybe'), /知らない答え/);
  assert.throws(() => answer(answer(newGame(1), 'hot', 'yes'), 'hot', 'no'), /2回/);
});

test('ひとつ戻ると、同じ質問がもう一度出る', () => {
  let game = newGame(20260923);
  const asked = [];
  for (let i = 0; i < 6; i++) {
    const step = nextStep(model, game);
    assert.equal(step.type, 'ask');
    asked.push(step.q);
    game = answer(game, step.q, truthful(probabilityOf(model, 'takoyaki', step.q)));
  }
  for (let i = 5; i >= 0; i--) {
    game = undo(game);
    assert.equal(nextStep(model, game).q, asked[i]);
  }
  assert.equal(undo(game), game);
});

test('同じ種なら同じ出だし。種が違えば出だしがばらける', () => {
  assert.equal(nextStep(model, newGame(7)).q, nextStep(model, newGame(7)).q);
  const openers = new Set();
  for (let seed = 1; seed <= 30; seed++) openers.add(nextStep(model, newGame(seed)).q);
  assert.ok(openers.size >= 2, `出だしが1種類しかない: ${[...openers]}`);
  assert.ok(openers.size <= LIMITS.openingSpread);
});

test('名前・色・形・地方の質問は、5問目までに出ない', () => {
  const late = new Set(QUESTIONS.filter(question => question.late).map(question => question.id));
  for (let seed = 1; seed <= 40; seed++) {
    for (const id of ['curry', 'sushi', 'takoyaki', 'annin', 'kiritanpo']) {
      let game = newGame(seed);
      for (let i = 0; i < LIMITS.lateAfter; i++) {
        const step = nextStep(model, game);
        if (step.type !== 'ask') break;
        assert.ok(!late.has(step.q), `${id} の ${i + 1}問目に ${step.q}`);
        game = answer(game, step.q, truthful(probabilityOf(model, id, step.q)));
      }
    }
  }
});

test('推測の基準：5問目までは推測しない、10問目までは0.85、以降は1問ごとに下げて0.4で止まる', () => {
  assert.equal(guessThreshold(0), Infinity);
  assert.equal(guessThreshold(LIMITS.minQuestions - 1), Infinity);
  assert.equal(guessThreshold(LIMITS.minQuestions), 0.85);
  assert.equal(guessThreshold(10), 0.85);
  assert.ok(Math.abs(guessThreshold(11) - 0.8) < 1e-9);
  assert.ok(Math.abs(guessThreshold(15) - 0.6) < 1e-9);
  assert.equal(guessThreshold(40), LIMITS.guessFloor);
});

test('確信が基準を超えると推測し、その料理は最有力', () => {
  let game = newGame(3);
  for (let guard = 0; guard < 30; guard++) {
    const step = nextStep(model, game);
    if (step.type === 'guess') {
      assert.equal(step.id, step.ranked[0].id);
      assert.ok(step.p >= guessThreshold(game.answers.length) || step.final || game.answers.length >= LIMITS.maxQuestions);
      assert.ok(game.answers.length >= LIMITS.minQuestions);
      return;
    }
    game = answer(game, step.q, truthful(probabilityOf(model, 'omurice', step.q)));
  }
  assert.fail('推測まで進まなかった');
});

test('外した直後は、少なくとも1問聞いてから次を推測する', () => {
  // 決まりが効くのは「1番手を外すと、2番手が正規化で基準を超える」局面。料理と種を総当たりで探し、見つかった全局面で確かめる
  const cases = [];
  for (const item of model.items) {
    for (let seed = 1; seed <= 4; seed++) {
      let game = newGame(seed);
      let step = nextStep(model, game);
      while (step.type === 'ask') {
        game = answer(game, step.q, truthful(probabilityOf(model, item.id, step.q)));
        step = nextStep(model, game);
      }
      if (step.type !== 'guess' || game.answers.length >= LIMITS.maxQuestions) continue;
      const [top, second] = step.ranked;
      if (second.p / (1 - top.p) >= guessThreshold(game.answers.length)) cases.push({ game: reject(game, top.id), label: `${item.id}/${seed}` });
    }
  }
  assert.ok(cases.length >= 1, '決まりが効く局面が見つからない（データか推理が変わった）');
  for (const { game, label } of cases) {
    const after = nextStep(model, game);
    assert.equal(after.type, 'ask', `${label}：外した直後に続けて推測した`);
  }
});

test('質問を使い切ったあとは、外しても続けて推測する', () => {
  let game = newGame(5);
  for (let i = 0; i < LIMITS.maxQuestions; i++) game = answer(game, nextStep(model, game).q, 'unknown');
  const first = nextStep(model, game);
  assert.equal(first.type, 'guess');
  const second = nextStep(model, reject(game, first.id));
  assert.equal(second.type, 'guess');
  assert.notEqual(second.id, first.id);
});

test('推測を使い切ったら参りました', () => {
  let game = newGame(1);
  for (const id of ['curry', 'ramen', 'sushi']) game = reject(game, id);
  assert.equal(nextStep(model, game).type, 'giveup');
});

test('質問を使い切ったら、それ以上聞かずに最後の推測をする', () => {
  let game = newGame(5);
  // どの料理とも合わない答え方で25問進める（「わからない」ばかり）
  for (let i = 0; i < LIMITS.maxQuestions; i++) {
    const step = nextStep(model, game);
    assert.equal(step.type, 'ask');
    game = answer(game, step.q, 'unknown');
  }
  const last = nextStep(model, game);
  assert.equal(last.type, 'guess');
  assert.equal(last.final, true);
});

test('質問の情報量は、候補が割れる質問ほど大きい', () => {
  const scored = scoreQuestions(model, posterior(model, newGame(1)), new Set());
  const gain = Object.fromEntries(scored.map(entry => [entry.id, entry.gain]));
  // 「温かい？」は半分近くに割れる。「あんこ？」は数品しか当てはまらない
  assert.ok(gain.hot > gain.anko);
  assert.ok(scored.every(entry => entry.gain >= -1e-9));
});

test('決め手は答えた質問の中から、その料理らしさの強い順に3件まで', () => {
  let game = newGame(11);
  let guessed = null;
  for (let guard = 0; guard < 40 && !guessed; guard++) {
    const step = nextStep(model, game);
    if (step.type === 'guess') { guessed = step.id; break; }
    game = answer(game, step.q, truthful(probabilityOf(model, 'sukiyaki', step.q)));
  }
  assert.equal(guessed, 'sukiyaki');
  const reasons = deciders(model, game, 'sukiyaki');
  assert.ok(reasons.length >= 1 && reasons.length <= 3);
  const answered = new Set(game.answers.map(entry => entry.q));
  for (const reason of reasons) assert.ok(answered.has(reason.q));
  for (let i = 1; i < reasons.length; i++) assert.ok(reasons[i - 1].weight >= reasons[i].weight);
  assert.deepEqual(deciders(model, game, 'nosuch'), []);
});

test('1手の計算は軽い（スマホで待たせない）', () => {
  let game = newGame(1);
  const started = performance.now();
  for (let i = 0; i < 20; i++) {
    const step = nextStep(model, game);
    if (step.type !== 'ask') break;
    game = answer(game, step.q, truthful(probabilityOf(model, 'udon', step.q)));
  }
  const perStep = (performance.now() - started) / Math.max(1, game.answers.length);
  assert.ok(perStep < 25, `1手 ${perStep.toFixed(1)}ms`);
});

test('出だしは6問の候補からくじで選び、直前の占いと同じ質問を避ける', () => {
  const openers = new Set();
  for (let seed = 1; seed <= 60; seed++) openers.add(nextStep(model, newGame(seed)).q);
  assert.ok(openers.size >= 4, `出だしが${openers.size}種類しかない`);
  for (let seed = 1; seed <= 30; seed++) {
    const first = nextStep(model, newGame(seed)).q;
    assert.notEqual(nextStep(model, newGame(seed, { avoid: [first] })).q, first);
  }
});

test('はっきりした答えとの食い違いを数える（「たぶん」と「わからない」は数えない）', () => {
  let game = newGame(1);
  game = answer(game, 'sweet', 'yes'); // カレーは甘いおやつではない → 食い違い
  game = answer(game, 'curry', 'no'); // カレー味ではない → 食い違い
  game = answer(game, 'spicy', 'probablyNot');
  game = answer(game, 'hot', 'unknown');
  assert.equal(contradictions(model, game, 'curry'), 2);
  assert.equal(contradictions(model, game, 'pudding'), 0);
});

test('質問を使い切っても、答えと食い違わない料理が無ければ参りました', () => {
  const questions = [{ id: 'hot', text: '温かい料理ですか？', base: 0 }, { id: 'cold', text: '冷たいですか？', base: 0 }, { id: 'sweet', text: '甘いですか？', base: 0 }];
  const tiny = buildModel(null, { questions, dishes: [
    { id: 'aa', name: 'あ', kana: 'あ', emoji: '🍲', tags: 'hot' },
    { id: 'bb', name: 'い', kana: 'い', emoji: '🍧', tags: 'cold' },
  ] });
  let game = newGame(1);
  for (const q of ['hot', 'cold', 'sweet']) game = answer(game, q, 'yes');
  // どちらも「はい」と答えた質問の2つと食い違う。当てずっぽうに出さず降参する
  assert.equal(nextStep(tiny, game).type, 'giveup');
});

test('決め手に「名前がカタカナですか？」は入らない', () => {
  // 全品で確かめる（外すと中華丼・まぜそば・タコスなど32局面でカタカナが決め手に入る）
  for (const { id } of model.items) {
    for (let seed = 1; seed <= 3; seed++) {
      let game = newGame(seed);
      let step = nextStep(model, game);
      while (step.type === 'ask') {
        game = answer(game, step.q, truthful(probabilityOf(model, id, step.q)));
        step = nextStep(model, game);
      }
      assert.ok(!deciders(model, game, id).some(entry => entry.q === 'katakana'), `${id}/${seed}`);
    }
  }
});

test('読みの輪は推測の画面でだけ100%。それまでは99%で止まり、答えるほど近づく', () => {
  let game = newGame(8);
  let step = nextStep(model, game);
  assert.ok(reading(model, game, step).value < 0.2, 'はじめから高い');
  const values = [];
  while (step.type === 'ask') {
    const now = reading(model, game, step);
    assert.ok(now.value >= 0 && now.value <= 0.99);
    values.push(now.value);
    game = answer(game, step.q, truthful(probabilityOf(model, 'curry', step.q)));
    step = nextStep(model, game);
  }
  assert.equal(step.type, 'guess');
  assert.deepEqual(reading(model, game, step), { value: 1, id: 'curry' });
  assert.ok(values.at(-1) > values[0], `近づいていない: ${values.map(v => v.toFixed(2))}`);
  // 外すと下がる
  const missed = reject(game, 'curry');
  assert.ok(reading(model, missed).value < 1);
});

test('読みの輪は、答えと2つ以上食い違う料理を数えない', () => {
  let game = newGame(1);
  for (const [q, a] of [['sweet', 'yes'], ['curry', 'no'], ['rice', 'yes'], ['spoon', 'yes'], ['hot', 'yes'], ['simmered', 'yes']]) game = answer(game, q, a);
  const now = reading(model, game);
  assert.notEqual(now.id, 'curry');
  if (now.id) assert.ok(contradictions(model, game, now.id) < 2);
});
