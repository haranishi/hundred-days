import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { CAMERA_DEFAULT, DEFAULTS, SAVE_NAME, SAVE_VERSION, TOOL_IDS } from '../../lib/contract.js';
import { createTree } from '../../lib/tree.js';

const viewFactory = Symbol.for('bonsai.test.createView3D');
const viewModule = 'data:text/javascript,' + encodeURIComponent(
  'export const createView3D = (...args) => globalThis[Symbol.for("bonsai.test.createView3D")](...args);',
);
let loadCount = 0;

function send(target, type, props = {}) {
  target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), props));
}

async function boot(t, { raw = null, failFirstRead = false, failRemove = false, capturePhoto, reduced = false, gfx = 'test' } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const document = new EventTarget();
  const window = new EventTarget();
  window.screen = { orientation: new EventTarget() };
  const elements = new Map();
  const frames = new Map();
  const reads = { get: 0, set: 0 };
  const motion = new EventTarget();
  motion.matches = reduced;
  const highlights = [];
  const lookAnimations = [];
  let viewOptions;
  let resizeStage;
  let nextFrame = 0;

  function element(id) {
    const node = new EventTarget();
    const captures = new Set();
    return Object.assign(node, {
      dataset: {}, hidden: true, open: false, textContent: '',
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 390, bottom: 600, width: 390, height: 600 }),
      setAttribute() {}, removeAttribute() {}, append() {},
      querySelector: (selector) => id === 'assist' && selector === '[data-assist-key]' ? byId('assist-first') : null,
      querySelectorAll: () => [], matches: () => false, contains: () => false,
      cloneNode: () => element(id), replaceWith: (next) => elements.set(id, next),
      showModal() { this.open = true; },
      close() { this.open = false; send(this, 'close'); },
      focus() { document.activeElement = this; },
      setPointerCapture: (pointerId) => captures.add(pointerId),
      hasPointerCapture: (pointerId) => captures.has(pointerId),
      releasePointerCapture: (pointerId) => captures.delete(pointerId),
    });
  }

  function byId(id) {
    if (!elements.has(id)) elements.set(id, element(id));
    return elements.get(id);
  }

  const tools = TOOL_IDS.map((id) => {
    const button = byId(`tool-${id}`);
    button.dataset.tool = id;
    return button;
  });
  Object.assign(document, {
    body: byId('body'), activeElement: null, hidden: false, createElement: element, getElementById: byId,
    querySelectorAll: (selector) => selector === 'button[data-tool]' ? tools : [],
  });

  function createView3D(_THREE, _canvas, options) {
    viewOptions = options;
    return {
      camera: {
        get: () => CAMERA_DEFAULT, set() {}, reset() {},
        pickRay: () => ({ origin: [0, 0, 8], dir: [0, 0, -1] }), pxToWorld: () => 0.01,
      },
      setPot() {}, setLight() {}, setSpecies() {}, setMoisture() {}, setSkeleton() {},
      setLook(_look, { animate }) { lookAnimations.push(animate); },
      setHighlight(value) { highlights.push(value); },
      resize() {}, dispose() {}, requestRender() {},
      capturePhoto,
    };
  }

  const globals = {
    window, document, location: { search: `?debug=1&gfx=${gfx}` }, devicePixelRatio: 1,
    matchMedia: () => motion,
    ResizeObserver: class {
      constructor(callback) { resizeStage = callback; }
      observe() {}
    },
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    [viewFactory]: createView3D,
    localStorage: {
      getItem(name) {
        assert.equal(name, SAVE_NAME);
        reads.get += 1;
        if (failFirstRead && reads.get === 1) throw new Error('SecurityError');
        return raw;
      },
      setItem(name, value) {
        assert.equal(name, SAVE_NAME);
        reads.set += 1;
        raw = value;
      },
      removeItem(name) {
        assert.equal(name, SAVE_NAME);
        if (failRemove) throw new Error('SecurityError');
        raw = null;
      },
    },
  };
  const originals = Reflect.ownKeys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key] of originals) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: globals[key] });
  }
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  // 実際のイベント配線を使い、WebGLの入口だけを描画契約に沿った偽物へ替える。
  const url = new URL(`../../app.js?test=${++loadCount}`, import.meta.url).href;
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === url) {
        if (specifier === './vendor/three.js') return { url: 'data:text/javascript,', shortCircuit: true };
        if (specifier === './lib/view3d.js') return { url: viewModule, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
  try {
    await import(url);
  } finally {
    hook.deregister();
  }

  function paint() {
    while (frames.size) {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const frame of callbacks) frame(0);
    }
  }

  function pointer(type, area, pointerId) {
    const data = { pointerType: 'touch', pointerId, button: 0, clientX: 30, clientY: 40 };
    send(document, type, data);
    send(byId(area), type, data);
  }

  paint();
  return {
    window, byId, pointer, highlights, lookAnimations, viewOptions, reads, storageValue: () => raw, resizeStage,
    app: window.__bonsai, notice: () => byId('notice-text').textContent,
    click(id) { send(byId(id), 'click'); paint(); },
  };
}

