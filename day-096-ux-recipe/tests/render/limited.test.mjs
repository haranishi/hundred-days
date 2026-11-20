// 期限・残り枠（limited）の部品固有の試験。
// v0の帯・v1のバッジ・real（本当の数字です）がページに出ないこと・空・無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { css } from '../../lib/blocks/limited.js';
import { renderPage as renderPageRaw } from '../../lib/render.js';
import { stripWrap } from './f2e-wrap-helpers.mjs';
// 描画の結果に入る文節の折れ目（<wbr>・uxr-nb）は、文言の比較の邪魔になるので除く。折れ目そのものは f2e-wrap-*.test.mjs が見る。
const renderPage = (...args) => stripWrap(renderPageRaw(...args));
import { emptyProps, oneEach } from '../fixtures/states.js';

const sample = {
  label: '今月の受付',
  text: '初めての方の枠を毎月10名までに限っています',
  value: '残り3枠',
  real: true,
  note: '埋まり次第、翌月のご案内になります。',
};

test('limited v0（帯）と v1（バッジ）の構造', () => {
  const v0 = renderPage(oneEach('limited', 0, sample), { mode: 'export' });
  assert.ok(v0.includes('class="uxr-lim-bar"') && v0.includes('class="uxr-lim-val"'));
  assert.ok(v0.includes('残り3枠') && v0.includes('今月の受付'));

  const v1 = renderPage(oneEach('limited', 1, sample), { mode: 'export' });
  assert.ok(v1.includes('class="uxr-lim-badge"') && v1.includes('uxr-lim-ico'));
  assert.ok(v1.includes('class="uxr-lim-val"'));
});

test('定員は縁のない白文字の札で示し、480pxからラベルと同じ行に並べる', () => {
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('limited', variant, sample), { mode: 'export' });
    const group = html.match(/<div class="uxr-lim-main">(.*?)<\/div>/)?.[1] ?? '';
    assert.match(group, /class="uxr-lim-label"[^>]*>.*class="uxr-lim-val"/);
    assert.doesNotMatch(group, /uxr-lim-text/);
  }
  const badge = css.match(/\.uxr-limited \.uxr-lim-val\{([^}]+)\}/)[1];
  assert.match(badge, /background:var\(--uxr-accent\)/);
  assert.match(badge, /color:var\(--uxr-accent-ink\)/);
  assert.doesNotMatch(css, /\.uxr-lim-val(?:-box)?\{[^}]*border(?:-width)?:\s*[1-9]/);
  const wide = css.split('@container uxr (min-width:480px)')[1] ?? '';
  assert.match(wide, /\.uxr-lim-main\{[^}]*display:inline-flex/);
  assert.match(wide, /\.uxr-lim-main\{[^}]*gap:8px/);
});

test('limited: real は編集用の確認項目であり、true/false ともページに一切描かれない', () => {
  for (const variant of [0, 1]) {
    for (const mode of ['preview', 'export']) {
      const a = renderPage(oneEach('limited', variant, { ...sample, real: true }), { mode });
      const b = renderPage(oneEach('limited', variant, { ...sample, real: false }), { mode });
      assert.equal(a, b, `v${variant}/${mode}: real の真偽で出力が変わらない`);
      assert.ok(!a.includes('data-path="real"') && !a.includes('本当の数字'), `v${variant}/${mode}: real の文言が出ない`);
    }
  }
});

test('limited: 空の扱いと危険な文字の無害化', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const emptyExp = renderPage(oneEach('limited', variant, emptyProps('limited')), { mode: 'export' });
    assert.ok(!emptyExp.includes('uxr-lim-bar') && !emptyExp.includes('uxr-lim-badge'));

    const emptyPre = renderPage(oneEach('limited', variant, emptyProps('limited')), { mode: 'preview' });
    assert.ok(emptyPre.includes('data-path="label"') && emptyPre.includes('data-path="text"') && emptyPre.includes('data-path="value"') && emptyPre.includes('data-path="note"'));

    const safe = renderPage(oneEach('limited', variant, { label: xss, text: xss, value: xss, real: true, note: xss }), { mode: 'export' });
    assert.ok(!safe.includes('<img src=x') && safe.includes('&lt;img src=x'));
  }
});
