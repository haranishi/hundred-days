// よくある質問（faq）の部品固有の試験。
// v0の details/summary 開閉・v1の Q/A 一覧・件数（2〜5件）・空・無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { emptyProps, maxProps, oneEach } from '../fixtures/states.js';

const sample = {
  heading: 'よくある質問',
  items: [
    { q: '服装は？', a: '動きやすい服装でお越しください。' },
    { q: '当日の予約はできますか？', a: '空きがあれば承ります。' },
    { q: '駐車場はありますか？', a: '2台分ご用意しています。' },
  ],
};

test('faq v0（開閉）: details/summary を用い、書き出しは先頭のみ開く・編集中はすべて開く', () => {
  const exp = renderPage(oneEach('faq', 0, sample), { mode: 'export' });
  assert.equal((exp.match(/<details class="uxr-faq-item"/g) ?? []).length, 3);
  assert.equal((exp.match(/<summary class="uxr-faq-q">/g) ?? []).length, 3);
  assert.equal((exp.match(/class="uxr-faq-toggle"/g) ?? []).length, 3);
  assert.equal((exp.match(/open=""/g) ?? []).length, 1, 'export は1件目だけ開く');

  const pre = renderPage(oneEach('faq', 0, sample), { mode: 'preview' });
  assert.equal((pre.match(/open=""/g) ?? []).length, 3, 'preview は編集のため全件開く');
});

test('faq v1（一覧）: QとAの印つき定義リストで常に見える', () => {
  const exp = renderPage(oneEach('faq', 1, sample), { mode: 'export' });
  assert.ok(exp.includes('<dl class="uxr-faq-dl">'));
  assert.equal((exp.match(/class="uxr-faq-qbadge"/g) ?? []).length, 3);
  assert.equal((exp.match(/class="uxr-faq-amark"/g) ?? []).length, 3);
  assert.ok(!exp.includes('<details'));
});

test('faq: 最大件数（5件）と空の扱い・危険な文字の無害化', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const maxHtml = renderPage(oneEach('faq', variant, maxProps('faq')), { mode: 'export' });
    const re = variant === 0 ? /<details class="uxr-faq-item"/g : /uxr-card uxr-faq-card/g;
    assert.equal((maxHtml.match(re) ?? []).length, 5, `v${variant}: 最大5件`);

    const emptyExp = renderPage(oneEach('faq', variant, emptyProps('faq')), { mode: 'export' });
    assert.ok(!emptyExp.includes('<details') && !emptyExp.includes('<dl'), `v${variant}: export で空の枠を出さない`);

    const emptyPre = renderPage(oneEach('faq', variant, emptyProps('faq')), { mode: 'preview' });
    assert.ok(emptyPre.includes('data-path="items.0.q"') && emptyPre.includes('data-path="items.0.a"'));

    const safe = renderPage(oneEach('faq', variant, {
      heading: xss,
      items: [{ q: xss, a: xss }, { q: '質問', a: '答え' }],
    }), { mode: 'export' });
    assert.ok(!safe.includes('<img src=x') && safe.includes('&lt;img src=x'));
  }
});
