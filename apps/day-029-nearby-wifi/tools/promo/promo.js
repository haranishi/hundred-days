import {
  CHAIN_PIN_ID, DEFAULT_FPS, DURATION_SECONDS, END_START, PIN_SPOT_ID, TAPS, appStepAt, captionAt,
  clamp, easeInOutCubic, easeOutBack, easeOutCubic, mix, phoneTimeline, progress, revealProgress,
  ringAt, ringOpacity, scrollAt, stageAt
} from './timeline.mjs';

window.__promo = { durationSeconds: DURATION_SECONDS, fps: DEFAULT_FPS };
window.__promoWarnings = [];

const $ = (id) => document.getElementById(id);
const phone = $('phone');
const appFrame = $('app-frame');
const caption = $('caption');
const titleScene = $('title-scene');
const promiseScene = $('promise-scene');
const endScene = $('end-scene');
const rings = [...document.querySelectorAll('.focus-ring')];
const tapRipple = $('tap-ripple');

const APP_WIDTH = appFrame.offsetWidth;   // 390
const APP_HEIGHT = appFrame.offsetHeight; // 844
const MARKER_SIZE = 44;
const MARKER_FONT = 11.52; // .wifi-marker の .72rem

let appliedStep = null;
let appStarted = false;

const warn = (message) => {
  if (!window.__promoWarnings.includes(message)) window.__promoWarnings.push(message);
};

const appDocument = () => appFrame.contentDocument;
const appWindow = () => appFrame.contentWindow;

function twoFrames(frameWindow = window) {
  return new Promise((resolve) => frameWindow.requestAnimationFrame(() => frameWindow.requestAnimationFrame(resolve)));
}

async function waitUntil(check, timeoutMs, message) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

/* 地図は OpenFreeMap から本物のタイルを取る。読み込みの途中で撮ると灰色の穴が写るので、
   状態を変えるたびに「2回続けて揃っている」ことを確かめてから次へ進む。
   __wifiMap は render-promo.mjs が addInitScript で立てる __E2E__ で生える。 */
async function waitForMap(timeoutMs = 40_000) {
  const started = Date.now();
  let calm = 0;
  for (;;) {
    const map = appWindow().__wifiMap;
    if (!map && Date.now() - started > 6000) {
      throw new Error('地図（__wifiMap）が見つかりません。render-promo.mjs の addInitScript で __E2E__ を立ててください');
    }
    if (map?.loaded() && map.areTilesLoaded()) calm += 1;
    else calm = 0;
    if (calm >= 2) {
      await twoFrames(appWindow());
      return;
    }
    if (Date.now() - started > timeoutMs) throw new Error('地図のタイルが揃いませんでした');
    await new Promise((resolve) => setTimeout(resolve, 90));
  }
}

/* 1コマごとの確認。揃っていれば何もしない。地図が動くのは状態を変えたときだけなので
   普段は素通りするが、タイルが遅れて外れたコマを撮らないための保険。 */
async function ensureMapSettled(t, timeoutMs = 5000) {
  const map = appWindow().__wifiMap;
  if (map?.loaded() && map.areTilesLoaded()) return;
  try {
    await waitForMap(timeoutMs);
  } catch {
    warn(`${t.toFixed(2)}秒: 地図のタイルが揃わないまま撮りました`);
  }
}

/* iframe を読み直して「探す前」に戻す。検索も絞り込みも取り消せないので、
   巻き戻すときは必ずここを通る（--from で途中から撮っても同じ画になる）。 */
async function reloadApp() {
  try { localStorage.removeItem('day029.wifi.v1'); } catch { /* 記憶が無くても撮影は成立する */ }
  const loaded = new Promise((resolve, reject) => {
    appFrame.addEventListener('load', resolve, { once: true });
    appFrame.addEventListener('error', () => reject(new Error('アプリの iframe を読み込めませんでした')), { once: true });
  });
  if (appStarted) appWindow().location.reload();
  else appFrame.src = appFrame.dataset.src;
  appStarted = true;
  await loaded;

  const doc = appDocument();
  if (!doc?.getElementById('locate')) throw new Error('アプリの操作要素が見つかりません');
  if (doc.getElementById('app').dataset.state !== 'empty') throw new Error('探す前の画面になっていません');
  await doc.fonts.ready;
  await waitForMap();
}

