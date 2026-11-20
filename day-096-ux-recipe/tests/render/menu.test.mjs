// メニュー・料金（menu）の部品固有の試験。
// 見た目の番号ごとの構造・件数（2〜6件）・空の扱い・危険な文字の無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { emptyProps, maxProps, oneEach } from '../fixtures/states.js';

const sample = {
  heading: 'メニューと料金',
  items: [
    { name: '初回体験 60分', price: '¥4,400', note: '問診と施術' },
    { name: '通常 60分', price: '¥6,600', note: '2回目以降' },
  ],
  foot: '料金は税込です。',
};

test('menu v0（一覧）: 点線と右揃えの値段・注記が描かれる', () => {
  const html = renderPage(oneEach('menu', 0, sample), { mode: 'export' });
  assert.ok(html.includes('class="uxr-menu-list"'));
  assert.equal((html.match(/class="uxr-menu-item"/g) ?? []).length, 2);
  assert.equal((html.match(/class="uxr-menu-dots"/g) ?? []).length, 2);
  assert.ok(html.includes('uxr-price uxr-menu-price'));
  assert.ok(html.includes('料金は税込です。'));

  // 名前だけ・値段だけの行では余計な点線を出さない
  const partial = renderPage(oneEach('menu', 0, {
    heading: 'メニュー',
    items: [{ name: '相談のみ', price: '', note: '' }, { name: '', price: '¥0', note: '' }],
    foot: '',
  }), { mode: 'export' });
  assert.ok(!partial.includes('uxr-menu-dots'));
});

test('menu v1（カード）: 値段を大きく見せるカード構成になる', () => {
  const html = renderPage(oneEach('menu', 1, sample), { mode: 'export' });
  assert.ok(html.includes('class="uxr-menu-cards"'));
  assert.equal((html.match(/uxr-card uxr-menu-card/g) ?? []).length, 2);
  assert.ok(html.includes('uxr-price uxr-menu-card-price'));
  assert.ok(!html.includes('uxr-menu-dots'));
});

test('menu: 最小（2件）〜最大（6件）と空の扱い（preview/export）', () => {
  for (const variant of [0, 1]) {
    const maxHtml = renderPage(oneEach('menu', variant, maxProps('menu')), { mode: 'export' });
    const itemRe = variant === 0 ? /class="uxr-menu-item"/g : /uxr-card uxr-menu-card/g;
    assert.equal((maxHtml.match(itemRe) ?? []).length, 6, `v${variant}: 最大6件`);

    const emptyExp = renderPage(oneEach('menu', variant, emptyProps('menu')), { mode: 'export' });
    assert.ok(!emptyExp.includes('<ul'), `v${variant}: export で空のリストを出さない`);

    const emptyPre = renderPage(oneEach('menu', variant, emptyProps('menu')), { mode: 'preview' });
    assert.ok(emptyPre.includes('data-path="heading"') && emptyPre.includes('data-path="items.0.name"') && emptyPre.includes('data-path="foot"'));
  }
});

test('menu: 危険な文字（<img onerror> 等）が全バリエーションで無害化される', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  const props = { heading: xss, items: [{ name: xss, price: xss, note: xss }, { name: '通常', price: '¥1,000', note: '' }], foot: xss };
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('menu', variant, props), { mode: 'export' });
    assert.ok(!html.includes('<img src=x'), `v${variant}`);
    assert.ok(html.includes('&lt;img src=x'), `v${variant}: エスケープされている`);
  }
});
