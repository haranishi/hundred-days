// hero 部品の固有試験。見た目3種（中央／左寄せ＋図形／大見出し）・空の扱い・危険な文字の無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { block, emptyProps, oneEach } from '../fixtures/states.js';
import { SCHEMA_VERSION } from '../../lib/contract.js';

const SAMPLE = {
  eyebrow: '駅徒歩3分の整体院',
  title: '肩の重さを、今日で手放す',
  lead: '丁寧な60分の整体。\n初めての方も安心です。',
  cta: '空き時間を見る',
  note: '前日までの変更は無料',
};

test('hero: 3つのバリエーションで固有の構造と飛び先を出し分ける', () => {
  const baseState = (variant) => ({
    v: SCHEMA_VERSION, goal: 'reserve', site: { name: '整体院' }, theme: { preset: 'soft', accent: 0 },
    blocks: [block('b1', 'hero', variant, SAMPLE), block('b2', 'cta', 0, { title: '予約', button: '予約する' })],
  });

  const v0 = renderPage(baseState(0), { mode: 'export' });
  assert.ok(v0.includes('class="uxr-chip">駅徒歩3分の整体院</span>'), 'v0 は eyebrow に uxr-chip を使う');
  assert.ok(v0.includes('<h1 class="uxr-h1">肩の重さを、今日で手放す</h1>'));
  assert.ok(v0.includes('丁寧な60分の整体。<br>初めての方も安心です。'), 'lead の改行が <br> になる');
  assert.ok(v0.includes('href="#uxr-b2"'), 'ボタンが cta ブロックへ飛ぶ');
  assert.ok(!v0.includes('uxr-art') && !v0.includes('uxr-h1wrap'));

  const v1 = renderPage(baseState(1), { mode: 'export' });
  assert.ok(v1.includes('class="uxr-eyebrow">駅徒歩3分の整体院</span>'));
  assert.ok(v1.includes('<i class="uxr-hero-shape" aria-hidden="true"></i><div class="uxr-hero-text">'), '背景の飾りと、読める文章を隣に置く');
  assert.ok(!v0.includes('uxr-hero-shape') && !v1.includes('uxr-h1wrap'), '背景の図形は左寄せだけに使う');

  const v2 = renderPage(baseState(2), { mode: 'export' });
  assert.ok(v2.includes('class="uxr-eyebrow">駅徒歩3分の整体院</span>'));
  assert.ok(v2.includes('<div class="uxr-h1wrap"><h1 class="uxr-h1">'), 'v2 は複数行マーカー用のラッパーを持つ');
  assert.ok(!v2.includes('uxr-hero-shape'));
});

test('hero: 空の項目は preview で目印を残し、export では余分な枠ごと消える', () => {
  for (const variant of [0, 1, 2]) {
    const emptyState = oneEach('hero', variant, emptyProps('hero'));
    const prev = renderPage(emptyState, { mode: 'preview' });
    for (const p of ['eyebrow', 'title', 'lead', 'cta', 'note']) {
      assert.ok(prev.includes(`data-path="${p}"`), `v${variant} preview に ${p}`);
    }
    const exp = renderPage(emptyState, { mode: 'export' });
    assert.ok(!exp.includes('uxr-hero-text') && !exp.includes('uxr-hero-shape') && !exp.includes('uxr-actions'), `v${variant} 空の export は中身を畳む`);

    const partial = renderPage(oneEach('hero', variant, { title: '見出しだけ', note: '注記だけ' }), { mode: 'export' });
    assert.ok(partial.includes('<h1 class="uxr-h1">見出しだけ</h1>'));
    assert.ok(partial.includes('uxr-actions') && !partial.includes('uxr-btn'), `v${variant} ボタンなし注記のみ`);
  }
});

test('hero: 危険な文字（<img onerror> 等）が全バリエーションで無害化される', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1, 2]) {
    const html = renderPage(oneEach('hero', variant, {
      eyebrow: xss.slice(0, 20), title: xss, lead: xss, cta: xss.slice(0, 14), note: xss.slice(0, 30),
    }), { mode: 'export' });
    assert.ok(!html.includes('<img'), `v${variant}: 生の img タグが出ない`);
    assert.ok(!/<[^>]*\son[a-z]+\s*=/i.test(html), `v${variant}: onerror がHTML属性にならない`);
    assert.ok(html.includes('&lt;img') && html.includes('&quot;') && html.includes('&#39;'), `v${variant}: 危険な文字がエスケープされる`);
  }
});