async function stepLocate() {
  const doc = appDocument();
  doc.getElementById('locate').click();
  await waitUntil(
    () => doc.getElementById('app').dataset.state === 'results' && doc.querySelectorAll('.spot').length > 0,
    20_000,
    '「現在地から探す」の結果が出ませんでした（位置情報の許可を確認してください）'
  );
  doc.activeElement?.blur();
  await waitForMap();
}

async function stepOnlyFree() {
  const doc = appDocument();
  const before = doc.getElementById('summary').textContent;
  doc.getElementById('only-free').click();
  await waitUntil(() => doc.getElementById('summary').textContent !== before, 8000, '「無料と客向けだけ」で件数が変わりませんでした');
  doc.activeElement?.blur();
  await waitForMap();
}

async function stepSelectPin() {
  const doc = appDocument();
  const marker = doc.querySelector(`.wifi-marker[data-id="${PIN_SPOT_ID}"]`);
  if (!marker) throw new Error(`地図に ${PIN_SPOT_ID} のピンがありません`);
  marker.click();
  await waitUntil(() => doc.querySelector(`.spot[data-id="${PIN_SPOT_ID}"][aria-current="true"]`), 8000, 'ピンを押してもリストが強調されませんでした');
  doc.activeElement?.blur();
  await waitForMap();
}

const STEPS = [stepLocate, stepOnlyFree, stepSelectPin];

async function applyStep(t) {
  const desired = appStepAt(t);
  if (appliedStep === null || desired < appliedStep) {
    await reloadApp();
    appliedStep = 0;
  }
  while (appliedStep < desired) {
    await STEPS[appliedStep]();
    appliedStep += 1;
  }
}

/* 結果が出た瞬間の演出。ピンとリストは実物のまま、出る順番だけをここで作る。
   ピンは MapLibre が transform で位置を決めているので、幅と高さで大きくする
   （translate(-50%,-50%) が効いたまま中心が動かない）。 */
function styleStage(t) {
  const stage = stageAt(t);
  const doc = appDocument();
  doc.querySelectorAll('.wifi-marker').forEach((element, index) => {
    const p = stage ? easeOutBack(revealProgress(index, t, stage.marker)) : 1;
    const size = MARKER_SIZE * (.34 + .66 * p);
    element.style.width = `${size.toFixed(2)}px`;
    element.style.height = `${size.toFixed(2)}px`;
    element.style.fontSize = `${(MARKER_FONT * (.34 + .66 * p)).toFixed(2)}px`;
    element.style.opacity = clamp(p * 1.7).toFixed(3);
  });
  doc.querySelectorAll('.spot').forEach((element, index) => {
    const p = stage ? easeOutCubic(revealProgress(index, t, stage.spot)) : 1;
    element.style.opacity = p.toFixed(3);
    element.style.transform = `translateY(${((1 - p) * 20).toFixed(2)}px)`;
  });
}

function anchorTop(name) {
  if (name === 'top') return 0;
  const doc = appDocument();
  const selector = name === 'map' ? '.map-card' : `.spot[data-id="${PIN_SPOT_ID}"]`;
  const element = doc.querySelector(selector);
  if (!element) return 0;
  return element.getBoundingClientRect().top + appWindow().scrollY;
}

function applyScroll(t) {
  const doc = appDocument();
  const limit = Math.max(0, doc.documentElement.scrollHeight - APP_HEIGHT);
  appWindow().scrollTo(0, Math.min(limit, Math.max(0, scrollAt(t, anchorTop))));
}

/* iframe の中の要素を、合成ページの座標へ写す。スマホ枠を拡大しているときも
   合うように、倍率は毎回 iframe の実寸から測る（CSS の 1.6 に加えて枠の scale が乗る）。 */
function frameGeometry() {
  const rect = appFrame.getBoundingClientRect();
  return { rect, scale: rect.width / APP_WIDTH };
}

