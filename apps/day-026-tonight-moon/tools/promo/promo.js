import { illumination, lunarCycle } from '../../lib/astro.js';
import { drawMoon, prepareCanvas } from '../../lib/draw.js';
import {
  DEFAULT_FPS, DURATION_SECONDS, T_STAMP, captionAt, clamp, easeInOutCubic,
  easeOutCubic, mix, moonTimeline, phoneTimeline, progress
} from './timeline.mjs';

window.__promo = { durationSeconds: DURATION_SECONDS, fps: DEFAULT_FPS };

const $ = (id) => document.getElementById(id);
const moonCanvas = $('feature-moon');
const phone = $('phone');
const appFrame = $('app-frame');
const caption = $('caption');
const titleScene = $('title-scene');
const promiseScene = $('promise-scene');
const endScene = $('end-scene');
const focusRings = [...document.querySelectorAll('.focus-ring')];
const tapRipple = $('tap-ripple');
const PROMO_WIDTH = 1080;
const PROMO_HEIGHT = 1920;
const MOON_SOURCE_SIZE = 1206;
const MOON_SOURCE_CENTER_X = MOON_SOURCE_SIZE / 2;
const MOON_SOURCE_CENTER_Y = MOON_SOURCE_SIZE * .47;
const MOON_RADIUS = MOON_SOURCE_SIZE * .315;
const APP_SCALE = 1.6;
const APP_STORAGE_SLOT = 'day026.moon.v1';

let lastOffset = null;
let stampApplied = false;
let featureMoonSource = null;

function seededRandom(seed = 0x260902) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function makeStars() {
  const random = seededRandom();
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 154; index += 1) {
    const star = document.createElement('i');
    const size = .8 + random() * (index % 13 === 0 ? 4 : 2.3);
    star.className = 'star';
    star.style.left = `${(random() * 100).toFixed(3)}%`;
    star.style.top = `${(random() * 100).toFixed(3)}%`;
    star.style.setProperty('--size', `${size.toFixed(2)}px`);
    star.style.setProperty('--alpha', (.2 + random() * .66).toFixed(3));
    star.style.setProperty('--color', index % 9 === 0 ? '#ffe6aa' : '#f5f2e8');
    fragment.append(star);
  }
  $('stars').append(fragment);
}

function drawFeatureMoon() {
  const at = Date.UTC(2026, 8, 2, 12, 0);
  const lit = illumination(at);
  const cycle = lunarCycle(at);
  featureMoonSource = document.createElement('canvas');
  const sourceCtx = prepareCanvas(featureMoonSource, MOON_SOURCE_SIZE, MOON_SOURCE_SIZE, 1);
  drawMoon(sourceCtx, MOON_SOURCE_SIZE, { illum: lit.fraction, waxing: cycle.waxing, glow: true });

  // drawMoon の呼び出しは変えず、月本体だけを光芒用の全画面レイヤーへ渡す。
  sourceCtx.globalCompositeOperation = 'destination-in';
  sourceCtx.fillStyle = '#fff';
  sourceCtx.beginPath();
  sourceCtx.arc(MOON_SOURCE_CENTER_X, MOON_SOURCE_CENTER_Y, MOON_RADIUS, 0, Math.PI * 2);
  sourceCtx.fill();
  sourceCtx.globalCompositeOperation = 'source-over';

  prepareCanvas(moonCanvas, PROMO_WIDTH, PROMO_HEIGHT, 1);
}

function twoFrames(frameWindow = window) {
  return new Promise((resolve) => frameWindow.requestAnimationFrame(() => frameWindow.requestAnimationFrame(resolve)));
}

async function loadApp() {
  try { localStorage.removeItem(APP_STORAGE_SLOT); } catch { /* 保存不可でも映像は作れる */ }
  await new Promise((resolve, reject) => {
    appFrame.addEventListener('load', resolve, { once: true });
    appFrame.addEventListener('error', () => reject(new Error('アプリの iframe を読み込めませんでした')), { once: true });
    appFrame.src = appFrame.dataset.src;
  });
  const doc = appFrame.contentDocument;
  if (!doc?.getElementById('moon-canvas')) throw new Error('アプリの描画要素が見つかりません');
  await doc.fonts.ready;
  await twoFrames(appFrame.contentWindow);
}

