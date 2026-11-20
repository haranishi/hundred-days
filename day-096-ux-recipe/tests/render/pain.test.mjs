// pain 部品の固有試験。チェック行・カード2種の構造、件数（2〜5件）、空項目・つなぎ帯の扱い、無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { emptyProps, oneEach } from '../fixtures/states.js';

const ITEMS = (n) => Array.from({ length: n }, (_, i) => ({ text: `お悩み項目${i + 1}` }));

test('pain: v0 は丸チェックの行、v1 はカード構成で、lead につなぎの帯と矢印が出る', () => {
  const props = { heading: 'こんなお悩み', items: ITEMS(3), lead: 'その悩み、一緒に解決します。\nまずはご相談ください。' };
  const v0 = renderPage(oneEach('pain', 0, props), { mode: 'export' });
  assert.ok(v0.includes('<h2 class="uxr-h2">こんなお悩み</h2>'));
  assert.equal((v0.match(/class="uxr-pain-mark"/g) || []).length, 3, 'v0 は項目数ぶんのチェック印を持つ');
  assert.ok(v0.includes('class="uxr-pain-bridge"') && v0.includes('class="uxr-pain-arrow"'), 'v0 は lead の上に向き矢印がある');
  assert.ok(v0.includes('その悩み、一緒に解決します。<br>まずはご相談ください。'));

  const v1 = renderPage(oneEach('pain', 1, props), { mode: 'export' });
  assert.equal((v1.match(/class="uxr-pain-item"/g) || []).length, 3);
  assert.ok(!v1.includes('class="uxr-pain-mark"'), 'v1 はチェック印を出さずカード（引用符飾り）で組む');
  assert.ok(v1.includes('class="uxr-pain-bridge"') && v1.includes('class="uxr-pain-arrow"'));
});

test('pain: 最小2件〜最大5件・空の項目・lead のみの扱いが両バリエーションで整う', () => {
  for (const variant of [0, 1]) {
    for (const count of [2, 5]) {
      const html = renderPage(oneEach('pain', variant, { heading: '悩み', items: ITEMS(count), lead: '解決へ' }), { mode: 'export' });
      assert.equal((html.match(/class="uxr-pain-item"/g) || []).length, count, `v${variant} 件数=${count}`);
    }
    // 途中が空の項目は export で飛ばされる
    const sparse = renderPage(oneEach('pain', variant, {
      heading: '悩み', items: [{ text: '1つ目' }, { text: '' }, { text: '3つ目' }], lead: 'つなぎ',
    }), { mode: 'export' });
    assert.equal((sparse.match(/class="uxr-pain-item"/g) || []).length, 2, `v${variant} 空項目を飛ばす`);
    assert.ok(sparse.includes('1つ目') && sparse.includes('3つ目'));

    // 全項目空の export で lead だけある場合は矢印を出さない
    const leadOnly = renderPage(oneEach('pain', variant, { heading: '', items: [{ text: '' }, { text: '' }], lead: 'まずは相談' }), { mode: 'export' });
    assert.ok(!leadOnly.includes('uxr-pain-list') && !leadOnly.includes('uxr-pain-arrow') && leadOnly.includes('uxr-pain-lead'));

    // 空状態の preview には全項目の data-path が残る
    const emptyPrev = renderPage(oneEach('pain', variant, emptyProps('pain')), { mode: 'preview' });
    assert.ok(emptyPrev.includes('data-path="heading"') && emptyPrev.includes('data-path="items.0.text"') && emptyPrev.includes('data-path="lead"'));
  }
});

test('pain: 危険な文字（<img onerror> 等）が全バリエーションで無害化される', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('pain', variant, {
      heading: xss.slice(0, 24), items: [{ text: xss }, { text: xss }], lead: xss,
    }), { mode: 'export' });
    assert.ok(!html.includes('<img'), `v${variant}: 生の img タグが出ない`);
    assert.ok(!/<[^>]*\son[a-z]+\s*=/i.test(html), `v${variant}: on* がHTML属性にならない`);
    assert.ok(html.includes('&lt;img'), `v${variant}: エスケープされる`);
  }
});
