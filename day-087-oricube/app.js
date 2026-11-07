// 画面とイベント。作品は engine-adapter から、再生は timeline、描画は viewer に任せる。
import { loadModels } from './lib/engine-adapter.js';
import { createTimeline, SPEEDS } from './lib/timeline.js';
import { createViewer, webglAvailable, VIEW_NAMES as VIEWS } from './lib/viewer.js';
import { effectiveView, wrapSegments } from './lib/views.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const testGfx = params.get('gfx') === 'test';
const debug = params.get('debug') === '1';
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => reducedQuery.matches;

const els = {
  app: $('app'), pickOpen: $('pick-open'), pickName: $('pick-name'), picker: $('picker'),
  pickerList: $('picker-list'), pickerClose: $('picker-close'), donePick: $('done-pick'), stage: $('stage'), canvas: $('view'), hint: $('hint'), loading: $('loading'),
  tools: $('stage-tools'), explode: $('explode'), done: $('done'), doneTitle: $('done-title'),
  other: $('other'), otherLabel: $('other-label'), shareOpen: $('share-open'),
  nogl: $('nogl'), noglWhy: $('nogl-why'), noglList: $('nogl-list'),
  prev: $('prev'), play: $('play'), playLabel: $('play-label'), next: $('next'),
  scrub: $('scrub'), ticks: $('ticks'), stepNo: $('step-no'), stepCount: $('step-count'),
  stepTitle: $('step-title'), stepText: $('step-text'), stepTip: $('step-tip'),
  speed: $('speed'), paperInfo: $('paper-info'), live: $('live'),
  legend: $('legend'), stepStop: $('step-stop'), steps: $('steps'), stepList: $('step-list'),
};
const wideQuery = matchMedia('(min-width: 720px) and (orientation: landscape), (min-width: 1024px)');
// A phone on its side with the two-column layout: the 3D is short, so the completion card goes to the
// right column (above the step text) instead of covering the paper.
const sideQuery = matchMedia('(min-width: 720px) and (orientation: landscape) and (max-height: 480px)');

// 線の種類ごとの凡例。turn・hinge は線の意味を説明しなくても動きで分かるので出さない
const LEGEND = {
  valley: { dash: '7 4', name: '谷折り', say: '手前に折る' },
  mountain: { dash: '8 3 1.6 3', name: '山折り', say: '向こうに折る' },
  reverse: { dash: '7 3 1.4 3 1.4 3', name: '中割り折り', say: '先端を紙の間に押し込んで裏返す' },
};
const SVG = 'http://www.w3.org/2000/svg';

const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const stars = (n) => '★'.repeat(Math.max(1, Math.min(3, n || 1)));

let models = [];
let model = null;
let tl = null;
let viewer = null;
let exploded = false;
let speed = 1;
let shownStep = -1;
let shownFinished = null;
let stepStop = false;
let hintBand = null;

// 日本語は語の途中でも折り返せてしまう（「ネ／クタイ」）。語と文末の数文字を、折り返さない span にまとめる（lib/views.js）。
// DOMで組み、innerHTML は使わない
function setWrapped(el, text, tail = 6) {
  el.replaceChildren(...wrapSegments(text, tail).map((p) => {
    if (!p.nowrap) return document.createTextNode(p.text);
    const span = document.createElement('span');
    span.className = 'nowrap';
    span.textContent = p.text;
    return span;
  }));
}

function renderLegend(step) {
  const kinds = [...new Set((step.guides || []).map((g) => g.kind))].filter((k) => LEGEND[k]);
  els.legend.hidden = kinds.length === 0;
  els.legend.replaceChildren(...kinds.map((k) => {
    const li = document.createElement('li');
    li.dataset.kind = k;
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 48 8');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', 'M2 4h44');
    path.setAttribute('stroke', '#d6452d');
    path.setAttribute('stroke-width', '3.4');
    path.setAttribute('stroke-dasharray', LEGEND[k].dash);
    svg.append(path);
    const b = document.createElement('b');
    b.textContent = LEGEND[k].name;
    li.append(svg, b, document.createTextNode(`＝${LEGEND[k].say}`));
    return li;
  }));
}

