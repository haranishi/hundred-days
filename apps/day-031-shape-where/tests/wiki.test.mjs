import assert from 'node:assert/strict';
import { test } from 'node:test';

import { articleUrl, createWikiReader, isThumbnailHost, pickFields, shouldTryNext, summaryUrl, titleCandidates, trimExtract } from '../lib/wiki.js';

const summary = (over = {}) => ({
  type: 'standard',
  title: '美郷町',
  extract: '美郷町（みさとちょう）は、秋田県の内陸南部にある町。',
  thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/misato.jpg' },
  content_urls: { desktop: { page: 'https://ja.wikipedia.org/wiki/%E7%BE%8E%E9%83%B7%E7%94%BA' } },
  ...over
});

test('記事名の候補は、都道府県が1つ・市区町村が2つ', () => {
  assert.deepEqual(titleCandidates({ name: '秋田県' }, ''), ['秋田県']);
  assert.deepEqual(titleCandidates({ name: '秋田県' }, '秋田県'), ['秋田県']);
  assert.deepEqual(titleCandidates({ name: '美郷町' }, '秋田県'), ['美郷町', '美郷町 (秋田県)']);
  assert.deepEqual(titleCandidates({ name: '' }, '秋田県'), []);
});

test('曖昧さ回避と、県名が出てこない要約は次の候補へ回す', () => {
  assert.equal(shouldTryNext(summary({ type: 'disambiguation' }), '秋田県', 1), true);
  assert.equal(shouldTryNext(summary({ extract: '美郷町は、宮城県にある町。' }), '秋田県', 1), true);
  assert.equal(shouldTryNext(summary(), '秋田県', 1), false);
  assert.equal(shouldTryNext(null, '秋田県', 1), true);
});

test('候補が尽きたら次を試さない', () => {
  assert.equal(shouldTryNext(summary({ type: 'disambiguation' }), '秋田県', 0), false);
  assert.equal(shouldTryNext(null, '秋田県', 0), false);
});

test('都道府県は県名で絞り込まない', () => {
  assert.equal(shouldTryNext(summary({ extract: '日本の東北地方にある県。' }), '', 1), false);
});

test('要約は110字で切って「…」を足す', () => {
  assert.equal(trimExtract('あ'.repeat(110)), 'あ'.repeat(110));
  assert.equal(trimExtract('あ'.repeat(111)), `${'あ'.repeat(110)}…`);
  assert.equal(trimExtract('  改行や\n連続する   空白は  1つに '), '改行や 連続する 空白は 1つに');
  assert.equal(trimExtract(''), '');
  assert.equal(trimExtract(null), '');
  assert.equal(trimExtract('あいうえお', 3), 'あいう…');
});

test('使うのは題・要約・写真・記事URLだけ', () => {
  const picked = pickFields(summary({ description: '捨てる項目' }));
  assert.deepEqual(Object.keys(picked).sort(), ['extract', 'thumbnail', 'title', 'url']);
  assert.equal(picked.title, '美郷町');
  assert.equal(picked.url, 'https://ja.wikipedia.org/wiki/%E7%BE%8E%E9%83%B7%E7%94%BA');
  assert.equal(pickFields(summary({ extract: '' })), null);
  assert.equal(pickFields(null), null);
});

test('写真はウィキメディアの配信元だけを使う（CSPで読めないため）', () => {
  const thumb = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/b/c.jpg/330px-c.jpg';
  assert.equal(pickFields(summary({ thumbnail: { source: thumb } })).thumbnail, thumb);
  assert.equal(isThumbnailHost('https://upload.wikimedia.org/wikipedia/commons/a.jpg'), true);
  assert.equal(isThumbnailHost('https://example.com/a.jpg'), false);
  assert.equal(isThumbnailHost(null), false);
  assert.equal(pickFields(summary({ thumbnail: { source: 'https://example.com/a.jpg' } })).thumbnail, '');
  assert.equal(pickFields(summary({ thumbnail: undefined })).thumbnail, '');
});