// overflow: hidden の祖先で切り取られる範囲。地図の外へ出たピンを囲わないために要る。
function clipRect(element) {
  const doc = appDocument();
  let clip = { left: 0, top: 0, right: APP_WIDTH, bottom: APP_HEIGHT };
  for (let node = element.parentElement; node && node !== doc.body; node = node.parentElement) {
    const { overflowX, overflowY } = appWindow().getComputedStyle(node);
    if (overflowX === 'visible' && overflowY === 'visible') continue;
    const rect = node.getBoundingClientRect();
    clip = {
      left: Math.max(clip.left, rect.left),
      top: Math.max(clip.top, rect.top),
      right: Math.min(clip.right, rect.right),
      bottom: Math.min(clip.bottom, rect.bottom)
    };
  }
  return clip;
}

function targetRect(target) {
  const doc = appDocument();
  if (target.from) {
    const first = doc.querySelector(target.from);
    const last = doc.querySelector(target.to);
    if (!first || !last) return null;
    const a = first.getBoundingClientRect();
    const b = last.getBoundingClientRect();
    const box = {
      left: Math.min(a.left, b.left), top: Math.min(a.top, b.top),
      right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom)
    };
    return { box, clip: clipRect(first) };
  }
  let element = doc.querySelector(target.selector);
  if (element && target.closest) element = element.closest(target.closest);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, clip: clipRect(element) };
}

// 画面に出ていない要素を囲うとスマホ枠の外に輪が浮く。6割以上見えているときだけ描く。
function visibleEnough({ box, clip }) {
  const width = Math.max(0, Math.min(box.right, clip.right) - Math.max(box.left, clip.left));
  const height = Math.max(0, Math.min(box.bottom, clip.bottom) - Math.max(box.top, clip.top));
  const area = (box.right - box.left) * (box.bottom - box.top);
  return area > 0 && (width * height) / area >= .6;
}

// pad はアプリ側の px。合成ページ上の太さは倍率と一緒に大きくなる。
function placeOverIframe(node, box, opacity, pad = 8) {
  const { rect, scale } = frameGeometry();
  const margin = pad * scale;
  node.style.display = 'block';
  node.style.left = `${(rect.left + box.left * scale - margin).toFixed(2)}px`;
  node.style.top = `${(rect.top + box.top * scale - margin).toFixed(2)}px`;
  node.style.width = `${((box.right - box.left) * scale + margin * 2).toFixed(2)}px`;
  node.style.height = `${((box.bottom - box.top) * scale + margin * 2).toFixed(2)}px`;
  node.style.opacity = String(opacity);
}

function renderRings(t) {
  const item = ringAt(t);
  const opacity = item ? ringOpacity(t, item) : 0;
  rings.forEach((node, index) => {
    const target = opacity > 0 ? item.targets[index] : null;
    const measured = target ? targetRect(target) : null;
    if (!measured || !visibleEnough(measured)) {
      if (target && opacity > .5) warn(`${t.toFixed(2)}秒: 注目リングの対象が見えていません（${target.selector ?? target.from}）`);
      node.style.display = 'none';
      return;
    }
    node.style.borderRadius = target.round ? '50%' : '18px';
    placeOverIframe(node, measured.box, opacity, target.pad);
  });
}

function renderTap(t) {
  const tap = TAPS.find(({ at }) => t >= at - .22 && t < at + .48);
  const measured = tap ? targetRect({ selector: tap.selector }) : null;
  if (!measured || !visibleEnough(measured)) {
    if (tap && !measured) warn(`${t.toFixed(2)}秒: 波紋の対象が見つかりません（${tap.selector}）`);
    tapRipple.style.display = 'none';
    return;
  }
  const { rect, scale } = frameGeometry();
  const centerX = rect.left + (measured.box.left + measured.box.right) / 2 * scale;
  const centerY = rect.top + (measured.box.top + measured.box.bottom) / 2 * scale;
  const inP = progress(t, tap.at - .22, tap.at, easeOutCubic);
  const outP = progress(t, tap.at, tap.at + .48, easeOutCubic);
  tapRipple.style.display = 'block';
  tapRipple.style.left = `${(centerX - 46).toFixed(2)}px`;
  tapRipple.style.top = `${(centerY - 46).toFixed(2)}px`;
  tapRipple.style.opacity = String(t < tap.at ? inP : 1 - outP);
  tapRipple.style.transform = `scale(${(t < tap.at ? mix(.45, 1, inP) : mix(1, 1.8, outP)).toFixed(4)})`;
}

