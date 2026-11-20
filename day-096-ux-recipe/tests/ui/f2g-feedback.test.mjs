import assert from 'node:assert/strict';
import test from 'node:test';
import * as persist from '../../lib/persist.js';
import { MINIMAL } from '../fixtures/states.js';
import { environment } from './f2b2a-session.test.mjs';

test('参加の見本の人数に印を付けると、閉じた診断行と操作の間に理由が一度だけ出る', async t => {
  const e = environment(t, { query: '&goal=event' });
  const ctx = await e.start();
  const limited = ctx.getState().blocks.find(block => block.type === 'limited');
  ctx.select(limited.id, { path: 'real' });
  const check = e.root.querySelector('#panel-edit').querySelector('[data-path="real"]');
  check.checked = true;
  check.dispatchEvent(new Event('change'));
  ctx.setTab('diagnosis');

  const rule = ctx.diagnose().items.find(item => item.id === 'honest-limited');
  assert.match(rule.note, /見本のまま/u);
  const details = e.root.querySelector('#panel-diagnosis').querySelector('[data-detail="honest-limited"]');
  const card = details.parentElement;
  assert.equal(details.open, false);
  const status = details.querySelector('summary').querySelector('.cs-rule-status');
  assert.match(status.textContent, /まだです/u);
  assert.equal(status.querySelector('.cs-rule-mark').textContent, '！');
  assert.equal(card.children[1]?.tagName, 'P');
  assert.equal(card.children[1].textContent, rule.note);
  assert.ok(card.children[2].contains(card.querySelector('[data-control="honest-limited/block"]')));
  details.open = true;
  assert.ok(!details.textContent.includes(rule.note));
  assert.equal(card.textContent.split(rule.note).length - 1, 1);
});

test('プレビューからサイト名を選ぶと、見た目パネルの2行の店名欄にフォーカスが移る', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  ctx.select(null, { path: 'site.name', tab: 'look' });
  const field = e.root.querySelector('#panel-look').querySelector('[data-path="site.name"]');
  assert.equal(field.tagName, 'TEXTAREA');
  assert.equal(field.rows, 2);
  assert.ok(e.doc.activeElement === field);
});

test('共有を開くと前の取り消しは無効になり、保存ダイアログでの操作結果はそこに残る', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  const live = e.root.querySelector('#toasts');
  const undo = t.mock.fn();
  ctx.toast('1か所を置き換えました。', { actionLabel: '元に戻す', onAction: undo });
  const stale = live.querySelector('button');
  ctx.openShare('export');
  const share = e.root.querySelector('#dlg-share');
  assert.ok(share.open);
  assert.equal(live.childElementCount, 0);
  stale.click();
  assert.equal(undo.mock.callCount(), 0);

  share.close();
  ctx.openSlots();
  const slots = e.root.querySelector('#dlg-slots');
  slots.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
  ctx.openSlots();
  assert.ok(live.parentElement === slots);
  assert.equal(live.textContent, '名前をつけて保存しました。');
});

test('前のエラーはダイアログを開くと消え、一覧を開く途中の読み取りエラーは一覧内に出る', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start({ storage: { ...persist, listSlots: () => null } });
  const live = e.root.querySelector('#toasts');
  ctx.slots.load('存在しない保存');
  assert.ok(live.querySelector('[role="alert"]'));
  ctx.openAppShare();
  assert.equal(live.childElementCount, 0);
  e.root.querySelector('#dlg-app-share').close();

  ctx.openSlots();
  assert.ok(live.parentElement === e.root.querySelector('#dlg-slots'));
  assert.equal(live.querySelector('[role="alert"]').textContent, '保存の一覧を読み取れませんでした。');
});

test('取り消しボタンを操作中でも8秒で通知が消え、元の操作にフォーカスが戻る', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  const origin = e.root.querySelector('#slot-topbar').querySelector('[data-slots]');
  origin.focus();
  const undo = t.mock.fn();
  ctx.toast('なおしました', { actionLabel: '元に戻す', onAction: undo });
  const live = e.root.querySelector('#toasts');
  const item = live.firstChild;
  const button = item.querySelector('button');
  t.mock.timers.tick(7000);
  button.focus();
  item.dispatchEvent(new Event('focusin'));
  item.dispatchEvent(new Event('pointerenter'));
  t.mock.timers.tick(999);
  assert.ok(live.contains(button));
  t.mock.timers.tick(1);
  assert.equal(live.childElementCount, 0);
  assert.ok(e.doc.activeElement === origin);
  button.click();
  assert.equal(undo.mock.callCount(), 0);
});
