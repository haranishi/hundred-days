// 料金プラン（plans）の部品固有の試験。
// おすすめリボン・改行区切りの箇条書き・v0/v1構造・件数（2〜4件）・空・無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { emptyProps, maxProps, oneEach } from '../fixtures/states.js';

const sample = {
  heading: '料金プラン',
  items: [
    { name: 'ライト', price: '¥3,000', note: '気軽に試す', lines: '月1回\nメール相談', pick: false },
    { name: 'スタンダード', price: '¥6,000', note: 'いちばん人気', lines: '月2回\n\n優先予約\n資料つき', pick: true },
  ],
};

test('plans v0/v1: pick のプランだけおすすめリボンと強い枠が付く', () => {
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('plans', variant, sample), { mode: 'export' });
    assert.equal((html.match(/class="uxr-plan-ribbon"/g) ?? []).length, 1, `v${variant}: おすすめは1件`);
    assert.equal((html.match(/uxr-plan is-pick/g) ?? []).length, 1, `v${variant}: is-pick は1件`);
    assert.ok(html.includes('おすすめ'));
    // 空行を除いた5行分のチェック箇条書きが描かれる（2 + 3）
    assert.equal((html.match(/uxr-plan-ck/g) ?? []).length, 5, `v${variant}: 箇条書き5行`);
    if (variant === 1) assert.ok(html.includes('class="uxr-plan-body"'));
    else assert.ok(!html.includes('class="uxr-plan-body"'));
  }
});

test('plans: 最大件数（4件）と空の扱い（preview/export）', () => {
  for (const variant of [0, 1]) {
    const maxHtml = renderPage(oneEach('plans', variant, maxProps('plans')), { mode: 'export' });
    assert.equal((maxHtml.match(/uxr-card uxr-plan/g) ?? []).length, 4, `v${variant}: 最大4件`);

    const emptyExp = renderPage(oneEach('plans', variant, emptyProps('plans')), { mode: 'export' });
    assert.ok(!emptyExp.includes('uxr-plan-grid'), `v${variant}: export で空のプラン一覧を出さない`);

    const emptyPre = renderPage(oneEach('plans', variant, emptyProps('plans')), { mode: 'preview' });
    assert.ok(emptyPre.includes('data-path="items.0.lines"') && emptyPre.includes('data-path="items.1.name"'));
  }
});

test('plans: 危険な文字が lines を含め全バリエーションで無害化される', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  const props = {
    heading: xss,
    items: [
      { name: xss, price: xss, note: xss, lines: `${xss}\n安全`, pick: true },
      { name: '通常', price: '¥1,000', note: '', lines: '', pick: false },
    ],
  };
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('plans', variant, props), { mode: 'export' });
    assert.ok(!html.includes('<img src=x'), `v${variant}`);
    assert.ok(html.includes('&lt;img src=x'), `v${variant}`);
  }
});
