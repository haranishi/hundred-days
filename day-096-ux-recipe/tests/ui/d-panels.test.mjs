import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { registerHooks } from 'node:module';
import { block, MINIMAL, RESERVE_SAMPLE } from '../fixtures/states.js';
import { SITE_NAME_MAX, countChars } from '../../lib/contract.js';
import { commit, createHistory, present, redo, reduce, undo } from '../../lib/state.js';
import { mountInspector, scalarEditor } from '../../lib/ui-inspector.js';
import { formModel } from '../../lib/ui-form-model.js';
import { mountDiagnosis } from '../../lib/ui-diagnosis.js';
import { mountLook, textField } from '../../lib/ui-look.js';
import { mountShare } from '../../lib/ui-share.js';
import { mountSlots } from '../../lib/ui-slots.js';

// 通知で入力欄が取り替わった場合も検出できるよう、同じノードを参照して操作する。
const descendants = (el) => el.children.flatMap((child) => [child, ...descendants(child)]);
const find = (el, predicate) => descendants(el).find(predicate);
const byText = (el, tag, text) => find(el, (node) => node.tagName === tag && node.textContent === text);
const byPath = (el, key) => find(el, (node) => node.dataset.path === key);
const byName = (el, name) => find(el, (node) => node.getAttribute('aria-label') === name);
const fire = (el, type, props) => el.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), props));
const flush = () => new Promise((resolve) => setImmediate(resolve));

class TestElement extends EventTarget {
  constructor(tag, doc) {
    super();
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.classList = { add() {} };
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.value = this.text = '';
    this.scrollTop = this.selectionStart = this.selectionEnd = 0;
  }
  get textContent() { return this.text + this.children.map((el) => el.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this.text = String(value); }
  get firstChild() { return this.children[0]; }
  get childElementCount() { return this.children.length; }
  get isConnected() { return this.ownerDocument.body.contains(this); }
  get maxLength() { return Number(this.getAttribute('maxlength') ?? -1); }
  set maxLength(value) { this.setAttribute('maxlength', value); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); if (key === 'href') delete this.href; }
  contains(el) { return this === el || descendants(this).includes(el); }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parent = this; this.children.push(node); } }
  prepend(node) { node.remove(); node.parent = this; this.children.unshift(node); }
  replaceChildren(...nodes) {
    for (const child of [...this.children]) child.remove();
    this.text = '';
    this.append(...nodes);
  }
  insertBefore(node, before) {
    node.remove(); node.parent = this; this.children.splice(this.children.indexOf(before), 0, node);
  }
  remove() {
    if (!this.parent) return;
    if (this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  querySelectorAll(selector) {
    if (selector === 'details[open]') return descendants(this).filter((el) => el.tagName === 'DETAILS' && el.open);
    const key = { '[data-path]': 'path', '[data-control]': 'control', '[data-slot-open]': 'slotOpen' }[selector];
    assert.ok(key, selector);
    return descendants(this).filter((el) => el.dataset[key] !== undefined);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  setSelectionRange(start, end, direction) {
    this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction;
  }
  insertText(text) {
    // ブラウザは利用者の挿入だけを UTF-16 の上限で切る。JS からの value 代入には上限を掛けない。
    const left = this.value.slice(0, this.selectionStart);
    const right = this.value.slice(this.selectionEnd);
    const room = this.maxLength - left.length - right.length;
    const inserted = this.maxLength < 0 ? text : text.slice(0, Math.max(0, room));
    this.value = left + inserted + right;
    this.setSelectionRange(left.length + inserted.length, left.length + inserted.length);
  }
  focus() { this.ownerDocument.activeElement = this; }
  select() { this.setSelectionRange(0, this.value.length, 'forward'); }
  scrollIntoView() { this.scrolled = true; }
  showModal() { this.open = true; }
  close() { this.open = false; fire(this, 'close'); }
  click() {
    if (this.disabled) return;
    if (this.download) this.ownerDocument.downloads.push({ name: this.download, blob: resolveObjectURL(this.href) });
    fire(this, 'click');
  }
}

function environment(t, tag, navigator = {}, globals = {}) {
  const doc = {
    createElement(name) { return new TestElement(name, this); },
    createElementNS(_ns, name) { return this.createElement(name); },
    downloads: [], copied: [],
    execCommand(cmd) { assert.equal(cmd, 'copy'); this.copied.push(this.activeElement.value); return true; },
  };
  for (const [key, value] of Object.entries({ document: doc, navigator, ...globals })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (old) Object.defineProperty(globalThis, key, old); else delete globalThis[key]; });
  }
  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  doc.documentElement.append(doc.body);
  const opener = doc.createElement('button');
  const root = doc.createElement(tag);
  doc.body.append(opener, root);
  opener.focus();
  return { doc, root, opener };
}

