import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMORY_SLOT, MEMORY_LIMITS, emptyMemory, sanitizeMemory, loadMemory, saveMemory, forgetMemory,
  normalizeName, findExact, searchDishes, remember, recordPlay, learnedCount,
} from '../lib/memory.js';
import { buildModel, probabilityOf, TUNING } from '../lib/oracle.js';
import { DISHES } from '../lib/dishes.js';
import { QUESTIONS } from '../lib/questions.js';
import { playOut, truthful } from './players.mjs';

const known = { dishIds: new Set(DISHES.map(dish => dish.id)), questionIds: new Set(QUESTIONS.map(question => question.id)) };
const model = buildModel();

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (name) => (name in data ? data[name] : null),
    setItem: (name, value) => { data[name] = String(value); },
    removeItem: (name) => { delete data[name]; },
  };
}
const brokenStorage = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
  removeItem() { throw new Error('SecurityError'); },
};

test('保存先のキーは1つで、_KEY という名前を使わない', () => {
  assert.equal(MEMORY_SLOT, 'day048.oracle.memory.v1');
});

test('初めての端末は空の記憶で、壊れていない扱い', () => {
  assert.deepEqual(loadMemory(fakeStorage(), known), { memory: emptyMemory(), available: true, repaired: false });
});

test('保存が使えない端末は available=false で、遊べる状態を返す', () => {
  const loaded = loadMemory(brokenStorage, known);
  assert.equal(loaded.available, false);
  assert.deepEqual(loaded.memory, emptyMemory());
  assert.equal(saveMemory(brokenStorage, emptyMemory()), false);
  assert.equal(forgetMemory(brokenStorage), false);
});

test('壊れたJSONは捨てて、repaired=true', () => {
  const loaded = loadMemory(fakeStorage({ [MEMORY_SLOT]: '{oops' }), known);
  assert.deepEqual(loaded, { memory: emptyMemory(), available: true, repaired: true });
});

test('知らない料理・質問・範囲外の数は捨て、残りは使う', () => {
  const raw = {
    v: 1,
    dishes: {
      curry: { spicy: [1, 2], nosuch: [1, 1], hot: [3, 2], cold: [0.5, 1.5] },
      ghost: { hot: [1, 1] },
    },
    custom: [
      { id: 'u1', name: 'ばあちゃんの煮しめ', answers: { hot: [1, 1] }, at: '2026-09-23' },
      { id: 'u1', name: '重複', answers: {} },
      { id: 'x9', name: '形が違う', answers: {} },
      { id: 'u2', name: '　', answers: {} },
    ],
    plays: 3,
    wins: 5,
  };
  const { memory, dropped } = sanitizeMemory(raw, known);
  assert.equal(dropped, true);
  assert.deepEqual(memory.dishes, { curry: { spicy: [1, 2] } });
  assert.deepEqual(memory.custom.map(entry => entry.id), ['u1']);
  assert.equal(memory.plays, 3);
  assert.equal(memory.wins, 0);
});

test('回数が負・小数・文字の記録は0に戻す', () => {
  for (const plays of [-1, 1.5, '3', Infinity]) {
    const { memory, dropped } = sanitizeMemory({ v: 1, plays, wins: 0 }, known);
    assert.equal(memory.plays, 0, String(plays));
    assert.equal(dropped, true);
  }
});

test('版の違う記録は丸ごと捨てる', () => {
  assert.deepEqual(sanitizeMemory({ v: 2, dishes: {} }, known), { memory: emptyMemory(), dropped: true });
  assert.deepEqual(sanitizeMemory([], known), { memory: emptyMemory(), dropped: true });
  assert.deepEqual(sanitizeMemory(null, known), { memory: emptyMemory(), dropped: false });
});

test('保存して読み直すと同じ記憶', () => {
  const storage = fakeStorage();
  const { memory } = remember(emptyMemory(), { name: 'ばあちゃんの煮しめ' }, [{ q: 'hot', a: 'yes' }, { q: 'sweet', a: 'no' }], '2026-09-23');
  assert.equal(saveMemory(storage, memory), true);
  assert.deepEqual(loadMemory(storage, known), { memory, available: true, repaired: false });
  assert.equal(forgetMemory(storage), true);
  assert.equal(storage.getItem(MEMORY_SLOT), null);
});

