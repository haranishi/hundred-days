import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEditor } from '../../app.js';
import { BLOCK_TYPES, MAX_BLOCKS } from '../../lib/contract.js';
import { attachDrag } from '../../lib/dnd.js';
import { mountKeys } from '../../lib/keys.js';
import { mountOutline } from '../../lib/ui-outline.js';
import { mountPalette } from '../../lib/ui-palette.js';
import { mountPreview } from '../../lib/ui-preview.js';
import { RESERVE_SAMPLE, STRESS } from '../fixtures/states.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
const rect = (left, top, right, bottom) => ({ left, top, right, bottom });

// 実際のHTMLと再描画後のノードを使い、フォーカスが古いノードに残る場合も検出する。
class Element extends EventTarget {
  constructor(tag, doc) {
    super();
    this.tag = tag;
    this.ownerDocument = doc;
    this.children = [];
    this.attrs = new Map();
    this.dataset = {};
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.className = this.text = '';
    this.classList = {
      toggle: (name, on) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        if (on) names.add(name); else names.delete(name);
        this.className = [...names].join(' ');
      },
      add: name => this.classList.toggle(name, true),
      remove: name => this.classList.toggle(name, false),
    };
    this.scrollTop = this.scrollLeft = 0;
    this.clientWidth = 390;
    this.clientHeight = 400;
  }
  setAttribute(name, value) {
    if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value);
    else if (name === 'class') this.className = value;
    else if (name === 'id') this.id = value;
    else if (name === 'tabindex') this.tabIndex = Number(value);
    else if (['open', 'hidden', 'disabled'].includes(name)) this[name] = true;
    else this.attrs.set(name, String(value));
  }
  getAttribute(name) {
    if (name.startsWith('data-')) return this.dataset[dataKey(name)] ?? null;
    if (name === 'tabindex') return this.tabIndex === undefined ? null : String(this.tabIndex);
    if (['open', 'hidden', 'disabled'].includes(name)) return this[name] ? '' : null;
    return this.attrs.get(name) ?? null;
  }
  removeAttribute(name) { this.attrs.delete(name); }
  matches(selector) {
    return selector.split(',').some(part => {
      const parts = part.trim().split(/\s+/);
      const simple = parts.pop();
      const tokens = simple.match(/^[\w-]+|[.#][\w-]+|\[[\w-]+(?:="[^"]*")?\]/g) ?? [];
      assert.equal(tokens.join(''), simple);
      const match = tokens.every(token => {
        if (token[0] === '.') return this.className.split(/\s+/).includes(token.slice(1));
        if (token[0] === '#') return this.id === token.slice(1);
        if (token[0] !== '[') return this.tag === token;
        const [, name, value] = token.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
        return value === undefined ? this.getAttribute(name) !== null : this.getAttribute(name) === value;
      });
      return match && (!parts.length || !!this.parentElement?.closest(parts.join(' ')));
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  contains(node) {
    for (; node; node = node.parentElement) if (node === this) return true;
    return false;
  }
  focus() { if (!this.disabled && !this.closest('[hidden]')) this.ownerDocument.activeElement = this; }
  remove() {
    if (!this.parentElement) return;
    if (this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  insertBefore(child, before) {
    child.remove();
    child.parentElement = this;
    this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, child);
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node instanceof Element) this.insertBefore(node, null);
      else this.text += node;
    }
  }
  replaceChildren(...nodes) {
    for (const child of [...this.children]) child.remove();
    this.text = '';
    this.append(...nodes);
  }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.replaceChildren(String(value)); }
  set innerHTML(markup) {
    this.replaceChildren();
    const stack = [this];
    for (const [token, end, tag, attrs, words] of markup.matchAll(/<!--[\s\S]*?-->|<\/([\w-]+)>|<([\w-]+)\b([^>]*)>|([^<]+)/g)) {
      if (end) { stack.pop(); continue; }
      if (words) { stack.at(-1).append(words); continue; }
      if (!tag) continue;
      const el = this.ownerDocument.createElement(tag);
      for (const [, name, value] of attrs.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) el.setAttribute(name, value ?? '');
      stack.at(-1).append(el);
      if (!token.endsWith('/>') && !['br', 'hr', 'input', 'img', 'wbr'].includes(tag)) stack.push(el);
    }
  }
  getBoundingClientRect() { return this.box ?? rect(0, 0, 300, 400); }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture() { this.capture = null; }
}

function fire(listener, type, target = listener, props = {}) {
  const event = Object.assign(new Event(type, { cancelable: true }), props);
  Object.defineProperty(event, 'target', { value: target });
  listener.dispatchEvent(event);
  return event;
}

function setup(t, initial = RESERVE_SAMPLE, width = 1200) {
  const doc = new EventTarget();
  doc.createElement = tag => new Element(tag, doc);
  doc.createElementNS = (_ns, tag) => doc.createElement(tag);
  doc.head = doc.createElement('head');
  doc.body = doc.createElement('body');
  doc.getElementById = id => doc.head.querySelector('#' + id) ?? doc.body.querySelector('#' + id);
  doc.body.innerHTML = html.slice(html.indexOf('<div id="app"'), html.indexOf('<noscript>'));
  const root = doc.getElementById('app');
  root.dataset.screen = 'editor';
  root.querySelector('#screen-edit').hidden = false;
  const media = [];
  const frames = new Map();
  const observers = new Set();
  let nextFrame = 0;
  const globals = {
    document: doc, window: new EventTarget(),
    matchMedia: query => {
      const min = Number(query.match(/\d+/)[0]);
      const mql = Object.assign(new EventTarget(), { min, matches: width >= min });
      media.push(mql);
      return mql;
    },
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { observers.add(this.callback); }
      disconnect() { observers.delete(this.callback); }
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; });
  }
  const ctx = createEditor(initial);
  ctx.toast = () => {};
  function resize(next) {
    width = next;
    for (const mql of media) {
      if (mql.matches === (next >= mql.min)) continue;
      mql.matches = next >= mql.min;
      fire(mql, 'change');
    }
    for (const callback of observers) callback();
  }
  function paint() {
    for (const [id, callback] of [...frames]) { frames.delete(id); callback(); }
  }
  return { doc, root, ctx, resize, paint };
}

