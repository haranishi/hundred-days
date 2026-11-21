import assert from 'node:assert/strict';
import test from 'node:test';
import { STORAGE_PREFIX } from '../../lib/contract.js';
import { MINIMAL, RESERVE_SAMPLE } from '../fixtures/states.js';
import { environment } from './f2b2a-session.test.mjs';

const current = STORAGE_PREFIX + 'current';
const remote = { ...MINIMAL, site: { name: '別のタブの下書き' } };
const reload = '別のタブの内容を読み込む';
const keep = 'このタブの内容で保存を続ける';
const button = (root, label) => root.querySelectorAll('button').find(el => el.textContent === label);
const edit = (ctx, name) => ctx.dispatch({ type: 'setSite', name });

for (const trigger of ['400ms', 'pagehide', 'visibilitychange']) {
  test(trigger + 'で保存する直前に別の下書きがあれば、更新通知の到着前でも保存を止める', async t => {
    const e = environment(t, { draft: MINIMAL });
    const ctx = await e.start();
    edit(ctx, '編集中の旧稿');
    const raw = JSON.stringify(remote);
    e.localStorage.setItem(current, raw);
    const writes = t.mock.method(e.localStorage, 'setItem');
    if (trigger === '400ms') t.mock.timers.tick(400);
    else if (trigger === 'pagehide') e.window.dispatchEvent(new Event('pagehide'));
    else {
      e.doc.hidden = true;
      e.doc.dispatchEvent(new Event('visibilitychange'));
    }
    assert.equal(writes.mock.callCount(), 0);
    assert.equal(e.localStorage.getItem(current), raw);
    assert.equal(ctx.getState().site.name, '編集中の旧稿');
    assert.equal(e.root.querySelector('[data-save-status]').dataset.status, 'paused');
    assert.ok(button(e.root, reload)?.closest('[role="status"]'));
    assert.equal(e.root.querySelector('#toasts').textContent, '');
    edit(ctx, '帯を出した後の入力');
    t.mock.timers.tick(500);
    e.stop();
    assert.equal(writes.mock.callCount(), 0);
  });
}

test('起動時の原文と自分の直前の保存を基準にし、同じ本文でも原文が変われば止める', async t => {
  const e = environment(t);
  e.localStorage.setItem(current, JSON.stringify(MINIMAL, null, 2));
  const ctx = await e.start();
  for (const name of ['一度目の保存', '二度目の保存']) {
    edit(ctx, name);
    t.mock.timers.tick(400);
    assert.equal(JSON.parse(e.localStorage.getItem(current)).site.name, name);
    assert.equal(e.root.querySelector('[data-save-status]').dataset.status, 'saved');
  }
  const otherRaw = JSON.stringify(ctx.getState(), null, 2);
  e.localStorage.setItem(current, otherRaw);
  edit(ctx, '三度目の編集');
  t.mock.timers.tick(400);
  assert.equal(e.localStorage.getItem(current), otherRaw);
  assert.ok(button(e.root, reload));
});

test('下書きの保存先が空か、書く直前だけ読み取りを拒まれても入力を保存する', async t => {
  const e = environment(t, { query: '&goal=buy' });
  const ctx = await e.start();
  edit(ctx, '空の保存先への初稿');
  t.mock.timers.tick(400);
  assert.equal(JSON.parse(e.localStorage.getItem(current)).site.name, '空の保存先への初稿');
  edit(ctx, '読めない端末の原稿');
  const read = t.mock.method(e.localStorage, 'getItem', () => { throw Error('読み取り不可'); });
  e.window.dispatchEvent(new Event('pagehide'));
  read.mock.restore();
  assert.equal(JSON.parse(e.localStorage.getItem(current)).site.name, '読めない端末の原稿');
  assert.equal(e.root.querySelector('[data-save-status]').dataset.status, 'saved');
});

test('保存の直後に他のタブが書いた値を、自分の保存済みの値として扱わない', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  const put = e.localStorage.setItem;
  const raw = JSON.stringify(remote);
  const write = t.mock.method(e.localStorage, 'setItem', (key, value) => {
    put(key, value);
    if (key === current) put(key, raw);
  });
  edit(ctx, '最初の保存');
  t.mock.timers.tick(400);
  write.mock.restore();
  edit(ctx, '次の入力');
  e.window.dispatchEvent(new Event('pagehide'));
  assert.equal(e.localStorage.getItem(current), raw);
  assert.ok(button(e.root, reload));
});

for (const choice of [reload, keep]) {
  test('帯で「' + choice + '」を選んだ後は、遅れて届いた更新通知で次の保存を止めない', async t => {
    const e = environment(t, { draft: MINIMAL });
    const ctx = await e.start();
    edit(ctx, '手元の下書き');
    const raw = JSON.stringify(remote, null, 2);
    e.localStorage.setItem(current, raw);
    t.mock.timers.tick(400);
    const action = button(e.root, choice);
    assert.ok(action);
    action.click();
    assert.equal(ctx.getState().site.name, choice === reload ? remote.site.name : '手元の下書き');
    e.window.dispatchEvent(Object.assign(new Event('storage'), {
      key: current, newValue: raw, storageArea: e.localStorage,
    }));
    edit(ctx, '選んだ後の保存');
    t.mock.timers.tick(400);
    assert.equal(JSON.parse(e.localStorage.getItem(current)).site.name, '選んだ後の保存');
    assert.equal(button(e.root, choice), undefined);
  });
}

test('見るだけ画面のフォームのボタンをクリックすると、送信されないことを通知する', async t => {
  const hash = '#v=1.' + Buffer.from(JSON.stringify(RESERVE_SAMPLE)).toString('base64url');
  const e = environment(t, { hash });
  await e.start();
  assert.equal(e.root.dataset.screen, 'viewer');
  const page = e.root.querySelector('[data-view-page]');
  // 試験用DOMはinnerHTMLを展開しないため、描画した見本のボタンをクリック先として再現する。
  const rendered = page.innerHTML.match(/<button\b[^>]*class="([^"]*\buxr-form-submit\b[^"]*)"[^>]*>/);
  assert.ok(rendered);
  const submit = e.doc.createElement('button');
  submit.className = rendered[1];
  page.append(submit);
  submit.click();
  assert.equal(e.root.querySelector('#toasts').textContent, 'このフォームは見本です。入力した内容は送信されません。');
  assert.equal(e.location.hash, hash);
});

test('保存一覧の時刻を指定して開くと、同じIDで作り直された作業を返さない', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  const { id } = ctx.slots.save('以前の案');
  const [row] = ctx.slots.list();
  assert.ok(ctx.slots.remove(id, row));
  edit(ctx, '別の作業');
  assert.equal(ctx.slots.save('新しい案').id, id);
  assert.equal(ctx.slots.load(id, { savedAt: row.savedAt }), null);
  assert.deepEqual(ctx.slots.load(id), ctx.getState());
});
