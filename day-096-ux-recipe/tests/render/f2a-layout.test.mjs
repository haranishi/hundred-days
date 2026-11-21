import assert from 'node:assert/strict';
import test from 'node:test';
import { BASE_CSS } from '../../lib/page-base.js';
import { BLOCK_RENDERERS } from '../../lib/blocks/index.js';
import { renderPage } from '../../lib/render.js';
import { oneEach } from '../fixtures/states.js';

// 個別の幅の規則を取り出し、別の幅で偶然同じ指定をしていても取り違えない。
function atWidth(css, condition) {
  const query = `@container uxr (${condition}){`;
  const start = css.indexOf(query);
  assert.notEqual(start, -1, query);
  return css.slice(start + query.length).split(/\n\s*\}/, 1)[0];
}

test('ページ全体は日本語の禁則と文節を使い、見出しと本文それぞれの行末を整える', () => {
  assert.match(BASE_CSS, /\.uxr-page\{[^}]*line-break:strict/);
  assert.match(BASE_CSS, /@supports\s*\(word-break:\s*auto-phrase\)\s*\{\s*\.uxr-page\{[^}]*word-break:auto-phrase/);
  const selectorsFor = wrap => [...BASE_CSS.matchAll(/:where\(([^)]+)\)\{[^{}]*?text-wrap:(balance|pretty)[^{}]*\}/g)]
    .filter(([, , value]) => value === wrap).flatMap(([, selectors]) => selectors.split(',').map(s => s.trim()));
  for (const selector of ['h1', 'h2', 'h3', '.uxr-h1wrap', '.uxr-h1', '.uxr-h2', '.uxr-h3']) {
    assert.ok(selectorsFor('balance').includes(selector), selector);
  }
  for (const selector of ['p', 'li', 'td', 'th', '.uxr-lead', '.uxr-note', '.uxr-lim-text']) {
    assert.ok(selectorsFor('pretty').includes(selector), selector);
  }
});

test('比較表は行見出しだけに幅を取り、420px以下で値の左右の余白を減らす', () => {
  const html = renderPage(oneEach('compare', 0, { items: [{ label: '首に巻くと', left: '端を襟に入れる', right: '前でひと結び' }] }), { mode: 'export' });
  assert.match(html, /<colgroup><col class="uxr-cmp-col-label"\s*\/><col span="2"\s*\/><\/colgroup>/);
  const { css } = BLOCK_RENDERERS.compare;
  assert.match(css, /\.uxr-cmp-col-label\{[^}]*26%/);
  assert.match(atWidth(css, 'max-width:336px'), /\.uxr-cmp-col-label\{width:5\.5em\}/);
  assert.match(atWidth(css, 'min-width:560px'), /\.uxr-cmp-col-label\{width:9em\}/);
  const cells = css.match(/\.uxr-compare\.uxr-v0 th,\s*\.uxr-page \.uxr-compare\.uxr-v0 td\{([^}]+)\}/)[1];
  assert.match(cells, /text-wrap:balance/);
  assert.match(cells, /word-break:auto-phrase/);
  assert.match(atWidth(css, 'max-width:420px'), /\bth,\s*\.uxr-page \.uxr-compare\.uxr-v0 td\{padding:\d+px [1-7]px/);
});

test('期限と残り枠は480px以下だけ数字より下に説明を一列、全幅で置く', () => {
  const { css } = BLOCK_RENDERERS.limited;
  const narrow = atWidth(css, 'max-width:480px');
  assert.match(narrow, /\.uxr-lim-bar,\s*\.uxr-page [^{]*\.uxr-lim-badge\{(?=[^}]*display:grid)[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(narrow, /\.uxr-lim-main\{display:contents\}/);
  assert.match(narrow, /\.uxr-lim-text\{(?=[^}]*order:1)[^}]*justify-self:stretch/);
  assert.match(narrow, /\.uxr-lim-badge\{[^}]*width:100%/);
  assert.doesNotMatch(css.replace(narrow, ''), /\.uxr-lim-text\{[^}]*order:1/);
});

test('横の手順は720pxから折り返した段の高さを揃え、説明のカードを行の下端まで広げる', () => {
  const { css } = BLOCK_RENDERERS.steps;
  const wide = atWidth(css, 'min-width:720px');
  assert.match(wide, /\.uxr-steps\.uxr-v1 \.uxr-steps-list\{[^}]*grid-auto-rows:1fr/);
  assert.match(wide, /\.uxr-steps\.uxr-v1 \.uxr-step-body\{[^}]*align-self:stretch/);
  assert.match(css, /\.uxr-steps\.uxr-v1 \.uxr-step-item\{[^}]*grid-template-rows:auto 1fr/);
});