function renderStepList() {
  els.stepList.replaceChildren(...model.steps.map((st, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'step-link';
    b.dataset.i = String(i);
    const num = document.createElement('span');
    num.className = 'step-num';
    num.textContent = String(i + 1);
    const name = document.createElement('span');
    name.textContent = st.title;
    b.append(num, name);
    onPress(b, () => { viewer?.stopSpin(); tl.goto(i); sync(); viewer?.wake(); });
    li.append(b);
    return li;
  }));
}

function markCurrentStep(i) {
  for (const b of els.stepList.querySelectorAll('.step-link')) {
    if (Number(b.dataset.i) === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  }
  els.noglList.querySelectorAll('li').forEach((li, k) => {
    if (k === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
}

function placeDone() {
  const panel = $('controls');
  if (sideQuery.matches) { if (els.done.parentElement !== panel) panel.prepend(els.done); }
  else if (els.done.parentElement !== els.stage) els.stage.insertBefore(els.done, els.nogl);
  els.app.dataset.donePlace = sideQuery.matches ? 'panel' : 'stage';
  updateInsets();
}

// 広い画面では右欄に開いたまま、スマホでは閉じた折りたたみにする
function placeStepList() {
  els.steps.open = wideQuery.matches;
  els.steps.classList.toggle('is-pinned', wideQuery.matches);
}

// 2本目の指で押したボタンは click にならないことがある（1本目で回している最中など）。
// 主ではない指の pointerup でも押したことにし、直後に来る click とは二重にしない。
function onPress(el, fn) {
  let downId = null;
  let suppressUntil = 0;
  el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !e.isPrimary) downId = e.pointerId; });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== downId) return;
    downId = null;
    suppressUntil = performance.now() + 600;
    fn(e);
  });
  el.addEventListener('pointercancel', () => { downId = null; });
  el.addEventListener('click', (e) => {
    if (performance.now() < suppressUntil) { suppressUntil = 0; return; }
    fn(e);
  });
}

function paperShape(p) {
  if (!p) return '';
  const r = Math.max(p.width, p.height) / Math.min(p.width, p.height);
  if (Math.abs(r - 1) < 0.01) return '正方形';
  if (Math.abs(r - Math.SQRT2) < 0.02) return '長方形（A4などのコピー用紙）';
  return '長方形';
}

// The model picker: one card per model, in the list order (easiest first).
function renderPicker() {
  els.pickerList.replaceChildren(...models.map((m) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick-card';
    b.dataset.id = m.id;
    const img = document.createElement('img');
    img.src = `./assets/thumb-${m.id}.svg`;
    img.alt = '';
    img.width = 96;
    img.height = 96;
    img.decoding = 'async';
    const name = document.createElement('span');
    name.className = 'pick-card-name';
    name.textContent = m.name;
    const meta = document.createElement('span');
    meta.className = 'pick-card-meta';
    const st = document.createElement('span');
    st.className = 'pick-stars';
    st.textContent = stars(m.level);
    st.setAttribute('aria-label', `難しさ${Math.max(1, Math.min(3, m.level || 1))}`);
    meta.append(st, document.createTextNode(` 約${m.minutes}分`));
    // Shown on the current card only (CSS), so the choice is not told by the red frame alone
    const badge = document.createElement('span');
    badge.className = 'pick-badge';
    badge.textContent = '選択中';
    b.append(badge, img, name, meta);
    onPress(b, () => {
      // After a choice, focus goes to play: Space then plays instead of opening the list again
      afterClose = els.play.offsetParent !== null ? els.play : els.next;
      closePicker();
      chooseModel(m.id, { autoplay: true });
    });
    li.append(b);
    return li;
  }));
}