function context(initial = MINIMAL, diagnose = () => ({ score: 80, items: [] })) {
  let history = createHistory(initial);
  let selectedId = initial?.blocks[0]?.id ?? null;
  let tab = 'edit';
  let diagnosis = initial && diagnose(initial);
  const listeners = new Set();
  const calls = [];
  const toasts = [];
  const entries = new Map();
  let sequence = 0;
  function snapshot(reason) { return { state: present(history), selectedId, diagnosis, reason }; }
  function notify(reason) { listeners.forEach((fn) => fn(snapshot(reason))); }
  function change(next, reason) { history = next; diagnosis = diagnose(present(next)); notify(reason); }
  const ctx = {
    getState: () => present(history), getHistory: () => history, getSelectedId: () => selectedId,
    getTab: () => tab, getDevice: () => 'phone', diagnose: () => diagnosis,
    subscribe(fn) { listeners.add(fn); fn(snapshot('init')); return () => listeners.delete(fn); },
    dispatch(action, opts = {}) {
      calls.push({ action, opts });
      const next = reduce(present(history), action);
      if (next !== present(history)) change(commit(history, next, opts.coalesce), 'dispatch');
    },
    undo() { change(undo(history), 'undo'); }, redo() { change(redo(history), 'redo'); },
    select(id, opts = {}) { selectedId = id; tab = opts.tab ?? tab; notify('select'); },
    toast(message, opts = {}) { toasts.push({ message, ...opts }); },
    viewUrl: async () => 'https://example.com/day96/#v=2.sample',
    slots: {
      list: () => [...entries.values()].map(({ state, ...meta }) => meta),
      save(name) {
        const id = 's' + (++sequence);
        const state = present(history);
        entries.set(id, { id, state, name, goal: state.goal, blocks: state.blocks.length, savedAt: sequence });
        return { ok: true, id };
      },
      load: (id) => entries.get(id)?.state ?? null,
      remove: (id) => entries.delete(id),
    },
  };
  return { ctx, calls, toasts, listeners };
}

test('上限10字の欄でも長い読みを最後まで打ち、短い候補に確定できる', (t) => {
  const { root } = environment(t, 'section');
  const changes = [];
  const field = textField({ label: '時刻', max: 10, value: '前🌙後' }, value => changes.push(value));
  const input = field.input;
  root.append(field.root);
  input.focus();
  input.setSelectionRange(1, 1);
  fire(input, 'compositionstart');
  const reading = 'にじゅうよじをすぎてから';
  for (let i = 0; i < 3; i++) {
    fire(input, 'beforeinput', { isComposing: true });
    input.insertText(reading);
    fire(input, 'input', { isComposing: true });
  }
  assert.equal(input.value, '前' + reading.repeat(3) + '🌙後');
  assert.equal(input.getAttribute('maxlength'), null);
  assert.deepEqual(changes, []);
  input.setSelectionRange(1, 1 + reading.length * 3);
  input.insertText('翌朝');
  fire(input, 'compositionend');
  fire(input, 'input', { isComposing: false });
  assert.deepEqual(changes, ['前翌朝🌙後']);
  assert.equal(input.maxLength, 11);
});

