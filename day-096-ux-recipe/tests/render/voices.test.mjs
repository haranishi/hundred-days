// voices 部品の固有試験。カード・大きな引用2種、figure/blockquote/figcaption、頭文字の丸、件数（1〜3件）、無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { emptyProps, oneEach } from '../fixtures/states.js';

const ITEMS = (n) => Array.from({ length: n }, (_, i) => ({
  quote: `感想テキスト${i + 1}。\nとても丁寧でした。`,
  who: `${['佐藤', '田中', '鈴木'][i]}さん（${30 + i * 10}代）`,
}));

test('voices: v0（カード）・v1（大きな引用）で figure/blockquote/figcaption と頭文字の丸を出す', () => {
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('voices', variant, { heading: 'お客様の声', items: ITEMS(3) }), { mode: 'export' });
    assert.ok(html.includes(`uxr-voices uxr-v${variant}`), `v${variant} クラス`);
    assert.equal((html.match(/<figure class="uxr-voice">/g) || []).length, 3);
    assert.equal((html.match(/<blockquote class="uxr-voice-body">/g) || []).length, 3);
    assert.equal((html.match(/<figcaption class="uxr-voice-foot">/g) || []).length, 3);
    assert.ok(html.includes('class="uxr-voice-avatar" aria-hidden="true">佐</span>'));
    assert.ok(html.includes('class="uxr-voice-avatar" aria-hidden="true">田</span>'));
    assert.ok(html.includes('class="uxr-voice-avatar" aria-hidden="true">鈴</span>'));
    assert.ok(html.includes('感想テキスト1。<br>とても丁寧でした。'));
  }
});

test('voices: 最小1件〜最大3件、空項目・who 欠損の扱いが両バリエーションで崩れない', () => {
  for (const variant of [0, 1]) {
    for (const count of [1, 2, 3]) {
      const html = renderPage(oneEach('voices', variant, { heading: '声', items: ITEMS(count) }), { mode: 'export' });
      assert.equal((html.match(/<figure class="uxr-voice">/g) || []).length, count, `v${variant} 件数=${count}`);
    }
    const quoteOnly = renderPage(oneEach('voices', variant, {
      heading: '声', items: [{ quote: '声だけあります', who: '' }],
    }), { mode: 'export' });
    assert.ok(quoteOnly.includes('<blockquote') && !quoteOnly.includes('<figcaption'), `v${variant} who が空なら figcaption を出さない`);

    const emptyPrev = renderPage(oneEach('voices', variant, emptyProps('voices')), { mode: 'preview' });
    assert.ok(emptyPrev.includes('data-path="items.0.quote"') && emptyPrev.includes('data-path="items.0.who"'));
    assert.ok(emptyPrev.includes('class="uxr-voice-avatar" aria-hidden="true">・</span>'), '空のとき頭文字は中点');

    const emptyExp = renderPage(oneEach('voices', variant, emptyProps('voices')), { mode: 'export' });
    assert.ok(!emptyExp.includes('uxr-voices-list'));
  }
});

test('voices: 危険な文字（<img onerror> 等・頭文字の < を含む）が両バリエーションで無害化される', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('voices', variant, {
      heading: xss.slice(0, 24),
      items: [{ quote: xss, who: xss.slice(0, 20) }],
    }), { mode: 'export' });
    assert.ok(!html.includes('<img'), `v${variant}: 生の img タグが出ない`);
    assert.ok(!/<[^>]*\son[a-z]+\s*=/i.test(html), `v${variant}: on* がHTML属性にならない`);
    assert.ok(html.includes('class="uxr-voice-avatar" aria-hidden="true">&lt;</span>'), `v${variant}: 頭文字もエスケープされる`);
  }
});
