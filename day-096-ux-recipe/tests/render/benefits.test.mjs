// benefits 部品の固有試験。3種（アイコン／番号つき／札つき一覧）・件数（2〜4件）・空項目スキップ時の連番・無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { ico } from '../../lib/render-kit.js';
import { emptyProps, oneEach } from '../fixtures/states.js';

const ITEMS = (n) => Array.from({ length: n }, (_, i) => ({ title: `理由${i + 1}`, text: `説明文${i + 1}\n改行あり` }));

test('benefits: 3つのバリエーションで固有のマークアップとアイコン・番号を出す', () => {
  const props = { heading: '選ばれる理由', items: [
    { title: '朝の四時間', text: '説明文1\n改行あり' },
    { title: 'お給料', text: '時給1,450円です' },
    { title: '大切に使う', text: '' },
    { title: '安心', text: '保証があります' },
  ] };

  const v0 = renderPage(oneEach('benefits', 0, props), { mode: 'export' });
  assert.ok(v0.includes('<ul class="uxr-ben-list">'));
  assert.equal((v0.match(/class="uxr-ico-badge"/g) || []).length, 4, 'v0 は項目数ぶんのアイコンバッジを持つ');
  const expected = ['clock', 'yen', 'heart', 'shield'].map(name => ico(name));
  const badges = html => [...html.matchAll(/class="uxr-ico-badge" aria-hidden="true">(<svg\b.*?<\/svg>)/g)].map(m => m[1]);
  assert.deepEqual(badges(v0), expected);
  assert.ok(v0.includes('説明文1<br>改行あり'));

  const v1 = renderPage(oneEach('benefits', 1, props), { mode: 'export' });
  assert.ok(v1.includes('<ol class="uxr-ben-list">'), 'v1 は番号つきなので ol を使う');
  for (const num of ['01', '02', '03', '04']) {
    assert.ok(v1.includes(`class="uxr-ben-num" aria-hidden="true">${num}</span>`), `v1 に ${num}`);
  }

  const v2 = renderPage(oneEach('benefits', 2, props), { mode: 'export' });
  assert.deepEqual(badges(v2), expected);
  assert.ok(v2.includes('<ul class="uxr-ben-list">'));
  assert.equal((v2.match(/<li class="uxr-ben-item"><span class="uxr-ico-badge" aria-hidden="true"><svg/g) || []).length, 4, '各行の先頭に札を1個ずつ置く');
  for (const [index, item] of props.items.entries()) {
    assert.ok(v2.includes(`class="uxr-ben-num" aria-hidden="true">0${index + 1}</span><h3 class="uxr-h3 uxr-ben-title">${item.title}</h3>`));
  }
});

test('benefits: 最小2件〜最大4件、途中の空項目スキップでも番号が詰まり、空状態が崩れない', () => {
  for (const variant of [0, 1, 2]) {
    for (const count of [2, 3, 4]) {
      const html = renderPage(oneEach('benefits', variant, { heading: '理由', items: ITEMS(count) }), { mode: 'export' });
      assert.equal((html.match(/class="uxr-ben-item"/g) || []).length, count, `v${variant} 件数=${count}`);
    }
    const sparse = renderPage(oneEach('benefits', variant, {
      heading: '理由',
      items: [{ title: '1つ目', text: '説明' }, { title: '', text: '' }, { title: '3つ目', text: '説明' }],
    }), { mode: 'export' });
    assert.equal((sparse.match(/class="uxr-ben-item"/g) || []).length, 2, `v${variant} 空項目を飛ばす`);
    if (variant === 1 || variant === 2) {
      assert.ok(sparse.includes('>01</span>') && sparse.includes('>02</span>') && !sparse.includes('>03</span>'), `v${variant} 空を飛ばして連番になる`);
    }
    const emptyPrev = renderPage(oneEach('benefits', variant, emptyProps('benefits')), { mode: 'preview' });
    assert.ok(emptyPrev.includes('data-path="items.0.title"') && emptyPrev.includes('data-path="items.1.text"'));
    const emptyExp = renderPage(oneEach('benefits', variant, emptyProps('benefits')), { mode: 'export' });
    assert.ok(!emptyExp.includes('uxr-ben-list'));
  }
});

test('benefits: 危険な文字（<img onerror> 等）が全バリエーションで無害化される', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1, 2]) {
    const html = renderPage(oneEach('benefits', variant, {
      heading: xss.slice(0, 28),
      items: [{ title: xss.slice(0, 16), text: xss }, { title: xss.slice(0, 16), text: xss }],
    }), { mode: 'export' });
    assert.ok(!html.includes('<img'), `v${variant}: 生の img タグが出ない`);
    assert.ok(!/<[^>]*\son[a-z]+\s*=/i.test(html), `v${variant}: on* がHTML属性にならない`);
    assert.ok(html.includes('&lt;img'), `v${variant}: エスケープされる`);
  }
});
