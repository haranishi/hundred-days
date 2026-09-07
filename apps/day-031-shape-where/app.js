/* 画面の組み立てと状態遷移。計算と文言は lib/ の純関数に寄せてある。

   通信は Wikipedia の要約1本だけ。クイズ自体は同梱データで完結するので、
   要約が取れなくても遊びは止まらない。枠だけ先に置いて「取れませんでした」に
   差し替えるので、レイアウトも動かない（コンソールにも何も出さない）。 */

import { QUESTION_COUNT, buildRound, formatScore, planPrefCodes, score } from './lib/quiz.js';
import { mulberry32, parseSeed, randomSeed } from './lib/rng.js';
import { REGIONS, regionHint } from './lib/regions.js';
import { bestOf, bestSlot, isPrefCode, load, saveBest, saveLastPref } from './lib/store.js';
import { articleUrl, createWikiReader } from './lib/wiki.js';
import { intentHref, intentText, modeLabel, postText, shareUrl, townUnit } from './lib/share-text.js';
import { placedPath, ringsToPath } from './lib/svg.js';

const MODES = ['pref', 'town', 'town-all'];
const ISLAND_NOTE = '県の本土から離れた島です';
/** ヒントを使わずに答えた問。正解表示でヒント行を空の帯にしないための一言 */
const NO_HINT_NOTE = 'ヒントなしで回答';
const LOADING_DELAY = 300;
const WIKI_LOADING = '解説を読み込み中…';
const WIKI_NONE = 'Wikipedia の解説は取れませんでした';
/** 都道府県モードのヒントで消す誤答の数（4択 → 2択） */
const ELIMINATE_COUNT = 2;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 最初の画面に並べる見本。特徴のある形を選ぶ（足りなければ先頭から埋める） */
const SAMPLE_CODES = ['01', '12', '47'];
const SAMPLE_COUNT = SAMPLE_CODES.length;
/** ?m= と ?p= で開いたときに、どのボタンへフォーカスを移すか */
const START_BUTTON = { pref: 'playPref', town: 'playTown', 'town-all': 'playTownAll' };

const byId = (id) => document.getElementById(id);
/* SVG 要素には hidden プロパティが無い（HTMLElement のもの）ので、属性で切り替える。
   CSS の [hidden] { display: none } はどの要素にも効く */
const setHidden = (node, value) => node.toggleAttribute('hidden', Boolean(value));
const app = byId('app');
const ui = {
  storageNotice: byId('storage-notice'),
  startSamples: byId('start-samples'),
  startShapes: byId('start-shapes'),
  playPref: byId('play-pref'),
  playTown: byId('play-town'),
  playTownAll: byId('play-town-all'),
  prefSelect: byId('pref-select'),
  bestPref: byId('best-pref'),
  bestTown: byId('best-town'),
  bestTownAll: byId('best-town-all'),
  progress: byId('progress'),
  scoreNow: byId('score-now'),
  quitButton: byId('quit-button'),
  shape: byId('shape'),
  shapePath: byId('shape-path'),
  hintButton: byId('hint-button'),
  hint: byId('hint'),
  hintOutline: byId('hint-outline'),
  hintTown: byId('hint-town'),
  hintText: byId('hint-text'),
  choices: byId('choices'),
  tracker: byId('tracker'),
  reveal: byId('reveal'),
  revealProgress: byId('reveal-progress'),
  revealResult: byId('reveal-result'),
  revealName: byId('reveal-name'),
  revealSub: byId('reveal-sub'),
  revealMap: byId('reveal-map'),
  revealNote: byId('reveal-note'),
  revealOutline: byId('reveal-outline'),
  revealTown: byId('reveal-town'),
  revealWiki: byId('reveal-wiki'),
  wikiThumb: byId('wiki-thumb'),
  wikiExtract: byId('wiki-extract'),
  wikiFoot: byId('wiki-foot'),
  wikiLink: byId('wiki-link'),
  nextButton: byId('next-button'),
  resultScore: byId('result-score'),
  resultMode: byId('result-mode'),
  resultBest: byId('result-best'),
  resultList: byId('result-list'),
  postScore: byId('post-score'),
  copyScore: byId('copy-score'),
  copyNote: byId('copy-note'),
  againButton: byId('again-button'),
  homeButton: byId('home-button'),
  retryButton: byId('retry-button'),
  errorHome: byId('error-home')
};