test('幅1100pxでは非選択の操作はhidden、1099pxでは全行に出て、幅を戻すと再び畳む', t => {
  const { root, ctx, resize } = setup(t);
  const outline = root.querySelector('#slot-outline');
  t.after(mountOutline(outline, ctx).destroy);
  const visible = () => outline.querySelectorAll('.ed-row-actions').filter(group => !group.hidden);
  assert.deepEqual(visible().map(group => group.closest('[data-row]').dataset.row), ['b1']);
  const pick = outline.querySelector('[data-row="b2"] [data-act="select"]');
  pick.focus();
  fire(outline, 'click', pick);
  assert.deepEqual(visible().map(group => group.closest('[data-row]').dataset.row), ['b2']);
  assert.ok(root.ownerDocument.activeElement === pick);
  resize(1099);
  assert.equal(visible().length, ctx.getState().blocks.length);
  assert.deepEqual(visible()[0].querySelectorAll('button').map(el => el.dataset.act), ['up', 'down', 'copy', 'remove']);
  resize(1100);
  assert.equal(visible().length, 1);
});

test('複製した行の操作へフォーカスを引き継ぎ、移動・削除の後も構成を操作できる', t => {
  const { root, ctx, doc } = setup(t);
  const outline = root.querySelector('#slot-outline');
  t.after(mountOutline(outline, ctx).destroy);
  const button = (id, act) => outline.querySelector('[data-row="' + id + '"] [data-act="' + act + '"]');
  function press(el) { el.focus(); fire(outline, 'click', el); }
  press(button('b1', 'copy'));
  const copy = ctx.getSelectedId();
  assert.notEqual(copy, 'b1');
  assert.ok(doc.activeElement === button(copy, 'copy'), '複製後のフォーカス');
  press(button(copy, 'down'));
  assert.ok(doc.activeElement === button(copy, 'down'), '移動後のフォーカス');
  press(button(copy, 'remove'));
  assert.equal(button(copy, 'select'), null);
  assert.ok(doc.activeElement === button(ctx.getSelectedId(), 'select'), '削除後のフォーカス');
});

