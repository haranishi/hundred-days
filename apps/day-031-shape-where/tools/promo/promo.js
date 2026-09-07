/* 1コマ＝時刻 t の純関数。__seek(t) を呼ぶと、その時刻の画がそのまま出る。

   アプリは reducedMotion で撮るので、アプリ自身のアニメーション（シルエットのフェード・
   正解表示のせり上がり）は動かない。見せたい動きは全部この合成ページ側で描く。
   アプリ本体には手を入れず、iframe の DOM に毎コマ上書きするだけにしてある。 */

import {
  BACKDROP_PREFS, DEFAULT_FPS, DURATION_SECONDS, END_START, FINGER, MARK_PREF, PREF_SEED,
  PREF_START, PROMISE_START, RESULT_START, TAPS, TITLE_START, TOWN_PREF, TOWN_SEED,
  appSceneAt, backdropDrift, captionAt, clamp, easeInOutCubic, easeOutCubic, mix,
  phoneTimeline, progress, revealFadeAt, scrollProgressAt, shapeFadeAt, wikiPhaseAt
} from './timeline.mjs';
import { QUESTION_COUNT, buildRound } from '../../lib/quiz.js';
import { mulberry32 } from '../../lib/rng.js';
import { ringsToPath } from '../../lib/svg.js';
import { STORAGE_NAME } from '../../lib/store.js';

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

/* 場面ごとの「どの種で開き、どのボタンを順に押すか」。appSceneAt(t) のキーと対になっている。
   同じ場面のあいだは読み直さない（場面の切れ目でだけ iframe を開き直す）。 */
const answerSteps = () => {
  const steps = ['start', 'hint'];
  for (let i = 0; i < QUESTION_COUNT; i += 1) {
    if (i > 0) steps.push('next');
    steps.push(`answer:${i}`);
  }
  steps.push('next');
  return steps;
};
const PLANS = {
  'hook-q': { round: 'pref', steps: ['start'], question: 0 },
  'hook-reveal': { round: 'pref', steps: ['start', 'answer:0'], question: 0, wiki: true },
  'pref-q': { round: 'pref', steps: ['start', 'answer:0', 'next'], question: 1 },
  'pref-reveal': { round: 'pref', steps: ['start', 'answer:0', 'next', 'answer:1'], question: 1, wiki: true },
  'town-q': { round: 'town', steps: ['start'], question: 0 },
  'town-hint': { round: 'town', steps: ['start', 'hint'], question: 0 },
  'town-reveal': { round: 'town', steps: ['start', 'hint', 'answer:0'], question: 0, wiki: true },
  // 結果は同じ1ラウンドを最後まで通す。ヒントを1問だけ使うので 9.5 / 10 になる
  'result': { round: 'town', steps: answerSteps(), question: null }
};

const FINGER_GROUPS = (() => {
  const groups = [];
  let current = [];
  for (const key of FINGER) {
    current.push(key);
    if (key.fade) { groups.push(current); current = []; }
  }
  if (current.length > 1) groups.push(current);
  return groups;
})();

const state = { rounds: null, scene: null, started: false, answerCode: null, wikiLoading: '', wikiReady: null };

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

// ---------------------------------------------------------------- 同梱データ

async function readJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`読み込めません: ${path}`);
  return response.json();
}

/* 出題は種で決まるので、合成ページ側でも同じ10問を組み立てて正解を先に知っておく。
   「たまたま外した」映像にならず、指を正解のボタンへ運べる。 */
