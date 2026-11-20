import assert from 'node:assert/strict';
import test from 'node:test';
import * as persist from '../../lib/persist.js';
import { STORAGE_PREFIX } from '../../lib/contract.js';
import { MINIMAL, RESERVE_SAMPLE } from '../fixtures/states.js';
import { environment } from './f2b2a-session.test.mjs';

const current = STORAGE_PREFIX + 'current';
const damagedText = '保存されていた下書きを読み取れませんでした。';
const unavailableText = 'この端末では、作業を保存できません。作ったページは「共有・書き出し」から残してください。';
const changedText = '保存の一覧が別のタブで変わっていました。一覧を更新しました。';
const resume = '新しい内容で保存を始める';
const decline = 'このまま保存しない';
const button = (el, label) => el.querySelectorAll('button').find(node => node.textContent === label);
const edit = (ctx, name) => ctx.dispatch({ type: 'setSite', name });
const banner = (e, text) => e.root.querySelector('#screen-edit').querySelectorAll('[role="status"]')
  .find(node => node.textContent.includes(text));

async function startBlocked(t, status) {
  const e = environment(t);
  const raw = status === 'damaged' ? ' {壊れた原文\n' : JSON.stringify(MINIMAL);
  e.localStorage.setItem(current, raw);
  const storage = {
    ...persist,
    readCurrent: t.mock.fn(() => ({ status, state: null })),
    saveCurrent: t.mock.fn(state => persist.saveCurrent(state, e.localStorage)),
    backupDamagedCurrent: t.mock.fn(() => persist.backupDamagedCurrent(e.localStorage)),
  };
  const ctx = await e.start({ storage });
  assert.equal(e.root.dataset.screen, 'goal');
  ctx.chooseGoal('buy');
  assert.equal(e.root.dataset.screen, 'editor');
  return { e, ctx, storage, raw };
}

test('読み取りを拒まれた端末でも編集でき、帯を閉じて画面を離れるまで古い下書きを守る', async t => {
  const { e, ctx, storage, raw } = await startBlocked(t, 'unavailable');
  const note = banner(e, unavailableText);
  assert.ok(note);
  assert.deepEqual(note.querySelectorAll('button').map(el => el.textContent), ['閉じる']);
  edit(ctx, 'このタブだけの編集');
  t.mock.timers.tick(10000);
  assert.ok(e.root.contains(note));
  button(note, '閉じる').click();
  assert.ok(!e.root.contains(note));
  const status = e.root.querySelector('[data-save-status]');
  assert.match(status.dataset.status, /^(error|paused)$/);
  assert.match(status.textContent, /できません|停止/);
  assert.equal(ctx.getState().site.name, 'このタブだけの編集');
  ctx.toGoalScreen();
  ctx.resume();
  assert.equal(banner(e, unavailableText), undefined);
  e.window.dispatchEvent(new Event('pagehide'));
  e.stop();
  assert.equal(storage.saveCurrent.mock.callCount(), 0);
  assert.equal(e.localStorage.getItem(current), raw);
});

test('壊れた原文の退避に成功したときだけ、最新の編集をすぐ1回保存して自動保存を再開する', async t => {
  const { e, ctx, storage, raw } = await startBlocked(t, 'damaged');
  const note = banner(e, damagedText);
  assert.ok(note);
  edit(ctx, 'コピー後に残す');
  t.mock.timers.tick(400);
  e.window.dispatchEvent(new Event('pagehide'));
  assert.equal(storage.saveCurrent.mock.callCount(), 0);
  storage.backupDamagedCurrent.mock.mockImplementationOnce(() => false);
  button(note, resume).click();
  assert.equal(storage.backupDamagedCurrent.mock.callCount(), 1);
  assert.equal(storage.saveCurrent.mock.callCount(), 0);
  assert.ok(e.root.contains(note));
  assert.equal(e.localStorage.getItem(current), raw);
  button(note, resume).click();
  assert.equal(storage.backupDamagedCurrent.mock.callCount(), 2);
  assert.equal(storage.saveCurrent.mock.callCount(), 1);
  assert.equal(e.localStorage.getItem(current + '.damaged'), raw);
  assert.deepEqual(persist.loadCurrent(), ctx.getState());
  assert.equal(e.root.querySelector('[data-save-status]').dataset.status, 'saved');
  assert.ok(!e.root.contains(note));
  edit(ctx, '再開した後の入力');
  t.mock.timers.tick(400);
  assert.equal(storage.saveCurrent.mock.callCount(), 2);
  assert.deepEqual(persist.loadCurrent(), ctx.getState());
});

test('「このまま保存しない」を選んだ後は、編集画面を開き直しても自動保存と退避を止めたままにする', async t => {
  const { e, ctx, storage, raw } = await startBlocked(t, 'damaged');
  const note = banner(e, damagedText);
  assert.ok(note);
  button(note, decline).click();
  edit(ctx, '書き出すための名前');
  ctx.toGoalScreen();
  ctx.resume();
  t.mock.timers.tick(800);
  e.window.dispatchEvent(new Event('pagehide'));
  assert.equal(banner(e, damagedText), undefined);
  assert.equal(e.root.querySelector('[data-save-status]').dataset.status, 'paused');
  e.stop();
  assert.equal(storage.saveCurrent.mock.callCount(), 0);
  assert.equal(storage.backupDamagedCurrent.mock.callCount(), 0);
  assert.equal(e.localStorage.getItem(current), raw);
});

for (const action of ['消す', '名前を変える']) {
  test('古い行で「' + action + '」を押したら、表示時の保存時刻を渡して別の作業を一覧に表示する', async t => {
    const e = environment(t, { draft: MINIMAL });
    const ctx = await e.start();
    const { id } = persist.saveSlot(MINIMAL, '前の案');
    const expected = { savedAt: persist.listSlots()[0].savedAt };
    const remove = t.mock.method(ctx.slots, 'remove');
    const rename = t.mock.method(ctx.slots, 'rename');
    const list = t.mock.method(ctx.slots, 'list');
    ctx.openSlots();
    const dialog = e.root.querySelector('#dlg-slots');
    if (action === '名前を変える') button(dialog, action).click();
    persist.deleteSlot(id);
    t.mock.timers.tick(1);
    assert.equal(persist.saveSlot(RESERVE_SAMPLE, '別のタブの作業').id, id);
    const before = list.mock.callCount();
    if (action === '消す') {
      button(dialog, action).click();
      assert.deepEqual(remove.mock.calls.at(-1)?.arguments, [id, expected]);
    } else {
      const input = dialog.querySelector('.cs-slot-row').querySelector('input');
      input.value = '古い名前変更';
      input.closest('form').dispatchEvent(new Event('submit', { cancelable: true }));
      assert.deepEqual(rename.mock.calls.at(-1)?.arguments, [id, '古い名前変更', expected]);
    }
    assert.ok(list.mock.callCount() > before);
    assert.equal(dialog.querySelector('h4').textContent, '別のタブの作業');
    assert.equal(e.root.querySelector('#toasts').textContent, changedText);
    assert.deepEqual(persist.loadSlot(id), RESERVE_SAMPLE);
  });
}