test('端点のURLは記事名をエスケープして組み立てる', () => {
  assert.equal(summaryUrl('美郷町 (秋田県)'), 'https://ja.wikipedia.org/api/rest_v1/page/summary/%E7%BE%8E%E9%83%B7%E7%94%BA%20(%E7%A7%8B%E7%94%B0%E7%9C%8C)');
  assert.equal(articleUrl('秋田県'), 'https://ja.wikipedia.org/wiki/%E7%A7%8B%E7%94%B0%E7%9C%8C');
});

const jsonResponse = (body, ok = true) => ({ ok, json: async () => body });

test('曖昧さ回避に当たったら2番目の候補で取り直す', async () => {
  const calls = [];
  const reader = createWikiReader({
    fetchImpl: async (url) => {
      calls.push(decodeURIComponent(url));
      return jsonResponse(calls.length === 1 ? summary({ type: 'disambiguation' }) : summary());
    }
  });
  const info = await reader.read({ name: '美郷町' }, '秋田県');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].endsWith('美郷町 (秋田県)'));
  assert.equal(info.title, '美郷町');
});

test('同じ記事は1ラウンドで一度しか取りにいかない', async () => {
  let calls = 0;
  const reader = createWikiReader({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(summary());
    }
  });
  await reader.read({ name: '美郷町' }, '秋田県');
  await reader.read({ name: '美郷町' }, '秋田県');
  assert.equal(calls, 1);
});

test('同名の町でも、県が違えば別の記事を取りにいく', async () => {
  const calls = [];
  const reader = createWikiReader({
    fetchImpl: async (url) => {
      const title = decodeURIComponent(url);
      calls.push(title);
      const pref = title.includes('島根県') || calls.length > 1 ? '島根県' : '秋田県';
      return jsonResponse(summary({ extract: `美郷町は、${pref}にある町。` }));
    }
  });
  const akita = await reader.read({ name: '美郷町' }, '秋田県');
  const shimane = await reader.read({ name: '美郷町' }, '島根県');
  assert.equal(calls.length, 2, '名前だけを鍵にすると2件目に1件目の記事が付く');
  assert.equal(akita.extract, '美郷町は、秋田県にある町。');
  assert.equal(shimane.extract, '美郷町は、島根県にある町。');
});

test('県名付きの候補が 404 でも、1件目の使える要約は捨てない', async () => {
  const calls = [];
  const reader = createWikiReader({
    fetchImpl: async (url) => {
      calls.push(decodeURIComponent(url));
      // 1件目＝県名の出てこない通常記事、2件目＝404
      return calls.length === 1 ? jsonResponse(summary({ extract: '美郷町は日本の町である。' })) : jsonResponse({}, false);
    }
  });
  const info = await reader.read({ name: '美郷町' }, '秋田県');
  assert.equal(calls.length, 2);
  assert.equal(info?.extract, '美郷町は日本の町である。');
});

test('取れなければ null を返すだけで、例外にしない', async () => {
  const failing = createWikiReader({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(await failing.read({ name: '秋田県' }, ''), null);

  const notFound = createWikiReader({ fetchImpl: async () => jsonResponse({}, false) });
  assert.equal(await notFound.read({ name: '秋田県' }, ''), null);

  const empty = createWikiReader({ fetchImpl: async () => jsonResponse(summary({ extract: '   ' })) });
  assert.equal(await empty.read({ name: '秋田県' }, ''), null);
});

test('候補を使い切ったら、県名が出てこない要約でも使う', async () => {
  const reader = createWikiReader({
    fetchImpl: async () => jsonResponse(summary({ extract: '美郷町は日本の町である。' }))
  });
  const info = await reader.read({ name: '美郷町' }, '秋田県');
  assert.equal(info.extract, '美郷町は日本の町である。');
});

test('最後まで曖昧さ回避なら何も出さない', async () => {
  const reader = createWikiReader({ fetchImpl: async () => jsonResponse(summary({ type: 'disambiguation' })) });
  assert.equal(await reader.read({ name: '美郷町' }, '秋田県'), null);
});
