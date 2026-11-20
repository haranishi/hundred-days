import assert from 'node:assert/strict';
import test from 'node:test';
import { BLOCK_RENDERERS } from '../../lib/blocks/index.js';
import { renderPage as renderPageRaw } from '../../lib/render.js';
import { stripWrap } from './f2e-wrap-helpers.mjs';
// 描画の結果に入る文節の折れ目（<wbr>・uxr-nb）は、文言の比較の邪魔になるので除く。折れ目そのものは f2e-wrap-*.test.mjs が見る。
const renderPage = (...args) => stripWrap(renderPageRaw(...args));
import { oneEach } from '../fixtures/states.js';

test('左寄せのヒーローは本文を読めるまま、背景にだけ図形を置く', () => {
  const page = oneEach('hero', 1, { title: '店の案内', cta: '予約する' });
  for (const mode of ['preview', 'export']) {
    const html = renderPage(page, { mode });
    assert.doesNotMatch(html, /uxr-art|uxr-hero-grid|<svg/);
    assert.match(html, /<i class="uxr-hero-shape" aria-hidden="true"><\/i><div class="uxr-hero-text">/);
    assert.match(html, /<h1\b[^>]*>店の案内<\/h1>/);
  }
  const { css } = BLOCK_RENDERERS.hero;
  assert.doesNotMatch(css, /uxr-art|repeating-linear-gradient/);
  assert.match(css, /\.uxr-hero\{[^}]*overflow:hidden/);
  const shape = css.match(/\.uxr-hero-shape\{([^}]+)\}/)?.[1] ?? '';
  for (const style of ['position:absolute', 'width:60%', 'border-radius:50%', 'pointer-events:none', 'var(--uxr-accent-soft)']) {
    assert.ok(shape.includes(style), style);
  }
  assert.match(css, /\.uxr-hero\.uxr-v1 \.uxr-hero-text\{[^}]*z-index:1/);
  assert.match(css, /\[data-theme="lively"\][^{]*\.uxr-hero-shape\{(?=[^}]*border:3px solid var\(--uxr-ink\))[^}]*box-shadow:/);
  assert.match(css, /\[data-theme="calm"\][^{]*\.uxr-hero-shape\{(?=[^}]*background:transparent)[^}]*border:1px solid/);
  assert.match(css, /\[data-theme="crisp"\][^{]*\.uxr-hero-shape\{[^}]*border-radius:var\(--uxr-radius-sm\)/);
  assert.match(css, /@container uxr \(min-width:640px\)\{\s*\.uxr-page \.uxr-hero\.uxr-v1/);
});

test('札つき一覧の理由は64pxの札と文章を一行に置く（札は常に左。左右に振らない）', () => {
  const page = oneEach('benefits', 2, { items: [{ title: '一つ目', text: '説明' }, { title: '二つ目' }] });
  const html = renderPage(page, { mode: 'export' });
  const { css } = BLOCK_RENDERERS.benefits;
  assert.doesNotMatch(html + css, /uxr-ben-(?:visual|emblem|tag)/);
  for (const [index, title] of ['一つ目', '二つ目'].entries()) {
    assert.ok(html.includes(`<div class="uxr-ben-body"><span class="uxr-ben-num" aria-hidden="true">0${index + 1}</span><h3 class="uxr-h3 uxr-ben-title">${title}</h3>`));
  }
  assert.match(css, /\.uxr-benefits\.uxr-v2 \.uxr-ben-item\{[^}]*display:flex/);
  assert.match(css, /\.uxr-benefits\.uxr-v2 \.uxr-ico-badge\{(?=[^}]*width:64px)[^}]*height:64px/);
  assert.match(css, /\.uxr-benefits\.uxr-v2 \.uxr-ico-badge \.uxr-ico\{(?=[^}]*width:30px)[^}]*height:30px/);
  assert.match(css, /\.uxr-ben-item\s*\+\s*\.uxr-ben-item\{[^}]*border-top:1px solid/);
  // 札だけが左右に振れて文字は左のまま、というちぐはぐを避ける（採点2周目の指摘）。札は常に左。
  assert.doesNotMatch(css, /row-reverse/);
  assert.doesNotMatch(css, /nth-child\(even\)/);
});

test('保証のシールは64pxの丸に収まり、説明だけなら文章だけを残す', () => {
  const page = oneEach('guarantee', 1, { text: '窓口でご相談ください。' });
  const html = renderPage(page, { mode: 'export' });
  assert.match(html, /窓口でご相談ください。/);
  assert.doesNotMatch(html, /uxr-guar-seal|<svg/);
  const { css } = BLOCK_RENDERERS.guarantee;
  assert.match(css, /\.uxr-guar-seal\{(?=[^}]*width:64px)(?=[^}]*height:64px)[^}]*border-radius:50%/);
  assert.doesNotMatch(css, /\.uxr-guar-seal::before/);
});

test('スタッフの頭文字の丸は広い幅でも72px以内に収まる', () => {
  const rules = [...BLOCK_RENDERERS.team.css.matchAll(/\.uxr-team-avatar\{([^}]+)\}/g)];
  const sizes = rules.flatMap(([, rule]) => [...rule.matchAll(/(?:width|height):(\d+)px/g)].map(m => Number(m[1])));
  assert.ok(sizes.length > 0);
  assert.ok(sizes.every(size => size <= 72), sizes.join(', '));
});