test('広い構成で名前を選ぶと次のTabは操作段へ進み、矢印の近道も同じ名前から分かる', t => {
  const { root, ctx, resize } = setup(t);
  const outline = root.querySelector('#slot-outline');
  t.after(mountOutline(outline, ctx).destroy);
  const row = outline.querySelector('[data-row="b7"]');
  const pick = row.querySelector('[data-act="select"]');
  pick.focus();
  fire(outline, 'click', pick);
  const stops = () => row.querySelectorAll('button').filter(el => !el.disabled && el.tabIndex !== -1 && !el.closest('[hidden]'));
  assert.deepEqual(stops().map(el => el.dataset.act), ['select', 'up', 'down', 'copy', 'remove']);
  assert.match(pick.getAttribute('aria-keyshortcuts') ?? '', /Alt\+ArrowUp Alt\+ArrowDown/);
  resize(1099);
  assert.equal(stops()[1].dataset.act, 'grip');
});

function outlineKeyboard(t) {
  const { root, ctx, doc } = setup(t, RESERVE_SAMPLE, 980);
  const outline = root.querySelector('#slot-outline');
  t.after(mountOutline(outline, ctx).destroy);
  const list = outline.querySelector('.ed-rows');
  const names = list.querySelectorAll('.ed-pick');
  const press = (key, flags = {}) => fire(list, 'keydown', doc.activeElement, { key, ...flags });
  return { list, names, doc, ctx, press };
}

test('構成の名前で上下の矢印を押すと隣へ移り、端で止まる。選択と並びは保つ', t => {
  const { doc, ctx, names, press } = outlineKeyboard(t);
  names[0].focus();
  const selected = ctx.getSelectedId();
  assert.ok(!press('ArrowUp').defaultPrevented);
  assert.ok(doc.activeElement === names[0]);
  assert.ok(press('ArrowDown').defaultPrevented);
  assert.ok(doc.activeElement === names[1]);
  assert.equal(ctx.getSelectedId(), selected);
  assert.ok(press('ArrowUp').defaultPrevented);
  assert.ok(doc.activeElement === names[0]);
  names.at(-1).focus();
  assert.ok(!press('ArrowDown').defaultPrevented);
  assert.ok(doc.activeElement === names.at(-1));
  assert.equal(ctx.getState(), RESERVE_SAMPLE);
});

test('構成の名前でHomeは先頭、Endは末尾へ移り、すでに端にいればキーを横取りしない', t => {
  const { doc, ctx, names, press } = outlineKeyboard(t);
  names[3].focus();
  for (const [key, target] of [['End', names.at(-1)], ['Home', names[0]]]) {
    assert.ok(press(key).defaultPrevented, key);
    assert.ok(doc.activeElement === target, key);
    assert.ok(!press(key).defaultPrevented, key);
  }
  assert.equal(ctx.getSelectedId(), RESERVE_SAMPLE.blocks[0].id);
});

test('修飾キー・変換中のキー・Tab・Enterは名前のフォーカス移動に使わない', t => {
  const { doc, names, press } = outlineKeyboard(t);
  const pick = names[2];
  pick.focus();
  for (const flags of [
    { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }, { keyCode: 229 },
  ]) {
    for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End']) {
      assert.ok(!press(key, flags).defaultPrevented);
      assert.ok(doc.activeElement === pick);
    }
  }
  for (const key of ['Tab', 'Enter']) assert.ok(!press(key).defaultPrevented);
});

test('つまみ・操作ボタン・入力欄では、矢印とHome・Endをそのまま使える', t => {
  const { doc, list, press } = outlineKeyboard(t);
  const row = list.children[2];
  const input = doc.createElement('input');
  row.append(input);
  for (const target of [row.querySelector('[data-act="grip"]'), row.querySelector('[data-act="copy"]'), input]) {
    target.focus();
    for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End']) {
      assert.ok(!press(key).defaultPrevented);
      assert.ok(doc.activeElement === target);
    }
  }
});

