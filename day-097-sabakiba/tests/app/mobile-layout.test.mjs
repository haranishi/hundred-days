// レイアウトを決めるCSSの値を照合します。文字の折り返しと実際の可視範囲はブラウザで測ります。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
const mediaPattern = /@media\s+([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/gu;
const base = css.replace(mediaPattern, '');
const media = [...css.matchAll(mediaPattern)];
const oneColumn = media.find(([, condition]) => condition.includes('(width < 640px)'))[2];
const homePhone = media.find(([, condition]) => condition.trim() === '(width < 600px)')[2];

function rule(selector, sheet = base) {
  const blocks = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/gu)];
  const match = blocks.find(([, selectors]) => selectors.split(',').some(value => value.trim() === selector));
  assert.ok(match, selector);
  return Object.fromEntries([...match[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/gu)].map(([, key, value]) => [key, value.trim()]));
}

function px(value) {
  assert.match(value, /^\d+(?:\.\d+)?px$/u);
  return Number.parseFloat(value);
}

test('一列のガイドで説明に使える高さを確保し、手順と再生の帯には44pxの操作領域が残る', () => {
  const row = rule('.guide-layout')['grid-template-rows'];
  const stage = row.match(/^minmax\((\d+)px, (\d+)dvh\) minmax\(0, 1fr\)$/u);
  assert.ok(stage);
  assert.deepEqual(stage.slice(1).map(Number), [220, 42]);
  assert.equal(rule('.guide-layout[data-mode="practice"]')['grid-template-rows'], 'minmax(240px, 48dvh) minmax(0, 1fr)');
  for (const selector of ['.button', '.icon-btn', '.ctrl-btn']) {
    assert.ok(px(rule(selector)['min-height']) >= 44 && px(rule(selector)['min-width']) >= 44);
  }
  assert.ok(px(rule('.u-slider').height) >= 44);
  const stepHeight = Math.max(...['.button', '.icon-btn'].map(s => px(rule(s)['min-height'])))
    + 2 * px(rule('.step-bar', oneColumn)['padding-block']) + Number.parseFloat(rule('.step-bar')['border-bottom']);
  const playbackHeight = Math.max(px(rule('.ctrl-btn')['min-height']), px(rule('.u-slider').height))
    + 2 * px(rule('.playback-bar', oneColumn)['padding-block']) + Number.parseFloat(rule('.playback-bar')['border-top']);
  assert.ok(stepHeight <= 48 && playbackHeight <= 50);
  // ヘッダー57pxと下端71pxは採点時の実測値です。再生の帯はステージの行に含まれます。
  for (const [height, minimum] of [[844, 290], [640, 170]]) {
    const cardSpace = height - 57 - Math.max(Number(stage[1]), height * Number(stage[2]) / 100) - stepHeight - 71;
    assert.ok(cardSpace >= minimum, `高さ${height}pxで説明欄の配分が${cardSpace}px`);
  }
  assert.equal(rule('.step-summary', oneColumn)['font-size'], '13px');
  const wide = media.find(([, condition]) => condition.includes('(min-width: 820px)'))[2];
  assert.equal(rule('.guide-layout', wide)['grid-template-rows'], 'minmax(0, 1fr)');
});

test('進捗の点は16個とも残り幅に応じて縮み、現在地を長さでも示す', () => {
  const dot = rule('.step-dot'), current = rule('.step-dot[data-state="current"]');
  assert.equal(dot.flex, '1 1 0');
  assert.equal(current.flex, '2.4 1 0');
  assert.equal(px(dot['min-width']), 3);
  assert.equal(px(dot['max-width']), 8);
  assert.equal(px(current['max-width']), 18);
  assert.ok(px(dot.height) >= 6 && px(dot.height) <= 8);
  const dots = rule('.step-dots');
  assert.notEqual(dots.overflow, 'hidden');
  const gap = dots.gap.match(/^min\(([\d.]+)px, ([\d.]+)%\)$/u);
  assert.ok(gap);
  for (const available of [80, 110, 160]) {
    const gaps = 15 * Math.min(Number(gap[1]), available * Number(gap[2]) / 100);
    assert.ok(16 * px(dot['min-width']) + gaps <= available);
  }
});

test('スマホの魚カードは約150px、絞り込みは横1列で、デスクトップの段組みは残る', () => {
  const card = rule('.species-card', homePhone);
  assert.equal(card.display, 'grid');
  assert.ok(px(card['min-height']) >= 140 && px(card['min-height']) <= 150);
  assert.match(card['grid-template-columns'], /^clamp\(96px, [\d.]+vw, 110px\) minmax\(0, 1fr\)$/u);
  assert.equal(rule('.species-blurb', homePhone)['-webkit-line-clamp'], '2');
  assert.equal(rule('.species-media', homePhone).padding, '0');
  const strip = rule('.filter-chips', homePhone);
  assert.equal(strip['flex-wrap'], 'nowrap');
  assert.equal(strip['overflow-x'], 'auto');
  assert.equal(strip['scroll-snap-type'], 'x proximity');
  assert.equal(strip['-webkit-overflow-scrolling'], 'touch');
  assert.ok(px(rule('.chip-btn')['min-height']) >= 44 && px(rule('.chip-btn', homePhone)['min-width']) >= 44);
  assert.equal(rule('.species-card')['flex-direction'], 'column');
  for (const width of [600, 1024]) {
    const wide = media.find(([, condition]) => condition.trim() === `(min-width: ${width}px)`)[2];
    assert.match(rule('.species-grid', wide)['grid-template-columns'], /repeat\([2-4],/u);
  }
});
