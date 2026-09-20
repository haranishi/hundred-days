/* 1コマ＝時刻 t の純関数。__seek(t) を呼ぶと、その時刻の画がそのまま出る。

   アプリは reducedMotion で撮るので、アプリ自身のアニメーション（見出しの rise）は動かない。
   見せたい動きは全部この合成ページ側で描く。アプリ本体には手を入れず、
   iframe の DOM に毎コマ上書きするだけにしてある。 */

import {
  DEFAULT_FPS, DURATION_SECONDS, END_START, FINGER, ANSWER_START, PLACE_CODE, PLACE_LABEL,
  PROMISE_START, TAPS, TITLE_START, T_HOOK_TAP, LAST_START,
  appSceneAt, backdropDrift, stripRevealAt, captionAt, clamp, easeInOutCubic, easeOutCubic, mix,
  phoneTimeline, progress, scrollWindowAt
} from './timeline.mjs';

window.__promo = { durationSeconds: DURATION_SECONDS, fps: DEFAULT_FPS };

const APP_SCALE = 1.6;
const SCROLL_MARGIN = 22;
const FINGER_TIP = { x: .5, y: .04 };

const $ = (id) => document.getElementById(id);
const phone = $('phone');
const appFrame = $('app-frame');
const caption = $('caption');
const titleScene = $('title-scene');
const promiseScene = $('promise-scene');
const endScene = $('end-scene');
const finger = $('finger');
const tapRipple = $('tap-ripple');
const choiceRing = $('choice-ring');
const postRing = $('post-ring');
const ghosts = [...document.querySelectorAll('#backdrop .ghost')];

/* 各場面を独立に再現する。保存場所の復元とボタン操作はアプリに任せる。 */
const savedPlace = { code: PLACE_CODE, mode: 'picked' };
const PLANS = {
  hook: { save: savedPlace, steps: ['check'] },
  answer: { save: savedPlace, steps: [] },
  bar: { save: savedPlace, steps: [] },
  'pick-start': { save: null, steps: [] },
  'pick-dialog': { save: null, steps: ['pick'] },
  'pick-pref': { save: null, steps: ['pick', 'pref'] },
  'pick-town': { save: null, steps: ['pick', 'pref', 'town'] },
  'pick-done': { save: null, steps: ['pick', 'pref', 'town', 'confirm'] },
  last: { save: savedPlace, steps: [] },
  recent: { save: savedPlace, steps: ['recent'] }
};

const FINGER_GROUPS = (() => {
  const groups = [];
  let current = [];
  for (const sceneName of FINGER) {
    current.push(sceneName);
    if (sceneName.fade) { groups.push(current); current = []; }
  }
  if (current.length > 1) groups.push(current);
  return groups;
})();

const state = { scene: null, started: false, targets: new Map() };

const appDocument = () => appFrame.contentDocument;
const appWindow = () => appFrame.contentWindow;
const twoFrames = (frameWindow = window) => new Promise((resolve) => (
  frameWindow.requestAnimationFrame(() => frameWindow.requestAnimationFrame(resolve))
));