async function loadRounds() {
  const prefFile = await readJson('../../data/prefectures.json');
  const townFile = await readJson(`../../data/towns/${TOWN_PREF}.json`);
  const prefs = prefFile.items;
  for (const [index, ghost] of ghosts.entries()) {
    const pref = prefs.find(({ code }) => code === BACKDROP_PREFS[index]);
    ghost.querySelector('path').setAttribute('d', ringsToPath(pref?.shape?.rings));
  }
  const mark = prefs.find(({ code }) => code === MARK_PREF);
  for (const node of document.querySelectorAll('.app-mark path')) {
    node.setAttribute('d', ringsToPath(mark?.shape?.rings));
  }
  return {
    pref: buildRound({ mode: 'pref', prefs, rng: mulberry32(PREF_SEED), count: QUESTION_COUNT }),
    town: buildRound({
      mode: 'town', prefs, townsByPref: { [TOWN_PREF]: townFile },
      prefCode: TOWN_PREF, rng: mulberry32(TOWN_SEED), count: QUESTION_COUNT
    })
  };
}

// ---------------------------------------------------------------- 場面の組み立て

function codeOf(roundName, index) {
  return state.rounds[roundName].questions[index].answer.code;
}

async function runStep(step, plan) {
  const doc = appDocument();
  const click = (selector) => {
    const node = doc.querySelector(selector);
    if (!node) throw new Error(`押せる要素がありません: ${selector}`);
    node.click();
    // 実クリックではないのでフォーカスリングは出ないが、念のため外して画を安定させる
    doc.activeElement?.blur?.();
  };
  if (step === 'start') {
    const selector = plan.round === 'pref' ? '#play-pref' : '#play-town';
    await waitUntil(() => doc.querySelector(`${selector}:not([disabled])`), 20_000, 'start 画面が用意できませんでした');
    click(selector);
    await waitForState('playing');
    return;
  }
  if (step === 'hint') { click('#hint-button'); return; }
  if (step === 'next') {
    click('#next-button');
    await waitUntil(() => appState() === 'playing' || appState() === 'result', 20_000, '次の問題へ進めませんでした');
    return;
  }
  if (step.startsWith('answer:')) {
    click(`.choice[data-code="${codeOf(plan.round, Number(step.slice(7)))}"]`);
    await waitForState('reveal');
    return;
  }
  throw new Error(`知らない手順です: ${step}`);
}

async function navigate(key) {
  const plan = PLANS[key];
  const seed = plan.round === 'pref' ? PREF_SEED : TOWN_SEED;
  /* ハッシュやクエリを変えても同じ文書のままだと load が来ないので、場面名を入れて必ず開き直す。
     ベストは端末に残るので、結果画面の「ベスト更新！」が撮る順番で変わらないよう毎回消す。 */
  try { localStorage.removeItem(STORAGE_NAME); } catch { /* 保存できない環境なら何も残っていない */ }
  const query = plan.round === 'pref' ? `seed=${seed}` : `seed=${seed}&p=${TOWN_PREF}`;
  const path = `/index.html?scene=${key}&${query}`;
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
  // 「解説を読み込み中…」はアプリの文言。触る前の初期値を借りて、こちらに写さない
  state.wikiLoading = doc.getElementById('wiki-extract').textContent;
  state.wikiReady = null;
  for (const step of plan.steps) await runStep(step, plan);

  /* 要約は非同期に後から届く。届く前と後で文字が変わるので、出す場面では必ず届くまで待つ。
     固定応答の記事名が出題とずれていると 404 になり「解説は取れませんでした」の画が撮れてしまう。
     それは出題規則を変えたときに必ず起きるので、静かに通さずここで落とす。 */
  if (plan.wiki) {
    const wiki = doc.getElementById('reveal-wiki');
    await waitUntil(() => wiki.dataset.status !== 'loading', 20_000, 'Wikipedia の応答が返りませんでした');
    if (wiki.dataset.status !== 'ready') {
      throw new Error(`Wikipedia の固定応答が出題と合っていません（${key}）。timeline.mjs の WIKI_SUMMARIES に記事名を足してください`);
    }
    state.wikiReady = {
      extract: doc.getElementById('wiki-extract').textContent,
      link: doc.getElementById('wiki-link').href
    };
  }
  state.answerCode = plan.question === null ? null : codeOf(plan.round, plan.question);
  state.scene = key;
  await doc.fonts.ready;
  await twoFrames(appWindow());
}

