// 画面とイベント。作品は engine-adapter から、再生は timeline、描画は viewer に任せる。
import { loadModels } from './lib/engine-adapter.js';
import { createTimeline, SPEEDS } from './lib/timeline.js';
import { createViewer, webglAvailable } from './lib/viewer.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const testGfx = params.get('gfx') === 'test';
const debug = params.get('debug') === '1';
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => reducedQuery.matches;

const els = {
  app: $('app'), pickOpen: $('pick-open'), pickName: $('pick-name'), picker: $('picker'),
  pickerList: $('picker-list'), pickerClose: $('picker-close'), donePick: $('done-pick'), stage: $('stage'), canvas: $('view'), hint: $('hint'),
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

// 日本語は語の途中でも折り返せてしまう（「手／前に」「紙飛行／機」）。折り紙の用語と、短い名詞・副詞句は途中で切らない。
// 長い語を先に並べる（正規表現は左から最長一致ではなく、並びの順に試すため）。
const NOWRAP_WORDS = [
  '立方体の箱', '紙飛行機', '中割り折り', 'ふたのない', '細くとがった', '桜色の面', '白い面', '青い面', '緑の面', '生成りの面',
  '中心線', '折り筋', '折り目', '谷折り', '山折り', '折り込み', '折り返し', '立ち上げ', '裏返し', '裏返す', '向こうに', '手前に',
  '手前の', '向こう', '手前', '二つに', '二つ', '仕組み', '背骨', '先端', '左右の', '角のひれ', '紙の間', '胴の紙',
];
const WORD_SPLIT = new RegExp(`(${NOWRAP_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
const WORD_SET = new Set(NOWRAP_WORDS);

// 文末の数文字（「す。」「せん。」など）だけが次の行に落ちないよう、各文の末尾をまとめて折り返さない。
// 文全体の最後は長めに（tail）、途中の文は4文字。DOMで組み、innerHTML は使わない
function setWrapped(el, text, tail = 6) {
  const str = String(text || '');
  const sentences = str.match(/[^。！？]+[。！？]?|[。！？]/g) || [];
  const nodes = [];
  const pushPlain = (plain) => {
    for (const part of plain.split(WORD_SPLIT)) {
      if (!part) continue;
      if (WORD_SET.has(part)) {
        const word = document.createElement('span');
        word.className = 'nowrap';
        word.textContent = part;
        nodes.push(word);
      } else nodes.push(document.createTextNode(part));
    }
  };
  sentences.forEach((sentence, i) => {
    const k = i === sentences.length - 1 ? tail : 4;
    if (sentence.length <= k + 2) { pushPlain(sentence); return; }
    const keep = document.createElement('span');
    keep.className = 'nowrap';
    keep.textContent = sentence.slice(-k);
    pushPlain(sentence.slice(0, -k));
    nodes.push(keep);
  });
  el.replaceChildren(...nodes);
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
    b.append(img, name, meta);
    onPress(b, () => { closePicker(); chooseModel(m.id, { autoplay: true }); });
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
function openPicker(e) {
  if (els.picker.open) return;
  opener = e?.currentTarget instanceof HTMLElement ? e.currentTarget : els.pickOpen;
  els.picker.showModal();
  // Start on the current model, so Enter keeps it and Tab moves on from there.
  const current = els.pickerList.querySelector('.pick-card[aria-current="true"]');
  current?.scrollIntoView({ block: 'nearest' });
  (current || els.pickerClose).focus({ preventScroll: true });
}

// Focus goes back to the button that opened it (see the 'close' listener).
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

// A model is built the first time it is used (the crane takes a moment). Keep the current model
// if the data of the chosen one cannot be built.
function chooseModel(id, opts) {
  const next = models.find((m) => m.id === id);
  if (next && next !== model) {
    try { void next.steps; } catch (error) {
      console.error(error);
      els.hint.textContent = `${next.name}の手順を組み立てられませんでした。`;
      return;
    }
  }
  selectModel(id, opts);
}

function selectModel(id, { autoplay = false, step = 0, t = null } = {}) {
  const next = models.find((m) => m.id === id) || models[0];
  model = next;
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
  els.paperInfo.append(label, sw(p.front, p.frontName, '表'), sw(p.back, p.backName, '裏'));
  els.otherLabel.textContent = models.length > 1 ? `${nextModel().name}へ` : '最初から';
  if (viewer) viewer.setModel(model, { view: params.get('view') || model.steps[0]?.view || 'iso' });
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
    announce(`手順${s.step + 1}／${n}。${st.title}。${st.text}${st.tip ? ` ${st.tip}` : ''}`);
  }

  if (s.finished !== shownFinished) {
    shownFinished = s.finished;
    els.done.hidden = !s.finished;
    els.app.dataset.finished = s.finished ? 'true' : 'false';
    if (s.finished) {
      els.doneTitle.textContent = `${model.name}の完成`;
      announce(`${model.name}が完成しました。`);
    }
    viewer?.setFinished(s.finished);
    updateInsets();
  }

  els.play.setAttribute('aria-label', s.playing ? '一時停止' : '再生');
  els.playLabel.textContent = s.playing ? '一時停止' : s.finished ? 'もう一度' : '再生';
  els.play.classList.toggle('is-playing', s.playing);
  // 完成後の「もう一度」は主ボタンにしない（主は完成の札の「次の作品へ」だけ）
  els.play.classList.toggle('is-done', s.finished && !s.playing);
  els.prev.disabled = s.step === 0 && (s.t === 0 || s.reduced) && !s.finished;
  els.next.disabled = s.finished;

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
  const lowest = els.done.hidden ? els.tools : els.done.querySelector('.done-card');
  const bottom = Math.max(0, stage.bottom - lowest.getBoundingClientRect().top) + 4;
  viewer.setInsets({ top, bottom });
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
  // Esc closes the native modal; send focus back to the header button either way.
  els.picker.addEventListener('close', () => {
    const back = opener && opener.offsetParent !== null ? opener : els.pickOpen;
    back.focus({ preventScroll: true });
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
  for (const b of els.tools.querySelectorAll('[data-view]')) onPress(b, () => viewer?.setView(b.dataset.view));
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
      e.preventDefault(); viewer?.setView('reset');
    }
  });

  if (matchMedia('(hover: hover) and (pointer: fine)').matches) els.hint.textContent = 'ドラッグで回す ・ ホイールで拡大';
  els.canvas.addEventListener('pointerdown', hideHint, { once: true });
  els.canvas.addEventListener('wheel', hideHint, { once: true, passive: true });

  new ResizeObserver(updateInsets).observe(els.stage);
  placeStepList();
  wideQuery.addEventListener?.('change', placeStepList);
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
  selectModel(target.id, { autoplay, step, t: tParam !== null && Number.isFinite(tParam) ? tParam : null });
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