test('貼り付けの直前はブラウザの上限を外し、確定時に後ろの文字を残して収める', (t) => {
  const { root } = environment(t, 'section');
  const changes = [];
  const field = textField({ label: '時刻', max: 10, value: '後' }, value => changes.push(value));
  root.append(field.root);
  const input = field.input;
  fire(input, 'beforeinput', { inputType: 'insertFromPaste' });
  input.insertText('🌷'.repeat(15));
  assert.equal(input.value, '🌷'.repeat(15) + '後');
  fire(input, 'input', { isComposing: false });
  assert.deepEqual(changes, ['🌷'.repeat(9) + '後']);
  assert.equal(input.maxLength, 19);
});

for (const type of ['blur', 'input']) {
  test('compositionend が届かなくても ' + type + ' で確定し、その後の編集も保存する', (t) => {
    const { root } = environment(t, 'section');
    const changes = [];
    const field = textField({ label: '時刻', max: 10 }, value => changes.push(value));
    root.append(field.root);
    const input = field.input;
    input.focus();
    fire(input, 'compositionstart');
    input.insertText('翌朝🌱');
    fire(input, 'input', { isComposing: true });
    assert.deepEqual(changes, []);
    fire(input, type, type === 'input' ? { isComposing: false } : {});
    assert.deepEqual(changes, ['翌朝🌱']);
    assert.equal(input.maxLength, 11);
    fire(input, 'compositionend');
    fire(input, 'beforeinput');
    input.insertText('から');
    fire(input, 'input');
    assert.deepEqual(changes, ['翌朝🌱', '翌朝🌱から']);
  });
}

test('保存名に文字数と上限を表示し、絵文字を24字保存して開き直せる', (t) => {
  const { doc, root } = environment(t, 'dialog');
  const { ctx } = context();
  const dialog = mountSlots(root, ctx);
  dialog.open();
  const input = doc.activeElement;
  assert.equal(input.maxLength, SITE_NAME_MAX);
  const description = input.getAttribute('aria-describedby').split(' ');
  const count = find(root, el => description.includes(el.id) && el.className === 'cs-count');
  assert.equal(count.textContent, countChars(MINIMAL.site.name) + '/24');
  input.select();
  fire(input, 'beforeinput');
  input.insertText('🌷'.repeat(25));
  fire(input, 'input', { isComposing: false });
  assert.equal(count.textContent, '24/24');
  assert.equal(input.value, '🌷'.repeat(24));
  fire(find(root, el => el.tagName === 'FORM'), 'submit');
  assert.equal(ctx.slots.list()[0].name, input.value);
  root.close();
  dialog.open();
  assert.equal(input.value, MINIMAL.site.name);
  assert.equal(count.textContent, countChars(MINIMAL.site.name) + '/24');
  dialog.destroy();
});

test('フォームの見た目を切り替えると、ひとこと表示だけに先頭の項目を使う注記が出る', (t) => {
  const { root } = environment(t, 'section');
  const { ctx } = context(RESERVE_SAMPLE);
  const panel = mountInspector(root, ctx);
  ctx.select('b8');
  const message = 'ひとこと表示では、先頭の1項目だけがページに出ます。';
  const hint = () => find(root, el => el.tagName === 'P' && !el.hidden && el.textContent === message);
  assert.equal(hint(), undefined);
  ctx.dispatch({ type: 'setVariant', id: 'b8', variant: 1 });
  assert.ok(hint());
  assert.ok(descendants(root).indexOf(hint()) < descendants(root).indexOf(byPath(root, 'items.0.label')));
  assert.equal(byPath(root, 'items.1.label').value, 'ご希望の日時');
  ctx.dispatch({ type: 'setVariant', id: 'b8', variant: 0 });
  assert.equal(hint(), undefined);
  panel.destroy();
});

