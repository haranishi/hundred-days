import {
  CAMERA_COUNT, DEFAULT_FPS, DURATION_SECONDS, END_START, SECOND_CAMERA, TALLINN_CAMERA,
  TAPS, T_RANDOM_TAP, T_SEARCH_TAP, appSceneAt, captionAt, clamp, countAt,
  easeInOutCubic, easeOutCubic, mix, panelScrollAt, phoneTimeline, progress, searchTextAt,
} from './timeline.mjs';

window.__promo = { durationSeconds: DURATION_SECONDS, fps: DEFAULT_FPS };

const $ = (id) => document.getElementById(id);
const phone = $('phone');
const appFrame = $('app-frame');
const caption = $('caption');
const titleScene = $('title-scene');
const promiseScene = $('promise-scene');
const endScene = $('end-scene');
const mapAura = $('map-aura');
const countScene = $('count-scene');
const cameraTotal = $('camera-total');
const tapRipple = $('tap-ripple');
const APP_SCALE = 1.6;

let appliedScene = null;
let appStarted = false;

const twoFrames = (frameWindow = window) => new Promise((resolve) => (
  frameWindow.requestAnimationFrame(() => frameWindow.requestAnimationFrame(resolve))
));
const appDocument = () => appFrame.contentDocument;

async function waitUntil(check, timeoutMs, message) {
  const started = performance.now();
  while (!check()) {
    if (performance.now() - started > timeoutMs) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function waitForIdle(map, timeoutMs = 30_000) {
  await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error('地図の idle を待てませんでした')), timeoutMs);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    // 場面切替後のタイル・source 描画を待つ。静止中でも idle が出るよう再描画を一度要求する。
    map.once('idle', () => finish());
    map.triggerRepaint();
  });
}

async function waitForScene({ cameraId = null } = {}) {
  const doc = appDocument();
  const win = appFrame.contentWindow;
  await waitUntil(() => doc.querySelector('#map') && win.__cameraMap, 30_000, 'MapLibre の地図を読み込めませんでした');

  // アプリが層を入れ終えたときに #map[data-ready] を付ける（lib/map.js）。付かないなら撮っても意味がないので待つ。
  await waitUntil(() => doc.querySelector('#map[data-ready="true"]'), 30_000, '地図の ready 属性が付きませんでした');
  if (!cameraId) {
    // 世界図は必ず同じ画にする（保存された位置に左右されない）
    win.__cameraMap.jumpTo({ center: [15, 25], zoom: 1.4 });
    await waitUntil(() => win.__cameraMap.queryRenderedFeatures({ layers: ['camera-clusters'] }).length > 0,
      30_000, '世界図のクラスタ円を描画できませんでした');
    await waitForIdle(win.__cameraMap);
    return;
  }
  await waitUntil(() => locationForFrame().hash === `#cam=${cameraId}` && doc.querySelector('.viewer img'),
    30_000, `カメラ ${cameraId} を開けませんでした`);
  await waitForIdle(win.__cameraMap);
  await waitUntil(() => {
    const image = doc.querySelector('.viewer img');
    return image?.complete && image.naturalWidth > 0;
  }, 30_000, `カメラ ${cameraId} の画像を読み込めませんでした`);
}

function locationForFrame() {
  return appFrame.contentWindow.location;
}

async function navigate(scene) {
  const cameraId = scene === 'tallinn' ? TALLINN_CAMERA : scene === 'madrid' ? SECOND_CAMERA : null;
  const loaded = new Promise((resolve, reject) => {
    appFrame.addEventListener('load', resolve, { once: true });
    appFrame.addEventListener('error', () => reject(new Error('アプリの iframe を読み込めませんでした')), { once: true });
  });
  /* hash だけ変えても同じ文書のままで load が来ず、アプリも起動時にしか #cam= を読まない。
     場面名をクエリに入れて毎回本当に読み直させる（同梱JSONはローカル配信なので数秒で戻る）。 */
  const path = cameraId ? `/index.html?scene=${scene}#cam=${cameraId}` : `/index.html?scene=${scene}`;
  /* アプリは前回の地図位置を localStorage に覚えて次回そこから始める。前の場面で寄ったまま世界図の場面へ戻ると
     クラスタ円が画面に無く、準備待ちが失敗する。同一オリジンなので合成ページ側から消してから読み直す。 */
  if (!cameraId) { try { localStorage.removeItem('day030.view.v1'); } catch { /* 保存できない環境では何も残っていない */ } }
  if (!appStarted) appFrame.src = path;
  else appFrame.contentWindow.location.replace(path);
  appStarted = true;
  await loaded;
  await waitForScene({ cameraId });
  appliedScene = scene;
  await appDocument().fonts.ready;
  await twoFrames(appFrame.contentWindow);
}

async function applyAppScene(t) {
  const desired = appSceneAt(t);
  if (desired !== appliedScene) await navigate(desired);

  const doc = appDocument();
  const search = doc.querySelector('#camera-search');
  const text = desired === 'search' ? searchTextAt(t) : '';
  if (search && search.value !== text) {
    search.value = text;
    // iframe と同じ realm の Event を使い、ブラウザごとの型検査に引っ掛からないようにする。
    search.dispatchEvent(new appFrame.contentWindow.InputEvent('input', {
      bubbles: true, inputType: 'insertText', data: text.at(-1) || null,
    }));
  }

  const panel = doc.querySelector('.panel-content');
  if (panel) panel.scrollTop = panelScrollAt(t, panel.scrollHeight - panel.clientHeight);
}