const storage = (() => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
})();

const state = {
  prefs: [],
  prefByCode: new Map(),
  townFiles: new Map(),
  record: null,
  canSave: false,
  urlPref: null,
  urlSeed: null,
  startMode: 'pref',
  startFocus: null,
  mode: 'pref',
  prefCode: null,
  round: null,
  index: 0,
  answers: [],
  hinted: false,
  ticket: 0,
  wiki: null,
  retry: null
};

const setState = (name) => {
  app.dataset.state = name;
};

const currentQuestion = () => state.round?.questions[state.index] ?? null;
const isLastQuestion = () => state.index >= (state.round?.questions.length ?? 0) - 1;
const prefNameOf = (code) => state.prefByCode.get(code)?.name ?? '';

// ---------------------------------------------------------------- データの読み込み

async function fetchJson(path) {
  const response = await fetch(`./data/${path}`);
  if (!response.ok) throw new Error(`データを読めません: ${path}`);
  return response.json();
}

/** 読み込みが 300ms 未満で終わるならスケルトンは出さない（ちらつきを増やさない） */
async function withLoading(task) {
  let finished = false;
  const timer = setTimeout(() => {
    if (!finished) setState('loading');
  }, LOADING_DELAY);
  try {
    return await task();
  } finally {
    finished = true;
    clearTimeout(timer);
  }
}

async function ensureTowns(code) {
  if (!state.townFiles.has(code)) state.townFiles.set(code, await fetchJson(`towns/${code}.json`));
  return state.townFiles.get(code);
}

// ---------------------------------------------------------------- start 画面

function buildPrefOptions() {
  ui.prefSelect.replaceChildren();
  for (const region of REGIONS) {
    const items = state.prefs.filter((pref) => region.prefs.includes(pref.code));
    if (!items.length) continue;
    const group = document.createElement('optgroup');
    group.label = region.label;
    for (const pref of items) {
      const option = document.createElement('option');
      option.value = pref.code;
      option.textContent = pref.name;
      group.append(option);
    }
    ui.prefSelect.append(group);
  }
}

/** 見本の小さなシルエット。「シルエット」という言葉より形そのもののほうが早い */
function sampleShape(pref) {
  const item = document.createElement('li');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 1000');
  svg.setAttribute('class', 'samples__shape');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('d', ringsToPath(pref.shape?.rings));
  svg.append(path);
  item.append(svg);
  return item;
}

function renderStartSamples() {
  const picked = SAMPLE_CODES.map((code) => state.prefByCode.get(code)).filter(Boolean);
  // 見本の県がデータに無い場合（テストの固定データなど）は先頭から埋めて数を揃える
  for (const pref of state.prefs) {
    if (picked.length >= SAMPLE_COUNT) break;
    if (!picked.includes(pref)) picked.push(pref);
  }
  ui.startShapes.replaceChildren(...picked.map(sampleShape));
  setHidden(ui.startSamples, picked.length < SAMPLE_COUNT);
}

const bestLabel = (slot) => {
  const value = bestOf(state.record, slot);
  return value === null ? 'まだ記録なし' : `ベスト ${formatScore(value)} / ${QUESTION_COUNT}`;
};

function renderStart() {
  const name = prefNameOf(ui.prefSelect.value);
  ui.playTown.textContent = `${name}の${townUnit(name)}ではじめる`;
  ui.bestPref.textContent = bestLabel('pref');
  ui.bestTown.textContent = bestLabel(bestSlot({ mode: 'town', prefCode: ui.prefSelect.value }));
  ui.bestTownAll.textContent = bestLabel('town-all');
}

function readParams() {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const pref = params.get('p');
  const mode = params.get('m');
  state.urlPref = isPrefCode(pref) ? pref : null;
  state.urlSeed = parseSeed(params.get('seed'));
  state.startMode = state.urlPref ? 'town' : (MODES.includes(mode) ? mode : 'pref');
  /* URL でモードを指定して開いた人には、そのボタンにフォーカスを置いて「ここを押す」と伝える。
     指定が無いときは何もしない（勝手にフォーカスを動かさない） */
  state.startFocus = state.urlPref || MODES.includes(mode) ? state.startMode : null;
}