test('部品の編集中はスクロールを保ち、同じ種類でも別の部品を選ぶと冒頭に戻る', (t) => {
  const { root } = environment(t, 'section');
  const { ctx } = context({ ...MINIMAL, blocks: [block('b1', 'form', 0), block('b2', 'form', 0)] });
  const panel = mountInspector(root, ctx);
  root.scrollTop = 280;
  ctx.dispatch({ type: 'setProp', id: 'b1', path: ['heading'], value: '受付' });
  assert.equal(root.scrollTop, 280);
  ctx.select('b2');
  assert.equal(root.scrollTop, 0);
  panel.destroy();
});

test('複数の「この部品を見る」はそれぞれの診断見出しを説明として参照する', (t) => {
  const { root } = environment(t, 'section');
  const items = ['見出しの位置', '見出しの長さ'].map((title, i) => ({
    id: 'rule-' + i, level: 'should', ok: false, title, why: '理由', blockId: 'b1',
  }));
  const { ctx } = context(MINIMAL, () => ({ items, score: 0 }));
  const panel = mountDiagnosis(root, ctx);
  const views = descendants(root).filter(el => el.tagName === 'BUTTON' && el.textContent === 'この部品を見る');
  const ids = views.map(view => view.getAttribute('aria-describedby'));
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(ids.map(id => find(root, el => el.id === id)?.textContent), items.map(item => item.title));
  panel.destroy();
});

for (const fallback of ['null', 'documentElement']) {
  test('共有を閉じてフォーカスが ' + fallback + ' なら開いたボタンへ戻す', (t) => {
    const { doc, root, opener } = environment(t, 'dialog');
    const { ctx } = context();
    const share = mountShare(root, ctx);
    share.open();
    doc.activeElement = fallback === 'null' ? null : doc.documentElement;
    root.close();
    assert.ok(doc.activeElement === opener);
    share.open();
    const other = doc.createElement('button');
    doc.body.append(other);
    other.focus();
    root.close();
    assert.ok(doc.activeElement === other);
    share.destroy();
  });
}

test('HTMLを作れない場合はコピー失敗をダイアログで知らせる', async (t) => {
  const { doc, root } = environment(t, 'dialog');
  const { ctx, toasts } = context();
  const share = mountShare(root, ctx);
  share.open('export');
  ctx.getState = () => ({ ...MINIMAL, site: null });
  byText(root, 'BUTTON', 'HTMLをコピー').click();
  await flush();
  assert.deepEqual(toasts.at(-1), { message: 'HTMLをコピーできませんでした。', kind: 'error' });
  assert.deepEqual(doc.copied, []);
  share.destroy();
});

test('PNGの幅を選んでいる間にページが変わってもフォーカスを保つ', async (t) => {
  const { doc, root } = environment(t, 'dialog', {}, {
    Image: class extends EventTarget { set src(value) { queueMicrotask(() => fire(this, 'load')); } },
    XMLSerializer: class { serializeToString() { return '<svg/>'; } },
  });
  const create = doc.createElement.bind(doc);
  t.mock.method(doc, 'createElement', (tag) => {
    const node = create(tag);
    if (tag === 'canvas') {
      node.getContext = () => ({ scale() {}, drawImage() {}, getImageData: () => ({ data: [255, 0, 0, 255] }) });
      node.toBlob = (done, type) => done(new Blob(['png'], { type }));
    }
    return node;
  });
  // 実機では端末ごとに判定を覚える。非対応端末の試験とキャッシュを共有しないようにする。
  const url = new URL('../../lib/ui-share.js?test=png-focus', import.meta.url);
  const hook = registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL === url.href && specifier === './png-export.js') return next('./png-export.js?test=png-focus', context);
      return next(specifier, context);
    },
  });
  const { mountShare } = await import(url.href).finally(() => hook.deregister());
  const { ctx } = context();
  const share = mountShare(root, ctx);
  share.open('export');
  await flush();
  const width = byName(root, 'スマホ幅');
  assert.ok(width);
  width.focus();
  ctx.dispatch({ type: 'setSite', name: '更新後のページ' });
  assert.ok(doc.activeElement === width, '状態変更直後');
  await flush();
  assert.ok(doc.activeElement === width, '対応判定後');
  assert.equal(byName(root, 'スマホ幅'), width);
  share.destroy();
});

