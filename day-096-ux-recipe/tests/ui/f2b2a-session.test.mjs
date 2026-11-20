import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as app from '../../app.js';
import { STORAGE_PREFIX } from '../../lib/contract.js';
import { createState } from '../../lib/state.js';
import { diagnose } from '../../lib/rules.js';
import { loadCurrent, loadSlot, saveCurrent } from '../../lib/persist.js';
import { mountToast } from '../../lib/ui-toast.js';
import { MINIMAL } from '../fixtures/states.js';
import { stripWrap } from '../render/f2e-wrap-helpers.mjs';

const currentKey = STORAGE_PREFIX + 'current';
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const link = state => '#v=1.' + Buffer.from(JSON.stringify(state)).toString('base64url');
const shared = { ...MINIMAL, goal: 'buy', site: { name: '共有された店' }, blocks: [] };
const help = '送ってくれた人にリンクをもう一度送ってもらうか、下から目的を選んで始めてください。';
const warning = 'いまの作業は、新しいページに置き換わります。残したいときは、先に「保存・開く」で名前をつけて保存してください。';
const markup = readFileSync(new URL('../../index.html', import.meta.url), 'utf8').split('<noscript>')[0];
const dataKey = key => key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// 実際のHTMLで各部品を起動し、画面遷移・イベント・保存を同じセッションで試す。
// レイアウト計算と、ページ本文のHTMLの描画は実ブラウザで確かめる。
class Element extends EventTarget {
  constructor(tag, doc) {
    super();
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.text = this.className = '';
    this.scrollTop = 0;
    this.style = {
      setProperty(key, value) { this[key] = String(value); },
      getPropertyValue(key) { return this[key] ?? ''; },
      removeProperty(key) { delete this[key]; },
    };
    this.classList = {
      add: name => this.className += ' ' + name,
      remove: name => this.className = this.className.split(/\s+/).filter(v => v !== name).join(' '),
      toggle: (name, on) => { this.classList.remove(name); if (on) this.classList.add(name); },
    };
  }
  setAttribute(key, value) {
    this.attributes.set(key, String(value));
    if (key.startsWith('data-')) this.dataset[dataKey(key)] = String(value);
    if (key === 'id') this.id = value;
    if (key === 'class') this.className = value;
    if (key === 'hidden') this.hidden = true;
  }
  getAttribute(key) {
    if (key.startsWith('data-')) return this.dataset[dataKey(key)] ?? null;
    if (key === 'open' || key === 'hidden') return this[key] ? '' : null;
    return this.attributes.get(key) ?? this[key] ?? null;
  }
  hasAttribute(key) { return this.getAttribute(key) !== null; }
  removeAttribute(key) { this.attributes.delete(key); }
  get firstChild() { return this.children[0]; }
  get childElementCount() { return this.children.length; }
  get isConnected() { return this.ownerDocument.body.contains(this); }
  get textContent() { return this.text + this.children.map(node => node.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this.text = String(value); }
  append(...nodes) { for (const node of nodes) this.insertBefore(node, null); }
  prepend(node) { this.insertBefore(node, this.firstChild); }
  insertBefore(node, anchor) {
    if (typeof node === 'string') { this.text += node; return; }
    node.remove();
    this.children.splice(anchor ? this.children.indexOf(anchor) : this.children.length, 0, node);
    node.parentElement = this;
  }
  before(node) { this.parentElement.insertBefore(node, this); }
  after(node) {
    const peers = this.parentElement.children;
    this.parentElement.insertBefore(node, peers[peers.indexOf(this) + 1]);
  }
  remove() {
    const parent = this.parentElement;
    if (parent) parent.children.splice(parent.children.indexOf(this), 1);
    this.parentElement = null;
  }
  replaceChildren(...nodes) {
    for (const child of [...this.children]) child.remove();
    this.text = '';
    this.append(...nodes);
  }
  contains(node) { return !!node && (node === this || this.contains(node.parentElement)); }
  matches(selectors) {
    return selectors.split(',').some(part => {
      const s = part.trim();
      if (s === '*') return true;
      if (s === ':focus-within') return this.contains(this.ownerDocument.activeElement);
      if (s === ':hover') return false;
      if (s.startsWith('#')) return this.id === s.slice(1);
      if (s.startsWith('.')) return this.className.split(/\s+/).includes(s.slice(1));
      const match = s.match(/^(\w+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/);
      if (!match) return false;
      const [, tag, attr, value] = match;
      return (!tag || this.tagName === tag.toUpperCase()) &&
        (!attr || (value === undefined ? this.hasAttribute(attr) : this.getAttribute(attr) === value));
    });
  }
  closest(s) { return this.matches(s) ? this : this.parentElement?.closest(s) ?? null; }
  querySelectorAll(s) {
    return this.children.flatMap(el => [...(el.matches(s) ? [el] : []), ...el.querySelectorAll(s)]);
  }
  querySelector(s) { return this.querySelectorAll(s)[0] ?? null; }
  focus() { this.ownerDocument.activeElement = this; }
  getClientRects() { return this.closest('[hidden]') ? [] : [{}]; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; }
  scrollIntoView() {}
  showModal() { this.open = true; }
  close() {
    if (!this.open) return;
    this.open = false;
    queueMicrotask(() => this.dispatchEvent(new Event('close')));
  }
  click() {
    if (this.disabled) return;
    fire(this, 'click');
    if (this.closest('form[method="dialog"]')) this.closest('dialog')?.close();
  }
}

function fire(target, type, fields = {}) {
  const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), fields);
  Object.defineProperty(event, 'target', { value: target });
  for (let node = target; node; node = node.parentElement) node.dispatchEvent(event);
  return event;
}