test('料理名：全角英数をそろえ、制御文字と余分な空白を消し、空と長すぎは断る', () => {
  assert.deepEqual(normalizeName('  ＢＬＴ　サンド\u0007 '), { ok: true, name: 'BLT サンド' });
  assert.deepEqual(normalizeName(' \u200b '), { ok: false, reason: 'empty', name: '' });
  assert.equal(normalizeName('あ'.repeat(MEMORY_LIMITS.nameLength)).ok, true);
  assert.equal(normalizeName('あ'.repeat(MEMORY_LIMITS.nameLength + 1)).reason, 'long');
  assert.equal(normalizeName(null).reason, 'empty');
});

test('名前が一覧の料理と一致すれば、その料理として扱う（ひらがな・カタカナ・別名）', () => {
  assert.equal(findExact(model, 'カレーライス'), 'curry');
  assert.equal(findExact(model, 'かれーらいす'), 'curry');
  assert.equal(findExact(model, '唐揚げ'), 'karaage');
  assert.equal(findExact(model, 'カラアゲ'), 'karaage');
  assert.equal(findExact(model, 'ばあちゃんの煮しめ'), null);
  assert.equal(findExact(model, ''), null);
});

test('表記ゆれ：送り仮名・漢字・略称の別名でも一覧の料理になる', () => {
  for (const [name, id] of [['から揚げ', 'karaage'], ['蕎麦', 'soba'], ['天麩羅', 'tempura'], ['豚カツ', 'tonkatsu'], ['TKG', 'tkg'], ['カレー', 'curry'], ['焼き芋', 'yakiimo']]) {
    assert.equal(findExact(model, name), id, name);
  }
});

test('入力が料理名を含むときも候補に出す（味噌ラーメン→ラーメン）', () => {
  assert.ok(searchDishes(model, '味噌ラーメン').includes('ramen'));
  assert.ok(searchDishes(model, '冷たいうどん').includes('udon'));
});

test('候補の検索は完全一致→前方一致→部分一致', () => {
  const hits = searchDishes(model, 'から');
  assert.ok(hits.includes('karaage'));
  assert.equal(searchDishes(model, 'うどん')[0], 'udon');
  assert.ok(searchDishes(model, 'やき').length <= 8);
  assert.deepEqual(searchDishes(model, '   '), []);
});

test('一覧の料理を覚えると、答えの合計と回数が増え、「わからない」は数えない', () => {
  const answers = [{ q: 'spicy', a: 'no' }, { q: 'hot', a: 'yes' }, { q: 'sweet', a: 'unknown' }, { q: 'cheese', a: 'probably' }];
  const first = remember(emptyMemory(), { id: 'curry' }, answers);
  assert.equal(first.id, 'curry');
  assert.deepEqual(first.memory.dishes.curry, { spicy: [0, 1], hot: [1, 1], cheese: [0.75, 1] });
  const second = remember(first.memory, { id: 'curry' }, [{ q: 'spicy', a: 'probablyNot' }]);
  assert.deepEqual(second.memory.dishes.curry.spicy, [0.25, 2]);
  assert.deepEqual(first.memory.dishes.curry.spicy, [0, 1], '元の記憶は書き換えない');
});

test('1つの質問で数える回数には上限があり、新しい答えほど効く', () => {
  let memory = emptyMemory();
  for (let i = 0; i < MEMORY_LIMITS.perQuestion; i++) memory = remember(memory, { id: 'curry' }, [{ q: 'spicy', a: 'yes' }]).memory;
  assert.deepEqual(memory.dishes.curry.spicy, [20, 20]);
  memory = remember(memory, { id: 'curry' }, [{ q: 'spicy', a: 'no' }]).memory;
  assert.deepEqual(memory.dishes.curry.spicy, [19, 20]);
});

test('新しい料理は u1, u2… の id で覚え、上限を超えたら古いものから忘れる', () => {
  let memory = emptyMemory();
  const ids = [];
  for (let i = 0; i < MEMORY_LIMITS.custom + 2; i++) {
    const result = remember(memory, { name: `料理${i}` }, [{ q: 'hot', a: 'yes' }]);
    memory = result.memory;
    ids.push(result.id);
  }
  assert.equal(ids[0], 'u1');
  assert.equal(memory.custom.length, MEMORY_LIMITS.custom);
  assert.equal(memory.custom[0].name, '料理2');
  const again = remember(memory, { id: memory.custom[0].id }, [{ q: 'sweet', a: 'no' }]).memory;
  assert.deepEqual(again.custom[0].answers.sweet, [0, 1]);
  assert.throws(() => remember(memory, { name: '' }, []), /料理名/);
  assert.throws(() => remember(memory, { id: 'u999' }, []), /見つかりません/);
});

