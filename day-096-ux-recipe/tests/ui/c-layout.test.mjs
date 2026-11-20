import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEditor } from '../../app.js';
import { flowMeter, previewScrollDelta } from '../../lib/ui-preview.js';
import { MINIMAL } from '../fixtures/states.js';

const view = { top: 100, bottom: 450 };

test('短い部品は上下に余白を残して全体を見せる。すでに見えているときは動かさない', () => {
  assert.equal(previewScrollDelta(view, { top: 120, bottom: 220 }), 0);
  assert.equal(previewScrollDelta(view, { top: 80, bottom: 180 }), -32);
  assert.equal(previewScrollDelta(view, { top: 400, bottom: 500 }), 62);
});

test('長い部品ではタップした文章を残す。構成から選んだときは部品の先頭を見せる', () => {
  const block = { top: -200, bottom: 800 };
  const part = { top: 540, bottom: 600 };
  assert.equal(previewScrollDelta(view, block, part), 162);
  assert.equal(previewScrollDelta(view, block, { top: 160, bottom: 240 }), 0);
  assert.equal(previewScrollDelta(view, block), -312);
  assert.equal(previewScrollDelta(view, block, block, 850), 236);
});

test('パネルが伸びる間も押した部品が見え、画面が広がったらその位置を保つ', () => {
  let offset = 0;
  for (const bottom of [792, 650, 510, 456, 792]) {
    const visible = { top: 96, bottom };
    const block = { top: 644 - offset, bottom: 764 - offset };
    const delta = previewScrollDelta(visible, block);
    offset += delta;
    assert.ok(block.top - delta >= visible.top && block.bottom - delta <= bottom);
    if (bottom === 792) assert.equal(delta, 0);
  }
  assert.equal(previewScrollDelta({ top: 0, bottom: 0 }, { top: 20, bottom: 40 }), 0);
});

test('スマホではタブ帯から始まり、タブの切替・同じタブの再押下・畳むボタンを区別する', () => {
  const ctx = createEditor(MINIMAL);
  const press = tab => ctx.setTab(tab, { toggle: true });
  const state = () => [ctx.getTab(), ctx.isMobilePanelOpen()];
  assert.deepEqual(state(), ['edit', false]);
  press('edit');
  assert.deepEqual(state(), ['edit', true]);
  press('outline');
  assert.deepEqual(state(), ['outline', true]);
  press('outline');
  assert.deepEqual(state(), ['outline', false]);
  press('look');
  ctx.foldPanel();
  assert.deepEqual(state(), ['look', false]);
  assert.equal(ctx.canUndo(), false);
});

test('点数・部品・サイト名からの指定は、同じタブが開いていても対象を表示する', () => {
  const ctx = createEditor(MINIMAL);
  ctx.setTab('diagnosis');
  ctx.setTab('diagnosis');
  assert.equal(ctx.isMobilePanelOpen(), true);
  ctx.foldPanel();
  ctx.select('b999');
  ctx.select(null);
  assert.equal(ctx.isMobilePanelOpen(), false);
  const id = MINIMAL.blocks[1].id;
  ctx.select(id);
  ctx.select(id, { path: 'note' });
  assert.deepEqual([ctx.getSelectedId(), ctx.getTab(), ctx.isMobilePanelOpen()], [id, 'edit', true]);
  ctx.foldPanel();
  ctx.select(null, { path: 'site.name', tab: 'look' });
  assert.deepEqual([ctx.getTab(), ctx.isMobilePanelOpen()], ['look', true]);
});

test('短いメーターにも5段階の名前と件数があり、ゼロと2桁も読み上げられる', () => {
  const ctx = createEditor(MINIMAL);
  const meter = () => flowMeter(ctx.diagnose().stages);
  assert.deepEqual(meter().map(step => step.description),
    ['気づく 1個', 'わかる 0個', '信じる 0個', '動く 0個', '安心 1個']);
  for (let i = 0; i < 9; i++) ctx.dispatch({ type: 'duplicateBlock', id: MINIMAL.blocks[0].id });
  assert.equal(meter()[0].count, 10);
  assert.equal(meter()[0].description, '気づく 10個');
});