function markCurrentModel() {
  els.pickName.textContent = model.name;
  els.pickOpen.setAttribute('aria-label', `作品を選ぶ（今は${model.name}）`);
  for (const b of els.pickerList.querySelectorAll('.pick-card')) {
    if (b.dataset.id === model.id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  }
}

let opener = null;
let afterClose = null; // where focus goes when the list closes after a choice (otherwise back to the opener)
function openPicker(e) {
  if (els.picker.open) return;
  opener = e?.currentTarget instanceof HTMLElement ? e.currentTarget : els.pickOpen;
  afterClose = null;
  // On a short landscape screen the list starts below the header, so the button that opened it stays whole
  els.picker.style.setProperty('--picker-top', `${Math.round(document.querySelector('.top').getBoundingClientRect().bottom)}px`);
  els.picker.showModal();
  // Start on the current model, so Enter keeps it and Tab moves on from there.
  const current = els.pickerList.querySelector('.pick-card[aria-current="true"]');
  current?.scrollIntoView({ block: 'nearest' });
  (current || els.pickerClose).focus({ preventScroll: true });
}

// Focus goes back to the button that opened it, or to play after a choice (see the 'close' listener).
function closePicker() {
  if (els.picker.open) els.picker.close();
}

const nextModel = () => models[(models.findIndex((m) => m.id === model.id) + 1) % models.length];

function renderTicks() {
  const n = model.steps.length;
  els.ticks.replaceChildren();
  for (let k = 1; k < n; k++) {
    const tick = document.createElement('span');
    tick.style.left = `${(k / n) * 100}%`;
    els.ticks.append(tick);
  }
  els.scrub.max = String(n);
}

function renderNoGlList() {
  els.noglList.replaceChildren(...model.steps.map((s) => {
    const li = document.createElement('li');
    const h = document.createElement('b');
    h.textContent = s.title;
    const p = document.createElement('span');
    p.textContent = ` ${s.text}${s.tip ? `（${s.tip}）` : ''}`;
    li.append(h, p);
    return li;
  }));
}

// A model is built the first time it is used. A heavy one (the crane) says so first and lets the screen
// paint before the build; a light one is built in place. If the data of the chosen model cannot be
// built, the current model stays.
let chooseToken = 0;
function chooseModel(id, opts) {
  const next = models.find((m) => m.id === id);
  const token = ++chooseToken;
  els.loading.hidden = true; // a choice made a moment ago may have left its notice up
  const finish = () => {
    if (token !== chooseToken) return;
    els.loading.hidden = true;
    selectModel(id, opts);
  };
  const build = () => {
    try { void next.steps; return true; } catch (error) {
      console.error(error);
      // The notice is a status region, so a screen reader announces the failure too.
      els.loading.textContent = `${next.name}の手順を組み立てられませんでした。`;
      els.loading.hidden = false;
      setTimeout(() => { if (token === chooseToken) els.loading.hidden = true; }, 5000);
      return false;
    }
  };
  if (!next || next === model || next.ready || !next.heavy) {
    if (next && next !== model && !build()) return;
    selectModel(id, opts);
    return;
  }
  els.loading.textContent = `${next.name}を準備しています…`;
  els.loading.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { if (token === chooseToken && build()) finish(); }, 0)));
}

// Switching models (not the first open) puts the model in the address bar and drops the position and
// the spread: s, t, paused and explode belong to the previous model. debug, gfx and view stay.
function rememberModel(id) {
  const q = new URLSearchParams(location.search);
  for (const k of ['s', 't', 'paused', 'explode']) q.delete(k);
  q.set('m', id);
  try { history.replaceState(history.state, '', `${location.pathname}?${q}${location.hash}`); } catch { /* file: or sandboxed */ }
}

// view: a view chosen in the link (view=). It holds for every step until the person resets the view.
function selectModel(id, { autoplay = false, step = 0, t = null, view = null, initial = false } = {}) {
  const next = models.find((m) => m.id === id) || models[0];
  model = next;
  if (!initial) rememberModel(model.id);
  markCurrentModel();
  tl = createTimeline({ durations: model.steps.map((s) => s.durationMs), reduced: reduced(), stepStop });
  tl.setSpeed(speed);
  if (t !== null) tl.setProgress(step, t);
  else tl.goto(step);
  shownStep = -1;
  shownFinished = null;
  renderTicks();
  renderStepList();
  const p = model.paper || {};
  els.paperInfo.replaceChildren();
  const label = document.createElement('span');
  label.textContent = `紙：${paperShape(p)}`;
  const sw = (color, name, side) => {
    const s = document.createElement('span');
    s.className = 'swatch';
    const dot = document.createElement('i');
    dot.style.background = color;
    s.append(dot, document.createTextNode(`${side} ${name || ''}`));
    return s;
  };
  // Line 1: the paper; line 2: the two sides (so a swatch never breaks away from its name)
  const sides = document.createElement('span');
  sides.className = 'swatches';
  sides.append(sw(p.front, p.frontName, '表'), sw(p.back, p.backName, '裏'));
  els.paperInfo.append(label, sides);
  els.otherLabel.textContent = models.length > 1 ? `${nextModel().name}へ` : '最初から';
  // The spread is per model: a new model starts closed
  if (exploded) setExplode(false);
  const startStep = tl.state().step;
  if (viewer) viewer.setModel(model, { view: VIEWS.includes(view) ? view : effectiveView(model.steps, startStep), moved: VIEWS.includes(view) });
  else renderNoGlList();
  // 3Dが無いときは動きを再生できないので、自動再生しない
  if (autoplay && !reduced() && viewer) tl.play();
  sync();
}

