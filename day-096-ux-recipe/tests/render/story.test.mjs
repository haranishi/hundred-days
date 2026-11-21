// story 部品の固有試験。文章・引用風2種、署名（— 名前）、160字本文と改行、空の扱い、無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage as renderPageRaw } from '../../lib/render.js';
import { stripWrap } from './f2e-wrap-helpers.mjs';
// 描画の結果に入る文節の折れ目（<wbr>・uxr-nb）は、文言の比較の邪魔になるので除く。折れ目そのものは f2e-wrap-*.test.mjs が見る。
const renderPage = (...args) => stripWrap(renderPageRaw(...args));
import { emptyProps, oneEach } from '../fixtures/states.js';

const SAMPLE = {
  heading: '開業のきっかけ',
  text: '毎日の疲れをその日のうちにほどけたら。\nそんな想いからこの場所を開きました。',
  who: '代表 山田花子',
};

test('story: v0（文章）と v1（引用風）で固有の構造と署名（— 名前）を出す', () => {
  const v0 = renderPage(oneEach('story', 0, SAMPLE), { mode: 'export' });
  assert.ok(v0.includes('class="uxr-story-head"') && v0.includes('class="uxr-story-rule"'), 'v0 は見出しと短い線を持つ');
  assert.ok(v0.includes('class="uxr-story-body"') && !v0.includes('<blockquote'), 'v0 は通常の文章構造');
  assert.ok(v0.includes('毎日の疲れをその日のうちにほどけたら。<br>そんな想いからこの場所を開きました。'));
  assert.ok(v0.includes('<p class="uxr-story-who"><span class="uxr-story-dash" aria-hidden="true">—</span><span class="uxr-story-who-name">代表 山田花子</span></p>'));

  const v1 = renderPage(oneEach('story', 1, SAMPLE), { mode: 'export' });
  assert.ok(v1.includes('<figure class="uxr-story-quote">'), 'v1 は figure で包む');
  assert.ok(v1.includes('<blockquote><p class="uxr-story-text">'), 'v1 は blockquote を使う');
  assert.ok(v1.includes('<figcaption class="uxr-story-who"><span class="uxr-story-dash" aria-hidden="true">—</span><span class="uxr-story-who-name">代表 山田花子</span></figcaption>'));
});

test('story: 空の項目は preview で目印を残し、export では余分な枠を出さない', () => {
  for (const variant of [0, 1]) {
    const emptyPrev = renderPage(oneEach('story', variant, emptyProps('story')), { mode: 'preview' });
    for (const p of ['heading', 'text', 'who']) {
      assert.ok(emptyPrev.includes(`data-path="${p}"`), `v${variant} preview に ${p}`);
    }
    const emptyExp = renderPage(oneEach('story', variant, emptyProps('story')), { mode: 'export' });
    assert.ok(!emptyExp.includes('uxr-story-quote') && !emptyExp.includes('uxr-story-body') && !emptyExp.includes('uxr-story-who'), `v${variant} 空 export で余分な枠なし`);

    const textOnly = renderPage(oneEach('story', variant, { heading: '', text: '本文だけ', who: '' }), { mode: 'export' });
    assert.ok(textOnly.includes('本文だけ') && !textOnly.includes('uxr-story-who') && !textOnly.includes('uxr-story-head'));
  }
});

test('story: 危険な文字（<img onerror> 等）が両バリエーションで無害化される', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const html = renderPage(oneEach('story', variant, {
      heading: xss.slice(0, 24), text: xss, who: xss.slice(0, 20),
    }), { mode: 'export' });
    assert.ok(!html.includes('<img'), `v${variant}: 生の img タグが出ない`);
    assert.ok(!/<[^>]*\son[a-z]+\s*=/i.test(html), `v${variant}: on* がHTML属性にならない`);
    assert.ok(html.includes('&lt;img'), `v${variant}: エスケープされる`);
  }
});
