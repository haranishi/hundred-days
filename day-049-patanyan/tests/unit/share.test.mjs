import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shareText, shareUrl, intentX, intentLine, modeLabel, cardFileName } from '../../lib/share.js';
import { SITE_URL } from '../../lib/site.js';
import { parseCourseParam, dateLabel, isValidDateKey } from '../../lib/date.js';

const today = 20260924;

test('共有文：設計書の例と一字一句同じ', () => {
  assert.equal(
    shareText({ mode: 'daily', dateKey: today, todayKey: today, score: 23, fish: 5 }),
    'ぱたにゃん｜きょうのコース 9/24 で23本くぐった🐟×5 #ぱたにゃん',
  );
});

test('共有文：いつでもモード・過去のコース・魚0匹', () => {
  assert.equal(shareText({ mode: 'any', dateKey: today, todayKey: today, score: 7, fish: 2 }), 'ぱたにゃん｜いつでもモードで7本くぐった🐟×2 #ぱたにゃん');
  assert.equal(shareText({ mode: 'daily', dateKey: 20260920, todayKey: today, score: 3, fish: 0 }), 'ぱたにゃん｜9/20 のコースで3本くぐった #ぱたにゃん');
});

test('挑戦リンク：きょうのコースは ?course= つき、いつでもモードは入口', () => {
  assert.equal(shareUrl({ mode: 'daily', dateKey: today }), 'https://hundred-days.pages.dev/day-049-patanyan/?course=20260924');
  assert.equal(shareUrl({ mode: 'any', dateKey: today }), SITE_URL);
});

test('X と LINE の投稿画面URL', () => {
  const text = 'ぱたにゃん｜きょうのコース 9/24 で23本くぐった🐟×5 #ぱたにゃん';
  const url = 'https://hundred-days.pages.dev/day-049-patanyan/?course=20260924';
  const x = new URL(intentX(text, url));
  assert.equal(x.origin + x.pathname, 'https://x.com/intent/post');
  assert.equal(x.searchParams.get('text'), text);
  assert.equal(x.searchParams.get('url'), url);
  const line = new URL(intentLine(url));
  assert.equal(line.origin + line.pathname, 'https://social-plugins.line.me/lineit/share');
  assert.equal(line.searchParams.get('url'), url);
});

test('モードの表示', () => {
  assert.equal(modeLabel({ mode: 'daily', dateKey: today, todayKey: today }), 'きょうのコース 9/24');
  assert.equal(modeLabel({ mode: 'daily', dateKey: 20260101, todayKey: today }), '1/1 のコース');
  assert.equal(modeLabel({ mode: 'any', dateKey: today, todayKey: today }), 'いつでもモード');
  assert.equal(cardFileName({ mode: 'daily', dateKey: today, score: 23 }), 'patanyan-20260924-23.png');
});

test('?course= は8桁の実在する日付だけを通す', () => {
  assert.equal(parseCourseParam('20260924'), 20260924);
  for (const bad of ['20260230', '2026924', 'abc', '20260924x', '', null, '19991231', '20261301']) {
    assert.equal(parseCourseParam(bad), null, String(bad));
  }
  assert.equal(isValidDateKey(20240229), true);
  assert.equal(dateLabel(20261105), '11/5');
});

test('公開URLは lib/site.js と index.html で食い違わない', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const pick = (re) => (html.match(re) || [])[1];
  assert.equal(pick(/<link rel="canonical" href="([^"]+)"/), SITE_URL);
  assert.equal(pick(/<meta property="og:url" content="([^"]+)"/), SITE_URL);
  assert.equal(pick(/<meta property="og:image" content="([^"]+)"/), `${SITE_URL}assets/og.png`);
});
