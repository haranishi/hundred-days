import {
  DEFAULT_FPS, DURATION_SECONDS, END_START, T_PASTE, T_SAVE, appStateAt, captionAt,
  clamp, easeInOutCubic, easeOutCubic, heroTimeline, keycapTimeline, mix, phoneTimeline,
  progress, ringOpacity, scrollAt
} from './timeline.mjs';

window.__promo = { durationSeconds: DURATION_SECONDS, fps: DEFAULT_FPS };

const $ = (id) => document.getElementById(id);
const hero = $('hero');
const heroCard = $('hero-card');
const heroBg = $('hero-bg');
const heroImage = $('hero-image');
const phone = $('phone');
const appFrame = $('app-frame');
const keycap = $('keycap');
const caption = $('caption');
const titleScene = $('title-scene');
const promiseScene = $('promise-scene');
const endScene = $('end-scene');
const focusRings = [...document.querySelectorAll('.focus-ring')];
const tapRipple = $('tap-ripple');

const APP_SCALE = 1.6;
const APP_STORAGE_SLOT = 'day027.frame.v1';
const HERO_PAD = 72;
const HERO_RAW_WIDTH = 864; // 素のスクショ（10%セーフいっぱい）→ 額縁が付くと 800 に締まる
const HERO_CARD_WIDTH = 800;
const PREVIEW_MARGIN = 19;
const LANDING_SECONDS = .6;

let applied = null;

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

async function loadApp() {
  try { localStorage.removeItem(APP_STORAGE_SLOT); } catch { /* 保存不可でも映像は作れる */ }
  await new Promise((resolve, reject) => {
    appFrame.addEventListener('load', resolve, { once: true });
    appFrame.addEventListener('error', () => reject(new Error('アプリの iframe を読み込めませんでした')), { once: true });
    appFrame.src = appFrame.dataset.src;
  });
  const doc = appDocument();
  if (!doc?.getElementById('sample')) throw new Error('アプリの操作要素が見つかりません');
  await doc.fonts.ready;
  await twoFrames(appFrame.contentWindow);
  applied = { loaded: false, bg: 'grape', aspect: 'auto', frame: false, saved: false };
}

/* 時刻 t の望ましい状態を計算し、前回適用した状態との差分だけ click する。
   これで --from の途中開始でも、前から通しても同じ画になる。 */
async function applyAppState(t) {
  const doc = appDocument();
  const win = appFrame.contentWindow;
  const desired = appStateAt(t);

  // 読み込みと保存は元へ戻せないので、巻き戻すときだけアプリごと初期状態に返す。
  if ((applied.loaded && !desired.loaded) || (applied.saved && !desired.saved)) {
    doc.getElementById('again').click();
    applied = { ...applied, loaded: false, saved: false };
    await twoFrames(win);
  }
  if (desired.bg !== applied.bg) {
    doc.querySelector(`[data-bg="${desired.bg}"]`).click();
    applied.bg = desired.bg;
    await twoFrames(win);
  }
  if (desired.aspect !== applied.aspect) {
    doc.querySelector(`[data-aspect="${desired.aspect}"]`).click();
    applied.aspect = desired.aspect;
    await twoFrames(win);
  }
  if (desired.frame !== applied.frame) {
    doc.getElementById('frame').click();
    applied.frame = desired.frame;
    await twoFrames(win);
  }
  if (desired.loaded && !applied.loaded) {
    doc.getElementById('sample').click();
    if (!await waitUntil(() => doc.getElementById('app').dataset.state === 'ready', 5000)) {
      throw new Error('サンプル画像を読み込めませんでした');
    }
    doc.activeElement?.blur(); // ready でプレビューに focus() するので、枠が映らないよう外す
    applied.loaded = true;
    await twoFrames(win);
  }
  if (desired.saved && !applied.saved) {
    doc.getElementById('download').click();
    await waitUntil(() => doc.getElementById('message').textContent === '保存しました', 3000);
    applied.saved = true;
    await twoFrames(win);
  }
}

/* reduced motion で撮るのでアプリ側の着地アニメは動かない。同じ動きを合成側で描く。 */
function applyLanding(t) {
  const preview = appDocument().getElementById('preview');
  if (!applied.loaded || t < T_PASTE || t >= T_PASTE + LANDING_SECONDS) {
    if (preview.style.cssText) preview.style.cssText = '';
    return;
  }
  const p = progress(t, T_PASTE, T_PASTE + LANDING_SECONDS, easeOutCubic);
  preview.style.opacity = String(p);
  preview.style.transform = `scale(${mix(.96, 1, p).toFixed(4)})`;
  preview.style.filter = `drop-shadow(0 12px 12px rgba(0, 0, 0, ${(.16 * p).toFixed(3)}))`;
}

