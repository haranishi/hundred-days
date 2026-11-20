// 場所・営業時間（access）の部品固有の試験。
// v0のピン見出し＋チップカード・v1の区切り線定義リスト・件数（2〜4件）・地図を置かないこと・空・無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { emptyProps, maxProps, oneEach } from '../fixtures/states.js';

const sample = {
  heading: '場所と営業時間',
  items: [
    { label: '住所', value: '〇〇市△△町1-2-3 2階' },
    { label: '営業時間', value: '10:00〜20:00（水曜休み）' },
  ],
};

test('access v0（カード）と v1（シンプル）の構造・外部地図を置かない', () => {
  const v0 = renderPage(oneEach('access', 0, sample), { mode: 'export' });
  assert.ok(v0.includes('class="uxr-acc-head"') && v0.includes('uxr-acc-pin'));
  assert.ok(v0.includes('<dl class="uxr-acc-dl">') && v0.includes('class="uxr-chip"'));
  assert.ok(!v0.includes('<iframe'));

  const v1 = renderPage(oneEach('access', 1, sample), { mode: 'export' });
  assert.ok(v1.includes('<dl class="uxr-acc-simple">') && v1.includes('class="uxr-acc-sdt"'));
  assert.ok(!v1.includes('uxr-acc-pin') && !v1.includes('class="uxr-card"'));
});

test('access: 最大件数（4件）と空の扱い・危険な文字の無害化', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const maxHtml = renderPage(oneEach('access', variant, maxProps('access')), { mode: 'export' });
    const re = variant === 0 ? /class="uxr-acc-row"/g : /class="uxr-acc-srow"/g;
    assert.equal((maxHtml.match(re) ?? []).length, 4, `v${variant}: 最大4件`);

    const emptyExp = renderPage(oneEach('access', variant, emptyProps('access')), { mode: 'export' });
    assert.ok(!emptyExp.includes('<dl') && !emptyExp.includes('uxr-acc-head'));

    const emptyPre = renderPage(oneEach('access', variant, emptyProps('access')), { mode: 'preview' });
    assert.ok(emptyPre.includes('data-path="heading"') && emptyPre.includes('data-path="items.0.label"') && emptyPre.includes('data-path="items.0.value"'));

    const safe = renderPage(oneEach('access', variant, {
      heading: xss,
      items: [{ label: xss, value: xss }, { label: '電話', value: '000-0000' }],
    }), { mode: 'export' });
    assert.ok(!safe.includes('<img src=x') && safe.includes('&lt;img src=x'));
  }
});
