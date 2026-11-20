import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { DEFAULTS, SAVE_NAME, SAVE_VERSION, TOOL_IDS } from '../../lib/contract.js';
import { createTree } from '../../lib/tree.js';
import { LEARNED_GFX_KEY } from '../../lib/gfx-select.js';
import { createCameraRig } from '../../lib/camera-math.js';

const viewFactory = Symbol.for('bonsai.test.createView3D');
const viewModule = 'data:text/javascript,' + encodeURIComponent(
  'export const createView3D = (...args) => globalThis[Symbol.for("bonsai.test.createView3D")](...args);',
);
let loadCount = 0;

function send(target, type, props = {}) {
  target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), props));
}

async function boot(t, {
  raw = null, learned = null, failFirstRead = false, failRemove = false, capturePhoto, reduced = false,
  gfx = 'test', coarse = false, debug = true, prepare = async () => {},
} = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const document = new EventTarget();
  const window = new EventTarget();
  window.screen = { orientation: new EventTarget(), width: 390, height: 844 };
  const elements = new Map();
  const frames = new Map();
  const reads = { get: 0, set: 0 };
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  const highlights = [];
  const lookAnimations = [];
  let viewOptions;
  const mounted = [];
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
      cloneNode: () => element(id),
      replaceWith(next) {
        if (document.activeElement === this) document.activeElement = document.body;
        elements.set(id, next);
      },
      showModal() { this.open = true; },
      close() { this.open = false; send(this, 'close'); },
      focus(options) { document.activeElement = this; this.focusOptions = options; },
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
    const rig = createCameraRig(30, () => {}, false);
    const cameraSets = [];
    const view = {
      prepare,
      camera: {
        get: rig.get,
        isManual: rig.isManual,
        set(next, opts) {
          cameraSets.push({ next, opts });
          rig.set(next, opts);
        },
        reset: rig.reset,
        pickRay: () => ({ origin: [0, 0, 8], dir: [0, 0, -1] }), pxToWorld: () => 0.01,
      },
      setPot() {}, setLight() {}, setSpecies() {}, setMoisture() {}, setSkeleton() {},
      setLook(_look, { animate }) { lookAnimations.push(animate); },
      setHighlight(value) { highlights.push(value); },
      resize() {}, dispose() { this.disposed = true; }, requestRender() {},
      capturePhoto,
    };
    mounted.push({ view, options, cameraSets });
    return view;
  }

  const globals = {
    window, document, location: { search: `?debug=${Number(debug)}&gfx=${gfx}` }, devicePixelRatio: 1,
    navigator: { hardwareConcurrency: 8 },
    matchMedia: (query) => query === '(pointer: coarse)' ? { matches: coarse } : motion,
    ResizeObserver: class {
      constructor(callback) { resizeStage = callback; }
      observe() {}
    },
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    [viewFactory]: createView3D,
    localStorage: {
      getItem(name) {
        if (name === LEARNED_GFX_KEY) return learned;
        assert.equal(name, SAVE_NAME);
        reads.get += 1;
        if (failFirstRead && reads.get === 1) throw new Error('SecurityError');
        return raw;
      },
      setItem(name, value) {
        if (name === LEARNED_GFX_KEY) { learned = value; return; }
        assert.equal(name, SAVE_NAME);
        reads.set += 1;
        raw = value;
      },
      removeItem(name) {
        if (failRemove) throw new Error('SecurityError');
        if (name === LEARNED_GFX_KEY) { learned = null; return; }
        assert.equal(name, SAVE_NAME);
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
    window, document, byId, pointer, highlights, lookAnimations, viewOptions, reads, storageValue: () => raw, resizeStage,
    mounted, motion, learnedValue: () => learned,
    async settle() { await Promise.resolve(); paint(); },
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
  assert.equal(date.textContent, '梅・冬・12月5週');
  page.app.advance(7);
  assert.equal(date.textContent, '梅・冬・1月1週');

  page.click('menu-open');
  page.byId('new-species').value = 'pine';
  send(page.byId('new-tree'), 'submit');
  assert.equal(date.textContent, '黒松・秋・10月1週');

  page.click('menu-open');
  page.click('reset-open');
  page.click('reset-confirm');
  assert.equal(date.textContent, '紅葉・秋・10月1週');
});

test('保存を消して最初から：通知と初回の案内カードが同じ位置で重ならない（案内は出さず、通知を読める）', async (t) => {
  const page = await boot(t);
  page.click('tips-close');
  page.click('menu-open');
  page.click('reset-open');
  page.click('reset-confirm'); // click は描画の枠（rAF）まで進める
  assert.equal(page.byId('notice').hidden, false, '通知が出る');
  assert.equal(page.byId('tips').hidden, true, '案内カードは出さない（通知と重なる）');
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

test('鍵盤で選んだ枝の白い光は、指やマウスで盆栽に触れると消え、道具やボタンの操作では消えない', async (t) => {
  const page = await boot(t);
  send(page.byId('view'), 'keydown', { key: ']' });
  assert.equal(page.highlights.at(-1)?.tone, 'select');
  // 道具を選んでも、枝を選んでから道具を選ぶ順で使えるよう、選択は残る
  page.click('tool-cut');
  assert.equal(page.highlights.at(-1)?.tone, 'select');
  page.click('undo');
  assert.equal(page.highlights.at(-1)?.tone, 'select');
  // 盆栽に触れた時点で消える。離したあとも、白い光が戻らない
  page.pointer('pointerdown', 'view', 1);
  page.pointer('pointerup', 'view', 1);
  assert.notEqual(page.highlights.at(-1)?.tone, 'select');
  assert.equal(page.highlights.at(-1), null);
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

test('メニューで画質を変えると設定を保存し、カメラと木を保ったまま描画を作り直す', async (t) => {
  const page = await boot(t, { gfx: '', coarse: true });
  await page.settle();
  const scene = page.app.view;
  const tree = page.app.tree;
  const pose = { az: -42, pol: 64, dist: 7, target: [0.1, 1.8, 0.4] };
  scene.camera.set(pose);
  assert.equal(page.byId('app').dataset.gfx, 'mid');

  page.click('menu-open');
  const input = page.byId('gfx');
  assert.equal(input.value, 'auto');
  input.value = 'high';
  send(input, 'change');
  assert.equal(page.byId('app').dataset.gfx, 'high');
  assert.equal(page.byId('app').dataset.ready, 'false');
  assert.equal(scene.disposed, true);
  assert.deepEqual(page.app.view.camera.get(), pose);
  assert.equal(page.app.view.camera.isManual(), true);
  assert.equal(page.app.tree, tree);
  await page.settle();
  assert.equal(page.byId('app').dataset.ready, 'true');
  send(page.window, 'pagehide');
  assert.equal(JSON.parse(page.storageValue()).gfx, 'high');

  page.app.feedFrames(Array(100).fill(60));
  assert.equal(page.app.state().gfx, 'high');
  assert.equal(page.mounted.length, 2);
});

test('自動では実行中の遅さを覚えて、カメラを保ち、一段下げたことを通知する', async (t) => {
  const page = await boot(t, { gfx: '', coarse: true });
  await page.settle();
  const scene = page.app.view;
  const pose = { az: 31, pol: 69, dist: 9, target: [0, 1.9, 0.5] };
  scene.camera.set(pose);
  page.document.hidden = true;
  page.app.feedFrames(Array(70).fill(55));
  assert.equal(page.byId('app').dataset.gfx, 'mid');
  page.document.hidden = false;

  for (let i = 0; i < 59; i += 1) page.viewOptions.onFrame(55);
  assert.equal(page.app.view, scene);
  page.app.feedFrames([55]);
  assert.equal(page.byId('app').dataset.gfx, 'low');
  assert.equal(scene.disposed, true);
  assert.equal(JSON.parse(page.learnedValue()).tier, 'low');
  assert.equal(page.app.state().gfxSetting, 'auto');
  assert.deepEqual(page.app.view.camera.get(), pose);
  assert.equal(page.app.view.camera.isManual(), true);
  await page.settle();
  assert.match(page.notice(), /動きが重いので、画質を下げました/);
  assert.equal(page.byId('live').textContent, page.notice());
});

test('動きの軽減を切り替えても手動の視点を引き継ぐ', async (t) => {
  const page = await boot(t, { gfx: '', coarse: true });
  await page.settle();
  const previous = page.app.view;
  previous.camera.set({ az: 30, pol: 65, dist: 8 });
  const pose = previous.camera.get();
  page.motion.matches = true;
  send(page.motion, 'change');
  await page.settle();
  assert.equal(previous.disposed, true);
  assert.equal(page.app.view.camera.isManual(), true);
  assert.deepEqual(page.app.view.camera.get(), pose);
});

test('保存した設定と覚えた画質よりURL指定が優先され、デバッグなしでは入口を出さない', async (t) => {
  const raw = JSON.stringify({ ...JSON.parse(previousSave()), gfx: 'low' });
  const page = await boot(t, { raw, gfx: 'mid', debug: false });
  assert.equal(page.app, undefined);
  assert.equal(page.byId('app').dataset.gfx, 'mid');
  assert.equal(page.viewOptions.onFrame, undefined);
  await page.settle();
  page.click('menu-open');
  assert.equal(page.byId('gfx').value, 'low');
});

test('以前の準備が失敗しても、画質の変更で始めた準備と読み込み表示を保つ', async (t) => {
  const jobs = [];
  const prepare = () => new Promise((resolve, reject) => jobs.push({ resolve, reject }));
  const page = await boot(t, { gfx: '', coarse: true, prepare });
  assert.equal(page.byId('loading').hidden, false);
  page.click('menu-open');
  const input = page.byId('gfx');
  input.value = 'low';
  send(input, 'change');
  jobs[0].reject(new Error('古い描画の準備'));
  await page.settle();
  assert.equal(page.byId('fallback').hidden, true);
  assert.equal(page.byId('loading').hidden, false);
  jobs[1].resolve();
  await page.settle();
  assert.equal(page.byId('loading').hidden, true);
  assert.equal(page.byId('app').dataset.ready, 'true');
  assert.equal(page.byId('app').dataset.gfx, 'low');
  assert.deepEqual(page.mounted.map(({ cameraSets }) => cameraSets.length), [0, 0]);
});

test('自動の再起動では期限内に覚えた軽めの画質から始める', async (t) => {
  const raw = previousSave();
  const learned = JSON.stringify({ tier: 'low', at: Date.now() });
  const page = await boot(t, { raw, learned, gfx: '', coarse: true });
  await page.settle();
  assert.equal(page.byId('app').dataset.gfx, 'low');
  page.click('menu-open');
  assert.equal(page.byId('gfx').value, 'auto');
  assert.equal(page.app.state().species, 'plum');
});

for (const [label, start, stop] of [
  ['指で触れている', (page) => {
    page.click('tool-bend');
    page.pointer('pointerdown', 'view', 1);
  }, (page) => page.pointer('pointerup', 'view', 1)],
  ['早送りしている', (page) => page.click('fast-start'), (page) => page.click('fast-stop')],
  ['ダイアログを開いている', (page) => page.click('menu-open'), (page) => page.byId('menu').close()],
]) {
  test(`自動降格は${label}間は待ち、操作が終わると一度だけ切り替える`, async (t) => {
    const page = await boot(t, { gfx: '', coarse: true });
    await page.settle();
    const scene = page.app.view;
    start(page);
    page.app.feedFrames(Array(120).fill(55));
    t.mock.timers.tick(400);
    assert.equal(page.app.view, scene);
    assert.equal(page.app.state().gfx, 'mid');
    assert.equal(JSON.parse(page.learnedValue()).tier, 'low');
    assert.doesNotMatch(page.notice(), /画質を下げました/);
    stop(page);
    t.mock.timers.tick(399);
    assert.equal(page.app.view, scene);
    t.mock.timers.tick(1);
    await page.settle();
    assert.equal(scene.disposed, true);
    assert.equal(page.app.state().gfx, 'low');
    assert.equal(page.app.view.camera.isManual(), false);
    assert.match(page.notice(), /画質を下げました/);
    t.mock.timers.tick(400);
    assert.equal(page.mounted.length, 2);
  });
}

for (const moveFocus of [false, true]) {
  test(`自動降格中に${moveFocus ? 'メニューボタンへ移したフォーカスを保つ' : '失ったフォーカスを新しいキャンバスに戻す'}`, async (t) => {
    const page = await boot(t, { gfx: '', coarse: true });
    await page.settle();
    const oldCanvas = page.byId('view');
    oldCanvas.focus();
    page.app.feedFrames(Array(60).fill(55));
    const canvas = page.byId('view');
    assert.notEqual(canvas, oldCanvas);
    assert.equal(page.document.activeElement, page.document.body);
    const menu = page.byId('menu-open');
    if (moveFocus) menu.focus();
    await page.settle();
    assert.equal(page.document.activeElement, moveFocus ? menu : canvas);
    assert.deepEqual(canvas.focusOptions, moveFocus ? undefined : { preventScroll: true });
  });
}

for (const [label, replace, expected] of [
  ['手動で画質を替える', (page) => {
    page.byId('gfx').value = 'high';
    send(page.byId('gfx'), 'change');
    page.byId('menu').close();
  }, 'high'],
  ['苗を替える', (page) => {
    page.byId('new-species').value = 'pine';
    send(page.byId('new-tree'), 'submit');
  }, 'mid'],
  ['WebGL表示が止まる', (page) => {
    send(page.byId('view'), 'webglcontextlost');
    page.byId('menu').close();
    page.click('retry-view');
  }, 'mid'],
]) {
  test(`画質の変更を待つ間に${label}と予約を捨てる`, async (t) => {
    const page = await boot(t, { gfx: '', coarse: true });
    await page.settle();
    page.click('menu-open');
    page.app.feedFrames(Array(60).fill(55));
    assert.equal(JSON.parse(page.learnedValue()).tier, 'low');
    replace(page);
    await page.settle();
    t.mock.timers.tick(800);
    assert.equal(page.mounted.length, 2);
    assert.equal(page.app.state().gfx, expected);
    assert.doesNotMatch(page.notice(), /画質を下げました/);
    if (expected === 'mid') {
      page.app.feedFrames(Array(60).fill(55));
      assert.equal(page.app.state().gfx, 'low');
      assert.equal(page.mounted.length, 3);
    }
  });
}

test('前面に戻った時点から自動降格の計測をやり直す', async (t) => {
  const page = await boot(t, { gfx: '', coarse: true });
  await page.settle();
  const slow = Array(59).fill(55);
  page.app.feedFrames(slow);
  assert.equal(page.app.state().gfx, 'mid');
  page.document.hidden = true;
  send(page.document, 'visibilitychange');
  page.app.feedFrames([55]);
  page.document.hidden = false;
  send(page.document, 'visibilitychange');
  page.app.feedFrames(slow);
  assert.equal(page.app.state().gfx, 'mid');
  page.app.feedFrames([55]);
  assert.equal(page.app.state().gfx, 'low');
});

test('保存を消して最初からやり直すと覚えた画質を捨て、端末に合わせて選び直す', async (t) => {
  const raw = previousSave();
  const learned = JSON.stringify({ tier: 'low', at: Date.now() });
  const page = await boot(t, { raw, learned, gfx: '', coarse: true });
  await page.settle();
  assert.equal(page.app.state().gfx, 'low');
  page.click('menu-open');
  page.click('reset-open');
  page.click('reset-confirm');
  await page.settle();
  assert.equal(page.learnedValue(), null);
  assert.equal(page.app.state().gfx, 'mid');
});
