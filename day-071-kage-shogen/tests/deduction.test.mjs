import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, PEOPLE } from '../lib/cases.js';
import {
  candidatesAfterReproduction, candidatesBeforeReproduction, heightFromLamp, judge, lampHeightOf, matchingByHeight, readingOf,
} from '../lib/deduction.js';

test('灯りと身長は6割と踏み台で計算し、往復して元に戻る', () => {
  assert.equal(lampHeightOf(165), 99);
  assert.equal(lampHeightOf(175, 20), 125);
  assert.equal(heightFromLamp(99), 165);
  assert.equal(heightFromLamp(125, 20), 175);
  for (const person of Object.values(PEOPLE)) {
    for (const stool of [0, 20]) assert.equal(heightFromLamp(lampHeightOf(person.height, stool), stool), person.height);
  }
});

const candidates = [
  [['saeki', 'moriyama'], ['moriyama']],
  [['kuga', 'uno'], ['uno']],
  [['saeki', 'kuga'], ['kuga']],
  [['kiritani', 'hasumi'], ['kiritani']],
  [['hiiragi', 'hasumi'], ['hiiragi']],
];

for (const [index, caseDef] of CASES.entries()) {
  test(`${caseDef.id}: アリバイで2人が残り、再現後は犯人だけになる`, () => {
    assert.deepEqual(candidatesBeforeReproduction(caseDef).map((person) => person.id), candidates[index][0]);
    assert.deepEqual(candidatesAfterReproduction(caseDef).map((person) => person.id), candidates[index][1]);
    for (const delta of [-0.5, 0.5]) {
      assert.deepEqual(candidatesAfterReproduction(caseDef, caseDef.stage.lamp.solution + delta).map((person) => person.id), [caseDef.culprit]);
    }
    assert.deepEqual(candidatesAfterReproduction(caseDef, caseDef.stage.lamp.solution + 0.51), []);
  });

  test(`${caseDef.id}: 犯人には closing、未知のidには RangeError を返す`, () => {
    assert.deepEqual(judge(caseDef, caseDef.culprit), { correct: true, suspectId: caseDef.culprit, message: caseDef.closing });
    assert.throws(() => judge(caseDef, 'unknown'), RangeError);
    const absent = Object.keys(PEOPLE).find((id) => !caseDef.suspects.some((suspect) => suspect.id === id));
    assert.throws(() => judge(caseDef, absent), RangeError);
  });
}

test('readingOf は、夜1だけ身長までの計算を見せ、夜2以降は灯りの高さまでにする', () => {
  assert.equal(readingOf(CASES[0]), '灯り99cm。6割で割ると、身長は165cm。');
  assert.equal(readingOf(CASES[0], 102), '灯り102cm。6割で割ると、身長は170cm。');
  assert.equal(readingOf(CASES[1]), '灯りの高さは96cm。これを提げた人の身長は？');
  assert.equal(readingOf(CASES[2]), '灯りの高さは102cm。これを提げた人の身長は？');
  assert.equal(readingOf(CASES[3]), '灯りの高さは125cm。これを提げた人の身長は？');
  assert.equal(readingOf(CASES[4]), '灯りの高さは108cm。これを提げた人の身長は？');
  assert.deepEqual(CASES.map((item) => item.showsHeight === true), [true, false, false, false, false]);
});

test('夜3と夜5は、灯りの高さに合う身長の人が2人いて、アリバイが決め手になる。ほかの夜は身長だけで決まる', () => {
  const ambiguous = [];
  for (const item of CASES) {
    const byHeight = matchingByHeight(item).map((person) => person.id);
    const afterAlibi = candidatesAfterReproduction(item).map((person) => person.id);
    assert.deepEqual(afterAlibi, [item.culprit], item.id);
    assert.ok(byHeight.includes(item.culprit), item.id);
    if (byHeight.length === 2) {
      ambiguous.push(item.id);
      const other = byHeight.find((id) => id !== item.culprit);
      // 同じ身長のもう1人は、アリバイだけが外す（身長では外れない）。
      assert.ok(item.clues.some((clue) => clue.rulesOut?.includes(other)), `${item.id}: ${other}を外すアリバイ`);
      assert.equal(matchingByHeight(item).length, 2);
      // アリバイは、同じ身長の人を外す。身長で外れる人は、アリバイに頼らない。
      const ruledOut = item.clues.flatMap((clue) => clue.rulesOut ?? []);
      assert.deepEqual(ruledOut, [other], item.id);
    } else {
      assert.deepEqual(byHeight, [item.culprit], item.id);
    }
  }
  assert.deepEqual(ambiguous, ['bag', 'umbrella']);
});

test('同じ身長の2人のうちアリバイで外れる人を選ぶと、アリバイの文を返す', () => {
  assert.equal(judge(CASES[2], 'tsubaki').message, `椿 みおは違う。${CASES[2].clues.find((clue) => clue.rulesOut).text}`);
  assert.equal(judge(CASES[4], 'shirase').message, `白瀬 あきらは違う。${CASES[4].clues.find((clue) => clue.rulesOut).text}`);
  assert.equal(PEOPLE.tsubaki.height, PEOPLE.kuga.height);
  assert.equal(PEOPLE.shirase.height, PEOPLE.hiiragi.height);
});

test('誤答には、その人を外すアリバイを返す', () => {
  const caseDef = CASES[0];
  const clue = caseDef.clues.find((item) => item.rulesOut?.includes('hinata'));
  assert.deepEqual(judge(caseDef, 'hinata'), {
    correct: false, suspectId: 'hinata', message: `日向 悠は違う。${clue.text}`,
  });
});

test('身長が合わない誤答には、灯りの高さと踏み台の計算を返す', () => {
  assert.deepEqual(judge(CASES[0], 'saeki'), {
    correct: false, suspectId: 'saeki',
    message: '佐伯 ふみは違う。身長150cmの6割は90cm。再現した灯りは99cmで、合わない。',
  });
  assert.deepEqual(judge(CASES[3], 'hasumi'), {
    correct: false, suspectId: 'hasumi',
    message: '蓮見 渉は違う。身長188cmの6割は約113cm。踏み台の20cmを足すと約133cm。再現した灯りは125cmで、合わない。',
  });
});