async function renderPhone(t) {
  const state = phoneTimeline(t);
  phone.style.opacity = String(state.opacity);
  phone.style.transform = `translate3d(0, ${state.translateY.toFixed(2)}px, 0) scale(${state.scale.toFixed(4)})`;
  await applyStep(t);
  await ensureMapSettled(t);
  styleStage(t);
  applyScroll(t);
  renderRings(t);
  renderTap(t);
}

function setEntrance(node, t, start, duration = .32, { y = 28, scaleFrom = .97 } = {}) {
  const p = progress(t, start, start + duration, easeOutCubic);
  node.style.opacity = t < start ? '0' : String(p);
  node.style.transform = `translate3d(0, ${mix(y, 0, p).toFixed(2)}px, 0) scale(${mix(scaleFrom, 1, p).toFixed(4)})`;
}

function renderTitle(t) {
  const visible = t >= 2.6 && t < 5;
  titleScene.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  // スマホが消えきる前に出し始める。ここを遅らせると数コマ何も無い画になる
  setEntrance($('main-title'), t, 2.8, .34, { y: 40, scaleFrom: .96 });
  setEntrance($('challenge-label'), t, 3, .3, { y: 16, scaleFrom: 1 });
  setEntrance($('main-lead'), t, 3.25, .32, { y: 26, scaleFrom: .99 });
  titleScene.style.opacity = String(1 - progress(t, 4.5, 4.85, easeInOutCubic));
}

function renderCaption(t) {
  const item = captionAt(t);
  if (!item) {
    caption.style.display = 'none';
    return;
  }
  caption.style.display = 'flex';
  caption.replaceChildren(...item.lines.flatMap((line, index) => {
    const nodes = [document.createTextNode(line)];
    if (index < item.lines.length - 1) nodes.push(document.createElement('br'));
    return nodes;
  }));
  const p = progress(t, item.start, item.start + .32, easeOutCubic);
  const overshoot = p < .78 ? mix(.9, 1.018, p / .78) : mix(1.018, 1, (p - .78) / .22);
  caption.style.opacity = String(p);
  caption.style.transform = `translate3d(0, ${mix(24, 0, p).toFixed(2)}px, 0) scale(${overshoot.toFixed(4)})`;
}

function renderPromise(t) {
  const visible = t >= 27.7 && t < END_START;
  promiseScene.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  const starts = [27.8, 28.65, 29.5];
  [...promiseScene.children].forEach((line, index) => setEntrance(line, t, starts[index], .32, { y: 28, scaleFrom: .985 }));
  promiseScene.style.opacity = String(1 - progress(t, 30.3, END_START, easeInOutCubic));
}

function renderEnd(t) {
  const visible = t >= END_START;
  endScene.style.display = visible ? 'block' : 'none';
  $('fade-black').style.opacity = visible ? String(progress(t, 35, 36, easeInOutCubic)) : '0';
  if (!visible) return;
  const p = progress(t, END_START, END_START + .35, easeOutCubic);
  endScene.style.opacity = String(p);
  endScene.style.transform = `translate3d(0, ${mix(34, 0, p).toFixed(2)}px, 0)`;
}

async function seekInternal(value) {
  const t = clamp(Number(value) || 0, 0, DURATION_SECONDS);
  renderTitle(t);
  await renderPhone(t);
  renderCaption(t);
  renderPromise(t);
  renderEnd(t);
}

window.__promoReady = Promise.all([
  document.fonts.ready,
  applyStep(0)
]).then(async () => {
  // 主役のピンと項目が本当に出ているか、描き始める前に確かめる
  const doc = appDocument();
  for (const selector of [`.wifi-marker[data-id="${PIN_SPOT_ID}"]`, `.wifi-marker[data-id="${CHAIN_PIN_ID}"]`, `.spot[data-id="${PIN_SPOT_ID}"]`]) {
    if (!doc.querySelector(selector)) throw new Error(`${selector} が見つかりません。探す中心（ORIGIN）か同梱データが変わっています`);
  }
  await seekInternal(0);
  await twoFrames();
});

window.__seek = async (tSeconds) => {
  await window.__promoReady;
  await seekInternal(tSeconds);
};
