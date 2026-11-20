import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStandaloneHtml } from '../../lib/export-html.js';
import { decodeState, parseViewHash, viewUrl } from '../../lib/codec.js';
import { BLOCK_SCHEMA, BLOCK_TYPES } from '../../lib/contract.js';
import { PAGE_CSS } from '../../lib/page-css.js';
import { renderPage } from '../../lib/render.js';
import { reduce } from '../../lib/state.js';
import { MINIMAL, RESERVE_SAMPLE, STRESS, oneEach } from '../fixtures/states.js';

test('1ファイルのHTMLに描画器の本文と同じCSSを収める', () => {
  for (const state of [MINIMAL, RESERVE_SAMPLE, STRESS]) {
    const html = buildStandaloneHtml(state);
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /<html lang="ja">/);
    assert.match(html, /<meta charset="utf-8">/i);
    assert.match(html, /<meta name="viewport" content="[^"]*width=device-width[^"]*">/);
    assert.match(html, /<meta name="generator" content="[^"]+">/);
    assert.equal(html.match(/<style>([\s\S]*?)<\/style>/)?.[1].trim(), PAGE_CSS.trim());
    assert.equal(html.match(/<body>([\s\S]*)<\/body>/)?.[1].trim(), renderPage(state, { mode: 'export' }));
  }
});

test('全バリエーションの書き出しにスクリプト・通信先・イベント属性・style属性がない', () => {
  const samples = [MINIMAL, RESERVE_SAMPLE, STRESS,
    ...BLOCK_TYPES.flatMap(type => BLOCK_SCHEMA[type].variants.map((_, v) => oneEach(type, v))),
  ];
  for (const state of samples) {
    const html = buildStandaloneHtml(state);
    assert.doesNotMatch(html, /<script\b|https?:|\son[a-z][\w:-]*\s*=|\sstyle\s*=/i);
    assert.doesNotMatch(html, /<(?:base|iframe|object|embed|link)\b|@import\b/i);
    assert.doesNotMatch(html, /\sdata-(?:path|block-id|ph)=/);
    for (const [, url] of html.matchAll(/\b(?:href|src|action)\s*=\s*"([^"]*)"/gi)) {
      assert.ok(url.startsWith('#'), url);
    }
    assert.equal(html.match(/<style>/g)?.length, 1);
  }
});

test('タイトルは空も含めてサイト名と一致し、閉じタグや引用符は文字として残る', () => {
  const title = name => buildStandaloneHtml({ ...MINIMAL, site: { name } });
  assert.match(title(''), /<title><\/title>/);
  assert.ok(title(MINIMAL.site.name).includes('<title>' + MINIMAL.site.name + '</title>'));
  const html = title('</title><script>&"\'--');
  assert.ok(html.includes('<title>&lt;/title&gt;&lt;script&gt;&amp;&quot;&#39;--</title>'));
  assert.equal(html.match(/<\/title>/gi)?.length, 1);
  assert.doesNotMatch(html, /<script/i);
});

test('冒頭のコメントでボタンとフォームの用途が分かり、サイト名の記号で閉じない', () => {
  const html = buildStandaloneHtml({ ...MINIMAL, site: { name: '店-->--名前' } });
  const comment = html.match(/^<!doctype html>\s*<!--([\s\S]*?)-->\s*<html/i)?.[1];
  assert.ok(comment);
  assert.match(comment, /ボタンの飛び先/);
  assert.match(comment, /フォーム/);
  assert.match(comment, /見本/);
  assert.doesNotMatch(comment, /--/);
});

test('編集したページを共有リンクから開いて書き出すと、同じHTMLになる', async () => {
  const edited = reduce(RESERVE_SAMPLE, { type: 'setSite', name: '</title><script>' });
  const link = await viewUrl(edited, '/recipe/');
  const opened = await decodeState(parseViewHash(link.slice(link.indexOf('#'))));
  assert.equal(opened.ok, true);
  const html = buildStandaloneHtml(opened.state);
  assert.equal(html, buildStandaloneHtml(edited));
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /<title>&lt;\/title&gt;&lt;script&gt;<\/title>/);
});