function previousSave() {
  const tree = createTree({ species: 'plum', seed: 9, day: 90 });
  return JSON.stringify({
    v: SAVE_VERSION, tree: tree.toJSON(), pot: DEFAULTS.pot, light: DEFAULTS.light, muted: false, tipsSeen: false, savedAt: 123,
  });
}

test('日付の札は保存から復元した樹種を表示し、時間送りと苗の切り替えでも更新する', async (t) => {
  const page = await boot(t, { raw: previousSave() });
  const date = page.byId('date-label');
  assert.equal(date.textContent, '梅 ・ 冬・12月5週');
  page.app.advance(7);
  assert.equal(date.textContent, '梅 ・ 冬・1月1週');

  page.click('menu-open');
  page.byId('new-species').value = 'pine';
  send(page.byId('new-tree'), 'submit');
  assert.equal(date.textContent, '黒松 ・ 秋・10月1週');

  page.click('menu-open');
  page.click('reset-open');
  page.click('reset-confirm');
  assert.equal(date.textContent, '紅葉 ・ 秋・10月1週');
});

test('視点ボタンは案内やダイアログが開くと隠れ、舞台に戻ると表示する', async (t) => {
  const page = await boot(t, { capturePhoto: async () => new Blob(['photo'], { type: 'image/png' }) });
  const button = page.byId('camera-reset');
  assert.equal(page.byId('tips').hidden, false);
  assert.equal(button.hidden, true, '初回の案内');
  page.click('tips-close');
  assert.equal(button.hidden, false);

  for (const [trigger, id] of [['menu-open', 'menu'], ['share-open', 'share-dialog'], ['photo-open', 'photo']]) {
    page.click(trigger);
    const dialog = page.byId(id);
    assert.equal(dialog.open, true, id);
    assert.equal(button.hidden, true, id);
    dialog.close();
    assert.equal(button.hidden, false, id);
  }

  page.click('menu-open');
  page.click('reset-open');
  assert.equal(page.byId('reset-dialog').open, true);
  page.byId('reset-dialog').close();
  assert.equal(page.byId('menu').open, true);
  assert.equal(button.hidden, true, '確認を閉じてもメニューが開いている');

  page.click('assist-open');
  assert.equal(page.byId('assist').hidden, false);
  assert.equal(button.hidden, true, '枝と視点の操作');
  page.click('assist-close');
  assert.equal(button.hidden, false);

  send(page.byId('view'), 'webglcontextlost');
  page.click('menu-open');
  page.byId('menu').close();
  assert.equal(button.hidden, true, '描画が止まったときは面を閉じても隠す');
  page.click('retry-view');
  assert.equal(button.hidden, false);
});

test('起動時の読込例外は通知し、案内や時間送りでは前の盆栽を上書きせず、新しい苗の操作では保存する', async (t) => {
  const raw = previousSave();
  const page = await boot(t, { raw, failFirstRead: true });
  send(page.window, 'pagehide');
  assert.equal(page.storageValue(), raw);
  assert.match(page.notice(), /読み取れないため、上書きを保留/);
  assert.equal(page.app.state().species, 'maple');
  assert.equal(page.app.advance(7).day, 7);
  send(page.window, 'pagehide');
  assert.equal(page.storageValue(), raw);

  page.click('menu-open');
  page.byId('new-species').value = 'pine';
  send(page.byId('new-tree'), 'submit');
  send(page.window, 'pagehide');
  assert.equal(JSON.parse(page.storageValue()).tree.species, 'pine');
  assert.equal(page.reads.set, 1);
});