export function environment(t, {
  query = '', hash = '', draft, width = 1440, resizeObserver = class { observe() {} disconnect() {} },
} = {}) {
  const doc = new EventTarget();
  doc.createElement = tag => new Element(tag, doc);
  doc.createElementNS = (_, tag) => doc.createElement(tag);
  doc.body = doc.createElement('body');
  doc.head = doc.createElement('head');
  doc.activeElement = doc.body;
  doc.querySelector = s => doc.head.querySelector(s) ?? doc.body.querySelector(s);
  doc.getElementById = id => doc.querySelector('#' + id);
  const stack = [doc.body];
  const tags = markup.slice(markup.indexOf('<div id="app"')).matchAll(/<(\/?)([\w-]+)\b([^>]*)>|([^<]+)/g);
  for (const [, close, tag, attrs, words] of tags) {
    if (words) { if (words.trim()) stack.at(-1).append(words.trim()); continue; }
    if (close) { stack.pop(); continue; }
    const node = doc.createElement(tag);
    for (const [, key, value] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) node.setAttribute(key, value ?? '');
    stack.at(-1).append(node);
    if (!attrs.endsWith('/') && !['img', 'br', 'wbr', 'input'].includes(tag)) stack.push(node);
  }
  const root = doc.getElementById('app');
  const location = new URL('https://example.test/day/?debug=1&tips=0' + query + hash);
  const window = new EventTarget();
  window.history = { replaceState(_state, _title, href) { location.href = href; } };
  const values = new Map();
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  if (draft) saveCurrent(draft, localStorage);
  const media = query => {
    const minimum = query.match(/min-width:\s*(\d+)px/);
    return Object.assign(new EventTarget(), { matches: !minimum || width >= Number(minimum[1]) });
  };
  const globals = { document: doc, window, location, localStorage, matchMedia: media,
    ResizeObserver: resizeObserver };
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  let mounted;
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => {
    mounted?.destroy();
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
  });
  return {
    doc, root, window, location, localStorage,
    start: async options => { mounted = await app.mountApp(root, options); return mounted.ctx; },
    stop() { mounted.destroy(); mounted = null; },
    async visit(hash) { location.hash = hash; window.dispatchEvent(new Event('hashchange')); await nextTurn(); },
    storage(key, newValue) {
      if (newValue === null) localStorage.removeItem(key);
      else localStorage.setItem(key, newValue);
      window.dispatchEvent(Object.assign(new Event('storage'), { key, newValue, storageArea: localStorage }));
    },
  };
}

const button = (node, label) => node?.querySelectorAll('button').find(el => el.textContent === label);
const activeDialog = root => root.querySelector('dialog[open]');
const notice = root => root.querySelector('#toasts');
const choose = (root, goal) => root.querySelector('[data-goal="' + goal + '"]').click();
const editName = (ctx, name) => ctx.dispatch({ type: 'setSite', name });

