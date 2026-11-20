import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCENTS, THEMES } from '../../lib/contract.js';
import { BASE_CSS } from '../../lib/page-base.js';
import { THEME_CSS } from '../../lib/page-themes.js';
import { renderPage } from '../../lib/render.js';
import { midProps, oneEach } from '../fixtures/states.js';

test('送料・税込・フォーム・フッターを含む注記は全幅で最低14pxを確保する', () => {
  const note = BASE_CSS.match(/\.uxr-page \.uxr-note\{([^}]+)\}/)[1];
  assert.match(note, /font-size:max\(14px,\s*\.875rem\)/);
  assert.match(note, /color:var\(--uxr-muted\)/);
  for (const [type, variant, path] of [
    ['hero', 1, 'note'], ['menu', 0, 'foot'], ['menu', 0, 'items.0.note'],
    ['menu', 1, 'items.0.note'], ['plans', 0, 'items.0.note'], ['limited', 0, 'note'],
    ['form', 1, 'note'], ['cta', 0, 'note'], ['footer', 0, 'text'],
  ]) {
    const html = renderPage(oneEach(type, variant, midProps(type)));
    const tag = [...html.matchAll(/<p\b[^>]*>/g)].map(match => match[0])
      .find(p => p.includes(`data-path="${path}"`));
    assert.match(tag ?? '', /class="[^"]*\buxr-note\b/, `${type}/${variant}/${path}`);
  }
});

function luminance(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i, '描画に使う色は不透明な16進色');
  const [r, g, b] = hex.slice(1).match(/../g).map(pair => parseInt(pair, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function pageColors(theme, accent) {
  const colors = new Map();
  const themeAttr = `[data-theme="${theme}"]`;
  const accentAttr = `[data-accent="${accent}"]`;
  // テーマと強調色が重なる指定は、片方だけの指定より優先される。
  for (const attrs of [themeAttr, accentAttr, themeAttr + accentAttr, accentAttr + themeAttr]) {
    const rule = THEME_CSS.split(`.uxr-page${attrs}{`)[1]?.split('}')[0] ?? '';
    for (const [, name, value] of rule.matchAll(/--uxr-([\w-]+):([^;]+)/g)) colors.set(name, value);
  }
  return colors;
}

for (const theme of THEMES) {
  test(`${theme}の注記は全6色でページ・カード・交互の地・薄い強調色に対して4.5:1以上`, t => {
    let minimum = Infinity;
    for (const [i, accent] of ACCENTS.entries()) {
      const colors = pageColors(theme, i);
      const muted = luminance(colors.get('muted'));
      for (const face of ['bg', 'surface', 'surface2', 'accent-soft']) {
        const bg = luminance(colors.get(face));
        const ratio = (Math.max(bg, muted) + 0.05) / (Math.min(bg, muted) + 0.05);
        assert.ok(ratio >= 4.5, `${theme}/${accent.key}/${face} ${ratio}:1`);
        minimum = Math.min(minimum, ratio);
      }
    }
    t.diagnostic(`最低 ${minimum.toFixed(2)}:1`);
  });
}