test('消去に失敗した端末では画面を初期苗に戻し、保存を消せなかったことを通知する', async (t) => {
  const raw = previousSave();
  const page = await boot(t, { raw, failRemove: true });
  assert.equal(page.app.state().species, 'plum');
  assert.equal(page.app.state().day, 90);
  page.click('menu-open');
  page.click('reset-open');
  page.click('reset-confirm');
  assert.equal(page.app.state().species, 'maple');
  assert.equal(page.app.state().day, 0);
  assert.equal(page.notice(), '画面は最初の盆栽に戻りましたが、この端末の保存は消せませんでした');
  page.app.advance(7);
  send(page.window, 'pagehide');
  assert.equal(page.storageValue(), raw);
});

test('文書全体の接触と向き・ウィンドウのリサイズを、押下中の道具に伝える', async (t) => {
  const page = await boot(t);
  page.click('tool-cut');
  page.pointer('pointerdown', 'date-label', 1);
  page.pointer('pointerdown', 'view', 2);
  assert.equal(page.highlights.at(-1), null);
  page.pointer('pointerup', 'date-label', 1);
  page.pointer('pointerup', 'view', 2);

  for (const resize of [
    () => send(page.window, 'resize'),
    () => send(page.window, 'orientationchange'),
    () => send(page.window.screen.orientation, 'change'),
    page.resizeStage,
  ]) {
    page.pointer('pointerdown', 'view', 3);
    assert.equal(page.highlights.at(-1)?.tone, 'cut');
    resize();
    assert.equal(page.highlights.at(-1), null);
    page.pointer('pointerup', 'view', 3);
  }
});

test('写真の完了は、撮影中の新しい操作がない時だけ選択表示を戻す', async (t) => {
  let complete;
  const page = await boot(t, { capturePhoto: () => new Promise((resolve) => { complete = resolve; }) });
  send(page.byId('view'), 'keydown', { key: ']' });
  assert.equal(page.highlights.at(-1)?.tone, 'select');
  page.click('photo-open');
  assert.equal(page.highlights.at(-1), null);
  complete(new Blob(['photo'], { type: 'image/png' }));
  await Promise.resolve();
  assert.equal(page.highlights.at(-1)?.tone, 'select');

  page.byId('photo').close();
  page.click('tool-cut');
  page.click('photo-open');
  page.byId('photo').close();
  page.pointer('pointerdown', 'view', 1);
  assert.equal(page.highlights.at(-1)?.tone, 'cut');
  complete(new Blob(['photo'], { type: 'image/png' }));
  await Promise.resolve();
  assert.equal(page.highlights.at(-1)?.tone, 'cut');
  page.pointer('pointercancel', 'view', 1);
});

test('道具の使い方を札と読み上げに出し、同じ道具の札は出し直さない', async (t) => {
  const page = await boot(t, { reduced: true, gfx: 'high' });
  assert.equal(page.viewOptions.reducedMotion, true);
  for (const [id, text] of [
    ['cut', /切る範囲が色づき、離すと切り/], ['bend', /おさえたまま動かすと.*曲が/], ['pinch', /枝先.*離すと.*芽を摘/],
  ]) {
    page.click(`tool-${id}`);
    assert.match(page.notice(), text);
    assert.match(page.byId('live').textContent, text);
    assert.equal(page.byId('notice').dataset.guide, 'true');
  }
  t.mock.timers.tick(5300);
  assert.equal(page.byId('notice').hidden, true);
  page.click('tool-pinch');
  assert.equal(page.byId('notice').hidden, true);
  assert.match(page.byId('live').textContent, /道具「芽摘み」を選びました/);
  page.click('tool-cut');
  assert.equal(page.byId('notice').hidden, false);
  page.click('tool-look');
  assert.equal(page.byId('notice').hidden, true);
  assert.match(page.byId('live').textContent, /道具「見る」を選びました/);
  page.app.advance(7);
  assert.deepEqual(page.lookAnimations, [false, false]);
});
