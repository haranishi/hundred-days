import assert from 'node:assert/strict';
import test from 'node:test';
import { BASE_CSS } from '../../lib/page-base.js';
import { THEME_CSS } from '../../lib/page-themes.js';
import { BLOCK_RENDERERS } from '../../lib/blocks/index.js';
import { buildFromRecipe } from '../../lib/recipes.js';
import { makeCtx } from '../../lib/render-kit.js';

function atWidth(css, condition) {
  const body = css.split('@container uxr (' + condition + '){')[1];
  assert.ok(body, 'コンテナ幅 ' + condition);
  return body.split(/\n\}/, 1)[0];
}

// 複数の部品で共有する規則も、指定した要素に掛かる宣言だけを調べる。
function declarations(css, selector) {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g);
  return [...rules].filter(([, selectors]) =>
    selectors.trim().split(/,\s*(?=\.uxr-page\b)/).includes(selector)
  ).map(([, , body]) => body).join(';');
}

test('店名と本文は同じ最大幅と左右余白を使い、960pxでは帯の端から72px空く', () => {
  for (const selector of ['.uxr-head-in', '.uxr-inner']) {
    const rule = declarations(BASE_CSS, '.uxr-page ' + selector);
    assert.match(rule, /max-width:var\(--uxr-max\)/, selector);
    assert.match(rule, /margin:0 auto/, selector);
    assert.match(rule, /padding:[^;}]+ var\(--uxr-pad-x\)(?:;|$)/, selector);
  }
  assert.match(declarations(BASE_CSS, '.uxr-page'), /--uxr-pad-x:20px/);
  const wide = atWidth(BASE_CSS, 'min-width:720px');
  for (const selector of ['.uxr-head', '.uxr-main']) {
    const rule = declarations(wide, '.uxr-page ' + selector);
    const max = Number(rule.match(/--uxr-max:(\d+)px/)?.[1]);
    const pad = Number(rule.match(/--uxr-pad-x:(\d+)px/)?.[1]);
    assert.equal((960 - max) / 2 + pad, 72, selector);
  }
});

test('560px未満は通常の見出しを左に揃え、中央の構成を使う4部品は対象から外す', () => {
  const narrow = atWidth(BASE_CSS, 'width < 560px');
  const heading = '.uxr-page .uxr-main > .uxr-block:not(.uxr-hero,.uxr-cta,.uxr-limited,.uxr-guarantee) .uxr-h2';
  assert.match(declarations(narrow, heading), /text-align:left/);
  for (const [type, variant, parent] of [
    ['hero', 0, '.uxr-inner'], ['cta', 0, '.uxr-inner'],
    ['limited', 1, '.uxr-inner'], ['guarantee', 1, '.uxr-guar-panel'],
  ]) {
    const centered = '.uxr-page .uxr-' + type + '.uxr-v' + variant + ' ' + parent;
    assert.match(declarations(BLOCK_RENDERERS[type].css, centered), /text-align:center/, type);
  }
});