async function waitUntil(check, timeoutMs, message) {
  const started = performance.now();
  while (!check()) {
    if (performance.now() - started > timeoutMs) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

const appState = () => appDocument()?.getElementById('app')?.dataset.state ?? '';
const waitForState = (name) => waitUntil(() => appState() === name, 20_000, `アプリが ${name} になりませんでした`);

// ---------------------------------------------------------------- 場面の組み立て

const STORAGE_NAME = 'day-033-did-it-shake';

async function runStep(step) {
  const doc = appDocument();
  if (step === 'pick') {
    doc.getElementById('pick-place').click();
    await waitUntil(() => doc.getElementById('place-dialog').open, 20_000, '場所選びが開きませんでした');
    return;
  }
  if (step === 'pref' || step === 'town') {
    const select = doc.getElementById(step === 'pref' ? 'pref-select' : 'town-select');
    const value = step === 'pref' ? '茨城県' : PLACE_CODE;
    await waitUntil(() => [...select.options].some((option) => option.value === value), 20_000, '選択肢がありません');
    select.focus({ preventScroll: true });
    select.value = value;
    select.dispatchEvent(new (appWindow().Event)('change', { bubbles: true }));
    return;
  }
  if (step === 'confirm') {
    // 閉じた直後にも指を同じ位置に残せるよう、iframe 内の矩形を保存する。
    const rect = doc.getElementById('place-confirm').getBoundingClientRect();
    state.targets.set('confirm', { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    doc.getElementById('place-confirm').click();
    await waitForPlace();
    return;
  }
  if (step === 'check') { doc.getElementById('check').click(); await waitForState('ready'); return; }
  if (step === 'recent') { doc.querySelector('#recent > summary').click(); return; }
  throw new Error(`知らない手順です: ${step}`);
}

const waitForPlace = () => waitUntil(() => {
  const doc = appDocument();
  return doc.getElementById('app').dataset.place === 'picked'
    && doc.getElementById('place-name').textContent === PLACE_LABEL
    && doc.getElementById('answer').dataset.kind === 'shook'
    && doc.getElementById('your-intensity').textContent === 'あなたの街は震度4';
}, 20_000, '水戸市の答えが出ませんでした');

async function navigate(sceneName) {
  const plan = PLANS[sceneName];
  state.targets.clear();
  /* 同じ URL のままだと load が来ないので、場面名を入れて必ず開き直す。
     アプリは起動時に localStorage を読むので、開く前に書いておく。 */
  try {
    if (plan.save) localStorage.setItem(STORAGE_NAME, JSON.stringify(plan.save));
    else localStorage.removeItem(STORAGE_NAME);
  } catch { throw new Error('撮影に必要な場所を保存できませんでした'); }

  const path = `/index.html?scene=${sceneName}`;
  const loaded = new Promise((resolve, reject) => {
    appFrame.addEventListener('load', resolve, { once: true });
    appFrame.addEventListener('error', () => reject(new Error('アプリを読み込めませんでした')), { once: true });
  });
  if (!state.started) appFrame.src = path;
  else appWindow().location.replace(path);
  state.started = true;
  await loaded;

  const doc = appDocument();
  await waitUntil(() => doc.getElementById('app'), 20_000, 'アプリが起動しませんでした');
  await waitForState('ready');
  if (plan.save) await waitForPlace();
  await doc.fonts.ready;
  await twoFrames(appWindow());
  for (const step of plan.steps) await runStep(step);

  state.scene = sceneName;
  await doc.fonts.ready;
  await twoFrames(appWindow());
}

// ---------------------------------------------------------------- アプリへの上書き

function scrollFor(t) {
  const view = scrollWindowAt(t);
  if (!view) return 0;
  const doc = appDocument();
  const win = appWindow();
  const topOf = (node) => node.getBoundingClientRect().top + win.scrollY;
  const bottomOf = (node) => node.getBoundingClientRect().bottom + win.scrollY;
  const headline = doc.getElementById('headline');
  // 答えは画面中央。上方向へはスクロールできないため0で止める。
  const answer = Math.max(0, topOf(headline) - (win.innerHeight - headline.offsetHeight) / 2);
  let target = answer;
  if (view.target === 'bar') {
    const count = doc.getElementById('today-label');
    const legend = doc.getElementById('legend');
    target = (topOf(count) + bottomOf(legend) - win.innerHeight) / 2;
  } else if (view.target === 'place') {
    target = topOf(doc.querySelector('.place-row')) - 180;
  } else if (view.target === 'last') {
    // 表を開いても上端を保ち、最後の揺れと表を同時に見せる。
    target = topOf(doc.getElementById('your-town')) - SCROLL_MARGIN;
  }
  const max = Math.max(0, doc.documentElement.scrollHeight - win.innerHeight);
  return mix(answer, clamp(target, 0, max), view.amount);
}

function overrideApp(t) {
  const doc = appDocument();
  // 折りたたみ中も同じ位置までスクロールでき、表を開いて上端が跳ねない。
  doc.body.style.paddingBottom = t >= LAST_START ? `${appWindow().innerHeight}px` : '';
  for (const id of ['answer', 'your-intensity']) {
    const node = doc.getElementById(id);
    node.style.animation = 'none';
    // バッジも0秒で出現途中。レイアウトは変えず、下から浮かせる。
    const start = t < TITLE_START ? T_HOOK_TAP - (id === 'answer' ? .04 : .01) : ANSWER_START;
    setEntrance(node, t, start, .6, { y: 16, scaleFrom: 1 });
  }
  const cells = [...doc.querySelectorAll('#strip .strip-cell')];
  cells.forEach((cell, index) => {
    const p = stripRevealAt(t, index, cells.length);
    cell.style.opacity = String(p);
    cell.style.transform = `translateY(${mix(8, 0, p).toFixed(2)}px)`;
  });
  appWindow().scrollTo(0, scrollFor(t));
}

// ---------------------------------------------------------------- 合成ページの描画

function frameRect() {
  return appFrame.getBoundingClientRect();
}

function boxIn(node) {
  if (!node?.getClientRects().length) return null;
  const rect = node.getBoundingClientRect();
  const frame = frameRect();
  return {
    left: frame.left + rect.left * APP_SCALE,
    top: frame.top + rect.top * APP_SCALE,
    width: rect.width * APP_SCALE,
    height: rect.height * APP_SCALE
  };
}

const centerOf = (box) => (box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null);

function targetBox(name) {
  const selectors = { check: '#check', pick: '#pick-place', confirm: '#place-confirm',
    recent: '#recent > summary', pref: '#pref-select', town: '#town-select' };
  const node = selectors[name] ? appDocument().querySelector(selectors[name]) : null;
  const live = boxIn(node);
  if (live) return live;
  const rect = state.targets.get(name);
  if (!rect) return null;
  const frame = frameRect();
  return { left: frame.left + rect.left * APP_SCALE, top: frame.top + rect.top * APP_SCALE,
    width: rect.width * APP_SCALE, height: rect.height * APP_SCALE };
}

function targetPoint(name) {
  if (name === 'idle') {
    /* 指の待機位置。画面の下端より外へ出すと字幕の札に隠れて「指が出てこない」ので、
       端末の中の下寄りに置く。横は「これから押すボタンの真下」にして、1コマ目で
       どこへ向かっているのかが分かるようにしている */
    const frame = frameRect();
    const next = targetBox('check');
    return {
      x: next ? next.left + next.width * .5 : frame.left + frame.width * .62,
      y: frame.bottom - 120
    };
  }
  return centerOf(targetBox(name));
}

function setEntrance(node, t, start, duration = .34, { y = 28, scaleFrom = .97 } = {}) {
  const p = progress(t, start, start + duration, easeOutCubic);
  node.style.opacity = t < start ? '0' : String(p);
  node.style.transform = `${node.classList.contains('app-mark') ? 'translateX(-50%) ' : ''}translate3d(0, ${mix(y, 0, p).toFixed(2)}px, 0) scale(${mix(scaleFrom, 1, p).toFixed(4)})`;
}

function renderBackdrop(t) {
  ghosts.forEach((ghost, index) => {
    const drift = backdropDrift(t, index);
    ghost.style.transform = `translate3d(${drift.x.toFixed(2)}px, ${drift.y.toFixed(2)}px, 0)`;
  });
}

function renderPhone(t) {
  const move = phoneTimeline(t);
  phone.style.opacity = String(move.opacity);
  phone.style.transform = `translate3d(${move.x.toFixed(2)}px, ${move.y.toFixed(2)}px, 0)`;
}

function renderTitle(t) {
  const visible = t >= TITLE_START && t < ANSWER_START;
  titleScene.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  setEntrance(titleScene.querySelector('.app-mark'), t, TITLE_START + .1, .42, { y: 44, scaleFrom: .86 });
  setEntrance($('main-title'), t, TITLE_START + .42, .38, { y: 36 });
  setEntrance($('main-lead'), t, TITLE_START + .78, .34);
  setEntrance($('challenge-label'), t, TITLE_START + 1.05, .3, { y: 16, scaleFrom: 1 });
  titleScene.style.opacity = String(1 - progress(t, ANSWER_START - .34, ANSWER_START, easeInOutCubic));
}

function renderCaption(t) {
  const item = captionAt(t);
  if (!item) { caption.style.display = 'none'; return; }
  caption.style.display = 'block';
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

function fingerAt(t) {
  const group = FINGER_GROUPS.find((points) => t >= points[0].at && t < points.at(-1).at);
  if (!group) return null;
  const index = group.findIndex((sceneName, i) => i < group.length - 1 && t >= sceneName.at && t < group[i + 1].at);
  if (index < 0) return null;
  const from = targetPoint(group[index].target);
  const to = targetPoint(group[index + 1].target);
  if (!from || !to) return null;
  const p = progress(t, group[index].at, group[index + 1].at, easeInOutCubic);
  const opacity = Math.min(
    progress(t, group[0].at, group[0].at + .25, easeOutCubic),
    1 - progress(t, group.at(-1).at - .3, group.at(-1).at, easeInOutCubic)
  );
  return {
    x: mix(from.x, to.x, p),
    // 直線だと機械的なので、行きも帰りも少しだけ弧を描かせる
    y: mix(from.y, to.y, p) - (group[index].target === group[index + 1].target ? 0 : 38 * Math.sin(Math.PI * p)),
    opacity
  };
}

function renderFinger(t) {
  const at = fingerAt(t);
  if (!at || at.opacity <= 0) { finger.style.display = 'none'; return; }
  const tap = TAPS.find(({ at: time }) => Math.abs(t - time) < .16);
  const press = tap ? mix(.9, 1, Math.abs(t - tap.at) / .16) : 1;
  finger.style.display = 'block';
  finger.style.left = `${(at.x - finger.offsetWidth * FINGER_TIP.x).toFixed(2)}px`;
  finger.style.top = `${(at.y - finger.offsetHeight * FINGER_TIP.y).toFixed(2)}px`;
  finger.style.opacity = String(at.opacity);
  finger.style.transformOrigin = `${FINGER_TIP.x * 100}% ${FINGER_TIP.y * 100}%`;
  finger.style.transform = `rotate(-15deg) scale(${press.toFixed(4)})`;
}

function renderRipple(t) {
  const tap = TAPS.find(({ at }) => t >= at - .18 && t < at + .5);
  const sceneName = tap ? FINGER.find(({ at }) => Math.abs(at - tap.at) < .001)?.target : null;
  const point = sceneName ? targetPoint(sceneName) : null;
  if (!point) { tapRipple.style.display = 'none'; return; }
  const before = progress(t, tap.at - .18, tap.at, easeOutCubic);
  const after = progress(t, tap.at, tap.at + .5, easeOutCubic);
  tapRipple.style.display = 'block';
  tapRipple.classList.toggle('hint', tap.kind === 'hint');
  tapRipple.style.left = `${point.x.toFixed(2)}px`;
  tapRipple.style.top = `${point.y.toFixed(2)}px`;
  tapRipple.style.opacity = String(t < tap.at ? before : 1 - after);
  tapRipple.style.transform = `scale(${(t < tap.at ? mix(.4, 1, before) : mix(1, 2.1, after)).toFixed(4)})`;
}

/** 押したボタンを1周だけ囲う（アプリの選択色は静止画で出るので、動きだけ足す） */
const RING_TARGETS = Object.freeze(Object.fromEntries(TAPS.map(({ target, at }) => [target, [at]])));
function renderChoiceRing(t) {
  const hit = Object.entries(RING_TARGETS)
    .flatMap(([name, times]) => times.map((at) => ({ name, at })))
    .find(({ at }) => t >= at && t < at + .8);
  const box = hit ? targetBox(hit.name) : null;
  if (!box) { choiceRing.style.display = 'none'; return; }
  const p = progress(t, hit.at, hit.at + .8, easeOutCubic);
  choiceRing.style.display = 'block';
  choiceRing.style.left = `${(box.left - 8).toFixed(2)}px`;
  choiceRing.style.top = `${(box.top - 8).toFixed(2)}px`;
  choiceRing.style.width = `${(box.width + 16).toFixed(2)}px`;
  choiceRing.style.height = `${(box.height + 16).toFixed(2)}px`;
  choiceRing.style.opacity = String((1 - p) * .95);
  choiceRing.style.transform = `scale(${mix(1, 1.06, p).toFixed(4)})`;
}

/** この Day には「結果画面」が無いので、投稿ボタンの光は出さない */
function renderPostRing() {
  postRing.style.display = 'none';
}

function renderPromise(t) {
  const visible = t >= PROMISE_START && t < END_START;
  promiseScene.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  [...promiseScene.children].forEach((line, index) => (
    setEntrance(line, t, PROMISE_START + .2 + index * .65, .4, { y: 32, scaleFrom: .985 })
  ));
  promiseScene.style.opacity = String(1 - progress(t, END_START - .3, END_START, easeInOutCubic));
}

function renderEnd(t) {
  const visible = t >= END_START;
  endScene.style.display = visible ? 'block' : 'none';
  $('fade-out').style.opacity = visible ? String(progress(t, DURATION_SECONDS - 1, DURATION_SECONDS, easeInOutCubic)) : '0';
  if (!visible) return;
  const p = progress(t, END_START, END_START + .45, easeOutCubic);
  endScene.style.opacity = String(p);
  endScene.style.transform = `translate3d(0, ${mix(36, 0, p).toFixed(2)}px, 0)`;
}

async function seekInternal(value) {
  const t = clamp(Number(value) || 0, 0, DURATION_SECONDS);
  const scene = appSceneAt(t);
  if (scene !== state.scene) await navigate(scene);
  overrideApp(t);
  renderBackdrop(t);
  renderPhone(t);
  renderTitle(t);
  renderCaption(t);
  renderChoiceRing(t);
  renderPostRing(t);
  renderRipple(t);
  renderFinger(t);
  renderPromise(t);
  renderEnd(t);
}

window.__promoReady = (async () => {
  await document.fonts.ready;
  await navigate(appSceneAt(0));
  await seekInternal(0);
  await twoFrames();
})();

window.__seek = async (seconds) => {
  await window.__promoReady;
  await seekInternal(seconds);
};
