import assert from 'node:assert/strict';
import test from 'node:test';
import { renderPage as renderPageRaw } from '../../lib/render.js';
import { stripWrap } from './f2e-wrap-helpers.mjs';
// 描画の結果に入る文節の折れ目（<wbr>・uxr-nb）は、文言の比較の邪魔になるので除く。折れ目そのものは f2e-wrap-*.test.mjs が見る。
const renderPage = (...args) => stripWrap(renderPageRaw(...args));
import { ico } from '../../lib/render-kit.js';
import { MINIMAL, oneEach } from '../fixtures/states.js';

test('空のストーリーはどちらの見た目でも書き出しの余白を残さない', () => {
  for (const variant of [0, 1]) {
    const page = oneEach('story', variant, {});
    assert.match(renderPage(page, { mode: 'export' }), /<div class="uxr-inner"><\/div>/);
    assert.match(renderPage(page), /data-path="text"/);
  }
});

test('質問が最大5枠で先頭や途中が空でも、書き出した最初の質問だけが開く', () => {
  const items = Array(5);
  items[1] = { q: '最初の質問', a: '最初の答え' };
  items[4] = { q: '次の質問', a: '次の答え' };
  const page = oneEach('faq', 0, { items });
  const html = renderPage(page, { mode: 'export' });
  const questions = [...html.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];
  assert.deepEqual(questions.map(([, attrs]) => /\bopen\b/.test(attrs)), [true, false]);
  assert.match(questions[0][2], /最初の質問/);
  assert.match(questions[1][2], /次の質問/);
});

test('料金プランの空白行だけのカードを省き、おすすめだけのカードと本文だけのカードを残す', () => {
  const items = [{ lines: '　\n ' }, { pick: true }, { lines: '相談つき' }, {}];
  for (const variant of [0, 1]) {
    const page = oneEach('plans', variant, { items });
    const html = renderPage(page, { mode: 'export' });
    assert.equal([...html.matchAll(/<li class="uxr-card uxr-plan/g)].length, 2);
    assert.match(html, /おすすめ/);
    assert.match(html, /相談つき/);
    assert.match(renderPage(page), /data-path="items\.0\.lines"/);
  }
});

test('登録されていない部品名はページの他の部品の描画を妨げない', () => {
  for (const type of ['toString', 'constructor', '__proto__']) {
    const page = { ...MINIMAL, blocks: [{ id: 'unknown', type }, ...MINIMAL.blocks] };
    assert.equal(renderPage(page), renderPage(MINIMAL));
  }
});

test('登録されていない名前のアイコンは空文字になる', () => {
  for (const name of ['toString', 'constructor', '__proto__']) assert.equal(ico(name), '');
  assert.match(ico('star'), /<svg\b/);
});
