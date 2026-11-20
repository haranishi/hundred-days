import assert from 'node:assert/strict';
import test from 'node:test';
import { THEMES } from '../../lib/contract.js';
import { THEME_CSS } from '../../lib/page-themes.js';
import { css } from '../../lib/blocks/form.js';
import { renderPage } from '../../lib/render.js';
import { oneEach } from '../fixtures/states.js';

function luminance(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map(pair => parseInt(pair, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

for (const theme of THEMES) {
  test(`${theme}の入力欄の枠は、欄の内側とカード面の両方に3:1以上`, t => {
    const rule = THEME_CSS.match(new RegExp(`\\[data-theme="${theme}"\\]\\{([^}]+)\\}`))[1];
    const color = key => {
      const hex = rule.match(new RegExp(`--uxr-${key}:(#[\\da-f]{6})(?:;|$)`, 'i'))?.[1];
      assert.ok(hex, `${theme} の ${key} に不透明な色が必要`);
      return luminance(hex);
    };
    const line = color('field-line');
    for (const face of ['bg', 'surface']) {
      const background = color(face);
      const contrast = (Math.max(line, background) + 0.05) / (Math.min(line, background) + 0.05);
      assert.ok(contrast >= 3, `${theme}/${face} ${contrast.toFixed(2)}:1`);
      t.diagnostic(`${theme}/${face} ${contrast.toFixed(2)}:1`);
    }
  });
}

test('縦とひとことの欄は編集時と書き出し時に同じ輪郭を使う', () => {
  for (const variant of [0, 1]) {
    const page = oneEach('form', variant, { items: [{ label: 'お名前' }] });
    assert.match(renderPage(page), /<div class="uxr-input-mock" aria-hidden="true">/);
    assert.match(renderPage(page, { mode: 'export' }), /<input class="uxr-input"/);
  }
  const controls = ':is(.uxr-input,.uxr-input-mock,textarea,select)';
  const rule = css.split(`.uxr-page .uxr-form ${controls}{`)[1]?.split('}')[0] ?? '';
  const border = rule.match(/border:([\d.]+)px solid var\(--uxr-field-line\)/);
  assert.ok(Number(border?.[1]) >= 1.5, '入力欄の輪郭は1.5px以上');
  assert.match(rule, /background:var\(--uxr-bg\)/);
  assert.ok(css.includes(`[data-theme="lively"] .uxr-form ${controls}{border-width:2px;background:var(--uxr-surface)}`));
  assert.doesNotMatch(css, /border-width:1px\b|border:[\d.]+px solid var\(--uxr-line\)/);
});