// ---------------------------------------------------------------- アプリへの上書き

function scrollFor(t) {
  const p = scrollProgressAt(t);
  if (p <= 0) return 0;
  const doc = appDocument();
  const win = appWindow();
  const reveal = doc.getElementById('reveal');
  if (!reveal?.getClientRects().length) return 0;
  const bottom = reveal.getBoundingClientRect().bottom + win.scrollY;
  const max = Math.max(0, doc.documentElement.scrollHeight - win.innerHeight);
  const target = clamp(bottom + SCROLL_MARGIN - win.innerHeight, 0, max);
  return target * p;
}

function overrideApp(t) {
  const doc = appDocument();
  const shape = doc.getElementById('shape');
  const fade = shapeFadeAt(t);
  shape.style.transformOrigin = '50% 50%';
  shape.style.opacity = String(fade);
  shape.style.transform = `scale(${mix(.965, 1, fade).toFixed(4)})`;

  const reveal = doc.getElementById('reveal');
  const revealed = revealFadeAt(t);
  reveal.style.opacity = String(revealed);
  reveal.style.transform = `translate3d(0, ${mix(18, 0, revealed).toFixed(2)}px, 0)`;

  /* 解説の枠は高さが決まっていて「読み込み中→本文」で顔だけ変わる。アプリは正解表示と同時に
     取りに行くが、S4 を見せ場にしたいので、届く時刻（T_WIKI）だけ合成側で決める。
     出すのは市区町村の正解表示だけ。都道府県の2回はアプリのまま（届いた本文をそのまま出す）。 */
  if (state.scene === 'town-reveal' && state.wikiReady) {
    const phase = wikiPhaseAt(t);
    const wiki = doc.getElementById('reveal-wiki');
    const extract = doc.getElementById('wiki-extract');
    const foot = doc.getElementById('wiki-foot');
    wiki.dataset.status = phase > 0 ? 'ready' : 'loading';
    extract.textContent = phase > 0 ? state.wikiReady.extract : state.wikiLoading;
    extract.style.opacity = phase > 0 ? String(phase) : '1';
    foot.toggleAttribute('hidden', phase <= 0);
    foot.style.opacity = String(phase);
  }
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
  const doc = appDocument();
  if (name === 'answer') return state.answerCode ? boxIn(doc.querySelector(`.choice[data-code="${state.answerCode}"]`)) : null;
  if (name === 'hint') {
    // 押すとボタンは消え、同じ行に「県内の位置」の文字が入れ替わりで出る。そちらを代わりの的にする
    return boxIn(doc.querySelector('#hint-button:not([hidden])') ?? doc.querySelector('#hint-text:not([hidden])'));
  }
  if (name === 'post') return boxIn(doc.getElementById('post-score'));
  if (name.startsWith('choice:')) return boxIn(doc.querySelectorAll('.choice')[Number(name.slice(7))]);
  return null;
}

function targetPoint(name) {
  // 投稿ボタンは文字を指で隠さないよう、中央ではなく右寄りを指す
  if (name === 'post') {
    const box = targetBox('post');
    return box ? { x: box.left + box.width * .82, y: box.top + box.height / 2 } : null;
  }
  if (name === 'idle') {
    /* 指の待機位置。画面の下端より外へ出すと字幕の札に隠れて「指が出てこない」ので、
       端末の中の下寄りに置く。横は「これから押す札の真下」にして、1コマ目で
       どのボタンへ向かっているのかが分かるようにしている */
    const frame = frameRect();
    const answer = targetBox('answer');
    return {
      x: answer ? answer.left + answer.width * .5 : frame.left + frame.width * .62,
      y: frame.bottom - 120
    };
  }
  return centerOf(targetBox(name));
}