function announce(text) {
  els.live.textContent = text;
}

function sync() {
  if (!tl) return;
  const s = tl.state();
  const n = s.length;
  const st = model.steps[s.step];

  if (s.step !== shownStep) {
    shownStep = s.step;
    els.stepNo.textContent = `手順 ${s.step + 1}`;
    els.stepCount.textContent = `/ ${n}`;
    setWrapped(els.stepTitle, st.title, 4);
    setWrapped(els.stepText, st.text);
    els.stepTip.hidden = !st.tip;
    setWrapped(els.stepTip, st.tip ? `つまずきやすい点：${st.tip}` : '');
    renderLegend(st);
    markCurrentStep(s.step);
    // Each step may recommend a view (the crane ends from the side). The viewer only follows it
    // until the person moves the camera.
    viewer?.followView(effectiveView(model.steps, s.step));
    announce(`手順${s.step + 1}／${n}。${st.title}。${st.text}${st.tip ? ` ${st.tip}` : ''}`);
  }

  if (s.finished !== shownFinished) {
    shownFinished = s.finished;
    els.done.hidden = !s.finished;
    els.app.dataset.finished = s.finished ? 'true' : 'false';
    if (s.finished) {
      els.doneTitle.textContent = `${model.name}の完成`;
      announce(`${model.name}が完成しました。`);
      if (!els.stage.contains(els.done)) els.done.scrollIntoView({ block: 'nearest' });
    }
    viewer?.setFinished(s.finished);
    updateInsets();
  }

  els.play.setAttribute('aria-label', s.playing ? '一時停止' : '再生');
  els.playLabel.textContent = s.playing ? '一時停止' : s.finished ? 'もう一度' : '再生';
  els.play.classList.toggle('is-playing', s.playing);
  // 完成後の「もう一度」は主ボタンにしない（主は完成の札の「次の作品へ」だけ）
  els.play.classList.toggle('is-done', s.finished && !s.playing);
  const focused = [els.next, els.prev].find((b) => b === document.activeElement);
  els.prev.disabled = s.step === 0 && (s.t === 0 || s.reduced) && !s.finished;
  els.next.disabled = s.finished;
  // A disabled button drops the focus to the page; keep it on the controls instead
  if (focused?.disabled) (els.play.offsetParent !== null ? els.play : focused === els.next ? els.prev : els.next).focus({ preventScroll: true });

  const pos = tl.position();
  if (document.activeElement !== els.scrub || s.playing) els.scrub.value = String(pos);
  const pct = Math.round(s.t * 100);
  els.scrub.setAttribute('aria-valuetext', s.finished ? '完成' : `手順${s.step + 1}／${n}、${pct}%`);
  els.scrub.style.setProperty('--fill', `${(pos / n) * 100}%`);

  if (viewer) viewer.setPose(s.step, easeInOut(s.t), s.guides);
}

function onTick(dt) {
  if (!tl || !tl.state().playing) return false;
  tl.tick(dt);
  sync();
  return tl.state().playing;
}

function setSpeed(value) {
  speed = value;
  tl.setSpeed(value);
  for (const b of els.speed.querySelectorAll('[data-speed]')) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === value));
}

function setExplode(on) {
  exploded = on;
  els.explode.setAttribute('aria-pressed', String(on));
  els.explode.querySelector('.explode-label').textContent = on ? '重なりを戻す' : '重なりを広げる';
  viewer?.setExplode(on);
}