function setEntrance(node, t, start, duration = .32, { y = 28, scaleFrom = .97 } = {}) {
  const p = progress(t, start, start + duration, easeOutCubic);
  node.style.opacity = t < start ? '0' : String(p);
  node.style.transform = `translate3d(0, ${mix(y, 0, p).toFixed(2)}px, 0) scale(${mix(scaleFrom, 1, p).toFixed(4)})`;
}

function renderMoon(t) {
  const state = moonTimeline(t);
  const ctx = moonCanvas.getContext('2d');
  const radius = MOON_RADIUS * state.scale;
  const centerX = PROMO_WIDTH / 2;
  const outerRadius = radius * 2.4;
  ctx.clearRect(0, 0, PROMO_WIDTH, PROMO_HEIGHT);

  const glow = ctx.createRadialGradient(centerX, state.centerY, radius, centerX, state.centerY, outerRadius);
  glow.addColorStop(0, 'rgba(255, 236, 190, .28)');
  glow.addColorStop(.357142857, 'rgba(255, 236, 190, .10)');
  glow.addColorStop(1, 'rgba(255, 236, 190, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, PROMO_WIDTH, PROMO_HEIGHT);

  const sourceX = centerX - MOON_SOURCE_CENTER_X * state.scale;
  const sourceY = state.centerY - MOON_SOURCE_CENTER_Y * state.scale;
  ctx.drawImage(
    featureMoonSource,
    sourceX,
    sourceY,
    MOON_SOURCE_SIZE * state.scale,
    MOON_SOURCE_SIZE * state.scale
  );
  moonCanvas.style.opacity = String(state.opacity);
}

function renderTitle(t) {
  const visible = t >= 2.6 && t < 5;
  titleScene.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  const fadeOut = 1 - progress(t, 4.65, 5, easeInOutCubic);
  setEntrance($('challenge-label'), t, 3.5, .3, { y: 16, scaleFrom: 1 });
  setEntrance($('main-title'), t, 3.3, .34, { y: 40, scaleFrom: .96 });
  setEntrance($('main-lead'), t, 3.8, .32, { y: 26, scaleFrom: .99 });
  titleScene.style.opacity = String(fadeOut);
}

function appDocument() {
  return appFrame.contentDocument;
}

function dispatchDateOffset(offset) {
  if (offset === lastOffset) return false;
  const range = appDocument().getElementById('date-range');
  range.value = String(offset);
  range.dispatchEvent(new Event('input', { bubbles: true }));
  lastOffset = offset;
  return true;
}

function absoluteTop(selector) {
  const win = appFrame.contentWindow;
  const rect = appDocument().querySelector(selector).getBoundingClientRect();
  return rect.top + win.scrollY;
}

function scrollTargets() {
  return {
    hero: 0,
    times: Math.max(0, absoluteTop('#times-title') - 54),
    harvest: Math.max(0, absoluteTop('#harvest-title') - 82),
    journal: Math.max(0, absoluteTop('#journal-title') - 64)
  };
}

function scrollAt(t, targets) {
  if (t < 10) return targets.hero;
  if (t < 10.7) return mix(targets.hero, targets.times, progress(t, 10, 10.7, easeInOutCubic));
  if (t < 15) return targets.times;
  if (t < 15.6) return mix(targets.times, targets.hero, progress(t, 15, 15.6, easeInOutCubic));
  if (t < 18.6) return targets.hero;
  if (t < 19.2) return mix(targets.hero, targets.harvest, progress(t, 18.6, 19.2, easeInOutCubic));
  if (t < 21) return targets.harvest;
  if (t < 21.6) return mix(targets.harvest, targets.journal, progress(t, 21, 21.6, easeInOutCubic));
  return targets.journal;
}

function ringOpacity(t, start, holdEnd, end) {
  if (t < start || t >= end) return 0;
  if (t < start + .3) return progress(t, start, start + .3, easeOutCubic);
  if (t > holdEnd) return 1 - progress(t, holdEnd, end, easeInOutCubic);
  return 1;
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
  if (t >= 6.2 && t < 8) {
    requests.push([doc.querySelector('#moon-readout'), ringOpacity(t, 6.2, 7.5, 8), 10]);
  } else if (t >= 11.2 && t < 12.45) {
    requests.push([doc.querySelector('#moonrise').closest('div'), ringOpacity(t, 11.2, 12.05, 12.45), 6]);
  } else if (t >= 12.6 && t < 14.35) {
    requests.push([doc.querySelector('#moonset').closest('div'), ringOpacity(t, 12.6, 13.9, 14.35), 6]);
  } else if (t >= 18.9 && t < 20.9) {
    const opacity = ringOpacity(t, 18.9, 20.45, 20.9);
    requests.push([doc.querySelector('#harvest-title'), opacity, 7]);
    requests.push([doc.querySelector('#full-difference'), opacity, 7]);
  }
  focusRings.forEach((ring, index) => {
    const request = requests[index];
    if (request) placeOverlay(ring, ...request);
    else ring.style.display = 'none';
  });
}

function ensureStamp(t) {
  if (t < T_STAMP || stampApplied) return;
  const button = appDocument().getElementById('seen-button');
  if (!button.disabled) button.click();
  stampApplied = true;
}

function renderTap(t) {
  if (t < T_STAMP - .2 || t >= T_STAMP + .45) {
    tapRipple.style.display = 'none';
    return;
  }
  const button = appDocument().getElementById('seen-button');
  const frameRect = appFrame.getBoundingClientRect();
  const rect = button.getBoundingClientRect();
  const inP = progress(t, T_STAMP - .2, T_STAMP, easeOutCubic);
  const outP = progress(t, T_STAMP, T_STAMP + .45, easeOutCubic);
  const scale = t < T_STAMP ? mix(.45, 1, inP) : mix(1, 1.75, outP);
  const opacity = t < T_STAMP ? inP : 1 - outP;
  tapRipple.style.display = 'block';
  tapRipple.style.left = `${frameRect.left + (rect.left + rect.width * .78) * APP_SCALE - 46}px`;
  tapRipple.style.top = `${frameRect.top + (rect.top + rect.height * .5) * APP_SCALE - 46}px`;
  tapRipple.style.opacity = String(opacity);
  tapRipple.style.transform = `scale(${scale.toFixed(4)})`;
}

async function renderPhone(t) {
  const state = phoneTimeline(t);
  phone.style.opacity = String(state.opacity);
  phone.style.transform = `translate3d(0, ${state.translateY.toFixed(3)}px, 0)`;
  const changed = dispatchDateOffset(state.dateOffset);
  if (changed) await twoFrames(appFrame.contentWindow);
  const targets = scrollTargets();
  appFrame.contentWindow.scrollTo(0, scrollAt(t, targets));
  ensureStamp(t);
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
  const visible = t >= 26 && t < 30;
  promiseScene.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  const starts = [26.15, 27.25, 28.35];
  [...promiseScene.children].forEach((line, index) => setEntrance(line, t, starts[index], .32, { y: 28, scaleFrom: .985 }));
  promiseScene.style.opacity = String(1 - progress(t, 29.72, 30, easeInOutCubic));
}

function renderEnd(t) {
  const visible = t >= 30;
  endScene.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  endScene.style.opacity = String(progress(t, 30, 30.32, easeOutCubic));
  endScene.style.transform = `translate3d(0, ${mix(34, 0, progress(t, 30, 30.32, easeOutCubic)).toFixed(2)}px, 0)`;
  $('fade-black').style.opacity = String(progress(t, 35, 36, easeInOutCubic));
}

async function seekInternal(value) {
  const t = clamp(Number(value) || 0, 0, DURATION_SECONDS);
  renderMoon(t);
  renderTitle(t);
  await renderPhone(t);
  renderCaption(t);
  renderPromise(t);
  renderEnd(t);
  if (t < 30) $('fade-black').style.opacity = '0';
}

makeStars();
drawFeatureMoon();

window.__promoReady = Promise.all([document.fonts.ready, loadApp()]).then(async () => {
  await seekInternal(0);
  await twoFrames();
});

window.__seek = async (tSeconds) => {
  await window.__promoReady;
  await seekInternal(tSeconds);
};