test('編集パネルは変換が確定した1回だけ保存し、他の通知でフォーカス・選択・スクロールを奪わない', (t) => {
  const { doc, root } = environment(t, 'section');
  const { ctx, calls, listeners } = context();
  const inspector = mountInspector(root, ctx);
  const title = byPath(root, 'title');
  assert.equal(byText(root, 'LABEL', 'キャッチコピー').htmlFor, title.id);
  assert.equal(title.maxLength, 32);
  inspector.focusPath(['title']);
  assert.equal(doc.activeElement, title);
  assert.equal(title.scrolled, true);
  root.scrollTop = 123;
  fire(title, 'compositionstart');
  title.value = 'はるのはな';
  title.setSelectionRange(0, 5, 'forward');
  fire(title, 'input', { isComposing: true });
  ctx.dispatch({ type: 'setProp', id: 'b1', path: ['lead'], value: '別の説明' });
  assert.equal(calls.length, 1);
  assert.equal(title.value, 'はるのはな');
  assert.equal(doc.activeElement, title);
  assert.deepEqual([title.selectionStart, title.selectionEnd, root.scrollTop], [0, 5, 123]);
  title.value = '春の花🌷';
  fire(title, 'compositionend');
  fire(title, 'input', { isComposing: false });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { action: { type: 'setProp', id: 'b1', path: ['title'], value: '春の花🌷' }, opts: { coalesce: 'p:b1:title' } });
  assert.equal(byPath(root, 'title'), title);
  assert.match(root.textContent, /4\/32/);
  ctx.undo();
  assert.equal(title.value, MINIMAL.blocks[0].props.title);
  ctx.select(null);
  assert.match(root.textContent, /部品を選んで/);
  inspector.destroy();
  assert.equal(listeners.size, 0);
});

test('追加・入れ替え・削除は一覧を更新し、移動先の入力欄に戻る。バリエーションとチェックも状態に届く', (t) => {
  const { doc, root } = environment(t, 'section');
  const sample = { ...RESERVE_SAMPLE, blocks: [...RESERVE_SAMPLE.blocks, block('last', 'limited', 0)] };
  const { ctx } = context(sample);
  const inspector = mountInspector(root, ctx);
  ctx.select('b2');
  const rows = () => descendants(root).filter((el) => el.tagName === 'FIELDSET');
  const values = () => ctx.getState().blocks[1].props.items.map((item) => item.text);
  const original = values();
  assert.equal(byText(rows()[0], 'BUTTON', '上へ').disabled, true);
  byText(rows()[0], 'BUTTON', '下へ').click();
  assert.deepEqual(values(), [original[1], original[0], original[2]]);
  assert.equal(doc.activeElement, byPath(root, 'items.1.text'));
  const add = byText(root, 'BUTTON', '項目を足す');
  add.click(); add.click();
  assert.equal(rows().length, 5);
  assert.equal(add.disabled, true);
  assert.equal(byText(rows()[4], 'BUTTON', '下へ').disabled, true);
  for (let i = 0; i < 3; i++) byText(rows().at(-1), 'BUTTON', '項目を消す').click();
  assert.equal(rows().length, 2);
  assert.equal(byText(rows()[0], 'BUTTON', '項目を消す').disabled, true);
  inspector.focusPath('items.1.text');
  assert.equal(doc.activeElement, byPath(root, 'items.1.text'));
  ctx.select('last');
  const check = byPath(root, 'real');
  check.checked = true; fire(check, 'change');
  assert.equal(ctx.getState().blocks.at(-1).props.real, true);
  const variant = byName(root, 'バッジ');
  variant.checked = true; fire(variant, 'change');
  assert.equal(ctx.getState().blocks.at(-1).variant, 1);
  inspector.destroy();
});