/** ?m= / ?p= で開いたときだけ、一度きりフォーカスを移す */
function focusStartButton() {
  const which = state.startFocus;
  state.startFocus = null;
  if (which) ui[START_BUTTON[which]]?.focus();
}

async function loadPrefs() {
  state.retry = loadPrefs;
  try {
    const data = await withLoading(() => fetchJson('prefectures.json'));
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) throw new Error('都道府県データが空です');
    state.prefs = items;
    state.prefByCode = new Map(items.map((pref) => [pref.code, pref]));
    buildPrefOptions();
    renderStartSamples();
    const wanted = state.urlPref ?? state.record.lastPref ?? items[0].code;
    ui.prefSelect.value = state.prefByCode.has(wanted) ? wanted : items[0].code;
    for (const node of [ui.playPref, ui.playTown, ui.playTownAll, ui.prefSelect]) node.disabled = false;
    app.dataset.mode = state.startMode;
    renderStart();
    setState('start');
    focusStartButton();
  } catch {
    setState('error');
  }
}

// ---------------------------------------------------------------- 出題

async function startRound({ mode, prefCode, seed }) {
  state.retry = () => startRound({ mode, prefCode, seed });
  app.dataset.mode = mode;
  try {
    const needed = [
      ...new Set(planPrefCodes({ mode, prefs: state.prefs, prefCode, rng: mulberry32(seed), count: QUESTION_COUNT }))
    ];
    await withLoading(() => Promise.all(needed.map(ensureTowns)));
    const townsByPref = Object.fromEntries(needed.map((code) => [code, state.townFiles.get(code)]));
    state.round = buildRound({
      mode,
      prefs: state.prefs,
      townsByPref,
      prefCode,
      rng: mulberry32(seed),
      count: QUESTION_COUNT
    });
    state.mode = mode;
    state.prefCode = prefCode;
    state.index = 0;
    state.answers = [];
    state.wiki = createWikiReader();
    if (mode === 'town' && prefCode) saveLastPref(storage, state.record, prefCode);
    renderQuestion();
    setState('playing');
  } catch {
    setState('error');
  }
}

function renderChoices(question) {
  ui.choices.replaceChildren();
  question.choices.forEach((item, order) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.dataset.code = item.code;
    button.textContent = item.name;
    button.setAttribute('aria-keyshortcuts', String(order + 1));
    ui.choices.append(button);
  });
}

const markOf = (entry) => (entry.correct ? (entry.hinted ? 'hint' : 'correct') : 'wrong');

/** 10問ぶんの丸。答えた問だけ印が変わる（右カラムの下の空きも埋める） */
function renderTracker() {
  const total = state.round?.questions.length ?? QUESTION_COUNT;
  const marks = state.answers.map(markOf);
  ui.tracker.replaceChildren(
    ...Array.from({ length: total }, (_, index) => {
      const dot = document.createElement('li');
      dot.dataset.mark = marks[index] ?? 'pending';
      return dot;
    })
  );
  const correct = state.answers.filter((entry) => entry.correct).length;
  ui.tracker.setAttribute('aria-label', `${total}問中${state.answers.length}問回答、正解${correct}`);
}

/** 「正解 2.5」。そのモードのベストがあれば続けて出す */
function renderScoreNow() {
  const total = state.round?.questions.length ?? QUESTION_COUNT;
  const best = bestOf(state.record, bestSlot({ mode: state.mode, prefCode: state.prefCode }));
  const now = `正解 ${formatScore(score(state.answers))}`;
  ui.scoreNow.textContent = best === null ? now : `${now} · ベスト ${formatScore(best)} / ${total}`;
}

function renderQuestion() {
  const question = currentQuestion();
  ui.progress.textContent = `${state.index + 1} / ${state.round.questions.length}`;
  renderScoreNow();
  ui.shapePath.setAttribute('d', ringsToPath(question.answer.shape?.rings));
  // クラスを付け直してフェードをやり直す（reduced motion では CSS 側で無効）
  ui.shape.classList.remove('appear');
  void ui.shape.getBoundingClientRect();
  ui.shape.classList.add('appear');

  state.hinted = false;
  app.dataset.hintUsed = 'false';
  setHidden(ui.hint, true);
  ui.hintText.dataset.tone = 'hint';
  setHidden(ui.hintText, true);
  setHidden(ui.hintButton, false);
  renderChoices(question);
  renderTracker();
}