function hideHint() { els.hint.hidden = true; }

// 3Dの上（ヒントの帯）と下（視点ボタンの帯、完成の札）に重なる高さを測って viewer へ渡す。
// 紙は、その間の空いた所の中央に置かれる
function updateInsets() {
  if (!viewer) return;
  const stage = els.stage.getBoundingClientRect();
  if (!stage.height) return;
  // ヒントは最初に触ると消えるが、紙が急に動かないよう、その帯の分は空けたままにする
  if (!els.hint.hidden && getComputedStyle(els.hint).display !== 'none') hintBand = Math.max(0, els.hint.getBoundingClientRect().bottom - stage.top) + 4;
  const cssHidden = els.hint.hidden ? false : getComputedStyle(els.hint).display === 'none';
  const top = cssHidden || hintBand === null ? 8 : hintBand;
  const lowest = els.done.hidden || !els.stage.contains(els.done) ? els.tools : els.done.querySelector('.done-card');
  const bottom = Math.max(0, stage.bottom - lowest.getBoundingClientRect().top) + 4;
  viewer.setInsets({ top, bottom });
}

// Back to the view the current step recommends; from here on the steps move the camera again.
function resetView() {
  viewer?.resetView(effectiveView(model.steps, tl.state().step));
}

function setStepStop(on) {
  stepStop = on;
  tl.setStepStop(on);
  els.stepStop.setAttribute('aria-pressed', String(on));
}