test('18個になった構成では追加ボタンの説明をその場で読め、1個消すと追加できる', t => {
  const { root, ctx, doc } = setup(t, STRESS);
  const outline = root.querySelector('#slot-outline');
  t.after(mountOutline(outline, ctx).destroy);
  const add = outline.querySelector('[data-add]');
  const note = doc.getElementById(add.getAttribute('aria-describedby'));
  assert.ok(note && !note.hidden);
  assert.equal(note.textContent, MAX_BLOCKS + '個までです。どれかを削除すると足せます。');
  assert.ok(add.disabled || add.getAttribute('aria-disabled') === 'true');
  ctx.dispatch({ type: 'removeBlock', id: ctx.getSelectedId() });
  assert.ok(note.hidden);
  assert.ok(!add.disabled && add.getAttribute('aria-disabled') !== 'true');
});

for (const [name, mount, selector, entries, size] of [
  ['構成', mountOutline, '#slot-outline', '[data-row]', RESERVE_SAMPLE.blocks.length],
  ['候補', mountPalette, '#dlg-palette', 'button[data-type]', BLOCK_TYPES.length],
]) {
  test(name + 'を破棄して再マウントしても要素が重複しない', t => {
    const { root, ctx } = setup(t);
    const slot = root.querySelector(selector);
    const first = mount(slot, ctx);
    assert.equal(slot.querySelectorAll(entries).length, size);
    first.destroy();
    assert.equal(slot.querySelectorAll(entries).length, 0);
    const second = mount(slot, ctx);
    assert.equal(slot.querySelectorAll(entries).length, size);
    second.destroy();
  });
}

for (const [name, tag, attrs] of [
  ['構成の名前', 'button', { 'data-row': 'b7' }],
  ['プレビュー内のリンク', 'a', { 'data-block-id': 'b7' }],
]) {
  test(name + 'のAlt＋矢印とDeleteは、選択中の別の部品を操作しない', t => {
    const { root, ctx, doc } = setup(t);
    const holder = doc.createElement('section');
    for (const [key, value] of Object.entries(attrs)) holder.setAttribute(key, value);
    const target = doc.createElement(tag);
    holder.append(target);
    root.querySelector(name.startsWith('構成') ? '#slot-outline' : '#slot-preview').append(holder);
    t.after(mountKeys(root, ctx).destroy);
    target.focus();
    const key = flags => fire(doc, 'keydown', target, flags);
    assert.ok(key({ key: 'ArrowUp', altKey: true }).defaultPrevented);
    assert.equal(ctx.getState().blocks[5].id, 'b7');
    ctx.select('b1');
    assert.ok(key({ key: 'Delete' }).defaultPrevented);
    assert.ok(!ctx.getState().blocks.some(block => block.id === 'b7'));
    assert.ok(ctx.getState().blocks.some(block => block.id === 'b1'));
  });
}

test('本文・タブ・上部バー・プレビュー背景でDeleteやAlt＋矢印を横取りしない', t => {
  const { root, ctx, doc } = setup(t);
  t.after(mountKeys(root, ctx).destroy);
  for (const el of [doc.body, root.querySelector('#tab-edit'), root.querySelector('[data-undo]'), root.querySelector('.ed-preview-scroll')]) {
    el.focus();
    for (const flags of [{ key: 'Delete' }, { key: 'ArrowDown', altKey: true }]) {
      assert.equal(fire(doc, 'keydown', el, flags).defaultPrevented, false);
    }
  }
  assert.equal(ctx.getState(), RESERVE_SAMPLE);
});

function dragSetup(t) {
  const { doc, root, paint } = setup(t);
  const list = root.querySelector('.ed-rows');
  const scroller = root.querySelector('[data-scroller]');
  scroller.box = rect(10, 100, 290, 360);
  list.getBoundingClientRect = () => rect(16, 110 - scroller.scrollTop, 284, 330 - scroller.scrollTop);
  for (let i = 0; i < 4; i++) {
    const row = doc.createElement('li');
    row.dataset.row = 'b' + (i + 1);
    row.getBoundingClientRect = () => rect(16, 110 + i * 55 - scroller.scrollTop, 284, 164 + i * 55 - scroller.scrollTop);
    const grip = doc.createElement('button');
    grip.dataset.act = 'grip';
    row.append(grip);
    list.append(row);
  }
  const moves = [];
  t.after(attachDrag(list, scroller, (...args) => moves.push(args)).destroy);
  const handle = list.querySelector('button');
  const pointer = (type, x, y) => fire(list, type, handle, { clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0 });
  pointer('pointerdown', 80, 130);
  pointer('pointermove', 80, 210);
  paint();
  return { list, scroller, moves, pointer, paint };
}