function drawMiniMap(outline, town, question) {
  const pref = state.prefByCode.get(question.prefCode);
  outline.setAttribute('d', ringsToPath(pref?.shape?.rings));
  town.setAttribute('d', placedPath(question.answer.shape?.rings, question.answer.pos));
}

/* 都道府県モードのヒント。地方名だと四国のように1つしか消せない県があり、
   市区町村の位置ヒントと効き目が違いすぎるので、誤答を2つ消して2択にする */
function eliminateChoices(question) {
  const wrong = [...ui.choices.querySelectorAll('.choice')].filter(
    (button) => button.dataset.code !== question.answer.code
  );
  for (const button of wrong.slice(0, ELIMINATE_COUNT)) {
    button.disabled = true;
    button.dataset.eliminated = 'true';
  }
}

function showHint() {
  if (state.hinted || app.dataset.state !== 'playing') return;
  const question = currentQuestion();
  state.hinted = true;
  app.dataset.hintUsed = 'true';
  /* 地図はシルエットのカードに重ね、文字はボタンと同じ行に入れ替える。
     どちらも新しい段を作らないので、4択もシルエットも動かない */
  const island = Boolean(question.answer.far);
  if (state.mode === 'pref') {
    eliminateChoices(question);
    ui.hintText.textContent = '2つに絞りました';
  } else if (island) {
    /* 県の枠の外にある離島の町。pos は枠内へ寄せた値なので、そのまま描くと
       縁に張り付いた嘘の位置になる。地図をやめて言葉で伝える */
    ui.hintText.textContent = ISLAND_NOTE;
  } else {
    drawMiniMap(ui.hintOutline, ui.hintTown, question);
    ui.hintText.textContent = '県内の位置';
  }
  setHidden(ui.hint, state.mode === 'pref' || island);
  setHidden(ui.hintButton, true);
  setHidden(ui.hintText, false);
}

function subLabel(question) {
  if (state.mode === 'pref') return regionHint(question.answer.code);
  const district = question.answer.district;
  return district ? `${question.prefName} ${district}` : question.prefName;
}

/** 解説の枠は3つの顔を持つ：読み込み中・本文あり・取れなかった。高さは変えない */
function setWiki(status, text) {
  ui.wikiExtract.textContent = text;
  ui.revealWiki.dataset.status = status;
  setHidden(ui.wikiFoot, status !== 'ready');
}

function resetWiki() {
  setHidden(ui.wikiThumb, true);
  ui.wikiThumb.removeAttribute('src');
  ui.wikiThumb.alt = '';
  ui.revealWiki.dataset.thumb = 'false';
  setWiki('loading', WIKI_LOADING);
}

async function loadWiki(question, ticket) {
  const info = await state.wiki.read(question.answer, state.mode === 'pref' ? '' : question.prefName);
  // 「次へ」で先に進んだあとに届いた応答は、前の問のものなので捨てる
  if (ticket !== state.ticket || app.dataset.state !== 'reveal') return;
  if (!info) {
    setWiki('none', WIKI_NONE);
    return;
  }
  ui.wikiLink.href = info.url || articleUrl(info.title);
  if (info.thumbnail) {
    ui.wikiThumb.src = info.thumbnail;
    ui.wikiThumb.alt = info.title;
    setHidden(ui.wikiThumb, false);
    ui.revealWiki.dataset.thumb = 'true';
  }
  setWiki('ready', info.extract);
}

/* 回答したら正解表示のところまで運ぶ。スマホでは4択より下にあって画面に入らない。
   block: 'nearest' は足りないぶんだけ動かすので、PCのように既に見えているときは動かない */
function scrollRevealIntoView() {
  const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  ui.reveal.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
}