function setEntrance(node, t, start, duration = .34, { y = 28, scaleFrom = .97 } = {}) {
  const p = progress(t, start, start + duration, easeOutCubic);
  node.style.opacity = t < start ? '0' : String(p);
  node.style.transform = `translate3d(0, ${mix(y, 0, p).toFixed(2)}px, 0) scale(${mix(scaleFrom, 1, p).toFixed(4)})`;
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
  const visible = t >= TITLE_START && t < PREF_START;
  titleScene.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  setEntrance(titleScene.querySelector('.app-mark'), t, TITLE_START + .1, .42, { y: 44, scaleFrom: .86 });
  setEntrance($('main-title'), t, TITLE_START + .42, .38, { y: 36 });
  setEntrance($('main-lead'), t, TITLE_START + .78, .34);
  setEntrance($('challenge-label'), t, TITLE_START + 1.05, .3, { y: 16, scaleFrom: 1 });
  titleScene.style.opacity = String(1 - progress(t, PREF_START - .34, PREF_START, easeInOutCubic));
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

function fingerAt(t) {
  const group = FINGER_GROUPS.find((keys) => t >= keys[0].at && t < keys.at(-1).at);
  if (!group) return null;
  const index = group.findIndex((key, i) => i < group.length - 1 && t >= key.at && t < group[i + 1].at);
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
    y: mix(from.y, to.y, p) - 38 * Math.sin(Math.PI * p),
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
  const point = tap ? targetPoint(tap.kind === 'hint' ? 'hint' : 'answer') : null;
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

/** 正解した選択肢を1周だけ囲う（アプリの緑は静止画で出るので、動きだけ足す） */
function renderChoiceRing(t) {
  const tap = TAPS.find(({ at, kind }) => kind === 'correct' && t >= at && t < at + .8);
  const box = tap ? targetBox('answer') : null;
  if (!box) { choiceRing.style.display = 'none'; return; }
  const p = progress(t, tap.at, tap.at + .8, easeOutCubic);
  choiceRing.style.display = 'block';
  choiceRing.style.left = `${(box.left - 8).toFixed(2)}px`;
  choiceRing.style.top = `${(box.top - 8).toFixed(2)}px`;
  choiceRing.style.width = `${(box.width + 16).toFixed(2)}px`;
  choiceRing.style.height = `${(box.height + 16).toFixed(2)}px`;
  choiceRing.style.opacity = String((1 - p) * .95);
  choiceRing.style.transform = `scale(${mix(1, 1.06, p).toFixed(4)})`;
}

/** 結果画面の「この結果をXに投稿」。押すと本当に x.com が開くので、光らせるだけで押さない */
function renderPostRing(t) {
  const active = state.scene === 'result' && t >= RESULT_START + 2.2 && t < PROMISE_START - .3;
  const box = active ? targetBox('post') : null;
  if (!box) { postRing.style.display = 'none'; return; }
  const pulse = .55 + .45 * Math.sin((t - RESULT_START - 2.2) * Math.PI * 1.5);
  postRing.style.display = 'block';
  postRing.style.left = `${(box.left - 10).toFixed(2)}px`;
  postRing.style.top = `${(box.top - 10).toFixed(2)}px`;
  postRing.style.width = `${(box.width + 20).toFixed(2)}px`;
  postRing.style.height = `${(box.height + 20).toFixed(2)}px`;
  postRing.style.opacity = String(.35 + .5 * pulse);
}

function renderPromise(t) {
  const visible = t >= PROMISE_START && t < END_START;
  promiseScene.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  [...promiseScene.children].forEach((line, index) => (
    setEntrance(line, t, PROMISE_START + .2 + index * 1.05, .4, { y: 32, scaleFrom: .985 })
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
  state.rounds = await loadRounds();
  await document.fonts.ready;
  await navigate(appSceneAt(0));
  await seekInternal(0);
  await twoFrames();
})();

window.__seek = async (seconds) => {
  await window.__promoReady;
  await seekInternal(seconds);
};
