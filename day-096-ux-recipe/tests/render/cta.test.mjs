// 行動ボタン（cta）の部品固有の試験。
// v0の反転ボタン帯・v1の左線カード・飛び先リンク・空・無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, sanitizeProps } from '../../lib/contract.js';
import { renderPage } from '../../lib/render.js';
import { emptyProps, oneEach } from '../fixtures/states.js';

const sample = {
  title: 'まずは体験から始めてみませんか',
  text: '空き状況を見て、ご希望の日時を選べます。',
  button: '空き状況を見る',
  note: '前日までの変更は無料です。',
};

test('cta v0（帯）と v1（カード）の構造と飛び先リンク', () => {
  const v0 = renderPage(oneEach('cta', 0, sample), { mode: 'export' });
  assert.ok(v0.includes('uxr-btn--inverse'), 'v0 は強調色の上に反転ボタンを載せる');
  assert.ok(v0.includes('href="#"'), '他に form/cta が無いときは #');

  const v1 = renderPage(oneEach('cta', 1, sample), { mode: 'export' });
  assert.ok(v1.includes('class="uxr-cta-card"') && v1.includes('class="uxr-cta-main"') && v1.includes('class="uxr-cta-side"'));
  assert.ok(!v1.includes('uxr-btn--inverse'), 'v1 は白地カードなので通常ボタン');

  // 同じページに form があるときは、ボタンの飛び先が form のアンカーになる
  const withForm = renderPage({
    v: SCHEMA_VERSION, goal: 'reserve', site: { name: '店' }, theme: { preset: 'soft', accent: 0 },
    blocks: [
      { id: 'b1', type: 'cta', variant: 0, props: sanitizeProps('cta', sample) },
      { id: 'b2', type: 'form', variant: 0, props: sanitizeProps('form', { heading: '予約', items: [{ label: '名前' }], submit: '送る' }) },
    ],
  }, { mode: 'export' });
  assert.ok(withForm.includes('href="#uxr-b2"'));
});

test('cta: 空の扱いと危険な文字の無害化', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const emptyExp = renderPage(oneEach('cta', variant, emptyProps('cta')), { mode: 'export' });
    assert.ok(!emptyExp.includes('uxr-btn') && !emptyExp.includes('uxr-cta-card'));

    const emptyPre = renderPage(oneEach('cta', variant, emptyProps('cta')), { mode: 'preview' });
    assert.ok(emptyPre.includes('data-path="title"') && emptyPre.includes('data-path="button"') && emptyPre.includes('data-path="note"'));

    const safe = renderPage(oneEach('cta', variant, { title: xss, text: xss, button: xss, note: xss }), { mode: 'export' });
    assert.ok(!safe.includes('<img src=x') && safe.includes('&lt;img src=x'));
  }
});