test('遊んだ回数と当てた回数、覚えた品数', () => {
  let memory = recordPlay(recordPlay(emptyMemory(), true), false);
  assert.equal(memory.plays, 2);
  assert.equal(memory.wins, 1);
  memory = remember(memory, { id: 'curry' }, [{ q: 'hot', a: 'yes' }]).memory;
  memory = remember(memory, { name: '煮しめ' }, [{ q: 'hot', a: 'yes' }]).memory;
  assert.equal(learnedCount(memory), 2);
});

test('覚えた答え方は、元の確率を2回分とみなして混ぜる', () => {
  const memory = remember(emptyMemory(), { id: 'curry' }, [{ q: 'spicy', a: 'no' }]).memory;
  const before = probabilityOf(model, 'curry', 'spicy');
  const after = probabilityOf(buildModel(memory), 'curry', 'spicy');
  assert.ok(Math.abs(after - (before * TUNING.priorWeight + 0) / (TUNING.priorWeight + 1)) < 1e-9);
});

test('学習の効果：カレーを「辛くない・スプーンを使わない」と思う人でも、覚えたあとは早く当たる', () => {
  // この人のカレー観：辛くない、スプーンでは食べない（はしで食べる）
  const quirks = { spicy: 'no', spoon: 'no', chopsticks: 'yes' };
  const answerFor = (dishModel) => (qid) => quirks[qid] ?? truthful(probabilityOf(dishModel, 'curry', qid));
  const isTarget = (id) => id === 'curry';
  let memory = emptyMemory();
  const before = playOut(buildModel(memory), { seed: 2, answerFor: answerFor(model), isTarget });
  for (let round = 0; round < 3; round++) {
    const played = playOut(buildModel(memory), { seed: 10 + round, answerFor: answerFor(model), isTarget });
    memory = remember(memory, { id: 'curry' }, played.game.answers).memory;
  }
  const after = playOut(buildModel(memory), { seed: 2, answerFor: answerFor(model), isTarget });
  assert.equal(after.ok, true);
  assert.ok(after.questions + after.game.rejected.length <= before.questions + before.game.rejected.length,
    `覚える前 ${before.questions}問・外れ${before.game.rejected.length} → 後 ${after.questions}問・外れ${after.game.rejected.length}`);
});

test('一覧に無い料理を教えると、同じ答え方をした次の占いで当てられる', () => {
  // 「ばあちゃんの煮しめ」：温かい・煮込む・しょうゆ・甘辛い・野菜たっぷり・はし・家で作る・お正月、甘いものではない
  const profile = { hot: 'yes', simmered: 'yes', soy: 'yes', amakara: 'yes', veggie: 'yes', chopsticks: 'yes', home: 'yes', newyear: 'yes',
    sweet: 'no', rice: 'no', noodle: 'no', bread: 'no', fried: 'no', meat: 'probablyNot', chicken: 'probably', tofu: 'probably', japan: 'yes' };
  const answerFor = (qid) => profile[qid] ?? 'unknown';
  let memory = emptyMemory();
  // 1回目：一覧に無いので外れて教わる
  const first = playOut(buildModel(memory), { seed: 4, answerFor, isTarget: () => false });
  assert.equal(first.ok, false);
  const taught = remember(memory, { name: 'ばあちゃんの煮しめ' }, first.game.answers, '2026-09-23');
  memory = taught.memory;
  // 2回目：覚えた料理が推測に出てくる
  const second = playOut(buildModel(memory), { seed: 5, answerFor, isTarget: (id) => id === taught.id });
  assert.equal(second.ok, true, '教えた料理が当たらない');
  // 1回教わっただけで、同じ答え方なら最初の推測に出る（教わった料理の答え方を強く効かせている）
  assert.equal(second.game.rejected.length, 0, `外れの推測 ${second.game.rejected.join(',')}`);
});
