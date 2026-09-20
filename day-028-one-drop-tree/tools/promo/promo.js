import { drawDrop, drawRipple, drawScene } from '../../lib/draw.js';
import { generatePlant } from '../../lib/plant.js';
import {
  DEFAULT_FPS, DURATION_SECONDS, END_START, FIXED_TODAY, HERO_LAST_STEPS, PLANT_SEED, TAPS,
  TREE_RECORDS, appStateAt, captionAt, clamp, easeInOutCubic, easeOutCubic, heroPlantAt,
  heroTimeline, mix, phoneTimeline, progress, recordDays, ringOpacity, treeStateAt
} from './timeline.mjs';

window.__promo = { durationSeconds: DURATION_SECONDS, fps: DEFAULT_FPS };

const $ = (id) => document.getElementById(id);
const hero = $('hero');
const heroCanvas = $('hero-canvas');
const heroContext = heroCanvas.getContext('2d');
const phone = $('phone');
const appFrame = $('app-frame');
const overlay = $('plant-overlay');
const overlayContext = overlay.getContext('2d');
const caption = $('caption');
const titleScene = $('title-scene');
const promiseScene = $('promise-scene');
const endScene = $('end-scene');
const focusRing = document.querySelector('.focus-ring');
const tapRipple = $('tap-ripple');

const APP_SCALE = 1.6;
const APP_STORAGE_SLOT = 'day028.tree.v1';
const HERO_SIZE = heroCanvas.width;
const SOIL_Y = .8; // lib/draw.js が土を描く高さ
const HERO_FILL = .62; // 木の高さを画面のどれだけに収めるか

/* 歩数ごとの梢の高さ。木は12歩でもう高さの8割まで伸びていて、そのあとは横に広がる。
   高さで割った寄りを使うと、camera が育ちに追い越されて木が縮んで見えることがない。 */
const HERO_TOPS = Array.from({ length: HERO_LAST_STEPS + 1 }, (_, steps) => (
  steps ? Math.min(...generatePlant(PLANT_SEED, steps).segments.map((segment) => segment.y2)) : SOIL_Y
));

function heroZoom(position) {
  const low = HERO_TOPS[Math.max(1, Math.floor(position))];
  const high = HERO_TOPS[Math.min(HERO_LAST_STEPS, Math.ceil(position))];
  return clamp(HERO_FILL / (SOIL_Y - mix(low, high, position - Math.floor(position))), 1, 2.4);
}

let applied = null;
let appStarted = false;

function twoFrames(frameWindow = window) {
  return new Promise((resolve) => frameWindow.requestAnimationFrame(() => frameWindow.requestAnimationFrame(resolve)));
}

function appDocument() {
  return appFrame.contentDocument;
}

async function waitUntil(check, timeoutMs) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

/* 撮影日が動くと「水をあげた日」の数もしおれ具合も変わる。
   render-promo.mjs の setFixedTime が iframe まで効いているかを毎回確かめる。 */
function checkFixedDate() {
  const now = new appFrame.contentWindow.Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
  if (today !== FIXED_TODAY) {
    throw new Error(`アプリ側の日付が ${today} です。${FIXED_TODAY} に固定してから描画してください`);
  }
}

/* 記録を localStorage へ書いてアプリを読み直す。水やりは元へ戻せないので、
   巻き戻すときもここを通す（--from で途中から撮っても同じ画になる）。 */