function previewTop() {
  const rect = appDocument().getElementById('preview').getBoundingClientRect();
  return Math.max(0, Math.round(rect.top + appFrame.contentWindow.scrollY - PREVIEW_MARGIN));
}

function setEntrance(node, t, start, duration = .32, { y = 28, scaleFrom = .97 } = {}) {
  const p = progress(t, start, start + duration, easeOutCubic);
  node.style.opacity = t < start ? '0' : String(p);
  node.style.transform = `translate3d(0, ${mix(y, 0, p).toFixed(2)}px, 0) scale(${mix(scaleFrom, 1, p).toFixed(4)})`;
}

function renderHero(t) {
  const state = heroTimeline(t);
  const grown = state.frame;
  hero.style.opacity = String(state.opacity);
  hero.style.top = `${state.centerY.toFixed(2)}px`;
  hero.style.transform = `translate(-50%, -50%) scale(${state.scale.toFixed(4)})`;
  heroCard.style.width = `${mix(HERO_RAW_WIDTH, HERO_CARD_WIDTH, grown).toFixed(2)}px`;
  heroCard.style.padding = `${mix(0, HERO_PAD, grown).toFixed(2)}px`;
  heroCard.style.boxShadow = `0 ${mix(0, 22, grown).toFixed(1)}px ${mix(0, 54, grown).toFixed(1)}px rgba(31, 35, 40, ${(.18 * grown).toFixed(3)})`;
  heroBg.style.opacity = String(grown);
  heroImage.style.borderRadius = `${mix(0, 28, grown).toFixed(2)}px`;
  heroImage.style.boxShadow = `0 ${mix(0, 34, grown).toFixed(1)}px ${mix(0, 78, grown).toFixed(1)}px rgba(0, 0, 0, ${(.34 * grown).toFixed(3)})`;
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

function renderKeycap(t) {
  const state = keycapTimeline(t);
  keycap.style.opacity = String(state.opacity);
  keycap.style.transform = `translate(-50%, -50%) scale(${state.scale.toFixed(4)})`;
}

function placeOverlay(node, target, opacity, padding = 8) {
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

function renderHighlights(t) {
  const doc = appDocument();
  const requests = [];
  if (t >= 8.2 && t < 9.7) {
    requests.push([doc.getElementById('preview'), ringOpacity(t, 8.2, 9.3, 9.7), 12]);
  } else if (t >= 10.9 && t < 14.9) {
    requests.push([doc.getElementById('backgrounds'), ringOpacity(t, 10.9, 14.4, 14.9), 14]);
  }
  focusRings.forEach((ring, index) => {
    const request = requests[index];
    if (request) placeOverlay(ring, ...request);
    else ring.style.display = 'none';
  });
}

function renderTap(t) {
  if (t < T_SAVE - .2 || t >= T_SAVE + .45) {
    tapRipple.style.display = 'none';
    return;
  }
  const rect = appDocument().getElementById('download').getBoundingClientRect();
  const frameRect = appFrame.getBoundingClientRect();
  const inP = progress(t, T_SAVE - .2, T_SAVE, easeOutCubic);
  const outP = progress(t, T_SAVE, T_SAVE + .45, easeOutCubic);
  tapRipple.style.display = 'block';
  tapRipple.style.left = `${frameRect.left + (rect.left + rect.width * .78) * APP_SCALE - 46}px`;
  tapRipple.style.top = `${frameRect.top + (rect.top + rect.height * .5) * APP_SCALE - 46}px`;
  tapRipple.style.opacity = String(t < T_SAVE ? inP : 1 - outP);
  tapRipple.style.transform = `scale(${(t < T_SAVE ? mix(.45, 1, inP) : mix(1, 1.75, outP)).toFixed(4)})`;
}

async function renderPhone(t) {
  const state = phoneTimeline(t);
  phone.style.opacity = String(state.opacity);
  phone.style.transform = `translate3d(0, ${state.translateY.toFixed(3)}px, 0)`;
  await applyAppState(t);
  applyLanding(t);
  appFrame.contentWindow.scrollTo(0, scrollAt(t, previewTop()));
  renderHighlights(t);
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
  renderKeycap(t);
  renderCaption(t);
  renderPromise(t);
  renderEnd(t);
}

window.__promoReady = Promise.all([
  document.fonts.ready,
  heroImage.decode().catch(() => { throw new Error('サンプル画像を読み込めませんでした'); }),
  loadApp()
]).then(async () => {
  await seekInternal(0);
  await twoFrames();
});

window.__seek = async (tSeconds) => {
  await window.__promoReady;
  await seekInternal(tSeconds);
};
