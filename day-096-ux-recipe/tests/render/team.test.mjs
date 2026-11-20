// team 部品の固有試験。丸・カード2種、頭文字の丸（写真なし）、1〜4人の件数、空の扱い、無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { emptyProps, oneEach } from '../fixtures/states.js';

const MEMBERS = (n) => Array.from({ length: n }, (_, i) => ({
  name: `${['山田太郎', '鈴木花子', '佐藤健', '高橋美咲'][i]}`,
  role: `役割${i + 1}`,
  text: `ひとこと${i + 1}\nよろしくお願いします。`,
}));

test('team: v0（丸）と v1（カード）で固有の構造と頭文字の丸を出し、顔写真 img は使わない', () => {
  const props = { heading: 'スタッフ紹介', items: MEMBERS(3) };

  const v0 = renderPage(oneEach('team', 0, props), { mode: 'export' });
  assert.ok(v0.includes('<ul class="uxr-team-list">'));
  assert.ok(!v0.includes('class="uxr-team-head"'), 'v0 は中央積みで team-head を持たない');
  assert.ok(!v0.includes('<img'), '写真タグを使わない');
  for (const ch of ['山', '鈴', '佐']) {
    assert.ok(v0.includes(`class="uxr-team-avatar" aria-hidden="true">${ch}</span>`), `頭文字 ${ch}`);
  }
  assert.ok(v0.includes('ひとこと1<br>よろしくお願いします。'));

  const v1 = renderPage(oneEach('team', 1, props), { mode: 'export' });
  assert.equal((v1.match(/class="uxr-team-head"/g) || []).length, 3, 'v1 は丸と名前・役割を team-head で横並びにまとめる');
  assert.ok(!v1.includes('<img'), 'v1 も写真タグを使わない');
});

test('team: 最小1人〜最大4人、空項目・一部項目欠損の扱いが両バリエーションで整う', () => {
  for (const variant of [0, 1]) {
    for (const count of [1, 2, 3, 4]) {
      const html = renderPage(oneEach('team', variant, { heading: 'メンバー', items: MEMBERS(count) }), { mode: 'export' });
      assert.equal((html.match(/class="uxr-team-item"/g) || []).length, count, `v${variant} 件数=${count}`);
    }
    const nameOnly = renderPage(oneEach('team', variant, {
      heading: 'メンバー', items: [{ name: '伊藤', role: '', text: '' }, { name: '', role: '', text: '' }],
    }), { mode: 'export' });
    assert.equal((nameOnly.match(/class="uxr-team-item"/g) || []).length, 1, `v${variant} 空項目を飛ばす`);
    assert.ok(nameOnly.includes('>伊</span>') && !nameOnly.includes('uxr-team-role') && !nameOnly.includes('uxr-team-text'));

    const emptyPrev = renderPage(oneEach('team', variant, emptyProps('team')), { mode: 'preview' });
    assert.ok(emptyPrev.includes('data-path="items.0.name"') && emptyPrev.includes('data-path="items.0.role"') && emptyPrev.includes('data-path="items.0.text"'));
    assert.doesNotMatch(emptyPrev, /uxr-team-avatar/, '名前が空の間は印を出さない');

    const emptyExp = renderPage(oneEach('team', variant, emptyProps('team')), { mode: 'export' });
    assert.ok(!emptyExp.includes('uxr-team-list'));
  }
});

test('team: 危険な文字（<img onerror> 等・頭文字の < を含む）が両バリエーションで無害化される', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('team', variant, {
      heading: xss.slice(0, 24),
      items: [{ name: xss.slice(0, 14), role: xss.slice(0, 16), text: xss }],
    }), { mode: 'export' });
    assert.ok(!html.includes('<img'), `v${variant}: 生の img タグが出ない`);
    assert.ok(!/<[^>]*\son[a-z]+\s*=/i.test(html), `v${variant}: on* がHTML属性にならない`);
    assert.ok(html.includes('class="uxr-team-avatar" aria-hidden="true">&lt;</span>'), `v${variant}: 頭文字もエスケープされる`);
  }
});