test('見た目のラジオは全選択肢に名前があり、サイト名はコードポイントで24文字まで編集できる', (t) => {
  const { root } = environment(t, 'section');
  const { ctx, calls } = context();
  const look = mountLook(root, ctx);
  const radios = descendants(root).filter((el) => el.getAttribute('role') === 'radio');
  assert.equal(radios.length, 10);
  assert.equal(byName(root, 'テーマ: やわらか').checked, true);
  assert.equal(byName(root, '強調色: コーラル').checked, true);
  const theme = byName(root, 'テーマ: しっとり');
  const accent = byName(root, '強調色: あい');
  theme.checked = true; fire(theme, 'change');
  accent.checked = true; fire(accent, 'change');
  assert.deepEqual(ctx.getState().theme, { preset: 'calm', accent: 1 });
  const input = byPath(root, 'site.name');
  assert.equal(input.maxLength, 24);
  input.focus();
  input.value = '🌷'.repeat(25);
  fire(input, 'input');
  assert.equal(ctx.getState().site.name, '🌷'.repeat(24));
  assert.equal(input.value, ctx.getState().site.name);
  assert.match(root.textContent, /24\/24/);
  assert.match(root.textContent, /24文字まで/);
  assert.equal(calls.at(-1).opts.coalesce, 'site.name');
  input.setSelectionRange(2, 4, 'forward');
  fire(input, 'beforeinput', { inputType: 'insertFromPaste' });
  input.value = '🌷庭の花' + '🌷'.repeat(22);
  input.setSelectionRange(5, 5, 'forward');
  fire(input, 'input');
  assert.equal(ctx.getState().site.name, '🌷庭' + '🌷'.repeat(22));
  assert.equal(input.selectionStart, 3);
  look.destroy();
});

test('言い換え候補は文字として表示し、押した項目だけが変わる。直前の文章へ戻せる', (t) => {
  const { root, doc } = environment(t, 'section');
  const { ctx, calls } = context();
  const title = formModel(MINIMAL.blocks[0], 'reserve').find((field) => field.role === 'headline');
  const suggestion = '春の庭を<予約>';
  const editor = scalarEditor({ ...title, suggestions: [suggestion] }, 'b1', ctx);
  root.append(editor.root);
  const off = ctx.subscribe(({ state }) => editor.update({ ...title, value: state.blocks[0].props.title }));
  byText(root, 'BUTTON', suggestion).click();
  assert.equal(ctx.getState().blocks[0].props.title, suggestion);
  assert.equal(editor.input.value, suggestion);
  assert.equal(doc.activeElement, editor.input);
  assert.deepEqual(calls[0].action.path, ['title']);
  assert.equal(calls[0].opts.coalesce, undefined);
  ctx.undo();
  assert.equal(editor.input.value, title.value);
  off();
});