/** 色だけで正誤を伝えない。札の頭に記号を足し、読み上げにも「正解 北海道」と伝える */
function markChoice(button, symbol, label) {
  const mark = document.createElement('span');
  mark.className = 'mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = symbol;
  button.setAttribute('aria-label', `${label} ${button.textContent}`);
  button.prepend(mark);
}

function answer(code) {
  if (app.dataset.state !== 'playing') return;
  const question = currentQuestion();
  const correct = code === question.answer.code;
  state.answers.push({ correct, hinted: state.hinted, chosen: code, question });

  for (const button of ui.choices.querySelectorAll('.choice')) {
    button.disabled = true;
    if (button.dataset.code === question.answer.code) {
      button.dataset.result = 'correct';
      markChoice(button, '✓', '正解');
    } else if (button.dataset.code === code) {
      button.dataset.result = 'wrong';
      markChoice(button, '✕', '不正解');
    }
  }
  renderTracker();

  ui.reveal.dataset.correct = String(correct);
  ui.revealProgress.textContent = `${state.index + 1} / ${state.round.questions.length} · 正解 ${formatScore(score(state.answers))}`;
  ui.revealName.textContent = question.answer.name;
  ui.revealSub.textContent = subLabel(question);
  const hasMap = state.mode !== 'pref';
  // 枠の外にある離島の町は、位置の地図を出さずに言葉で伝える（pos が枠内へ寄せてあるため）
  const island = hasMap && Boolean(question.answer.far);
  setHidden(ui.revealMap, !hasMap || island);
  ui.revealNote.textContent = island ? ISLAND_NOTE : '';
  setHidden(ui.revealNote, !island);
  if (hasMap && !island) drawMiniMap(ui.revealOutline, ui.revealTown, question);
  ui.nextButton.textContent = isLastQuestion() ? '結果を見る' : '次へ';
  /* ヒント行はボタンを引っ込めても高さが残る。空の帯にせず、使ったヒントか
     「ヒントなしで回答」を置く。どちらも1行なので4択もシルエットも動かない */
  if (!state.hinted) ui.hintText.textContent = NO_HINT_NOTE;
  ui.hintText.dataset.tone = state.hinted ? 'hint' : 'quiet';
  setHidden(ui.hintText, false);
  resetWiki();
  setState('reveal');
  /* role="status" は「表示されたあとに変わった文字」を読む。先に入れてから出すと読まれない */
  ui.revealResult.textContent = correct ? '正解！' : 'ざんねん';
  // 焦点はここで移すが、動かすのはスクロールの担当にまかせる（二度スクロールしない）
  ui.nextButton.focus({ preventScroll: true });
  scrollRevealIntoView();

  state.ticket += 1;
  const ticket = state.ticket;
  // 要約は待たずに足す。取れなくても枠の高さは変わらないので、画面は動かない
  loadWiki(question, ticket).catch(() => {
    if (ticket === state.ticket && app.dataset.state === 'reveal') setWiki('none', WIKI_NONE);
  });
}

function goNext() {
  if (app.dataset.state !== 'reveal') return;
  if (isLastQuestion()) {
    finishRound();
    return;
  }
  state.index += 1;
  renderQuestion();
  setState('playing');
  ui.progress.focus();
}

// ---------------------------------------------------------------- 結果

/* 一覧は墨色の行に記号だけ色を付ける。行ごと朱にすると「外した回数」が結果の主役になる */
function resultItem(entry) {
  const item = document.createElement('li');
  const chosen = entry.question.choices.find((choice) => choice.code === entry.chosen);
  if (entry.correct) {
    item.dataset.mark = entry.hinted ? 'hinted' : 'correct';
    item.append(`${entry.question.answer.name} `);
    item.append(
      entry.hinted ? span('note', '△ ヒント') : span('mark mark--correct', '✓')
    );
    item.append(srOnly(entry.hinted ? '（正解・ヒントあり）' : '（正解）'));
  } else {
    item.dataset.mark = 'wrong';
    item.append(`${chosen?.name ?? ''} `);
    item.append(span('mark mark--wrong', '✗'));
    item.append(span('note', `（正解は${entry.question.answer.name}）`));
    item.append(srOnly('（不正解）'));
  }
  return item;
}

function span(className, text) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

function srOnly(text) {
  return span('sr-only', text);
}