test('目的の指定で編集済みの下書きがあれば入口を開き、URLを消して保存を守る', async t => {
  const e = environment(t, { query: '&goal=buy', draft: MINIMAL });
  await e.start();
  assert.equal(e.root.dataset.screen, 'goal');
  assert.equal(e.location.searchParams.has('goal'), false);
  assert.equal(notice(e.root).textContent, '続きの作業があるため、目的の選択から始めます。');
  t.mock.timers.tick(1000);
  assert.deepEqual(loadCurrent(), MINIMAL);
});

test('入口の置換は中止でき、同意しても最初の編集までは以前の下書きを保存しておく', async t => {
  const e = environment(t, { query: '&fresh=1', draft: MINIMAL });
  const ctx = await e.start();
  choose(e.root, 'buy');
  let dialog = activeDialog(e.root);
  assert.ok(dialog?.textContent.includes(warning));
  button(dialog, 'やめる').click();
  assert.equal(e.root.dataset.screen, 'goal');
  choose(e.root, 'buy');
  dialog = activeDialog(e.root);
  button(dialog, '置き換える').click();
  assert.equal(ctx.getState().goal, 'buy');
  t.mock.timers.tick(500);
  e.window.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(loadCurrent(), MINIMAL);
  editName(ctx, '藍の店');
  t.mock.timers.tick(400);
  assert.equal(loadCurrent().site.name, '藍の店');
  ctx.undo();
  ctx.undo();
  assert.deepEqual(ctx.getState(), MINIMAL);
});

for (const [name, settings] of [
  ['下書きなしの目的指定', { query: '&goal=buy' }],
  ['未編集の下書きがある入口', { query: '&fresh=1', draft: createState('reserve') }],
]) {
  test(name + 'では確認せず見本を開き、選択だけで保存しない', async t => {
    const e = environment(t, settings);
    const ctx = await e.start();
    if (e.root.dataset.screen === 'goal') choose(e.root, 'buy');
    assert.ok(!activeDialog(e.root));
    assert.equal(ctx.getState().goal, 'buy');
    t.mock.timers.tick(1000);
    assert.deepEqual(loadCurrent(), settings.draft ?? null);
  });
}

test('共有ページの点を表示し、行き帰りで編集の履歴、選択、タブを保ち、ダイアログを閉じる', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  editName(ctx, '作業中');
  editName(ctx, '戻せる名前');
  ctx.undo();
  ctx.select('b2');
  ctx.setTab('look');
  const history = ctx.getHistory();
  ctx.openSlots();
  await e.visit(link(shared));
  assert.equal(e.root.dataset.screen, 'viewer');
  assert.ok(!activeDialog(e.root));
  assert.ok(ctx.getHistory() === history);
  assert.equal(ctx.getSelectedId(), 'b2');
  assert.equal(ctx.getTab(), 'look');
  assert.equal(e.root.querySelector('#screen-view').querySelector('[data-score]').textContent, 'UX診断 ' + diagnose(shared).score + '点');
  ctx.openAppShare();
  await e.visit('');
  assert.ok(!activeDialog(e.root));
  assert.ok(ctx.getHistory() === history);
  assert.ok(ctx.isMobilePanelOpen());
  ctx.redo();
  assert.equal(ctx.getState().site.name, '戻せる名前');
});

test('共有ページをもとに作るときだけ確認し、決定後も1回で下書きに戻せる', async t => {
  const e = environment(t, { draft: MINIMAL, hash: link(shared) });
  const ctx = await e.start();
  e.root.querySelector('[data-adopt]').click();
  const dialog = activeDialog(e.root);
  assert.ok(dialog?.textContent.includes(warning));
  assert.equal(e.root.dataset.screen, 'viewer');
  button(dialog, '置き換える').click();
  assert.deepEqual(ctx.getState(), shared);
  ctx.undo();
  assert.deepEqual(ctx.getState(), MINIMAL);
});

test('閲覧から入口で保存したとき、保存名の初期値も本文も編集側の下書きになる', async t => {
  const e = environment(t, { draft: MINIMAL, hash: link(shared) });
  const ctx = await e.start();
  const fromViewer = ctx.slots.save('自分の控え');
  assert.deepEqual(loadSlot(fromViewer.id), MINIMAL);
  e.root.querySelector('[data-choose]').click();
  ctx.openSlots();
  const dialog = activeDialog(e.root);
  const name = dialog.querySelector('textarea');
  assert.equal(name?.rows, 2);
  assert.equal(name.value, MINIMAL.site.name);
  fire(dialog.querySelector('form'), 'submit');
  const row = ctx.slots.list()[0];
  assert.equal(row.name, MINIMAL.site.name);
  assert.deepEqual(loadSlot(row.id), MINIMAL);
});

