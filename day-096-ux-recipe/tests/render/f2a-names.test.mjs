import assert from 'node:assert/strict';
import test from 'node:test';
import { initial } from '../../lib/render-kit.js';
import { renderPage as renderPageRaw } from '../../lib/render.js';
import { stripWrap } from './f2e-wrap-helpers.mjs';
// 描画の結果に入る文節の折れ目（<wbr>・uxr-nb）は、文言の比較の邪魔になるので除く。折れ目そのものは f2e-wrap-*.test.mjs が見る。
const renderPage = (...args) => stripWrap(renderPageRaw(...args));
import { buildFromRecipe } from '../../lib/recipes.js';
import { block, oneEach } from '../fixtures/states.js';

test('空の名前には印がなく、頭文字は結合する濁点や補助漢字も一文字として読める', () => {
  for (const name of ['', '　 ', null, undefined]) assert.equal(initial(name), '');
  assert.equal(initial(' 𠮷田 '), '𠮷');
  assert.equal(initial('か\u3099く').normalize('NFC'), 'が');
});

test('スタッフのかやと声のかやに、どちらも「か」の印が付く', () => {
  for (const mode of ['preview', 'export']) {
    const html = renderPage(buildFromRecipe('apply'), { mode });
    assert.match(html, /class="uxr-team-avatar" aria-hidden="true">か<\/span>/);
    assert.match(html, /class="uxr-voice-avatar" aria-hidden="true">か<\/span>/);
    assert.match(html, />売り場担当・かや<\/span>/);
  }
});

test('声の署名は元のまま表示し、名前だけ・役割つき・敬称つきの名前から印を作る', () => {
  const credits = [
    ['かや', 'か'], ['しずさん・机仕事', 'し'], ['配膳当番・とわ', 'と'],
    ['田中様（来店）', '田'], ['𠮷田・売り場担当', '𠮷'],
    ['30代・会社員', ''], ['売り場の先輩', ''], ['初めて利用した方', ''], ['お客様', ''], ['さん', ''],
  ];
  for (const [who, letter] of credits) {
    for (const variant of [0, 1]) {
      const page = oneEach('voices', variant, { items: [{ quote: '感想', who }] });
      page.blocks.push(block('b2', 'team', 0, { items: [{ name: 'かや', role: '案内役' }] }));
      const html = renderPage(page, { mode: 'export' });
      const marks = [...html.matchAll(/class="uxr-voice-avatar" aria-hidden="true">([^<]*)<\/span>/g)];
      assert.deepEqual(marks.map(m => m[1]), letter ? [letter] : [], who);
      assert.ok(html.includes(`>${who}</span>`), who);
    }
  }
});

test('担当者名と見分けられない肩書きだけの署名は、名前の印に使わない', () => {
  for (const who of ['地域コーディネーター', '30代・写真家', 'お店のスタッフさん', '編集部・広報部']) {
    const page = oneEach('voices', 0, { items: [{ who, quote: '感想' }] });
    const html = renderPage(page, { mode: 'export' });
    assert.doesNotMatch(html, /uxr-voice-avatar/, who);
    assert.ok(html.includes(`>${who}</span>`));
  }
});

test('名前が空でも役割や感想を読めて、空の印を描かない', () => {
  for (const variant of [0, 1]) {
    for (const [type, item, prefix] of [
      ['team', { name: '　', role: '売り場の先輩', text: 'お店を案内します。' }, 'team'],
      ['voices', { who: '　', quote: 'お店を案内します。' }, 'voice'],
    ]) {
      for (const mode of ['preview', 'export']) {
        const html = renderPage(oneEach(type, variant, { items: [item] }), { mode });
        assert.ok(!html.includes(`uxr-${prefix}-avatar`), `${type}/${mode}`);
        assert.ok(html.includes('お店を案内します。'));
      }
    }
  }
});
