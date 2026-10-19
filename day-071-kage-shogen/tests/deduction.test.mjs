import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, PEOPLE } from '../lib/cases.js';
import {
  candidatesAfterReproduction, candidatesBeforeReproduction, heightFromLamp, judge, lampHeightOf, readingOf,
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
  [['tsubaki', 'kuga'], ['kuga']],
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

test('readingOf は灯りの読みと踏み台を含めた身長の計算を示す', () => {
  assert.equal(readingOf(CASES[0]), '灯り99cm。6割で割ると、身長は165cm。');
  assert.equal(readingOf(CASES[3]), '灯り125cm − 踏み台20cm ＝ 105cm。6割で割ると、身長は175cm。');
  assert.equal(readingOf(CASES[4]), '灯り108cm。6割で割ると、身長は180cm。');
  assert.equal(readingOf(CASES[0], 102), '灯り102cm。6割で割ると、身長は170cm。');
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