for (const type of ['scroll', 'wheel']) {
  test(type + 'の後、ポインターを動かさなくても目印と確定先が一致する', t => {
    const { list, scroller, moves, pointer, paint } = dragSetup(t);
    const mark = () => list.querySelector('[data-drop]')?.dataset.row;
    assert.equal(mark(), 'b2');
    scroller.scrollTop = 60;
    fire(scroller, type);
    paint();
    assert.equal(mark(), 'b3');
    pointer('pointerup', 80, 210);
    assert.deepEqual(moves, [['b1', 2]]);
    assert.equal(mark(), undefined);
  });
}

for (const [name, x, y] of [['下の追加ボタン', 80, 345], ['ウィンドウの外', 80, -4], ['隣のパネル', 310, 210]]) {
  test(name + 'で離したドラッグは取り消して目印を消す', t => {
    const { list, pointer, moves } = dragSetup(t);
    pointer('pointerup', x, y);
    assert.deepEqual(moves, []);
    assert.equal(list.querySelector('[data-drop]'), null);
    assert.equal(list.querySelector('.is-dragging'), null);
  });
}

test('取り消したドラッグの直後に届くクリックがつまみを選び直さない', t => {
  const { list, pointer, moves } = dragSetup(t);
  const grip = list.querySelector('button');
  pointer('pointerup', 310, 210);
  assert.ok(fire(list, 'click', grip, { detail: 1 }).defaultPrevented);
  assert.ok(!fire(list, 'click', grip, { detail: 0 }).defaultPrevented);
  assert.deepEqual(moves, []);
});

test('再描画後は同じFAQの2問目、同じ部品のリンク、サイト名に戻り、パネルのフォーカスも保つ', t => {
  const { root, ctx, doc } = setup(t);
  const preview = root.querySelector('#slot-preview');
  t.after(mountPreview(preview, ctx).destroy);
  const targets = [
    () => preview.querySelectorAll('[data-block-id="b7"] summary')[1],
    () => preview.querySelector('[data-block-id="b1"] a[data-path]'),
    () => preview.querySelector('[data-path="site.name"]'),
    () => root.querySelector('#tab-edit'),
  ];
  for (const [i, find] of targets.entries()) {
    const before = find();
    before.focus();
    ctx.dispatch({ type: 'setSite', name: '編集' + i });
    assert.ok(doc.activeElement === find(), '再描画後のフォーカス ' + i);
    if (i < 3) assert.ok(doc.activeElement !== before);
  }
});

test('最下部で編集するときはラベルの余白を戻してからスクロール位置を復元する', t => {
  const { root, ctx } = setup(t);
  const preview = root.querySelector('#slot-preview');
  const scroll = preview.querySelector('.ed-preview-scroll');
  t.after(mountPreview(preview, ctx).destroy);
  let position = 536;
  Object.defineProperty(scroll, 'scrollTop', {
    get: () => position,
    set: y => { position = Math.min(y, preview.querySelector('.ed-block-tag') ? 536 : 500); },
  });
  ctx.dispatch({ type: 'setSite', name: '新しい名前' });
  assert.equal(scroll.scrollTop, 536);
});

test('390pxでもパソコンを選ぶと960pxの紙面が収まり、等倍に戻すと縮小の案内が消える', t => {
  const { root, ctx } = setup(t, RESERVE_SAMPLE, 390);
  const preview = root.querySelector('#slot-preview');
  const page = preview.querySelector('[data-page]');
  const frame = preview.querySelector('[data-frame]');
  const pc = preview.querySelector('button[data-device="pc"]');
  page.parentElement.clientWidth = 360;
  t.after(mountPreview(preview, ctx).destroy);
  fire(preview, 'click', pc);
  assert.equal(frame.dataset.device, 'pc');
  assert.equal(frame.style['--ed-paper-width'], '960px');
  assert.equal(pc.getAttribute('aria-pressed'), 'true');
  assert.equal(Number(page.style['--ed-preview-scale']), 360 / 960);
  const note = preview.querySelector('[data-scale-note]');
  assert.equal(note.textContent, '縮小して表示しています');
  assert.ok(!note.hidden);
  page.parentElement.clientWidth = 390;
  fire(preview, 'click', preview.querySelector('button[data-device="phone"]'));
  assert.equal(Number(page.style['--ed-preview-scale']), 1);
  assert.ok(note.hidden);
});

