// フッター（footer）の部品固有の試験。
// 名前・注意書き・リンク名（リンク要素 a にしない）・0〜3件・区切り線クラス・空・無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { emptyProps, maxProps, oneEach } from '../fixtures/states.js';

const sample = {
  name: 'ひだまり整体院',
  text: 'このページはサンプルです。',
  items: [{ text: 'プライバシー方針' }, { text: '特定商取引法' }],
};

test('footer: リンク名は a タグにせず飾り文字として出し、注意書きの有無で区切り線を切り替える', () => {
  const html = renderPage(oneEach('footer', 0, sample), { mode: 'export' });
  assert.ok(html.includes('class="uxr-foot-brand"') && html.includes('ひだまり整体院'));
  assert.ok(html.includes('class="uxr-foot-top has-sep"'), '注意書きがあるときは全幅の区切り線を付ける');
  assert.equal((html.match(/class="uxr-foot-link"/g) ?? []).length, 2);
  assert.ok(!html.includes('<a '), 'フッターのリンク名はリンク要素にしない');

  // 注意書きが空なら区切り線クラスを付けない
  const noText = renderPage(oneEach('footer', 0, { name: '店名', text: '', items: [] }), { mode: 'export' });
  assert.ok(noText.includes('class="uxr-foot-top"') && !noText.includes('has-sep'));
  assert.ok(!noText.includes('uxr-foot-links'));
});

test('footer: 最大件数（3件）・空の扱い・危険な文字の無害化', () => {
  const maxHtml = renderPage(oneEach('footer', 0, maxProps('footer')), { mode: 'export' });
  assert.equal((maxHtml.match(/class="uxr-foot-link"/g) ?? []).length, 3, '最大3件');

  const emptyExp = renderPage(oneEach('footer', 0, emptyProps('footer')), { mode: 'export' });
  assert.ok(!emptyExp.includes('uxr-foot-top') && !emptyExp.includes('uxr-foot-text'));

  const emptyPre = renderPage(oneEach('footer', 0, emptyProps('footer')), { mode: 'preview' });
  assert.ok(emptyPre.includes('data-path="name"') && emptyPre.includes('data-path="text"'));

  const xss = '<img src=x onerror=alert(1)>"\'&';
  const safe = renderPage(oneEach('footer', 0, { name: xss, text: xss, items: [{ text: xss }] }), { mode: 'export' });
  assert.ok(!safe.includes('<img src=x') && safe.includes('&lt;img src=x'));
});
