import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as persist from '../../lib/persist.js';
import { MINIMAL, RESERVE_SAMPLE } from '../fixtures/states.js';
import { environment } from './f2b2a-session.test.mjs';

const viewHash = state => '#v=1.' + Buffer.from(JSON.stringify(state)).toString('base64url');

test('スマホの通知位置は開閉途中もパネルの外寸に追従し、入口・閲覧・終了時に高さを残さない', async t => {
  const observed = new Map();
  class ResizeObserver {
    constructor(notify) { this.notify = notify; }
    observe(target) { observed.set(target, this.notify); }
    disconnect() {
      for (const [target, notify] of observed) if (notify === this.notify) observed.delete(target);
    }
  }
  const e = environment(t, { draft: MINIMAL, query: '&fresh=1', width: 390, resizeObserver: ResizeObserver });
  const panel = e.root.querySelector('#slot-panel');
  const height = () => e.root.style.getPropertyValue('--ed-panel-h');
  let box = 86;
  panel.getBoundingClientRect = () => ({ height: box });
  function resize(px) {
    box = px;
    // 下端の余白と境界線が実寸に含まれる端末を再現する。
    observed.get(panel)([{ target: panel, borderBoxSize: [{ blockSize: px }], contentRect: { height: px - 35 } }]);
  }
  const ctx = await e.start();
  assert.equal(height(), '0px');
  ctx.resume();
  assert.ok(observed.has(panel));
  resize(86);
  assert.equal(height(), '86px');
  e.root.querySelector('#tab-diagnosis').click();
  assert.equal(ctx.isMobilePanelOpen(), true);
  for (const px of [172.5, 320]) {
    resize(px);
    assert.equal(height(), px + 'px');
  }
  e.root.querySelector('[data-fold]').click();
  assert.equal(ctx.isMobilePanelOpen(), false);
  resize(86);
  assert.equal(height(), '86px');
  ctx.toGoalScreen();
  assert.equal(height(), '0px');
  resize(86);
  assert.equal(height(), '0px');
  ctx.resume();
  assert.equal(height(), '86px');
  await e.visit(viewHash(MINIMAL));
  assert.equal(e.root.dataset.screen, 'viewer');
  assert.equal(height(), '0px');
  e.stop();
  assert.equal(observed.has(panel), false);
  assert.equal(height(), '');
});

test('720px未満の通知は下端基準で、編集時はパネル上に12px、入口と閲覧は安全領域を空ける', () => {
  const css = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
  const mobile = css.split('@media (width < 720px) {')[1].split('@media')[0];
  const rules = [...mobile.matchAll(/([^{}]+\.app-toasts)\s*\{([^}]*)\}/g)];
  const rule = selector => rules.find(([, match]) => match.trim() === selector)?.[2] ?? '';
  const common = rule('.app-shell > .app-toasts');
  const editor = rule('.app-shell[data-screen="editor"] > .app-toasts');
  assert.match(editor, /bottom:\s*calc\(var\(--ed-panel-h,\s*0px\)\s*\+\s*12px\)\s*;/);
  assert.doesNotMatch(editor, /safe-area-inset-bottom/);
  assert.match(common, /bottom:\s*max\(16px,\s*env\(safe-area-inset-bottom\)\)/);
  const position = common + editor;
  for (const side of ['left', 'right']) assert.match(position, new RegExp(side + ':\\s*12px'));
  assert.match(position, /width:\s*auto/);
  assert.match(position, /max-width:\s*none/);
  for (const [, , properties] of rules) assert.doesNotMatch(properties, /\btop\s*:/);
});

const openedMessage = '保存したページを開きました。';

function openSlot(e, ctx, id) {
  ctx.openSlots();
  e.root.querySelector('#dlg-slots').querySelector('[data-slot-open="' + id + '"]').click();
}

test('保存を開くと通知は1枚だけで、ボタンを押すと開く直前の作業に戻る', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  ctx.dispatch({ type: 'setSite', name: '開く直前の店名' });
  const before = ctx.getState();
  const { id } = persist.saveSlot(RESERVE_SAMPLE, '保存した案');
  const live = e.root.querySelector('#toasts');
  // 二度出して一枚を残す実装でも、読み上げには二度伝わってしまう。
  const additions = t.mock.method(live, 'append');
  openSlot(e, ctx, id);
  assert.deepEqual(ctx.getState(), RESERVE_SAMPLE);
  assert.equal(e.root.querySelector('dialog[open]'), null);
  assert.equal(additions.mock.callCount(), 1);
  assert.equal(live.childElementCount, 1);
  assert.equal(live.firstChild.querySelector('span').textContent, openedMessage);
  assert.equal(live.querySelector('button')?.textContent, '元に戻す');
  live.querySelector('button').click();
  assert.deepEqual(ctx.getState(), before);
  assert.equal(live.childElementCount, 0);
});

test('入口の下書きから保存を開いて編集すると、古い「元に戻す」を押しても編集が残る', async t => {
  const e = environment(t, { draft: MINIMAL, query: '&fresh=1' });
  const ctx = await e.start();
  const { id } = persist.saveSlot(RESERVE_SAMPLE, '別の案');
  openSlot(e, ctx, id);
  const live = e.root.querySelector('#toasts');
  const stale = live.querySelector('button');
  assert.equal(stale?.textContent, '元に戻す');
  ctx.dispatch({ type: 'setSite', name: '読み込み後の店名' });
  assert.equal(live.childElementCount, 0);
  stale.click();
  assert.equal(ctx.getState().site.name, '読み込み後の店名');
});

