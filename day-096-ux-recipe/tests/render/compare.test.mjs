// 比較（compare）の部品固有の試験。
// v0の table（th scope）・v1の✓と—の2列リスト・件数（2〜5件）・空・無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { emptyProps, maxProps, oneEach } from '../fixtures/states.js';

const sample = {
  heading: 'これまでの方法との違い',
  leftName: '当店',
  rightName: '一般的',
  items: [
    { label: '担当', left: 'ずっと同じ', right: '毎回変わる' },
    { label: '予約変更', left: '前日まで無料', right: '手数料あり' },
  ],
};

test('compare v0（表）: table と th scope を使い左を強調する', () => {
  const html = renderPage(oneEach('compare', 0, sample), { mode: 'export' });
  assert.ok(html.includes('<table class="uxr-cmp-table">'));
  assert.ok(html.includes('<th scope="col" class="uxr-cmp-ours">'));
  assert.ok(html.includes('<th scope="col" class="uxr-cmp-other">'));
  assert.equal((html.match(/<th scope="row">/g) ?? []).length, 2);
  assert.ok(html.includes('当店') && html.includes('一般的'));
});

test('compare v1（チェック）: 左に✓・右に—の2列カードになる', () => {
  const html = renderPage(oneEach('compare', 1, sample), { mode: 'export' });
  assert.ok(html.includes('class="uxr-cmp-cols"'));
  assert.ok(html.includes('uxr-cmp-card--ours') && html.includes('uxr-cmp-card--other'));
  assert.equal((html.match(/uxr-cmp-mark--yes/g) ?? []).length, 2);
  assert.equal((html.match(/uxr-cmp-mark--no/g) ?? []).length, 2);
  assert.ok(!html.includes('<table'));
});

test('compare: 最大件数（5件）と空の扱い・危険な文字の無害化', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const maxHtml = renderPage(oneEach('compare', variant, maxProps('compare')), { mode: 'export' });
    const re = variant === 0 ? /<th scope="row">/g : /uxr-cmp-mark--yes/g;
    assert.equal((maxHtml.match(re) ?? []).length, 5, `v${variant}: 最大5件`);

    const emptyExp = renderPage(oneEach('compare', variant, emptyProps('compare')), { mode: 'export' });
    assert.ok(!emptyExp.includes('<table') && !emptyExp.includes('uxr-cmp-cols'), `v${variant}: export で空の比較を出さない`);

    const emptyPre = renderPage(oneEach('compare', variant, emptyProps('compare')), { mode: 'preview' });
    assert.ok(emptyPre.includes('data-path="leftName"') && emptyPre.includes('data-path="rightName"') && emptyPre.includes('data-path="items.0.left"'));

    const safe = renderPage(oneEach('compare', variant, {
      heading: xss, leftName: xss, rightName: xss,
      items: [{ label: xss, left: xss, right: xss }, { label: '項目', left: 'あり', right: 'なし' }],
    }), { mode: 'export' });
    assert.ok(!safe.includes('<img src=x') && safe.includes('&lt;img src=x'));
  }
});
