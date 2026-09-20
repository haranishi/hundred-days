import assert from 'node:assert/strict';
import { test } from 'node:test';

import { APP_TITLE, intentHref, intentText, modeLabel, postText, scoreLine, shareUrl, townUnit } from '../lib/share-text.js';

const BASE = 'https://hundred-days.pages.dev/day-031-shape-where/';

test('東京都だけ「市区町村」と書く', () => {
  assert.equal(townUnit('東京都'), '市区町村');
  assert.equal(townUnit('秋田県'), '市町村');
  assert.equal(townUnit(''), '市町村');
});

test('3つのモードの言い方', () => {
  assert.equal(modeLabel({ mode: 'pref' }), '都道府県のシルエットクイズ');
  assert.equal(modeLabel({ mode: 'town', prefName: '秋田県' }), '秋田県の市町村クイズ');
  assert.equal(modeLabel({ mode: 'town', prefName: '東京都' }), '東京都の市区町村クイズ');
  assert.equal(modeLabel({ mode: 'town-all' }), '全国の市区町村クイズ');
});

test('投稿文の1行目にはアプリ名と点数が入る', () => {
  assert.equal(scoreLine({ mode: 'pref', score: 8.5 }), 'この形、どこ？ 都道府県のシルエットクイズ 8.5 / 10');
  assert.equal(scoreLine({ mode: 'town', prefName: '秋田県', score: 9 }), 'この形、どこ？ 秋田県の市町村クイズ 9 / 10');
  assert.equal(scoreLine({ mode: 'town-all', score: 0 }), 'この形、どこ？ 全国の市区町村クイズ 0 / 10');
  assert.ok(scoreLine({ mode: 'pref', score: 1 }).startsWith(APP_TITLE));
});

test('市区町村モードだけ、URLに県を付けて持ち運ぶ', () => {
  assert.equal(shareUrl({ mode: 'town', prefCode: '05', base: BASE }), `${BASE}?p=05`);
  assert.equal(shareUrl({ mode: 'pref', base: BASE }), BASE);
  assert.equal(shareUrl({ mode: 'town-all', base: BASE }), BASE);
  // 県を選んで遊んだあとに別モードで投稿しても、県は付いてこない
  assert.equal(shareUrl({ mode: 'pref', prefCode: '05', base: BASE }), BASE);
  assert.equal(shareUrl({ mode: 'town-all', prefCode: '05', base: BASE }), BASE);
  // 手元で ?seed= 付きのまま遊んだときに、種を配らない
  assert.equal(shareUrl({ mode: 'town', prefCode: '05', base: `${BASE}?seed=1#x` }), `${BASE}?p=05`);
});

test('コピー用は1行目・URL・ハッシュタグの3行', () => {
  const text = postText({ mode: 'town', prefName: '秋田県', score: 8.5, url: `${BASE}?p=05` });
  assert.deepEqual(text.split('\n'), [
    'この形、どこ？ 秋田県の市町村クイズ 8.5 / 10',
    `${BASE}?p=05`,
    '#100日チャレンジ'
  ]);
});

test('Xに渡す本文にはURLを入れない（url= で別に渡すため）', () => {
  const text = intentText({ mode: 'pref', score: 7 });
  assert.equal(text, 'この形、どこ？ 都道府県のシルエットクイズ 7 / 10\n#100日チャレンジ');
  assert.ok(!text.includes('http'));
});

test('Xの投稿画面のURL', () => {
  const href = intentHref({ text: 'あ い', url: `${BASE}?p=05` });
  assert.ok(href.startsWith('https://x.com/intent/post?text='));
  assert.ok(href.includes(encodeURIComponent(`${BASE}?p=05`)));
  assert.equal(decodeURIComponent(new URL(href).searchParams.get('text')), 'あ い');
});