test('診断理由の開閉を保ち、根拠・確度・目安を表示し、なおす操作を1回で取り消せる', (t) => {
  const { doc, root } = environment(t, 'section');
  const { ctx, toasts, listeners } = context(MINIMAL, (state) => ({
    score: state.site.name === '短い名前' ? 100 : 60,
    items: [{
      id: 'name', level: 'tip', ok: state.site.name === '短い名前', title: '名前がある', why: '来た人に名前を伝えます。',
      note: 'このアプリの目安です。', sources: [{ label: '資料', url: 'https://example.com/info', confidence: '一部確認' }],
      blockId: 'b1', fix: { label: 'サイト名を変更する', action: { type: 'setSite', name: '短い名前' } },
    }],
  }));
  const diagnosis = mountDiagnosis(root, ctx);
  find(root, (el) => el.dataset.detail === 'name').open = true;
  ctx.dispatch({ type: 'setTheme', accent: 2 });
  assert.equal(find(root, (el) => el.dataset.detail === 'name').open, true);
  assert.match(root.textContent, /このアプリの目安です。/);
  assert.match(root.textContent, /一部確認/);
  const source = byText(root, 'A', '資料');
  assert.deepEqual([source.href, source.target, source.rel], ['https://example.com/info', '_blank', 'noopener noreferrer']);
  const fix = byText(root, 'BUTTON', 'なおす');
  fix.focus(); fix.click();
  assert.equal(ctx.getState().site.name, '短い名前');
  assert.equal(doc.activeElement.textContent, 'できていること（1）');
  assert.equal(toasts[0].message, 'なおしました');
  assert.equal(toasts[0].actionLabel, '元に戻す');
  toasts[0].onAction();
  assert.equal(ctx.getState().site.name, MINIMAL.site.name);
  byText(root, 'BUTTON', 'この部品を見る').click();
  assert.equal(ctx.getSelectedId(), 'b1');
  assert.equal(ctx.getTab(), 'edit');
  diagnosis.destroy();
  assert.equal(listeners.size, 0);
});

test('共有リンクの生成中は送れず、遅れて届いた古い結果は捨てる。端末の共有はその場で開く', async (t) => {
  const sent = [];
  const { root, doc, opener } = environment(t, 'dialog', { share: (value) => { sent.push(value); } });
  const { ctx, listeners } = context();
  const first = Promise.withResolvers();
  const second = Promise.withResolvers();
  const tasks = [first, second];
  ctx.viewUrl = () => tasks.shift().promise;
  const dialog = mountShare(root, ctx);
  dialog.open();
  const copy = byText(root, 'BUTTON', 'リンクをコピー');
  const link = byText(root, 'A', 'Xで投稿');
  const input = find(root, (el) => el.readOnly);
  assert.equal(copy.disabled, true);
  assert.equal(link.href, undefined);
  ctx.dispatch({ type: 'setSite', name: '新しいページ' });
  const url = 'https://example.com/day96/#v=2.new';
  second.resolve(url);
  await flush();
  first.resolve('https://example.com/day96/#v=2.old');
  await flush();
  assert.equal(input.value, url);
  assert.equal(copy.disabled, false);
  for (const anchor of [link, byText(root, 'A', 'LINEで送る')]) {
    assert.equal(new URL(anchor.href).searchParams.get('url'), url);
    assert.equal(anchor.target, '_blank');
    assert.equal(anchor.rel, 'noopener noreferrer');
  }
  byText(root, 'BUTTON', '端末の共有を開く').click();
  assert.deepEqual(sent, [{ text: 'UXレシピで「予約してもらう」のページを組み立てました（UX診断 80点）', url }]);
  byText(root, 'BUTTON', '閉じる').click();
  assert.equal(doc.activeElement, opener);
  dialog.destroy();
  assert.equal(listeners.size, 0);
});

test('コピー許可がなくてもダイアログ内の選択でコピーでき、タブを矢印で移ってHTMLを書き出せる', async (t) => {
  const { root, doc } = environment(t, 'dialog', {
    clipboard: { writeText: async () => { throw new Error('コピーの許可なし'); } },
  });
  const { ctx, toasts } = context();
  const dialog = mountShare(root, ctx);
  dialog.open();
  await flush();
  assert.equal(byText(root, 'BUTTON', '端末の共有を開く'), undefined);
  const copy = byText(root, 'BUTTON', 'リンクをコピー');
  copy.focus(); copy.click();
  await flush();
  assert.equal(doc.copied[0], await ctx.viewUrl());
  assert.equal(doc.activeElement, copy);
  assert.equal(toasts.at(-1).message, 'コピーしました');
  const linkTab = byText(root, 'BUTTON', 'リンク');
  fire(linkTab, 'keydown', { key: 'ArrowRight' });
  await flush();
  assert.equal(byText(root, 'BUTTON', '書き出し').getAttribute('aria-selected'), 'true');
  assert.equal(linkTab.tabIndex, -1);
  assert.equal(byText(root, 'BUTTON', '画像で保存(PNG)'), undefined);
  byText(root, 'BUTTON', 'HTMLをコピー').click();
  await flush();
  byText(root, 'BUTTON', 'HTMLをダウンロード').click();
  assert.equal(doc.downloads[0].name, 'ux-recipe-reserve.html');
  assert.equal(doc.downloads[0].blob.type, 'text/html;charset=utf-8');
  assert.equal(await doc.downloads[0].blob.text(), doc.copied[1]);
  assert.match(doc.copied[1], /ひだまり整体院/);
  assert.doesNotMatch(doc.copied[1], /<script\b/i);
  dialog.destroy();
});