async function loadRecord(id) {
  const wateredDays = recordDays(TREE_RECORDS[id]);
  try {
    localStorage.setItem(APP_STORAGE_SLOT, JSON.stringify({
      v: 1,
      seed: PLANT_SEED,
      plantedOn: wateredDays[0],
      wateredDays,
      updatedAt: `${wateredDays.at(-1)}T00:00:00.000Z`
    }));
  } catch {
    throw new Error('記録を localStorage へ書き込めませんでした');
  }

  const loaded = new Promise((resolve, reject) => {
    appFrame.addEventListener('load', resolve, { once: true });
    appFrame.addEventListener('error', () => reject(new Error('アプリの iframe を読み込めませんでした')), { once: true });
  });
  if (appStarted) appFrame.contentWindow.location.reload();
  else appFrame.src = appFrame.dataset.src;
  appStarted = true;
  await loaded;

  const doc = appDocument();
  if (!doc?.getElementById('water')) throw new Error('アプリの操作要素が見つかりません');
  checkFixedDate();
  if (doc.getElementById('app').dataset.state !== 'ready') throw new Error(`記録 ${id} が読み込まれていません`);
  if (doc.getElementById('water').disabled) throw new Error(`記録 ${id} では水をあげられません`);
  doc.getElementById('plant').style.visibility = 'hidden'; // 木は overlay 側で描く
  await doc.fonts.ready;
  await twoFrames(appFrame.contentWindow);
  applied = { record: id, watered: false };
}

async function applyAppState(t) {
  const desired = appStateAt(t);
  if (desired.record !== applied.record || (applied.watered && !desired.watered)) {
    await loadRecord(desired.record);
  }
  if (!desired.watered || applied.watered) return;
  const doc = appDocument();
  doc.getElementById('water').click();
  if (!await waitUntil(() => doc.getElementById('water').textContent === '今日はあげました', 3000)) {
    throw new Error('水やりが記録に入りませんでした');
  }
  doc.activeElement?.blur(); // 水やり後に canvas へ focus() するので、枠が映らないよう外す
  applied.watered = true;
  await twoFrames(appFrame.contentWindow);
}

function drawTree(context, size, state) {
  drawScene(context, {
    plant: generatePlant(PLANT_SEED, state.steps),
    size,
    wilt: state.wilt ?? 0,
    progress: state.progress,
    newborn: state.newborn,
    clear: state.clear ?? true
  });
}

function renderHero(t) {
  const state = heroTimeline(t);
  hero.style.opacity = String(state.opacity);
  hero.style.top = `${state.centerY.toFixed(2)}px`;
  hero.style.transform = `translate(-50%, -50%) scale(${state.scale.toFixed(4)})`;
  if (state.opacity <= 0) return;
  const view = heroPlantAt(t);
  const zoom = heroZoom(view.position);
  heroContext.setTransform(1, 0, 0, 1, 0, 0);
  heroContext.clearRect(0, 0, HERO_SIZE, HERO_SIZE);
  // 鉢の底を画面に残したまま寄る。木が伸びるぶんだけ引くので、苗のうちから画面が埋まる。
  const bottom = HERO_SIZE * .965;
  heroContext.setTransform(zoom, 0, 0, zoom, HERO_SIZE * .5 * (1 - zoom), bottom * (1 - zoom));
  drawTree(heroContext, HERO_SIZE, { ...view, clear: false });
}

/* iframe 内の .canvas-bed にぴたりと重ねる。アプリは木の高さに合わせて正方形の上を
   隠すので、bed の高さ÷幅を crop として毎コマ測り、同じ切り取り方をここでも作る。 */
function renderOverlay(t) {
  const bed = appDocument().querySelector('.canvas-bed');
  if (!bed) throw new Error('アプリの .canvas-bed が見つかりません');
  const rect = bed.getBoundingClientRect();
  const size = Math.round(rect.width * APP_SCALE);
  const height = Math.round(rect.height * APP_SCALE);
  if (overlay.width !== size || overlay.height !== height) {
    overlay.width = size;
    overlay.height = height;
  }
  overlay.style.width = `${size}px`;
  overlay.style.height = `${height}px`;
  overlay.style.left = `${(rect.left * APP_SCALE).toFixed(2)}px`;
  overlay.style.top = `${(rect.top * APP_SCALE).toFixed(2)}px`;

  const crop = rect.height / rect.width;
  overlayContext.setTransform(1, 0, 0, 1, 0, -(1 - crop) * size);
  const state = treeStateAt(t);
  drawTree(overlayContext, size, state);
  if (state.drop !== null) drawDrop(overlayContext, size, state.drop);
  if (state.ripple !== null) drawRipple(overlayContext, size, state.ripple);
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
  setEntrance($('main-title'), t, 3.3, .34, { y: 40, scaleFrom: .96 });
  setEntrance($('challenge-label'), t, 3.5, .3, { y: 16, scaleFrom: 1 });
  setEntrance($('main-lead'), t, 3.8, .32, { y: 26, scaleFrom: .99 });
  titleScene.style.opacity = String(1 - progress(t, 4.65, 5, easeInOutCubic));
}