test('目的を変える確認を出した後で共有リンクへ移ると、古い決定を適用できない', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  ctx.toGoalScreen();
  choose(e.root, 'buy');
  const dialog = activeDialog(e.root);
  assert.ok(dialog);
  const confirm = dialog.querySelector('.app-primary');
  await e.visit(link(shared));
  assert.ok(!activeDialog(e.root));
  confirm.click();
  assert.equal(e.root.dataset.screen, 'viewer');
  assert.deepEqual(loadCurrent(), MINIMAL);
});

test('最初のリンクを復号している間に次のリンクへ移っても最後のページが表示される', async t => {
  const e = environment(t, { hash: link(MINIMAL) });
  const started = e.start();
  await e.visit(link(shared));
  await started;
  assert.equal(e.root.dataset.screen, 'viewer');
  assert.match(stripWrap(e.root.querySelector('[data-view-page]').innerHTML), /共有された店/); // 文節の折れ目（<wbr>）を除いて比べる
});

test('壊れた共有リンクには、起動時も別リンクへの移動時も理由に続けて次の手を出す', async t => {
  const e = environment(t, { hash: '#v=bad' });
  await e.start();
  assert.ok(notice(e.root).textContent.endsWith(help));
  choose(e.root, 'buy');
  await e.visit('#v=invalid');
  assert.equal(e.root.dataset.screen, 'goal');
  assert.ok(notice(e.root).textContent.endsWith(help));
});

test('通知は1枚で、同じ文なら同じノードで4秒数え直し、エラーは次の通知まで残す', t => {
  const { root } = environment(t);
  const live = notice(root);
  const ui = mountToast(live);
  ui.toast('最初');
  ui.toast('次');
  assert.equal(live.children.length, 1);
  const item = live.firstChild;
  t.mock.timers.tick(3900);
  ui.toast('次');
  assert.ok(live.firstChild === item);
  t.mock.timers.tick(3999);
  assert.equal(live.textContent, '次');
  t.mock.timers.tick(1);
  assert.equal(live.textContent, '');
  ui.toast('失敗', { kind: 'error' });
  t.mock.timers.tick(60000);
  assert.equal(live.textContent, '失敗');
  ui.toast('完了');
  assert.equal(live.textContent, '完了');
  ui.destroy();
});

test('同じ文とボタンで通知し直したら、最新の操作だけが一度実行される', t => {
  const { root } = environment(t);
  const live = notice(root);
  const ui = mountToast(live);
  const calls = [];
  for (const id of [1, 2]) ui.toast('なおしました', { actionLabel: '元に戻す', onAction: () => calls.push(id) });
  assert.equal(live.children.length, 1);
  const action = button(live, '元に戻す');
  action.click();
  action.click();
  assert.deepEqual(calls, [2]);
  ui.destroy();
});

test('診断の取り消しは選択・タブ・幅を変えても残り、別の編集の後は古い操作を実行できない', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  editName(ctx, 'なおした名前');
  ctx.toast('なおしました', { actionLabel: '元に戻す', onAction: ctx.undo });
  const live = notice(e.root);
  const stale = button(live, '元に戻す');
  ctx.select('b2');
  ctx.setTab('diagnosis');
  ctx.setDevice('pc');
  assert.ok(button(live, '元に戻す') === stale);
  editName(ctx, 'その後の入力');
  assert.equal(live.children.length, 0);
  stale.click();
  assert.equal(ctx.getState().site.name, 'その後の入力');
});

test('入口を開いた後、編集画面の削除通知から下書きを巻き戻せない', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  ctx.dispatch({ type: 'removeBlock', id: 'b1' });
  ctx.toast('部品を削除しました。', { actionLabel: '元に戻す', onAction: ctx.undo });
  const stale = button(notice(e.root), '元に戻す');
  ctx.toGoalScreen();
  assert.equal(notice(e.root).children.length, 0);
  stale.click();
  ctx.resume();
  assert.deepEqual(ctx.getState().blocks.map(b => b.id), ['b2']);
  assert.deepEqual(loadCurrent(), ctx.getState());
});