test('パネルの幅だけが変わっても実際の倍率に縮小の案内を合わせる', t => {
  const { root, ctx, resize } = setup(t);
  const preview = root.querySelector('#slot-preview');
  const page = preview.querySelector('[data-page]');
  const note = preview.querySelector('[data-scale-note]');
  t.after(mountPreview(preview, ctx).destroy);
  page.parentElement.clientWidth = 375;
  resize(1200);
  assert.ok(note.hidden, 'スマホ枠が数%縮むだけでは案内を出さない');
  ctx.setDevice('pc');
  for (const space of [960, 620, 960]) {
    page.parentElement.clientWidth = space;
    resize(1200);
    assert.equal(Number(page.style['--ed-preview-scale']), space / 960);
    assert.equal(note.hidden, space === 960);
  }
});

test('スキップリンクで構成を開き、選択部品・プレビュー・使用中のパネルタブへフォーカスできる', t => {
  const { root, ctx, doc } = setup(t, RESERVE_SAMPLE, 390);
  const outline = root.querySelector('#slot-outline');
  const holder = root.querySelector('#panel-outline');
  const preview = root.querySelector('#slot-preview');
  holder.append(outline);
  t.after(mountOutline(outline, ctx).destroy);
  t.after(mountPreview(preview, ctx).destroy);
  t.after(mountKeys(root, ctx).destroy);
  // 畳んだパネルへ誤ってフォーカスできる試験にならないよう、実画面と同じタイミングで開く。
  t.after(ctx.subscribe(() => {
    holder.hidden = !ctx.isMobilePanelOpen() || ctx.getTab() !== 'outline';
    for (const tab of root.querySelectorAll('[role="tab"]')) {
      tab.tabIndex = ctx.getTab() === tab.dataset.tab ? 0 : -1;
      tab.setAttribute('aria-selected', String(ctx.isMobilePanelOpen() && tab.tabIndex === 0));
    }
  }));
  const skip = id => {
    const link = root.querySelector('a[href="#slot-' + id + '"]');
    assert.ok(link);
    link.focus();
    return fire(root, 'click', link);
  };
  ctx.select('b7');
  ctx.foldPanel();
  assert.ok(skip('outline').defaultPrevented);
  assert.equal(ctx.getTab(), 'outline');
  assert.ok(ctx.isMobilePanelOpen());
  assert.ok(doc.activeElement === outline.querySelector('[data-row="b7"] [data-act="select"]'));
  skip('preview');
  assert.ok(doc.activeElement === preview.querySelector('[data-block-id="b7"]'));
  ctx.select(null);
  skip('preview');
  assert.ok(doc.activeElement === preview.querySelector('.ed-preview-scroll'));
  ctx.setTab('diagnosis');
  ctx.foldPanel();
  skip('panel');
  assert.ok(ctx.isMobilePanelOpen());
  assert.ok(doc.activeElement === root.querySelector('#tab-diagnosis'));
  root.dataset.screen = 'viewer';
  ctx.foldPanel();
  skip('outline');
  assert.equal(ctx.isMobilePanelOpen(), false);
});

test('編集開始時の見出しから最初のTabで先頭の近道へ進める', t => {
  const { root, ctx, doc } = setup(t);
  t.after(mountKeys(root, ctx).destroy);
  const title = root.querySelector('#slot-topbar [data-site]');
  title.focus();
  assert.ok(fire(doc, 'keydown', title, { key: 'Tab' }).defaultPrevented);
  assert.ok(doc.activeElement === root.querySelector('a[href="#slot-outline"]'));
});
