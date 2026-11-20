import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, renderBlock } from '../../lib/render.js';
import { makeCtx } from '../../lib/render-kit.js';
import { PAGE_CSS } from '../../lib/page-css.js';
import { WRAP_CSS } from '../../lib/page-wrap-css.js';
import { oneEach } from '../fixtures/states.js';
import { stripWrap } from './f2e-wrap-helpers.mjs';

test('プレビューと書き出しの本文に文節の境目が入り、元の部品と編集用の属性を復元できる', () => {
  const title = '読みたい資料を棚から探します。';
  const page = oneEach('hero', 0, { title, lead: '定員は12人です。' });
  page.site.name = title;
  for (const mode of ['preview', 'export']) {
    const html = renderPage(page, { mode });
    const block = renderBlock(page.blocks[0], makeCtx(page, mode));
    assert.ok(html.includes('読みたい<wbr>資料を<wbr>棚から<wbr>探します。'));
    assert.ok(html.includes('<wbr><span class="uxr-nb">12人</span><wbr>'));
    assert.ok(block.includes(title));
    assert.ok(stripWrap(html).includes(block));
    assert.equal(html.includes('data-path="site.name"'), mode === 'preview');
  }
});

test('ページ末尾のCSSで自動分節を上書きし、保護した語だけを一行に収める', () => {
  const phrase = PAGE_CSS.lastIndexOf('word-break:auto-phrase');
  assert.ok(phrase >= 0);
  assert.ok(PAGE_CSS.lastIndexOf('word-break:keep-all') > phrase);
  assert.ok(PAGE_CSS.endsWith(WRAP_CSS));
  assert.match(WRAP_CSS, /\.uxr-page\s*\{\s*word-break:keep-all;overflow-wrap:anywhere;line-break:strict;?\s*\}/);
  assert.match(WRAP_CSS, /\.uxr-page \.uxr-nb\s*\{\s*white-space:nowrap;?\s*\}/);
  // 文章の要素は break-word（pretty/balance が anywhere の途中を選ぶのを防ぐ）。容れ物の anywhere は残す。
  assert.match(WRAP_CSS, /:where\([^)]*\bp\b[^)]*\)\s*\{\s*overflow-wrap:break-word;?\s*\}/);
});
