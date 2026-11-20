// proof 部品の固有試験。横ならび・カード2種、.uxr-num クラス、件数（2〜4件）、空項目の扱い、無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { emptyProps, oneEach } from '../fixtures/states.js';

const ITEMS = (n) => Array.from({ length: n }, (_, i) => ({ num: `${(i + 1) * 100}+`, label: `実績の説明${i + 1}` }));

test('proof: v0（横ならび）・v1（カード）で .uxr-num と説明を正しく描く', () => {
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('proof', variant, { heading: 'これまでの実績', items: ITEMS(3) }), { mode: 'export' });
    assert.ok(html.includes(`uxr-proof uxr-v${variant}`), `v${variant} クラス`);
    assert.ok(html.includes('<h2 class="uxr-h2">これまでの実績</h2>'));
    assert.ok(html.includes('<ul class="uxr-proof-list">'));
    assert.equal((html.match(/class="uxr-num uxr-proof-num"/g) || []).length, 3, `v${variant} .uxr-num を付与`);
    assert.equal((html.match(/class="uxr-proof-label"/g) || []).length, 3);
  }
});

test('proof: 最小2件〜最大4件・8文字の長めの数字・空項目のスキップが両バリエーションで整う', () => {
  for (const variant of [0, 1]) {
    for (const count of [2, 3, 4]) {
      const html = renderPage(oneEach('proof', variant, { heading: '実績', items: ITEMS(count) }), { mode: 'export' });
      assert.equal((html.match(/class="uxr-proof-item"/g) || []).length, count, `v${variant} 件数=${count}`);
    }
    const longNum = renderPage(oneEach('proof', variant, {
      heading: '実績',
      items: [{ num: '12,345件+', label: '累計相談数' }, { num: '', label: '' }, { num: '98.7%達成', label: '満足度' }],
    }), { mode: 'export' });
    assert.equal((longNum.match(/class="uxr-proof-item"/g) || []).length, 2, `v${variant} 空項目を飛ばす`);
    assert.ok(longNum.includes('12,345件') && longNum.includes('98.7%達成'));

    const emptyPrev = renderPage(oneEach('proof', variant, emptyProps('proof')), { mode: 'preview' });
    assert.ok(emptyPrev.includes('data-path="items.0.num"') && emptyPrev.includes('data-path="items.1.label"'));
    const emptyExp = renderPage(oneEach('proof', variant, emptyProps('proof')), { mode: 'export' });
    assert.ok(!emptyExp.includes('uxr-proof-list'));
  }
});

test('proof: 危険な文字（<img onerror> 等）が両バリエーションで無害化される', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('proof', variant, {
      heading: xss.slice(0, 24),
      items: [{ num: '<img x=>', label: xss.slice(0, 16) }, { num: '100&200', label: xss.slice(0, 16) }],
    }), { mode: 'export' });
    assert.ok(!html.includes('<img'), `v${variant}: 生の img タグが出ない`);
    assert.ok(!/<[^>]*\son[a-z]+\s*=/i.test(html), `v${variant}: on* がHTML属性にならない`);
    assert.ok(html.includes('&lt;img') && html.includes('100&amp;200'), `v${variant}: エスケープされる`);
  }
});