test('閉じたダイアログや取り外した通知領域からも、次の通知を表示できる', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  const live = notice(e.root);
  ctx.openSlots();
  ctx.toast('ダイアログ内');
  assert.ok(live.parentElement === activeDialog(e.root));
  activeDialog(e.root).close();
  await nextTurn();
  assert.ok(live.parentElement === e.root);
  live.remove();
  ctx.toast('次の通知');
  assert.ok(live.parentElement === e.root);
  ctx.openSlots();
  ctx.toast('保存しました');
  e.stop();
  await nextTurn();
  assert.ok(live.parentElement === e.root);
  assert.equal(live.children.length, 0);
  assert.equal(e.window.__uxr, undefined);
});

const keep = 'このタブの内容で保存を続ける';
const reload = '別のタブの内容を読み込む';
for (const choice of [keep, reload]) {
  test('別タブの更新で保存を止め、' + choice, async t => {
    const e = environment(t, { draft: MINIMAL });
    const ctx = await e.start();
    const writes = t.mock.method(e.localStorage, 'setItem');
    editName(ctx, '保存待ち');
    e.storage(currentKey, JSON.stringify(shared));
    const action = button(e.root, choice);
    assert.ok(action);
    const banner = action.closest('[role="status"]');
    assert.ok(banner?.textContent.includes('別のタブで、この作業が更新されました。'));
    assert.ok(!notice(e.root).contains(banner));
    editName(ctx, 'このタブで最後に入力');
    t.mock.timers.tick(800);
    e.window.dispatchEvent(new Event('pagehide'));
    assert.deepEqual(loadCurrent(), shared);
    const recent = { ...shared, site: { name: '別のタブの最終版' } };
    e.storage(currentKey, JSON.stringify(recent));
    const before = writes.mock.callCount();
    action.click();
    const expected = choice === keep ? 'このタブで最後に入力' : recent.site.name;
    assert.equal(ctx.getState().site.name, expected);
    assert.equal(loadCurrent().site.name, expected);
    assert.equal(writes.mock.callCount() - before, choice === keep ? 1 : 0);
    assert.ok(!e.root.contains(banner) || banner.hidden);
    if (choice === reload) assert.equal(ctx.canUndo(), false);
    editName(ctx, '合意した後の入力');
    t.mock.timers.tick(400);
    assert.equal(loadCurrent().site.name, '合意した後の入力');
  });
}

test('無関係な鍵・消えた値・壊れた値では競合の案内を出さず、入力を保存する', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  let input = 0;
  for (const [key, value] of [
    [STORAGE_PREFIX + 'slot.s1', JSON.stringify(shared)], [STORAGE_PREFIX + 'seen', '{}'],
    [currentKey, null], [currentKey, '壊れたJSON'], [currentKey, '{"goal":"buy"}'],
  ]) {
    editName(ctx, '入力' + ++input);
    e.storage(key, value);
    assert.ok(!button(e.root, keep) || button(e.root, keep).closest('[hidden]'));
    t.mock.timers.tick(400);
    assert.deepEqual(loadCurrent(), ctx.getState());
  }
});

test('パネルは修飾キー付きの矢印をブラウザに返し、通常の矢印でタブを移す', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  const tab = e.root.querySelector('#tab-edit');
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
    assert.equal(fire(tab, 'keydown', { key: 'ArrowLeft', [modifier]: true }).defaultPrevented, false);
    assert.equal(ctx.getTab(), 'edit');
  }
  assert.equal(fire(tab, 'keydown', { key: 'ArrowRight' }).defaultPrevented, true);
  assert.equal(ctx.getTab(), 'diagnosis');
});

test('保存中・保存済みはすぐ表示し、読み上げは最後の入力から5秒後と保存失敗時に限る', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  const bar = e.root.querySelector('#slot-topbar');
  const visible = bar.querySelector('[data-save-status]');
  assert.equal(visible.getAttribute('aria-live'), 'off');
  const live = bar.querySelector('[aria-live="polite"]');
  assert.ok(live);
  t.mock.timers.tick(10000);
  assert.equal(live.textContent, '');
  for (const name of ['店', '商店']) {
    editName(ctx, name);
    assert.equal(visible.textContent, '保存中…');
    t.mock.timers.tick(600);
    assert.equal(visible.textContent, '端末に保存済み');
    assert.equal(live.textContent, '');
  }
  t.mock.timers.tick(4399);
  assert.equal(live.textContent, '');
  t.mock.timers.tick(1);
  assert.equal(live.textContent, '保存しました');
  t.mock.method(e.localStorage, 'setItem', () => { throw Error('満杯'); });
  editName(ctx, '公開用の名前');
  t.mock.timers.tick(400);
  assert.equal(live.textContent, '端末に保存できません');
});