function setEntrance(node, t, start, duration = .34, { y = 28, scaleFrom = .97 } = {}) {
  const p = progress(t, start, start + duration, easeOutCubic);
  node.style.opacity = t < start ? '0' : String(p);
  node.style.transform = `translate3d(0, ${mix(y, 0, p).toFixed(2)}px, 0) scale(${mix(scaleFrom, 1, p).toFixed(4)})`;
}

function renderPhone(t) {
  const state = phoneTimeline(t);
  phone.style.opacity = String(state.opacity);
  phone.style.transform = `translate3d(0, ${state.translateY.toFixed(2)}px, 0)`;
  const hook = t < 2.6;
  mapAura.style.display = hook ? 'block' : 'none';
  mapAura.style.opacity = String(hook ? .55 + .45 * Math.sin(Math.PI * progress(t, 0, 2.6)) : 0);
  countScene.style.display = hook ? 'block' : 'none';
  cameraTotal.textContent = countAt(t).toLocaleString('ja-JP');
  cameraTotal.dataset.complete = String(countAt(t) === CAMERA_COUNT);
}

function renderTitle(t) {
  const visible = t >= 2.6 && t < 5.2;
  titleScene.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  setEntrance(titleScene.querySelector('.globe-mark'), t, 2.7, .42, { y: 45, scaleFrom: .86 });
  setEntrance($('main-title'), t, 3.15, .38, { y: 38, scaleFrom: .96 });
  setEntrance($('main-lead'), t, 3.55, .34);
  setEntrance($('challenge-label'), t, 3.88, .3, { y: 16, scaleFrom: 1 });
  titleScene.style.opacity = String(1 - progress(t, 4.82, 5.2, easeInOutCubic));
}

function renderCaption(t) {
  const item = captionAt(t);
  if (!item) { caption.style.display = 'none'; return; }
  caption.style.display = 'flex';
  caption.classList.toggle('hook', item.kind === 'hook');
  caption.replaceChildren(...item.lines.flatMap((line, index) => {
    const nodes = [document.createTextNode(line)];
    if (index < item.lines.length - 1) nodes.push(document.createElement('br'));
    return nodes;
  }));
  const p = progress(t, item.start, item.start + .3, easeOutCubic);
  caption.style.opacity = String(p);
  caption.style.transform = `translate3d(0, ${mix(22, 0, p).toFixed(2)}px, 0) scale(${mix(.96, 1, p).toFixed(4)})`;
}

function tapTarget(tap) {
  const doc = appDocument();
  if (tap.target === 'random-button') return doc.querySelector('#random-button');
  return doc.querySelector(`#search-results [role="option"][data-camera-id="${TALLINN_CAMERA}"]`)
    || doc.querySelector('#search-results [role="option"]');
}

function renderTap(t) {
  const tap = TAPS.find(({ at }) => t >= at - .2 && t < at + .48);
  const target = tap ? tapTarget(tap) : null;
  if (!target) { tapRipple.style.display = 'none'; return; }
  const rect = target.getBoundingClientRect();
  const frameRect = appFrame.getBoundingClientRect();
  const inP = progress(t, tap.at - .2, tap.at, easeOutCubic);
  const outP = progress(t, tap.at, tap.at + .48, easeOutCubic);
  tapRipple.style.display = 'block';
  tapRipple.style.left = `${frameRect.left + (rect.left + rect.width * .5) * APP_SCALE - 48}px`;
  tapRipple.style.top = `${frameRect.top + (rect.top + rect.height * .5) * APP_SCALE - 48}px`;
  tapRipple.style.opacity = String(t < tap.at ? inP : 1 - outP);
  tapRipple.style.transform = `scale(${(t < tap.at ? mix(.45, 1, inP) : mix(1, 1.8, outP)).toFixed(4)})`;
}

function renderPromise(t) {
  const visible = t >= 24 && t < END_START;
  promiseScene.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  [...promiseScene.children].forEach((line, index) => setEntrance(line, t, 24.3 + index * 1.35, .4, { y: 34, scaleFrom: .985 }));
  promiseScene.style.opacity = String(1 - progress(t, 29.55, END_START, easeInOutCubic));
}

function renderEnd(t) {
  const visible = t >= END_START;
  endScene.style.display = visible ? 'block' : 'none';
  $('fade-black').style.opacity = visible ? String(progress(t, 35, 36, easeInOutCubic)) : '0';
  if (!visible) return;
  const p = progress(t, END_START, END_START + .45, easeOutCubic);
  endScene.style.opacity = String(p);
  endScene.style.transform = `translate3d(0, ${mix(38, 0, p).toFixed(2)}px, 0)`;
}

async function seekInternal(value) {
  const t = clamp(Number(value) || 0, 0, DURATION_SECONDS);
  await applyAppScene(t);
  renderPhone(t);
  renderTitle(t);
  renderCaption(t);
  renderTap(t);
  renderPromise(t);
  renderEnd(t);
}

window.__promoReady = Promise.all([document.fonts.ready, navigate('world')]).then(async () => {
  await seekInternal(0);
  await twoFrames();
});

window.__seek = async (tSeconds) => {
  await window.__promoReady;
  await seekInternal(tSeconds);
};