function shareParts(value) {
  const prefName = prefNameOf(state.prefCode);
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  const url = shareUrl({ mode: state.mode, prefCode: state.prefCode, base: canonical || globalThis.location.href });
  return { prefName, url, value };
}

function finishRound() {
  const value = score(state.answers);
  const total = state.round.questions.length;
  const { prefName, url } = shareParts(value);

  ui.resultScore.textContent = `${formatScore(value)} / ${total}`;
  ui.resultMode.textContent = modeLabel({ mode: state.mode, prefName });

  const slot = bestSlot({ mode: state.mode, prefCode: state.prefCode });
  const before = bestOf(state.record, slot);
  const { improved } = saveBest(storage, state.record, slot, value, new Date());

  ui.resultList.replaceChildren(...state.answers.map(resultItem));
  ui.postScore.href = intentHref({ text: intentText({ mode: state.mode, prefName, score: value }), url });
  ui.copyNote.textContent = '';
  setState('result');
  // role="status" は表示されたあとの変化を読む。先に入れてから出すと読まれない
  ui.resultBest.textContent = !state.canSave
    ? ''
    : improved
      ? 'ベスト更新！'
      : `ベスト ${formatScore(before)} / ${total}`;
  ui.resultScore.focus();
}

async function copyPostText() {
  const value = score(state.answers);
  const { prefName, url } = shareParts(value);
  const text = postText({ mode: state.mode, prefName, score: value, url });
  try {
    await navigator.clipboard.writeText(text);
    ui.copyNote.textContent = 'コピーしました';
  } catch {
    ui.copyNote.textContent = 'コピーできませんでした';
  }
}

// ---------------------------------------------------------------- 出来事

ui.playPref.addEventListener('click', () => startRound({ mode: 'pref', prefCode: null, seed: nextSeed() }));
ui.playTown.addEventListener('click', () => startRound({ mode: 'town', prefCode: ui.prefSelect.value, seed: nextSeed() }));
ui.playTownAll.addEventListener('click', () => startRound({ mode: 'town-all', prefCode: null, seed: nextSeed() }));
ui.prefSelect.addEventListener('change', renderStart);
ui.hintButton.addEventListener('click', showHint);
ui.quitButton.addEventListener('click', quitRound);
ui.nextButton.addEventListener('click', goNext);
ui.choices.addEventListener('click', (event) => {
  const button = event.target.closest('.choice');
  if (button && !button.disabled) answer(button.dataset.code);
});
ui.againButton.addEventListener('click', () =>
  startRound({ mode: state.mode, prefCode: state.prefCode, seed: randomSeed() })
);
ui.homeButton.addEventListener('click', backToStart);
ui.errorHome.addEventListener('click', backToStart);
ui.copyScore.addEventListener('click', copyPostText);
ui.retryButton.addEventListener('click', () => state.retry?.());

/* 1〜4 キーでも選べる。入力欄にいるときは邪魔しない */
document.addEventListener('keydown', (event) => {
  if (app.dataset.state !== 'playing' || event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const order = Number(event.key);
  if (!Number.isInteger(order) || order < 1 || order > 4) return;
  const button = ui.choices.querySelectorAll('.choice')[order - 1];
  if (button && !button.disabled) {
    event.preventDefault();
    answer(button.dataset.code);
  }
});

function backToStart() {
  renderStart();
  app.dataset.mode = state.mode;
  setState('start');
}

/** 途中でやめる。確認は挟まない（10問は捨てても惜しくない長さ）。点数は残さない */
function quitRound() {
  if (app.dataset.state !== 'playing' && app.dataset.state !== 'reveal') return;
  // 遅れて届く要約が、戻ったあとの画面を触らないように番号を進めておく
  state.ticket += 1;
  state.round = null;
  state.answers = [];
  backToStart();
  ui.playPref.focus();
}

/* ?seed= はテストとデモのための固定の種。「もう一度」は毎回引き直す */
function nextSeed() {
  return state.urlSeed ?? randomSeed();
}

function boot() {
  readParams();
  const loaded = load(storage);
  state.record = loaded.record;
  state.canSave = loaded.canSave;
  setHidden(ui.storageNotice, state.canSave);
  loadPrefs();
}

boot();