function placeOverIframe(node, target, opacity, padding = 8) {
  if (!target || opacity <= 0) {
    node.style.display = 'none';
    return;
  }
  const frameRect = appFrame.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  node.style.display = 'block';
  node.style.left = `${frameRect.left + rect.left * APP_SCALE - padding}px`;
  node.style.top = `${frameRect.top + rect.top * APP_SCALE - padding}px`;
  node.style.width = `${rect.width * APP_SCALE + padding * 2}px`;
  node.style.height = `${rect.height * APP_SCALE + padding * 2}px`;
  node.style.opacity = String(opacity);
}

// 「1日1回まで」の字幕の間だけ、押せなくなったボタンを囲う。
function renderRing(t) {
  const opacity = ringOpacity(t, 9.7, 10.6, 11);
  placeOverIframe(focusRing, opacity > 0 ? appDocument().getElementById('water') : null, opacity, 10);
}

function renderTap(t) {
  const tap = TAPS.find(({ at }) => t >= at - .2 && t < at + .45);
  if (!tap) {
    tapRipple.style.display = 'none';
    return;
  }
  const rect = appDocument().getElementById(tap.target).getBoundingClientRect();
  const frameRect = appFrame.getBoundingClientRect();
  const inP = progress(t, tap.at - .2, tap.at, easeOutCubic);
  const outP = progress(t, tap.at, tap.at + .45, easeOutCubic);
  tapRipple.style.display = 'block';
  tapRipple.style.left = `${frameRect.left + (rect.left + rect.width * .5) * APP_SCALE - 46}px`;
  tapRipple.style.top = `${frameRect.top + (rect.top + rect.height * .5) * APP_SCALE - 46}px`;
  tapRipple.style.opacity = String(t < tap.at ? inP : 1 - outP);
  tapRipple.style.transform = `scale(${(t < tap.at ? mix(.45, 1, inP) : mix(1, 1.75, outP)).toFixed(4)})`;
}

async function renderPhone(t) {
  const state = phoneTimeline(t);
  phone.style.opacity = String(state.opacity);
  phone.style.transform = `translate3d(0, ${state.translateY.toFixed(3)}px, 0)`;
  await applyAppState(t);
  // 390×844 なら #plant と #water が両方見えるので、動かさず先頭に固定する
  appFrame.contentWindow.scrollTo(0, 0);
  renderOverlay(t);
  renderRing(t);
  renderTap(t);
}

function renderCaption(t) {
  const item = captionAt(t);
  if (!item) {
    caption.style.display = 'none';
    return;
  }
  caption.style.display = 'flex';
  caption.classList.toggle('hook', item.kind === 'hook');
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
  const visible = t >= 26 && t < END_START;
  promiseScene.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  const starts = [26.15, 27.25, 28.35];
  [...promiseScene.children].forEach((line, index) => setEntrance(line, t, starts[index], .32, { y: 28, scaleFrom: .985 }));
  promiseScene.style.opacity = String(1 - progress(t, 29.55, END_START, easeInOutCubic));
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
  renderHero(t);
  renderTitle(t);
  await renderPhone(t);
  renderCaption(t);
  renderPromise(t);
  renderEnd(t);
}

window.__promoReady = Promise.all([
  document.fonts.ready,
  loadRecord('R1')
]).then(async () => {
  await seekInternal(0);
  await twoFrames();
});

window.__seek = async (tSeconds) => {
  await window.__promoReady;
  await seekInternal(tSeconds);
};
