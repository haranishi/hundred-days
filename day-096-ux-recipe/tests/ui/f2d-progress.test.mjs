import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditor } from '../../app.js';
import { buildFromRecipe } from '../../lib/recipes.js';
import { mountDiagnosis } from '../../lib/ui-diagnosis.js';
import { block } from '../fixtures/states.js';

const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const progressBar = root => descendants(root).find(node => node.getAttribute('role') === 'progressbar');

class PanelElement extends EventTarget {
  children = [];
  attributes = new Map();
  dataset = {};
  style = {};
  text = '';
  get firstChild() { return this.children[0]; }
  get childElementCount() { return this.children.length; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this.text = String(value); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.text = ''; this.children = nodes; }
  contains(node) { return this === node || descendants(this).includes(node); }
  querySelectorAll(selector) {
    assert.equal(selector, 'details[open]');
    return descendants(this).filter(node => node.open);
  }
}

function openPanel(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const createElement = () => new PanelElement();
  Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { createElement, createElementNS: createElement, activeElement: null },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  });
  const state = buildFromRecipe('reserve');
  const ctx = createEditor(state);
  const root = createElement();
  t.after(mountDiagnosis(root, ctx).destroy);
  return { root, ctx, state };
}

for (const [samples, edited, width, caption] of [
  [10, 0, '0%', '自分の文章に直した部品: 0 / 10'],
  [4, 6, '60%', '自分の文章に直した部品: 6 / 10'],
  [0, 10, '100%', 'すべての部品の文章を直しました。'],
]) {
  test('見本が' + samples + '個の診断で、書き換えた部品の数を文字と棒で示す', t => {
    const { root, ctx, state } = openPanel(t);
    if (edited) {
      const blocks = state.blocks.map((sample, index) => index < samples ? sample :
        block(sample.id, 'story', 0, { text: 'お店で育てた花を紹介します。' }));
      ctx.dispatch({ type: 'replace', state: { ...state, blocks } });
    }
    assert.equal(ctx.diagnose().samples.count, samples);
    const bar = progressBar(root);
    assert.ok(bar, '進み具合を読み上げられる');
    assert.equal(bar.getAttribute('aria-label'), '自分の文章に直した部品');
    assert.equal(bar.getAttribute('aria-valuemin'), '0');
    assert.equal(bar.getAttribute('aria-valuemax'), '10');
    assert.equal(bar.getAttribute('aria-valuenow'), String(edited));
    assert.equal(bar.getAttribute('aria-valuetext'), edited + ' 個 / 10 個');
    assert.equal(bar.firstChild.style.width, width);
    assert.ok(root.textContent.includes(caption));
    if (samples) {
      const remaining = '見本の文章が残っている部品: ' + samples + '個';
      assert.ok(root.textContent.indexOf(remaining) > root.textContent.indexOf(caption));
      ctx.dispatch({ type: 'removeBlock', id: state.blocks[0].id });
      assert.equal(progressBar(root).getAttribute('aria-valuemax'), '9');
      assert.ok(root.textContent.includes('自分の文章に直した部品: ' + edited + ' / 9'));
    }
  });
}

test('部品をすべて外すと、進み具合の文字と棒も消える', t => {
  const { root, ctx, state } = openPanel(t);
  ctx.dispatch({ type: 'replace', state: { ...state, blocks: [] } });
  assert.match(root.textContent, /部品がありません/u);
  assert.doesNotMatch(root.textContent, /自分の文章に直した部品|すべての部品の文章を直しました/u);
  assert.equal(progressBar(root), undefined);
});