function bind() {
  onPress(els.play, () => { viewer?.stopSpin(); tl.toggle(); sync(); viewer?.wake(); });
  onPress(els.prev, () => { viewer?.stopSpin(); tl.prev(); sync(); });
  onPress(els.next, () => { viewer?.stopSpin(); tl.next(); sync(); });
  onPress(els.stepStop, () => setStepStop(!stepStop));
  onPress(els.other, () => chooseModel(nextModel().id, { autoplay: true }));
  onPress(els.pickOpen, openPicker);
  onPress(els.donePick, openPicker);
  onPress(els.pickerClose, () => closePicker());
  // ×, a tap outside and Esc send focus back to the button that opened the list; a choice sends it to play.
  els.picker.addEventListener('close', () => {
    const back = afterClose && afterClose.offsetParent !== null ? afterClose
      : opener && opener.offsetParent !== null ? opener : els.pickOpen;
    afterClose = null;
    back.focus({ preventScroll: true });
  });
  // Arrow keys move between the cards: ← → one card, ↑ ↓ one row (the column count is read from the layout).
  els.picker.addEventListener('keydown', (e) => {
    const cards = [...els.pickerList.querySelectorAll('.pick-card')];
    const at = cards.indexOf(document.activeElement);
    if (at < 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    const top0 = cards[0].getBoundingClientRect().top;
    const cols = Math.max(1, cards.filter((c) => Math.abs(c.getBoundingClientRect().top - top0) < 2).length);
    const to = { ArrowLeft: at - 1, ArrowRight: at + 1, ArrowUp: at - cols, ArrowDown: at + cols, Home: 0, End: cards.length - 1 }[e.key];
    e.preventDefault();
    if (to < 0 || to >= cards.length) return;
    cards[to].focus();
    cards[to].scrollIntoView({ block: 'nearest' });
  });
  // Keep Tab inside the list: a native modal would otherwise let it leave to the browser's own controls.
  els.picker.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...els.picker.querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items.at(-1);
    if (e.shiftKey && (document.activeElement === first || !els.picker.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // A tap on the dimmed area outside the panel lands on the <dialog> itself.
  els.picker.addEventListener('click', (e) => { if (e.target === els.picker) closePicker(); });
  onPress(els.shareOpen, () => {
    const share = document.getElementById('share');
    share?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
    share?.querySelector('button, a')?.focus({ preventScroll: true });
  });
  onPress(els.explode, () => setExplode(!exploded));
  for (const b of els.tools.querySelectorAll('[data-view]')) onPress(b, () => (b.dataset.view === 'reset' ? resetView() : viewer?.pickView(b.dataset.view)));
  for (const b of els.speed.querySelectorAll('[data-speed]')) onPress(b, () => setSpeed(Number(b.dataset.speed)));

  els.scrub.addEventListener('pointerdown', () => viewer?.stopSpin());
  els.scrub.addEventListener('input', () => { viewer?.stopSpin(); tl.seek(Number(els.scrub.value)); sync(); });
  els.scrub.addEventListener('keydown', (e) => {
    // つまみの←→は手順の送りにそろえる（1目盛りずつだと遅すぎる）
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (e.key === 'ArrowLeft') tl.prev(); else tl.next();
      sync();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || els.picker.open) return;
    const tag = e.target?.tagName;
    const typing = tag === 'INPUT' && e.target.type !== 'range';
    if (typing || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); tl.next(); sync(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); tl.prev(); sync(); }
    else if (e.key === ' ' || e.code === 'Space') {
      // ボタンにフォーカスがあるときは、そのボタンを押す（標準の動き）
      if (tag === 'BUTTON' || tag === 'A') return;
      e.preventDefault(); tl.toggle(); sync(); viewer?.wake();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault(); resetView();
    }
  });

  if (matchMedia('(hover: hover) and (pointer: fine)').matches) els.hint.textContent = 'ドラッグで回す ・ ホイールで拡大';
  els.canvas.addEventListener('pointerdown', hideHint, { once: true });
  els.canvas.addEventListener('wheel', hideHint, { once: true, passive: true });

  new ResizeObserver(updateInsets).observe(els.stage);
  placeStepList();
  wideQuery.addEventListener?.('change', placeStepList);
  placeDone();
  sideQuery.addEventListener?.('change', placeDone);
  reducedQuery.addEventListener?.('change', () => { tl.setReduced(reduced()); sync(); viewer?.wake(); });
}

function showNoGl(reason) {
  els.app.dataset.webgl = 'false';
  els.nogl.hidden = false;
  els.tools.hidden = true;
  els.hint.hidden = true;
  els.canvas.hidden = true;
  // 動きを見せられないので、再生と速さは出さない。前へ・次へ・つまみで手順を読む
  els.play.hidden = true;
  els.speed.hidden = true;
  els.stepStop.hidden = true;
  els.noglWhy.textContent = reason;
}

async function main() {
  try {
    models = await loadModels();
    // Only the model that opens first is built now; a data error in it shows here as before.
    void (models.find((m) => m.id === params.get('m')) || models[0]).steps;
  } catch (error) {
    showNoGl(`作品のデータを組み立てられませんでした。${error?.message || ''}`);
    els.stepTitle.textContent = '読み込めませんでした';
    throw error;
  }
  els.app.dataset.engine = models.source || 'engine';
  renderPicker();

  if (webglAvailable()) {
    try {
      viewer = createViewer({ canvas: els.canvas, testGfx, reducedMotion: reduced, onTick });
      els.app.dataset.webgl = 'true';
    } catch (error) {
      viewer = null;
      showNoGl('この端末では3D表示を使えませんでした（WebGLを初期化できません）。手順は文章で読めます。');
    }
  } else {
    showNoGl('この端末やブラウザでは3D表示（WebGL）が使えません。手順は文章で読めます。');
  }

  const id = params.get('m');
  const sParam = Number.parseInt(params.get('s') || '', 10);
  const tParam = params.has('t') ? Number(params.get('t')) : null;
  const target = models.find((m) => m.id === id) || models[0];
  const step = Number.isFinite(sParam) ? Math.min(Math.max(sParam - 1, 0), target.steps.length - 1) : 0;
  const hasPosition = Number.isFinite(sParam) || (tParam !== null && Number.isFinite(tParam));
  const autoplay = !hasPosition && params.get('paused') !== '1';
  bind();
  selectModel(target.id, { autoplay, step, t: tParam !== null && Number.isFinite(tParam) ? tParam : null, view: params.get('view'), initial: true });
  if (params.get('explode') === '1') setExplode(true);
  if (!SPEEDS.includes(speed)) setSpeed(1);
  els.app.dataset.ready = 'true';

  if (debug) {
    window.__oricube = {
      get model() { return model; },
      models,
      setProgress(i, t) { tl.setProgress(i, t); sync(); },
      state() { return { ...tl.state(), model: model.id, exploded, engine: models.source, viewer: viewer?.stats() ?? null }; },
    };
  }
}

main();
