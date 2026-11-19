import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const html = read('index.html');
const mediaRules = new Map();
const base = read('app.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^@media ([^{]+)\{([\s\S]*?)^\}/gm, (_, query, rules) => {
  mediaRules.set(query.trim(), rules);
  return '';
});

function media(query) {
  assert.ok(mediaRules.has(query), `@media ${query}`);
  return mediaRules.get(query);
}

function cssValue(rules, selector, property) {
  let value;
  const declaration = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`);
  for (const [, selectors, body] of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.split(',').some((candidate) => candidate.trim() === selector)) {
      value = body.match(declaration)?.[1].trim() ?? value;
    }
  }
  return value;
}

function action(id) {
  const markup = html.match(new RegExp(`<button\\b[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?<\\/button>`))?.[0];
  assert.ok(markup, `#${id}`);
  return markup;
}

test('視点ボタンは四隅の枠と中央の点、短い表示名と従来の読み上げ名を持つ', () => {
  const button = action('camera-reset');
  assert.match(button, /aria-label="視点を元に戻す"/);
  assert.match(button, /<svg[^>]*aria-hidden="true"/);
  assert.match(button, /<circle cx="12" cy="12"[^>]*\/>/);
  assert.match(button, /<\/svg>\s*視点\s*<\/button>/);
  const path = button.match(/<path d="([^"]+)"/)?.[1] ?? '';
  assert.equal([...path.matchAll(/[Mm][^Mm]*[HhVv][^Mm]*[HhVv]/g)].length, 4);
});

test('時間ボタンは48px、上端と履歴のボタンは44px以上をCSSで確保する', () => {
  function atLeast(value, pixels, selector) {
    assert.match(value ?? '', /^\d+(?:\.\d+)?px$/, selector);
    assert.ok(Number.parseFloat(value) >= pixels, `${selector} は ${pixels}px 以上（${value}）`);
  }
  for (const id of ['menu-open', 'photo-open', 'share-open']) assert.match(action(id), /class="top-action"/);
  for (const id of ['undo', 'redo']) assert.match(action(id), /class="button"/);
  for (const [selector, pixels] of [['.button', 44], ['.top-action', 44], ['.history .button', 44], ['.time-actions .button', 48]]) {
    const minHeight = cssValue(base, selector, 'min-height') ?? (selector === '.history .button' ? cssValue(base, '.button', 'min-height') : undefined);
    atLeast(minHeight, pixels, selector);
    for (const [query, rules] of mediaRules) {
      const override = cssValue(rules, selector, 'min-height');
      if (override !== undefined) atLeast(override, pixels, `${query} の ${selector}`);
    }
  }
});

test('低い横画面は左に44pxの帯と舞台を置き、道具と時間・履歴を右に集める', () => {
  const rules = media('(orientation: landscape) and (max-height: 480px)');
  assert.match(cssValue(rules, '#app', '--landscape-panel'), /220px.*env\(safe-area-inset-right\)/);
  assert.equal(cssValue(rules, '.workbench', 'grid-template-columns'), 'minmax(0, 1fr) var(--landscape-panel)');
  assert.equal(cssValue(rules, '.stage', 'grid-column'), '1');
  assert.equal(cssValue(rules, '.stage', 'grid-row'), '1 / -1');
  assert.equal(cssValue(rules, '.stage', 'margin-block-start'), 'var(--landscape-header)');
  for (const selector of ['.tools', '.calendar']) assert.equal(cssValue(rules, selector, 'grid-column'), '2');
  for (const selector of ['.top', '.workbench']) assert.equal(cssValue(rules, selector, 'grid-area'), '1 / 1');
  assert.equal(cssValue(rules, '.top', 'margin-inline-end'), 'var(--landscape-panel)');
  assert.equal(cssValue(rules, '.top-action', 'flex-direction'), 'row');
  assert.match(cssValue(rules, '#app', '--landscape-header'), /44px.*env\(safe-area-inset-top\)/);
  for (const selector of ['.tips', '.notice']) assert.equal(cssValue(rules, selector, 'top') ?? cssValue(base, selector, 'top'), '12px');
});

test('1024pxから上下帯と視点の右端は同じ余白になり、道具は5等分する', () => {
  const rules = media('(min-width: 1024px)');
  const inset = cssValue(rules, '.top', 'padding-inline');
  assert.equal(inset, 'var(--aligned-edge)');
  for (const selector of ['.tools', '.calendar']) assert.equal(cssValue(rules, selector, 'padding-inline'), inset);
  assert.equal(cssValue(rules, '.camera-reset', 'right'), inset);
  assert.match(cssValue(rules, '#app', '--aligned-edge'), /max\(24px,.*100vw - 1120px/);
  for (const selector of ['.top-inner', '.tools-inner', '.calendar-inner']) assert.equal(cssValue(rules, selector, 'max-width'), 'none');
  assert.equal(cssValue(base, '.tools-inner', 'grid-template-columns'), 'repeat(5, minmax(0, 1fr))');
});

test('無効な履歴ボタンは墨の文字と枠を半透明で残す', () => {
  const disabled = '.history .button:disabled';
  assert.equal(cssValue(base, disabled, 'border-color'), 'var(--ink)');
  assert.equal(cssValue(base, disabled, 'color'), 'var(--ink)');
  assert.equal(cssValue(base, disabled, 'background'), 'transparent');
  const opacity = Number(cssValue(base, disabled, 'opacity'));
  assert.ok(opacity >= 0.45 && opacity <= 0.55);
});

test('狭いメニューでは苗の選択を全幅の1列にし、保存消去は早送りから離して朱の細枠を付ける', () => {
  const rules = media('(width < 480px)');
  assert.equal(cssValue(rules, '.seedling-options', 'display'), 'grid');
  assert.equal(cssValue(rules, '.seedling-options', 'grid-template-columns'), 'minmax(0, 1fr)');
  assert.equal(cssValue(base, '.sheet select', 'width'), '100%');
  const menu = html.match(/<dialog\b[^>]*id="menu"[\s\S]*?<\/dialog>/)?.[0] ?? '';
  const settings = menu.match(/<section\b[^>]*aria-labelledby="settings-title"[\s\S]*?<\/section>/)?.[0] ?? '';
  const reset = action('reset-open');
  assert.ok(settings.includes(action('fast-start')));
  assert.ok(!settings.includes(reset));
  assert.ok(menu.indexOf(reset) > menu.lastIndexOf('</details>'));
  assert.match(reset, /class="button reset-open"/);
  assert.equal(cssValue(base, '.reset-open', 'border-color'), 'var(--shu-ink)');
  assert.equal(cssValue(base, ':root', '--shu-ink'), '#a63620');
  assert.match(cssValue(base, '.button', 'border'), /^1px solid /);
  assert.equal(cssValue(base, '.button', 'color'), 'var(--ink)');
  assert.equal(cssValue(base, '.reset-open', 'background'), 'var(--paper)');
});
