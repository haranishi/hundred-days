// 保証・安心（guarantee）の部品固有の試験。
// v0の帯・v1の円形シール・安心の一言（0〜3件）・空の扱い・無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage as renderPageRaw } from '../../lib/render.js';
import { stripWrap } from './f2e-wrap-helpers.mjs';
// 描画の結果に入る文節の折れ目（<wbr>・uxr-nb）は、文言の比較の邪魔になるので除く。折れ目そのものは f2e-wrap-*.test.mjs が見る。
const renderPage = (...args) => stripWrap(renderPageRaw(...args));
import { emptyProps, maxProps, oneEach } from '../fixtures/states.js';

const sample = {
  title: '30日間の返金保証',
  text: '合わないと感じた場合は、理由を問わず全額お返しします。',
  items: [{ text: '手続きはメール1通' }, { text: '解約料なし' }],
};

test('guarantee v0（帯）: 盾のアイコンと帯・安心の一言チップが描かれる', () => {
  const html = renderPage(oneEach('guarantee', 0, sample), { mode: 'export' });
  assert.ok(html.includes('class="uxr-guar-band"'));
  assert.ok(html.includes('class="uxr-guar-crest"'));
  assert.equal((html.match(/class="uxr-guar-chip"/g) ?? []).length, 2);
});

test('guarantee v1（シール）: 丸い盾の隣に読める見出しがある', () => {
  const html = renderPage(oneEach('guarantee', 1, sample), { mode: 'export' });
  assert.match(html, /class="uxr-guar-seal" aria-hidden="true"><svg\b[\s\S]*?<\/svg><\/span><h2 class="uxr-h2 uxr-guar-seal-title">30日間の返金保証<\/h2>/);
  assert.equal((html.match(/class="uxr-guar-chip"/g) ?? []).length, 2);
});

test('guarantee: 0件〜最大3件・空の扱い（書き出しで空の盾を残さない）・無害化', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const zero = renderPage(oneEach('guarantee', variant, { title: '安心保証', text: '説明', items: [] }), { mode: 'export' });
    assert.ok(!zero.includes('uxr-guar-chips'), `v${variant}: 0件でチップ枠を出さない`);

    const maxHtml = renderPage(oneEach('guarantee', variant, maxProps('guarantee')), { mode: 'export' });
    assert.equal((maxHtml.match(/class="uxr-guar-chip"/g) ?? []).length, 3, `v${variant}: 最大3件`);

    const emptyExp = renderPage(oneEach('guarantee', variant, emptyProps('guarantee')), { mode: 'export' });
    assert.ok(!emptyExp.includes('uxr-guar-band') && !emptyExp.includes('uxr-guar-panel'), `v${variant}: 空の書き出しで飾りのみ残さない`);

    const emptyPre = renderPage(oneEach('guarantee', variant, emptyProps('guarantee')), { mode: 'preview' });
    assert.ok(emptyPre.includes('data-path="title"') && emptyPre.includes('data-path="text"'));

    const safe = renderPage(oneEach('guarantee', variant, { title: xss, text: xss, items: [{ text: xss }] }), { mode: 'export' });
    assert.ok(!safe.includes('<img src=x') && safe.includes('&lt;img src=x'));
  }
});
