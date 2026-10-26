import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDeck,
  calculateRank,
  createGameState,
  evaluateChoice,
  getReviewItems,
  submitAction,
  tickTimer
} from '../lib/engine.js';
import { getItemById } from '../lib/items.js';

test('evaluateChoice: 機内のみ・預けのみ・不可・両方OKの4種を正確に判定すること', () => {
  const powerbank = getItemById('powerbank-10000');
  assert.equal(evaluateChoice(powerbank, 'carry_on').isCorrect, true);
  assert.equal(evaluateChoice(powerbank, 'checked').isCorrect, false);
  assert.equal(evaluateChoice(powerbank, 'prohibited').isCorrect, false);

  const scissors = getItemById('scissors-8cm');
  assert.equal(evaluateChoice(scissors, 'carry_on').isCorrect, false);
  assert.equal(evaluateChoice(scissors, 'checked').isCorrect, true);
  assert.equal(evaluateChoice(scissors, 'prohibited').isCorrect, false);

  const gas = getItemById('gas-cartridge-camp');
  assert.equal(evaluateChoice(gas, 'carry_on').isCorrect, false);
  assert.equal(evaluateChoice(gas, 'checked').isCorrect, false);
  assert.equal(evaluateChoice(gas, 'prohibited').isCorrect, true);

  const pouch = getItemById('liquid-pouch-intl');
  assert.equal(evaluateChoice(pouch, 'carry_on').isCorrect, true);
  assert.equal(evaluateChoice(pouch, 'checked').isCorrect, true);
  assert.equal(evaluateChoice(pouch, 'prohibited').isCorrect, false);
});

test('createGameState と submitAction: 正解でスコアとコンボが増加し、誤答でコンボがリセットされること', () => {
  let state = createGameState('rush', () => 0.5);
  assert.equal(state.status, 'playing');
  assert.equal(state.remainingSeconds, 60);
  assert.ok(state.currentItem);
  assert.ok(state.nextItem);
  assert.notEqual(state.currentItem.id, state.nextItem.id);

  // 1問目を正解させる
  const firstCorrectAction = state.currentItem.allowed[0];
  state = submitAction(state, firstCorrectAction, { elapsedMs: 1200 });
  assert.equal(state.correctCount, 1);
  assert.equal(state.combo, 1);
  assert.equal(state.score, 150); // base 100 + combo 20 + speed 30

  // 2問目をわざと間違えさせる
  const secondItem = state.currentItem;
  const wrongAction = ['carry_on', 'checked', 'prohibited'].find((a) => !secondItem.allowed.includes(a));
  state = submitAction(state, wrongAction, { elapsedMs: 1200 });
  assert.equal(state.correctCount, 1);
  assert.equal(state.mistakeCount, 1);
  assert.equal(state.combo, 0);
  assert.equal(state.maxCombo, 1);
  assert.equal(state.score, 150);
});

test('trainingモード: 10問回答時点で自動的に finished に遷移すること', () => {
  const deck = buildDeck('training', () => 0.25);
  assert.equal(deck.length, 10);

  let state = createGameState('training', () => 0.25);
  assert.equal(state.remainingSeconds, null);
  assert.equal(state.targetCount, 10);

  for (let i = 0; i < 10; i += 1) {
    assert.equal(state.status, 'playing');
    const action = state.currentItem.allowed[0];
    state = submitAction(state, action);
  }

  assert.equal(state.status, 'finished');
  assert.equal(state.totalAnswered, 10);
  assert.equal(state.correctCount, 10);
  assert.equal(state.currentItem, null);

  const rank = calculateRank(state);
  assert.equal(rank.grade, 'S');
  assert.equal(rank.accuracy, 100);
});

test('rushモード: 36問を超えてもデッキが自動再補充され、タイマー0で finished になること', () => {
  let state = createGameState('rush', () => 0.4);
  for (let i = 0; i < 42; i += 1) {
    const action = state.currentItem.allowed[0];
    state = submitAction(state, action, { elapsedMs: 800, rng: () => 0.3 });
  }
  assert.equal(state.status, 'playing');
  assert.equal(state.totalAnswered, 42);
  assert.ok(state.currentItem);

  state = tickTimer(state, 59);
  assert.equal(state.status, 'playing');
  assert.equal(state.remainingSeconds, 1);

  state = tickTimer(state, 1);
  assert.equal(state.status, 'finished');
  assert.equal(state.remainingSeconds, 0);
  assert.equal(state.currentItem, null);
});

test('getReviewItems: 間違えた問題を重複なく抽出し、全問正解時は重要3品目を返すこと', () => {
  let state = createGameState('training', () => 0.1);
  // 全問正解
  for (let i = 0; i < 10; i += 1) {
    state = submitAction(state, state.currentItem.allowed[0]);
  }
  const perfectReview = getReviewItems(state);
  assert.equal(perfectReview.hasMistakes, false);
  assert.equal(perfectReview.items.length, 3);

  // 1問ミスがある場合
  let mistakeState = createGameState('training', () => 0.1);
  const firstItem = mistakeState.currentItem;
  const wrong = ['carry_on', 'checked', 'prohibited'].find((a) => !firstItem.allowed.includes(a));
  mistakeState = submitAction(mistakeState, wrong);
  const reviewWithMistake = getReviewItems(mistakeState);
  assert.equal(reviewWithMistake.hasMistakes, true);
  assert.equal(reviewWithMistake.items.length, 1);
  assert.equal(reviewWithMistake.items[0].item.id, firstItem.id);
});
