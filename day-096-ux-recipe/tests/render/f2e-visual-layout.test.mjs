import assert from 'node:assert/strict';
import test from 'node:test';
import { BLOCK_RENDERERS } from '../../lib/blocks/index.js';
import { BASE_CSS } from '../../lib/page-base.js';
import { buildFromRecipe } from '../../lib/recipes.js';
import { renderPage } from '../../lib/render.js';

function rule(css, selector) {
  const body = css.split(selector + '{')[1]?.split('}')[0];
  assert.ok(body, selector);
  return body;
}

test('問い合わせのヒーローは右上に線だけを描き、他のテーマの飾りは円に収める', () => {
  const html = renderPage(buildFromRecipe('inquire'), { mode: 'export' });
  assert.match(html, /data-theme="crisp"/);
  assert.match(html, /<i class="uxr-hero-shape" aria-hidden="true"><\/i><div class="uxr-hero-text">/);
  const css = BLOCK_RENDERERS.hero.css;
  const shape = '.uxr-hero.uxr-v1 .uxr-hero-shape';
  assert.match(rule(css, '.uxr-page ' + shape), /aspect-ratio:1;[^}]*border-radius:50%/);
  const crisp = rule(css, '.uxr-page[data-theme="crisp"] ' + shape);
  assert.match(crisp, /background:(?:none|transparent)(?:;|$)/);
  assert.match(crisp, /border-block:1px solid var\(--uxr-accent-line\)/);
  assert.match(crisp, /transform:rotate\(/);
  for (const theme of ['soft', 'lively', 'calm']) {
    const overrides = css.split(`.uxr-page[data-theme="${theme}"] ${shape}{`)[1]?.split('}')[0] ?? '';
    assert.doesNotMatch(overrides, /border-radius:(?!50%)/, theme);
  }
});

test('特徴の札は狭い幅でも広い幅でも、偶数行を含めて本文の左にある', () => {
  const css = BLOCK_RENDERERS.benefits.css;
  assert.match(rule(css, '.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-item'), /display:flex/);
  assert.doesNotMatch(css, /row-reverse|\.uxr-ico-badge\{[^}]*\border:/);
  const html = renderPage(buildFromRecipe('inquire'), { mode: 'export' });
  const rows = [...html.matchAll(/<li class="uxr-ben-item">(.*?)<\/li>/g)];
  assert.equal(rows.length, 2);
  for (const [, row] of rows) {
    assert.match(row, /^<span class="uxr-ico-badge".*<\/span><div class="uxr-ben-body">/);
  }
});

test('店主の話の見出しと引用枠は共通の本文幅に収まり、二重の中央寄せをしない', () => {
  const html = renderPage(buildFromRecipe('apply'), { mode: 'export' });
  assert.match(html, /class="uxr-block uxr-story uxr-v1"[^>]*><div class="uxr-inner"><div class="uxr-story-wrap">/);
  const inner = rule(BASE_CSS, '.uxr-page .uxr-inner');
  assert.match(inner, /max-width:var\(--uxr-max\)/);
  assert.match(inner, /padding:var\(--uxr-pad-y\) var\(--uxr-pad-x\)/);
  assert.doesNotMatch(BLOCK_RENDERERS.story.css, /\.uxr-story-wrap\{[^}]*max-width:\d|\.uxr-story-wrap\{[^}]*margin-inline:auto/);
});

test('保証の盾は見出しの上に置き、720px以上では本文とチップを共通の左端から始める', () => {
  const css = BLOCK_RENDERERS.guarantee.css;
  assert.doesNotMatch(css, /\.uxr-guar-band\{[^}]*grid-template-columns:auto 1fr/);
  const wide = css.split('@container uxr (min-width:720px)')[1] ?? '';
  assert.match(rule(wide, '.uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-panel'), /justify-items:start/);
  assert.match(rule(wide, '.uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-panel'), /text-align:start/);
  assert.match(rule(wide, '.uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-chips'), /justify-content:flex-start/);
  const html = renderPage(buildFromRecipe('buy'), { mode: 'export' });
  assert.match(html, /class="uxr-guar-band"><div class="uxr-guar-crest".*?<\/div><div class="uxr-guar-body"><h2/);
});

test('720px以上の日程表は、見出しと時刻が同じ左端から始まる', () => {
  const html = renderPage(buildFromRecipe('event'), { mode: 'export' });
  assert.match(html, /class="uxr-block uxr-schedule uxr-v0"[^>]*><div class="uxr-inner"><h2[^>]*>.*?<\/h2><ol class="uxr-sched-list"><li[^>]*><div class="uxr-sched-tcol">/);
  const wide = BLOCK_RENDERERS.schedule.css.split('@container uxr (min-width:720px)')[1] ?? '';
  assert.match(rule(wide, '.uxr-page .uxr-schedule.uxr-v0 .uxr-sched-tcol'), /text-align:start/);
});

test('応援の実績3件は320pxから3等分し、最後の数字も一つの列に収める', () => {
  const html = renderPage(buildFromRecipe('support'), { mode: 'export' });
  assert.equal((html.match(/class="uxr-proof-item"/g) ?? []).length, 3);
  const css = BLOCK_RENDERERS.proof.css;
  const wide = css.split('@container uxr (min-width:320px)')[1]?.split('@container')[0] ?? '';
  const three = '.uxr-page .uxr-proof .uxr-proof-list:has(> :nth-child(3):last-child)';
  assert.match(rule(wide, three), /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css, /:last-child:nth-child\(odd\)\{grid-column:1\/-1/);
  assert.match(wide, /\.uxr-proof-item:nth-child\(3\):last-child\{[^}]*border-top:0/);
});