test('上部バーで文字を省いても5つの操作名と保存状態の読み上げを保つ', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const bar = html.match(/<header id="slot-topbar"[^>]*>([\s\S]*?)<\/header>/)[1];
  const labels = [...bar.matchAll(/<button\b[^>]*>/g)].map(([tag]) => tag.match(/aria-label="([^"]+)"/)?.[1]);
  assert.deepEqual(labels, ['目的を選び直す', '元に戻す', 'やり直す', '保存・開く', '共有・書き出し']);
  const status = bar.match(/<span\b[^>]*data-save-status[^>]*>/)[0];
  assert.match(status, /role="status"/);
  assert.match(status, /aria-live="polite"/);
});

const css = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const media = condition => css.split('@media ' + condition + ' {')[1]?.split('@media')[0] ?? '';

test('広い構成では選択だけで操作段を表示し、ホバーやフォーカスで行を伸縮しない', () => {
  assert.match(media('(min-width: 1100px)'), /\.ed-row:not\(\.is-selected\) \.ed-row-actions\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /\.ed-row[^{}]*(?::hover|:focus-within)[^{}]*\.ed-row-actions/);
});

test('狭い構成では名前・つまみ・操作が同じ段に収まり、44pxのボタンと抜粋の省略を保つ', () => {
  const compact = media('(width < 1100px)');
  assert.match(compact, /\.ed-row\s*\{[^}]*grid-template-columns:\s*minmax\(44px, 1fr\) 44px auto/);
  assert.match(compact, /\.ed-row-actions\s*\{[^}]*grid-column:\s*auto/);
  assert.match(compact, /\.ed-row-control\s*\{[^}]*width:\s*44px/);
  assert.match(css, /\.ed-excerpt\s*\{[^}]*text-overflow:\s*ellipsis/);
});

test('プレビューではラベルの高さを枠の外に確保し、縮小時もサイト名を44px以上押せる', () => {
  assert.match(css, /\.uxr-block\.is-selected\s*\{[^}]*margin-block-start:/);
  assert.match(css, /\.ed-block-tag\s*\{[^}]*bottom:\s*calc\(100%/);
  assert.match(css, /\[data-path="site\.name"\]\s*\{[^}]*min-height:\s*calc\(44px \/ var\(--ed-preview-scale/);
  assert.match(css, /#slot-preview [^{]*:focus-visible\s*\{[^}]*outline:[^}]*outline-offset:[^}]*box-shadow:/);
});

test('スマホの通知は、編集画面ではパネルの上端のすぐ上に出て、点数・流れの表示とパネルの中を覆わない', () => {
  const mobile = media('(width < 720px)');
  // 入口・見るだけ（パネルなし）は画面の下。編集画面は、パネルの高さ（--ed-panel-h）の分だけ上。
  assert.match(mobile, /\.app-shell > \.app-toasts\s*\{[^}]*bottom:\s*max\(16px, env\(safe-area-inset-bottom\)\)/);
  const editor = mobile.match(/\.app-shell\[data-screen="editor"\] > \.app-toasts\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(editor, /bottom:\s*calc\(var\(--ed-panel-h, 0px\) \+ 12px\)/);
  assert.doesNotMatch(editor, /\btop:/);
});

test('720px以上の通知は画面下端から16pxの中央に置き、幅を520pxまでに収める', () => {
  const toast = media('(min-width: 720px)').match(/\.app-toasts\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(toast, /\bleft:\s*50%\s*;/);
  assert.match(toast, /\bright:\s*auto\s*;/);
  assert.match(toast, /\bbottom:\s*16px\s*;/);
  assert.match(toast, /\btransform:\s*translateX\(-50%\)\s*;/);
  assert.match(toast, /\bmax-width:\s*min\(520px,\s*calc\(100vw\s*-\s*32px\)\)\s*;/);
});
