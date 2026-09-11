import test from 'node:test';
import assert from 'node:assert/strict';
import { kanjiNumber, kanjiYear, paperDate, issueLabel, jstParts } from '../lib/kanji.js';
import { stripSiteSuffix, clipHeadline, leadSentences, toArticle, publishedLabel, HEADLINE_MAX } from '../lib/meta.js';

test('kanjiNumber: 位取りのある1〜99', () => {
  assert.equal(kanjiNumber(1), '一');
  assert.equal(kanjiNumber(10), '十');
  assert.equal(kanjiNumber(12), '十二');
  assert.equal(kanjiNumber(20), '二十');
  assert.equal(kanjiNumber(35), '三十五');
  assert.equal(kanjiNumber(99), '九十九');
});

test('kanjiYear: 年は1桁ずつ並べる', () => assert.equal(kanjiYear(2026), '二〇二六'));

test('paperDate: 日本時間で出す（CIのUTCに引きずられない）', () => {
  // UTCでは9月11日15時＝日本時間では9月12日0時
  assert.equal(paperDate(new Date('2026-09-11T15:30:00Z')), '二〇二六年九月十二日（土）');
});

test('jstParts: 日付の境目', () => {
  assert.deepEqual(jstParts(new Date('2026-09-11T14:59:00Z')), { year: 2026, month: 9, day: 11, weekday: '金' });
});

test('issueLabel: Day番号が号数になる', () => assert.equal(issueLabel(35), '第三十五号'));

test('stripSiteSuffix: 末尾の媒体名だけを落とす', () => {
  assert.equal(stripSiteSuffix('能登の被災地でいま起きていること｜NHKニュース', 'NHKニュース'), '能登の被災地でいま起きていること');
  assert.equal(stripSiteSuffix('使い方 - Zenn', 'Zenn'), '使い方');
});

test('stripSiteSuffix: 先頭の媒体名も落とす', () => {
  assert.equal(stripSiteSuffix('Zenn｜エンジニアのための情報共有', 'Zenn'), 'エンジニアのための情報共有');
});

test('stripSiteSuffix: 語中のハイフンでは切らない', () => {
  assert.equal(stripSiteSuffix('e-Stat の使い方', 'Zenn'), 'e-Stat の使い方');
  assert.equal(stripSiteSuffix('e-Stat の使い方 - Zenn', 'Zenn'), 'e-Stat の使い方');
});

test('stripSiteSuffix: 媒体名が無ければそのまま', () => {
  assert.equal(stripSiteSuffix('見出しだけ', ''), '見出しだけ');
});

test('clipHeadline: 20字で切る', () => {
  const long = 'あ'.repeat(30);
  assert.equal([...clipHeadline(long)].length, HEADLINE_MAX);
  assert.ok(clipHeadline(long).endsWith('…'));
  assert.equal(clipHeadline('短い見出し'), '短い見出し');
});

test('leadSentences: 2文まで', () => {
  assert.equal(leadSentences('一文目です。二文目です。三文目です。'), '一文目です。二文目です。');
  assert.equal(leadSentences('句点のない説明文'), '句点のない説明文');
});

test('leadSentences: 長すぎる1文は切る', () => {
  const lead = leadSentences(`${'あ'.repeat(200)}。`);
  assert.ok([...lead].length <= 120);
  assert.ok(lead.endsWith('…'));
});

test('publishedLabel: 漢数字にする', () => {
  assert.equal(publishedLabel('2026-09-10T09:00:00+09:00'), '二〇二六年九月十日');
  assert.equal(publishedLabel('こわれた日付'), '');
  assert.equal(publishedLabel(null), '');
});

test('toArticle: 中継の戻り値から紙面の1本を組み立てる', () => {
  const article = toArticle({
    title: 'テスト記事｜ITmedia NEWS',
    lead: 'あ。い。う。',
    site: 'ITmedia NEWS',
    host: 'itmedia.co.jp',
    image: 'https://example.com/a.png',
    publishedAt: '2026-09-11T10:00:00+09:00',
    canonical: 'https://example.com/article'
  });
  assert.equal(article.headline, 'テスト記事');
  assert.equal(article.lead, 'あ。い。');
  assert.equal(article.url, 'https://example.com/article');
  assert.equal(article.publishedAt, '二〇二六年九月十一日');
});

test('toArticle: 媒体名が無ければホスト名を使う', () => {
  assert.equal(toArticle({ title: 'x', host: 'example.com' }).site, 'example.com');
});