test('開いた保存ダイアログに通知を出して作り直しても、担当画面の要素と通知先は1組だけ', async t => {
  const e = environment(t, { draft: MINIMAL });
  const count = () => e.root.querySelectorAll('*').filter(node => !node.closest('.ed-rows') && !node.closest('[data-groups]')).length;
  const ctx = await e.start();
  const before = count();
  const allBefore = e.root.querySelectorAll('*').length;
  ctx.openSlots();
  ctx.toast('保存の結果');
  e.stop();
  const second = await e.start();
  assert.equal(count(), before);
  const allAfter = e.root.querySelectorAll('*').length;
  t.diagnostic('再起動前→後の要素数　構成の行・部品候補を除く ' + before + '→' + count() + '、全体 ' + allBefore + '→' + allAfter);
  assert.equal(e.root.querySelectorAll('#toasts').length, 1);
  second.toast('再開');
  assert.equal(notice(e.root).textContent, '再開');
  assert.equal(e.root.querySelectorAll('[data-goal="reserve"]').length, 1);
});

test('編集から目的を選び直すときも置換前に保存方法を伝え、見た目と元の文章を引き継げる', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  ctx.dispatch({ type: 'setTheme', preset: 'lively', accent: 3 });
  const before = ctx.getState();
  ctx.toGoalScreen();
  choose(e.root, 'buy');
  const dialog = activeDialog(e.root);
  assert.ok(dialog?.textContent.includes(warning));
  button(dialog, '置き換える').click();
  assert.deepEqual(ctx.getState().theme, before.theme);
  assert.equal(ctx.getState().goal, 'buy');
  e.window.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(loadCurrent(), before);
  ctx.undo();
  assert.ok(ctx.getState() === before);
});

test('読み込みを決める直前に次の保存が済んでいれば、最新の下書きを開く', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  e.storage(currentKey, JSON.stringify(shared));
  const latest = { ...shared, site: { name: 'クリック直前の別タブの保存' } };
  saveCurrent(latest);
  button(e.root, reload).click();
  assert.deepEqual(ctx.getState(), latest);
  t.mock.timers.tick(400);
  assert.deepEqual(loadCurrent(), latest);
});

test('保存に失敗した下書きへ戻ったときは、端末への保存済みと表示しない', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  t.mock.method(e.localStorage, 'setItem', () => { throw Error('容量不足'); });
  editName(ctx, 'まだ端末に保存できていない名前');
  t.mock.timers.tick(400);
  ctx.toGoalScreen();
  choose(e.root, 'buy');
  activeDialog(e.root).querySelector('.app-primary').click();
  ctx.toGoalScreen();
  ctx.resume();
  assert.equal(ctx.getState().site.name, 'まだ端末に保存できていない名前');
  assert.equal(e.root.querySelector('[data-save-status]').dataset.status, 'error');
});

test('手前のダイアログを閉じたら通知領域は入口に戻り、次の通知で開いている面へ移る', async t => {
  const e = environment(t, { draft: MINIMAL });
  const ctx = await e.start();
  ctx.openSlots();
  ctx.openAppShare();
  const live = notice(e.root);
  ctx.toast('手前の案内');
  const front = e.root.querySelector('#dlg-app-share');
  assert.ok(live.parentElement === front);
  front.close();
  await nextTurn();
  assert.ok(live.parentElement === e.root);
  ctx.toast('次の案内');
  assert.ok(live.parentElement === e.root.querySelector('#dlg-slots'));
});

test('起動中に移ったBの変更通知が描画後に届いても、Bで開いた確認は閉じない', async t => {
  const e = environment(t, { draft: MINIMAL, hash: link(MINIMAL) });
  const started = e.start();
  e.location.hash = link(shared);
  await started;
  e.root.querySelector('[data-adopt]').click();
  const dialog = activeDialog(e.root);
  assert.ok(dialog);
  e.window.dispatchEvent(new Event('hashchange'));
  await nextTurn();
  assert.ok(dialog.open);
});