test('下書きのない入口から最初の保存を開くと、成功を1枚で知らせ、空の履歴で始まる', async t => {
  const e = environment(t);
  const ctx = await e.start();
  const { id } = persist.saveSlot(RESERVE_SAMPLE, '最初の案');
  openSlot(e, ctx, id);
  const live = e.root.querySelector('#toasts');
  assert.equal(live.childElementCount, 1);
  assert.equal(live.textContent, openedMessage);
  assert.equal(live.querySelector('button'), null);
  assert.equal(ctx.canUndo(), false);
  assert.deepEqual(ctx.getState(), RESERVE_SAMPLE);
});

test('一覧を開いた後で保存が消えていたら、エラーを一覧内に出して編集中のページを保つ', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  const { id } = persist.saveSlot(RESERVE_SAMPLE, '別の案');
  ctx.openSlots();
  const dialog = e.root.querySelector('#dlg-slots');
  persist.deleteSlot(id);
  dialog.querySelector('[data-slot-open]').click();
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelector('[role="alert"]').textContent, '保存したページを読み取れませんでした。');
  assert.deepEqual(ctx.getState(), MINIMAL);
});

test('診断を下まで読んでから見出しを消すと、新たな必須の不足を先頭に出し、フォーカスを奪わない', async t => {
  const e = environment(t, { draft: RESERVE_SAMPLE });
  const ctx = await e.start();
  ctx.setTab('diagnosis');
  const panel = e.root.querySelector('#panel-diagnosis');
  const site = e.root.querySelector('[data-site]');
  site.focus();
  panel.scrollTop = 480;
  const id = RESERVE_SAMPLE.blocks[0].id;
  ctx.dispatch({ type: 'setProp', id, path: ['title'], value: 'あ'.repeat(30) });
  assert.equal(ctx.diagnose().items.find(item => item.id === 'hero-title-short').ok, false);
  assert.equal(panel.scrollTop, 480);
  ctx.dispatch({ type: 'removeBlock', id });
  assert.ok(panel.querySelector('[data-control="hero-first/fix"]'));
  assert.equal(panel.scrollTop, 0);
  assert.ok(e.doc.activeElement === site);
});

test('同じ必須の不足が続くときと「なおす」で解決したときは、診断の読んでいる位置を保つ', async t => {
  const e = environment(t, { draft: RESERVE_SAMPLE });
  const ctx = await e.start();
  ctx.setTab('diagnosis');
  const panel = e.root.querySelector('#panel-diagnosis');
  ctx.dispatch({ type: 'removeBlock', id: RESERVE_SAMPLE.blocks[0].id });
  panel.scrollTop = 275;
  ctx.dispatch({ type: 'setSite', name: '再編集した名前' });
  assert.equal(panel.scrollTop, 275);
  const fix = panel.querySelector('[data-control="hero-first/fix"]');
  fix.focus();
  fix.click();
  assert.equal(ctx.diagnose().items.find(item => item.id === 'hero-first').ok, true);
  assert.equal(panel.scrollTop, 275);
  assert.equal(e.doc.activeElement.dataset.control, 'completed');
});

test('保存通知は選択・タブ・デバイスの変更で保ち、編集・取り消し・やり直し・画面移動で消す', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  const live = e.root.querySelector('#toasts');
  ctx.slots.save('途中の案');
  ctx.select('b2');
  ctx.setTab('look');
  ctx.setDevice('pc');
  assert.equal(live.textContent, '名前をつけて保存しました。');
  ctx.dispatch({ type: 'setSite', name: '変更後の名前' });
  assert.equal(live.childElementCount, 0);
  for (const change of [ctx.undo, ctx.redo, ctx.toGoalScreen]) {
    ctx.toast('保存しました。');
    change();
    assert.equal(live.childElementCount, 0);
  }
});

test('別の共有ページへ移ると、前のページで出した情報の通知が消える', async t => {
  const e = environment(t, { hash: viewHash(MINIMAL) });
  const ctx = await e.start();
  ctx.toast('このフォームは見本です。入力した内容は送信されません。');
  const live = e.root.querySelector('#toasts');
  assert.equal(live.childElementCount, 1);
  await e.visit(viewHash(RESERVE_SAMPLE));
  assert.equal(e.root.dataset.screen, 'viewer');
  assert.equal(live.childElementCount, 0);
});

test('読み取りエラーは編集と画面移動を経ても次の通知まで残る', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  const live = e.root.querySelector('#toasts');
  assert.equal(ctx.slots.load('存在しない保存'), null);
  const alert = live.querySelector('[role="alert"]');
  assert.ok(alert);
  ctx.dispatch({ type: 'setSite', name: '新しい名前' });
  ctx.undo();
  ctx.toGoalScreen();
  t.mock.timers.tick(60000);
  assert.ok(live.firstChild === alert);
  ctx.toast('保存しました。');
  assert.equal(live.textContent, '保存しました。');
});

test('ボタン付きの通知は8秒で消え、期限を過ぎたボタンを押しても実行しない', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  const live = e.root.querySelector('#toasts');
  const action = t.mock.fn();
  ctx.toast('なおしました', { actionLabel: '元に戻す', onAction: action });
  const button = live.querySelector('button');
  t.mock.timers.tick(7999);
  assert.ok(live.contains(button));
  t.mock.timers.tick(1);
  assert.equal(live.childElementCount, 0);
  button.click();
  assert.equal(action.mock.callCount(), 0);
});