test('共有リンクの失敗を伝え、作り直せたら長さの注意を出してクリップボードに渡す', async (t) => {
  const copied = [];
  const { root, doc } = environment(t, 'dialog', { clipboard: { writeText: (text) => { copied.push(text); } } });
  const { ctx } = context();
  ctx.viewUrl = () => Promise.reject(new Error());
  const dialog = mountShare(root, ctx);
  dialog.open();
  await flush();
  assert.match(root.textContent, /リンクを作れませんでした/);
  assert.equal(byText(root, 'BUTTON', 'リンクをコピー').disabled, true);
  const long = 'https://example.com/#v=1.' + 'z'.repeat(3000);
  ctx.viewUrl = async () => long;
  dialog.open();
  await flush();
  assert.equal(find(root, (el) => el.tagName === 'P' && el.textContent.includes('リンクが長め')).hidden, false);
  byText(root, 'BUTTON', 'リンクをコピー').click();
  await flush();
  assert.deepEqual(copied, [long]);
  assert.deepEqual(doc.copied, []);
  dialog.destroy();
});

test('名前をつけて端末に6件保存できる。開くは置き換え1回で、削除後は再び保存できる', (t) => {
  const { doc, root } = environment(t, 'dialog');
  const { ctx, calls, listeners } = context();
  const dialog = mountSlots(root, ctx);
  dialog.open();
  const name = doc.activeElement;
  assert.equal(name.value, MINIMAL.site.name);
  const form = find(root, (el) => el.tagName === 'FORM');
  const save = byText(root, 'BUTTON', '保存する');
  for (let i = 1; i <= 6; i++) {
    name.value = '案<' + i + '>';
    fire(form, 'submit');
  }
  assert.equal(save.disabled, true);
  assert.match(root.textContent, /6\/6/);
  assert.match(root.textContent, /案<6>/);
  assert.match(root.textContent, /予約してもらう/);
  assert.match(root.textContent, /部品2個/);
  const remove = byText(root, 'BUTTON', '消す');
  remove.click();
  assert.equal(save.disabled, false);
  assert.match(root.textContent, /5\/6/);
  assert.equal(doc.activeElement.textContent, '開く');
  ctx.dispatch({ type: 'setSite', name: '別の編集中のページ' });
  byText(root, 'BUTTON', '開く').click();
  assert.equal(root.open, false);
  assert.equal(ctx.getState().site.name, MINIMAL.site.name);
  assert.equal(calls.filter(({ action }) => action.type === 'replace').length, 1);
  ctx.undo();
  assert.equal(ctx.getState().site.name, '別の編集中のページ');
  dialog.destroy();
  assert.equal(listeners.size, 0);
});

test('目的画面からも保存一覧を開ける。現在のページが空なら保存は無効になる', (t) => {
  const { root } = environment(t, 'dialog');
  const { ctx } = context(null);
  const dialog = mountSlots(root, ctx);
  dialog.open();
  assert.equal(byText(root, 'BUTTON', '保存する').disabled, true);
  assert.match(root.textContent, /まだ保存したページはありません/);
  dialog.destroy();
});
