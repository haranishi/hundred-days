import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, EPILOGUE } from '../lib/cases.js';
import { readingOf, refutation, suspectsOf } from '../lib/deduction.js';
import { longestKept, nowrapSegments } from '../lib/text.js';

// 画面に出る、数字を含みうる文をすべて集める（事件簿・読み・誤答の理由・容疑者の肩書き）。
function screenTexts() {
  const texts = [EPILOGUE.text];
  for (const item of CASES) {
    texts.push(item.summary, item.intro, item.witness.quote, item.sceneNote, item.footprint, item.coach, item.deductionHint,
      item.reveal, item.closing, readingOf(item), ...item.hints, ...item.clues.map((clue) => clue.text));
    if (item.coachNoGuide) texts.push(item.coachNoGuide);
    for (const suspect of suspectsOf(item)) {
      texts.push(`${suspect.role}・${suspect.height}cm`, suspect.statement);
      if (suspect.id !== item.culprit) texts.push(refutation(item, suspect));
    }
  }
  return texts;
}

// 折り返してよい位置（断片の境目と、keep でない断片の中の文字の境目）の直後の文字を集める。
function lineStartCandidates(text) {
  const starts = [];
  let offset = 0;
  for (const segment of nowrapSegments(text)) {
    const chars = Array.from(segment.text);
    if (offset > 0) starts.push({ at: offset, rest: segment.text });
    if (!segment.keep) for (let i = 1; i < chars.length; i += 1) starts.push({ at: offset + i, rest: chars.slice(i).join('') });
    offset += chars.length;
  }
  return starts;
}

test('断片をつなぐと元の文に戻る（textContent は変わらない）', () => {
  for (const text of [...screenTexts(), '', 'ABC', '合計 15 / 15', '★−1']) {
    assert.equal(nowrapSegments(text).map((segment) => segment.text).join(''), text, text);
  }
});

test('数字の直前・単位の途中・＝と−の前では折り返さない（全画面の文）', () => {
  for (const text of screenTexts()) {
    for (const { rest } of lineStartCandidates(text)) {
      assert.doesNotMatch(rest, /^[0-9]/, `${text}：数字が行頭に来る`);
      assert.doesNotMatch(rest, /^cm/, `${text}：単位が行頭に来る`);
      assert.doesNotMatch(rest, /^ ?[＝−]/, `${text}：式の記号が行頭に来る`);
    }
  }
});

test('語＋数字＋単位をひとまとまりにする', () => {
  const kept = (text) => nowrapSegments(text).filter((segment) => segment.keep).map((segment) => segment.text);
  assert.deepEqual(kept('犯人の身長175cmだ'), ['身長175cm']);
  assert.ok(kept('身長は165cm。').includes('長は165cm。'));
  assert.ok(kept('壁から260cm、壁の左端').includes('から260cm、'));
  assert.ok(kept('犯人は、20cmの踏み台').includes('、20cmの'));
  assert.ok(kept('家政婦・150cm').includes('婦・150cm'));
  // 式は「＝」の前後で割れない。「−」は前の語につく（「− 踏み台」の前の空白のうしろでは割れてよい）。
  assert.deepEqual(kept('灯り125cm − 踏み台20cm ＝ 105cm。'), ['灯り125cm −', 'み台20cm ＝ 105cm。']);
  // 助詞は決まった語だけ（動詞の途中まで巻き込まない）。
  assert.ok(kept('灯りの高さ102cmでそろった').includes('高さ102cmで'));
  assert.ok(kept('1cmずつ動かす').includes('1cmずつ'));
  assert.ok(kept('星2つ（ヒント）').includes('星2つ'));
});

test('数字の無い文は、ひとつの普通の断片のまま', () => {
  assert.deepEqual(nowrapSegments('灯りが、だいぶ高い。下げてみよう。'), [{ text: '灯りが、だいぶ高い。下げてみよう。', keep: false }]);
  assert.deepEqual(nowrapSegments(''), []);
});

test('つなぐ範囲は20字まで（幅360でも1行に収まり、はみ出さない）', () => {
  for (const text of screenTexts()) assert.ok(longestKept(text) <= 20, `${text}：${longestKept(text)}字`);
});
