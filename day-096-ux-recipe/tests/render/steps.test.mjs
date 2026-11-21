// steps 部品の固有試験。縦・横2種、件数（2〜5件）、空項目スキップ時の連番詰め、無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { emptyProps, oneEach } from '../fixtures/states.js';

const ITEMS = (n) => Array.from({ length: n }, (_, i) => ({ title: `手順${i + 1}`, text: `進め方の説明${i + 1}` }));

test('steps: v0（縦）・v1（横）で ol・番号の丸・矢印アイコンを含む構造を出す', () => {
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('steps', variant, { heading: 'ご利用の流れ', items: ITEMS(3) }), { mode: 'export' });
    assert.ok(html.includes(`uxr-steps uxr-v${variant}`), `v${variant} クラス`);
    assert.ok(html.includes('<ol class="uxr-steps-list">'), `v${variant} は順序つきリスト ol`);
    assert.equal((html.match(/class="uxr-step-item"/g) || []).length, 3);
    assert.ok(html.includes('class="uxr-step-num">1</span>') && html.includes('class="uxr-step-num">2</span>') && html.includes('class="uxr-step-num">3</span>'));
    assert.equal((html.match(/class="uxr-step-arrow"/g) || []).length, 3, '横並び切替用の矢印要素を持つ');
  }
});

test('steps: 最小2件〜最大5件、途中の空項目を飛ばしても番号が連番で詰まる', () => {
  for (const variant of [0, 1]) {
    for (const count of [2, 5]) {
      const html = renderPage(oneEach('steps', variant, { heading: '流れ', items: ITEMS(count) }), { mode: 'export' });
      assert.equal((html.match(/class="uxr-step-item"/g) || []).length, count, `v${variant} 件数=${count}`);
      assert.ok(html.includes(`class="uxr-step-num">${count}</span>`));
    }
    // 2件目が空でも、表示される番号は 1, 2, 3 と詰まる
    const sparse = renderPage(oneEach('steps', variant, {
      heading: '流れ',
      items: [
        { title: '予約', text: '日時を選ぶ' },
        { title: '', text: '' },
        { title: '来店', text: '受付する' },
        { title: '', text: '' },
        { title: '完了', text: '会計する' },
      ],
    }), { mode: 'export' });
    assert.equal((sparse.match(/class="uxr-step-item"/g) || []).length, 3, `v${variant} 空項目を飛ばす`);
    assert.ok(sparse.includes('class="uxr-step-num">1</span>'));
    assert.ok(sparse.includes('class="uxr-step-num">2</span>'));
    assert.ok(sparse.includes('class="uxr-step-num">3</span>'));
    assert.ok(!sparse.includes('class="uxr-step-num">4</span>'), `v${variant} 飛び番にならない`);

    const emptyPrev = renderPage(oneEach('steps', variant, emptyProps('steps')), { mode: 'preview' });
    assert.ok(emptyPrev.includes('data-path="items.0.title"') && emptyPrev.includes('data-path="items.1.text"'));
    const emptyExp = renderPage(oneEach('steps', variant, emptyProps('steps')), { mode: 'export' });
    assert.ok(!emptyExp.includes('uxr-steps-list'));
  }
});

test('steps: 危険な文字（<img onerror> 等）が両バリエーションで無害化される', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('steps', variant, {
      heading: xss.slice(0, 24),
      items: [{ title: xss.slice(0, 16), text: xss }, { title: xss.slice(0, 16), text: xss }],
    }), { mode: 'export' });
    assert.ok(!html.includes('<img'), `v${variant}: 生の img タグが出ない`);
    assert.ok(!/<[^>]*\son[a-z]+\s*=/i.test(html), `v${variant}: on* がHTML属性にならない`);
    assert.ok(html.includes('&lt;img'), `v${variant}: エスケープされる`);
  }
});
