// 申込フォーム（form）の部品固有の試験。
// preview は押せない枠（div）・export は本物の form/label/input/button・v1 は先頭1項目のみ・件数・空・無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage as renderPageRaw } from '../../lib/render.js';
import { stripWrap } from './f2e-wrap-helpers.mjs';
// 描画の結果に入る文節の折れ目（<wbr>・uxr-nb）は、文言の比較の邪魔になるので除く。折れ目そのものは f2e-wrap-*.test.mjs が見る。
const renderPage = (...args) => stripWrap(renderPageRaw(...args));
import { emptyProps, maxProps, oneEach } from '../fixtures/states.js';

const sample = {
  heading: 'ご予約・お問い合わせ',
  items: [{ label: 'お名前' }, { label: 'メールアドレス' }, { label: 'ご希望の日時' }],
  submit: '予約を送る',
  note: '1営業日以内にご連絡します。',
};

test('form preview: フォーカスを奪わない div の枠で描き、本物の form/input/button を出さない', () => {
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('form', variant, sample), { mode: 'preview' });
    assert.ok(!html.includes('<form') && !html.includes('<input') && !html.includes('<button') && !html.includes('<label'), `v${variant}: 編集中はネイティブ入力を出さない`);
    assert.ok(html.includes('class="uxr-input-mock"'), `v${variant}: モック入力欄がある`);
    assert.ok(html.includes('data-path="submit"'), `v${variant}: ボタン文言を編集できる`);
    const mocks = (html.match(/class="uxr-input-mock"/g) ?? []).length;
    assert.equal(mocks, variant === 0 ? 3 : 1, `v${variant}: 項目数`);
  }
});

test('form export: 送信が起きない見本（<form>を使わず、ボタンは type=button）。label/input を描き、v1 は先頭1項目だけ使う', () => {
  const v0 = renderPage(oneEach('form', 0, sample), { mode: 'export' });
  // <form> と type=submit があると、公開したHTMLで入力が配信元へGETで送られる（Enterでも）。見本は送信しない。
  assert.ok(!v0.includes('<form') && !v0.includes('type="submit"') && !v0.includes('action='), '書き出しに送信できる形が無い');
  assert.ok(v0.includes('<div class="uxr-form-box" role="group" aria-label="入力欄の見本">'));
  assert.equal((v0.match(/<input class="uxr-input"/g) ?? []).length, 3);
  assert.equal((v0.match(/<label class="uxr-field-label" for="uxr-f\d+-2-b1"/g) ?? []).length, 3);
  assert.ok(v0.includes('<button class="uxr-btn uxr-form-submit" type="button">予約を送る</button>'));

  const v1 = renderPage(oneEach('form', 1, maxProps('form')), { mode: 'export' });
  assert.ok(v1.includes('class="uxr-form-inline"'));
  assert.equal((v1.match(/<input class="uxr-input"/g) ?? []).length, 1, 'v1 は上限6件でも先頭1項目だけ');

  // v0 の上限6件
  const v0Max = renderPage(oneEach('form', 0, maxProps('form')), { mode: 'export' });
  assert.equal((v0Max.match(/<input class="uxr-input"/g) ?? []).length, 6, 'v0 は最大6件');

  // v1 で先頭項目だけ空・2件目に値があるときは入力欄を出さない（先頭1項目のみ対象）
  const v1FirstEmpty = renderPage(oneEach('form', 1, {
    heading: '登録', items: [{ label: '' }, { label: '2件目' }], submit: '送信', note: '',
  }), { mode: 'export' });
  assert.ok(!v1FirstEmpty.includes('<input') && !v1FirstEmpty.includes('2件目'));
});

test('form: 空の扱いと危険な文字の無害化（preview/export・v0/v1）', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const emptyExp = renderPage(oneEach('form', variant, emptyProps('form')), { mode: 'export' });
    assert.ok(!emptyExp.includes('<form') && !emptyExp.includes('uxr-form-card'));

    const emptyPre = renderPage(oneEach('form', variant, emptyProps('form')), { mode: 'preview' });
    assert.ok(emptyPre.includes('data-path="heading"') && emptyPre.includes('data-path="items.0.label"') && emptyPre.includes('data-path="submit"'));

    for (const mode of ['preview', 'export']) {
      const safe = renderPage(oneEach('form', variant, {
        heading: xss, items: [{ label: xss }], submit: xss, note: xss,
      }), { mode });
      assert.ok(!safe.includes('<img src=x') && safe.includes('&lt;img src=x'), `v${variant}/${mode}`);
    }
  }
});

test('form export: 欄のIDは、IDに - や _ を含む別の部品と重ならない（b1 の0番目と b1-f0 の欄）', () => {
  const a = oneEach('form', 0, sample);
  const html = renderPage({ ...a, blocks: [{ ...a.blocks[0], id: 'b1' }, { ...a.blocks[0], id: 'b1-f0' }] }, { mode: 'export' });
  const ids = [...html.matchAll(/ id="(uxr-f\d+-\d+-[^"]+)"/g)].map(m => m[1]);
  assert.ok(ids.length >= 4);
  assert.equal(new Set(ids).size, ids.length, `IDが重なっている: ${ids.join(',')}`);
});