test('問い合わせと応募の輪はヘッダーの下から始まり、問い合わせでは直径の半分以上が右に出る', () => {
  const { css } = BLOCK_RENDERERS.hero;
  const shape = ' .uxr-hero.uxr-v1 .uxr-hero-shape';
  const base = declarations(css, '.uxr-page' + shape);
  assert.match(base, /aspect-ratio:1(?:;|$)/);
  assert.match(base, /border-radius:50%/);
  for (const theme of ['crisp', 'calm']) {
    const themed = declarations(css, '.uxr-page[data-theme="' + theme + '"]' + shape);
    assert.match(themed, /top:[1-9]\d*px/);
    assert.match(themed, /border:1px solid var\(--uxr-accent-line\)/);
    assert.match(themed, /background:(?:none|transparent)(?:;|$)/);
    assert.doesNotMatch(themed, /rotate\(|translateY?\(|border-radius:(?!50%)/);
    if (theme === 'crisp') {
      assert.match(themed, /width:70%/);
      assert.match(themed, /transform:translateX\((?:[5-9]\d)%\)/);
    }
  }
});

test('フッターの店舗案内は項目ごとに改行し、小さい文字でも読める間隔を取る', () => {
  const rule = declarations(BLOCK_RENDERERS.footer.css, '.uxr-page .uxr-footer .uxr-foot-links');
  assert.match(rule, /display:grid/);
  assert.match(rule, /gap:[1-9]\d*px/);
  assert.match(rule, /font-size:max\(14px,\s*\.875rem\)/);
  const state = buildFromRecipe('reserve');
  const footer = state.blocks.at(-1);
  const html = BLOCK_RENDERERS.footer.render(footer, makeCtx(state, 'export'));
  const labels = [...html.matchAll(/<li><span class="uxr-foot-link">([^<]+)<\/span><\/li>/g)];
  assert.deepEqual(labels.map(match => match[1]), footer.props.items.map(item => item.text));
  assert.ok(labels.length > 0 && html.includes('このページはサンプルです。'));
});

test('にぎやかの定員の帯はページの地色に墨の上下線を引く', () => {
  const band = '.uxr-page[data-theme="lively"] .uxr-limited.uxr-v0';
  const rule = declarations(BLOCK_RENDERERS.limited.css, band);
  assert.match(rule, /background:var\(--uxr-bg\)/);
  assert.match(rule, /border-block:[2-9]px solid var\(--uxr-ink\)/);
});

test('参加の定員は720px以上でラベルと数字をまとめ、説明に一行を割く', () => {
  const { css, render } = BLOCK_RENDERERS.limited;
  const wide = atWidth(css, 'min-width:720px');
  const text = '.uxr-page[data-theme="lively"] .uxr-limited.uxr-v0 .uxr-lim-text';
  assert.match(declarations(wide, text), /flex-basis:100%/);
  assert.match(declarations(css, '.uxr-page .uxr-limited.uxr-v0 .uxr-lim-bar'), /flex-wrap:wrap/);
  const state = buildFromRecipe('event');
  const block = state.blocks.find(item => item.type === 'limited');
  const html = render(block, makeCtx(state, 'export'));
  assert.match(html, /<div class="uxr-lim-main"><span class="uxr-lim-label">[^<]+<\/span><span class="uxr-lim-val">[^<]+<\/span><\/div><span class="uxr-lim-text">/);
});

test('にぎやかの主ボタンは狭い幅で影の分を空け、CTAの最小幅もそこに収める', () => {
  const lively = '.uxr-page[data-theme="lively"]';
  const theme = declarations(THEME_CSS, lively);
  assert.match(theme, /--uxr-btn-shadow-x:3px/);
  assert.match(theme, /--uxr-btn-shadow:var\(--uxr-btn-shadow-x\) /);
  const button = declarations(atWidth(THEME_CSS, 'width < 640px'), lively + ' .uxr-btn:not(.uxr-btn--ghost)');
  assert.match(button, /--uxr-btn-max:calc\(100% - var\(--uxr-btn-shadow-x\)\)/);
  assert.match(button, /max-width:var\(--uxr-btn-max\)/);
  assert.match(button, /margin-inline-end:var\(--uxr-btn-shadow-x\)/);
  const hero = declarations(BLOCK_RENDERERS.hero.css, '.uxr-page .uxr-hero .uxr-actions .uxr-btn');
  assert.match(hero, /max-width:var\(--uxr-btn-max,100%\)/);
  for (const [variant, min] of [['.uxr-v0', 280], ['.uxr-v1 .uxr-cta-side', 200]]) {
    const cta = declarations(BLOCK_RENDERERS.cta.css, '.uxr-page .uxr-cta' + variant + ' .uxr-btn');
    assert.ok(cta.includes('min-width:min(var(--uxr-btn-max,100%),' + min + 'px)'));
  }
});
