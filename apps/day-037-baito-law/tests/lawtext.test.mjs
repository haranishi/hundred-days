import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiUrl, formatEnforcedOn, sourceUrl, textOf, toArticle } from '../lib/lawtext.js';
import { LAWS, TOPICS, findTopic, lawOf } from '../lib/topics.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));

test('第39条：見出し・条番号・法令名・施行日が取れる', () => {
  const a = toArticle(fixture('roukikou-39.json'));
  assert.equal(a.lawTitle, '労働基準法');
  assert.equal(a.lawNum, '昭和二十二年法律第四十九号');
  assert.equal(a.articleNum, '39');
  assert.equal(a.caption, '（年次有給休暇）');
  assert.equal(a.title, '第三十九条');
  assert.match(a.enforcedOn, /^\d{4}-\d{2}-\d{2}$/);
});

test('第39条：項が順番どおりに並ぶ', () => {
  const a = toArticle(fixture('roukikou-39.json'));
  assert.ok(a.paragraphs.length >= 7, `項の数が少ない: ${a.paragraphs.length}`);
  assert.deepEqual(a.paragraphs.map((p) => p.num).slice(0, 5), [1, 2, 3, 4, 5]);
  assert.match(a.paragraphs[0].text, /^使用者は、その雇入れの日から起算して六箇月間継続勤務し/);
  assert.match(a.paragraphs[0].text, /有給休暇を与えなければならない。$/);
});

test('第39条：号がある項は号を分けて持つ', () => {
  const a = toArticle(fixture('roukikou-39.json'));
  const withItems = a.paragraphs.find((p) => p.items.length);
  assert.ok(withItems, '号を持つ項が見つからない');
  assert.ok(withItems.items[0].title.length > 0);
  assert.ok(withItems.items[0].text.length > 0);
  /* 号の本文が項の本文に二重で入っていない */
  assert.ok(!withItems.text.includes(withItems.items[0].text));
});

test('第34条：休憩の条文が本文どおりに取れる', () => {
  const a = toArticle(fixture('roukikou-34.json'));
  assert.equal(a.caption, '（休憩）');
  assert.match(
    a.paragraphs[0].text,
    /^使用者は、労働時間が六時間を超える場合においては少くとも四十五分/
  );
});

test('第91条：短い条も1項として扱える', () => {
  const a = toArticle(fixture('roukikou-91.json'));
  assert.equal(a.caption, '（制裁規定の制限）');
  assert.equal(a.paragraphs.length, 1);
  assert.match(a.paragraphs[0].text, /減給の制裁/);
});

test('民法627条：別の法令でも同じ形で取れる', () => {
  const a = toArticle(fixture('minpou-627.json'));
  assert.equal(a.lawTitle, '民法');
  assert.equal(a.articleNum, '627');
  assert.match(a.paragraphs[0].text, /^当事者が雇用の期間を定めなかったときは/);
});

test('条文でないものを渡したら null', () => {
  assert.equal(toArticle(null), null);
  assert.equal(toArticle({}), null);
  assert.equal(toArticle({ law_full_text: { tag: 'Law', children: [] } }), null);
});

test('textOf：ルビの読み（Rt）は本文に混ぜない', () => {
  const node = {
    tag: 'Sentence',
    children: ['前段', { tag: 'Ruby', children: ['漢字', { tag: 'Rt', children: ['かんじ'] }] }, '後段'],
  };
  assert.equal(textOf(node), '前段漢字後段');
});

test('textOf：知らないタグでも中の文字列は落とさない', () => {
  const node = { tag: 'Sentence', children: [{ tag: 'QuoteStruct', children: [{ tag: 'Fig', children: ['図の中の字'] }] }] };
  assert.equal(textOf(node), '図の中の字');
});

test('施行日は人が読む形にする', () => {
  assert.equal(formatEnforcedOn('2026-07-17'), '2026年7月17日');
  assert.equal(formatEnforcedOn('2025-06-01'), '2025年6月1日');
  assert.equal(formatEnforcedOn(''), '');
  assert.equal(formatEnforcedOn('こわれた日付'), '');
});

test('APIのURLと原典のURLを組み立てる', () => {
  assert.equal(
    apiUrl('322AC0000000049', '39'),
    'https://laws.e-gov.go.jp/api/2/law_data/322AC0000000049?response_format=json&elm=Article_39'
  );
  assert.equal(
    sourceUrl('322AC0000000049', 'Mp-Ch_4-At_39'),
    'https://laws.e-gov.go.jp/law/322AC0000000049#Mp-Ch_4-At_39'
  );
  /* アンカーが無くても法令のページには着く */
  assert.equal(sourceUrl('322AC0000000049', ''), 'https://laws.e-gov.go.jp/law/322AC0000000049');
});

test('困りごとの一覧に抜けや重複がない', () => {
  assert.equal(TOPICS.length, 10);
  assert.equal(new Set(TOPICS.map((t) => t.key)).size, 10);
  assert.equal(new Set(TOPICS.map((t) => t.label)).size, 10);
  for (const t of TOPICS) {
    assert.ok(lawOf(t), `${t.key} の法令が LAWS にない`);
    assert.match(t.article, /^\d+$/);
    /* アンカーは章番号を含む形でしか当たらない（At_39 だけでは外れる） */
    assert.match(t.anchor, /^Mp-.*At_\d+$/);
    assert.ok(t.anchor.endsWith(`At_${t.article}`), `${t.key} のアンカーが条番号と合っていない`);
    /* 札の文言に法律用語を使わない */
    assert.ok(!t.label.includes('第'), `${t.key} の札が条番号を出している`);
  }
  assert.equal(findTopic('yukyu').article, '39');
  assert.equal(findTopic('ないキー'), null);
});

test('法令IDはe-Govの形（英数字）である', () => {
  for (const law of Object.values(LAWS)) assert.match(law.id, /^[0-9A-Z]+$/);
});
