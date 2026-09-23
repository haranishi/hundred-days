// 画面の進行：intro → asking → guessing → won ／ 推測を使い切ったら teaching → taught（教えずに終えたら ended）。
// 推理は lib/oracle.js、端末の記憶は lib/memory.js、読みの輪の見せ方は lib/meter.js に任せる。ここが持つのは「答えの列」と
// 「外れた推測の列」だけで、質問・推測・まぼろし・読みの値は毎回そこから計算し直す（ひとつ戻っても表示がずれない）。
// 例外は読みの軌跡で、これは「そのとき画面に出ていた読み」の履歴なので、答えるたびに積み、戻すたびに降ろす。
import { ANSWERS, CUSTOM_EMOJI, LIMITS, buildModel, newGame, nextStep, answer, undo, reject, deciders, itemOf, reading } from './lib/oracle.js';
import { QUESTIONS } from './lib/questions.js';
import { DISHES } from './lib/dishes.js';
import {
  MEMORY_LIMITS, loadMemory, saveMemory, forgetMemory, emptyMemory, remember, recordPlay, learnedCount,
  searchDishes, findExact, normalizeName,
} from './lib/memory.js';
import {
  answerLabel, questionText, counterText, guessesLeftText, counterSpeech, guessNote, wonHeadline, wonCountText, giveupCountText,
  wonShareText, taughtShareText, xIntentUrl, localDay, dishImage,
} from './lib/view.js';
import { percent, delta, direction, deltaLabel, readingSpeech, trailPoints, trailLine } from './lib/meter.js';

const THINK_MS = 350; // 答えるたびに「考える」顔を見せる長さ
const SURPRISE_MS = 600; // 読みが下がったとき・「ちがう」を押したときの驚いた顔
const CHOSEN_MS = 300; // 押した答えを光らせる長さ。指やキーで答えたときに、どれを選んだかが残る
const MIST_MS = 1400; // 「ちがう」のあと、霧の知らせを読ませる長さ
// 新しい質問が出た直後の答えを受け流す（二度押しで2問進まないように）。
// 体験評価では 90ms と 300ms の2連続タップで2問進んだので、300ms より長くする
const ASK_GUARD_MS = 350;
// 「占ってもらう」の直後の1問目はもう少し長く。開始ボタンのあった位置に答えのボタンが来るので、開始の2連続タップ（260ms）が1問目の答えになった
const START_GUARD_MS = 400;
const GUESS_GUARD_MS = 400; // 推測が出た直後の操作を受け流す（答えの連打がそのまま「当たり」にならないように）
const FINISH_GUARD_MS = 500; // 結果の画面に入った直後の Enter を受け流す（当たりの Enter で次の占いが始まらないように）
const DELTA_MS = 1100; // 前回との差の札を出しておく長さ
const LOSS_MS = 1000; // 失った分の輪を赤く光らせておく長さ
const OPENERS_SLOT = 'day048.oracle.openers.v1'; // 直前の占いの最初の2問（次の出だしで避ける）
const HINT_SLOT = 'day048.oracle.ringhint.v1'; // 読みの輪の説明を出したか
const SESSION_SLOT = 'day048.oracle.session.v1'; // 進行中の占い（再読み込みで続きから遊ぶ）
const SVG_NS = 'http://www.w3.org/2000/svg';

const $ = id => document.getElementById(id);
const app = $('app');
const stage = $('stage');
const ring = $('ring');
const reveal = $('reveal');
const vision = document.querySelector('.vision');
const layers = [...vision.querySelectorAll('.vision__layer')];
const panels = [...document.querySelectorAll('[data-panel]')];
const forgetDialog = $('forget-dialog');
const restartDialog = $('restart-dialog');
const teachInput = $('teach-input');
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

// ?seed=数字 で種を固定する（テスト・デモ用）。無ければ時刻から
const seedParam = new URLSearchParams(location.search).get('seed');
const fixedSeed = seedParam !== null && /^\d{1,10}$/.test(seedParam) ? Number(seedParam) >>> 0 : null;
let seed = fixedSeed ?? (Date.now() >>> 0);
let played = 0;

let storage = null;
try {
  storage = window.localStorage;
} catch {
  // 保存を拒否する設定。loadMemory が available=false として扱う
}
let sessionStore = null;
try {
  sessionStore = window.sessionStorage;
} catch {
  // 続きから遊べないだけ
}
const known = { dishIds: new Set(DISHES.map(dish => dish.id)), questionIds: new Set(QUESTIONS.map(question => question.id)) };
const loaded = loadMemory(storage, known);
const storageState = { available: loaded.available, repaired: loaded.repaired };
let memory = loaded.memory;
// 読めた分だけで書き戻す。そのままだと、開くたびに「読めなかった」と知らせ続けてしまう
if (loaded.repaired) saveMemory(storage, memory);
let repairNotice = loaded.repaired;

let model = buildModel(memory);
let game = newGame(seed);
let step = null;
let read = { value: 0, id: null }; // いまの読み（輪の値と、水晶玉に映す料理）
let shown = null; // 輪にいま出している読み。前回との差の札はここから取る
let trail = []; // 読みの軌跡。trail[0] は答える前、trail[i] は i 問目に答えた直後の読み
let meterCause = null; // 次に輪を描く理由（answer・miss・undo・reset）
let state = 'intro';
let busy = false; // 霧の知らせを出している間。操作は受け付けない
let upcoming = null; // 霧が明けたあとの一手
let result = null;
let teachTouched = false;
let guardUntil = 0; // この時刻までは、答え・推測への操作を受け流す
let finishGuardUntil = 0;
let hintOn = false;
let hintTaken = false;
let justStarted = false; // 「占ってもらう」の直後で、まだ1問目を出していない
let openers = [];
let thinkTimer = 0;
let chosenTimer = 0;
let mistTimer = 0;
let deltaTimer = 0;
let lossTimer = 0;
let shownArt = null;
let revealedArt = null;
let preloadedLead = null;
let shownQuestion = null;
let activeLayer = 0;
const broken = new Set(); // 読めなかった絵。以後は最初から絵文字で出す
const preloaded = new Set();

// ---------------------------------------------------------------- 端末に置く小さな記録（どれも失敗したら無視して遊べるようにする）

// 直前の占いの最初の2問。保存が使えないときは null を返し、このタブの中の記録で代える
function readOpeners() {
  try {
    const raw = JSON.parse(storage.getItem(OPENERS_SLOT) ?? '[]');
    return Array.isArray(raw) ? raw.filter(id => known.questionIds.has(id)).slice(0, 2) : [];
  } catch {
    return null;
  }
}

function saveOpeners() {
  openers = game.answers.slice(0, 2).map(entry => entry.q);
  try {
    storage.setItem(OPENERS_SLOT, JSON.stringify(openers));
  } catch {
    // 端末をまたいで効かないだけ
  }
}

// 読みの輪の説明は、この端末で1回だけ。保存できない端末では、このタブで1回だけ
function takeHint() {
  if (hintTaken) return false;
  hintTaken = true;
  try {
    if (storage.getItem(HINT_SLOT)) return false;
    storage.setItem(HINT_SLOT, '1');
  } catch {
    // 覚えられない端末。このタブでは二度と出さない
  }
  return true;
}

function saveSession() {
  try {
    if (state === 'asking' || state === 'guessing' || state === 'teaching') {
      const { answers, rejected, avoid, missAt } = game;
      sessionStore.setItem(SESSION_SLOT, JSON.stringify({ v: 1, seed: game.seed, played, answers, rejected, avoid, missAt: missAt ?? null, trail }));
    } else sessionStore.removeItem(SESSION_SLOT);
  } catch {
    // 再読み込みで最初からになるだけ
  }
}

// 保存してあった占いを検証する。答えは oracle の answer() で積み直すので、知らない答えや重複はここで弾かれる
function checkSession(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
  const { answers, rejected, avoid, missAt } = raw;
  if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xffffffff) return null;
  if (!Number.isInteger(raw.played) || raw.played < 1 || raw.played > 1e6) return null;
  if (!Array.isArray(answers) || answers.length > LIMITS.maxQuestions) return null;
  if (!Array.isArray(rejected) || rejected.length > LIMITS.maxGuesses || !rejected.every(id => model.index.has(id))) return null;
  if (!Array.isArray(avoid) || avoid.length > 2 || !avoid.every(id => known.questionIds.has(id))) return null;
  let rebuilt;
  try {
    rebuilt = newGame(raw.seed, { avoid });
    for (const entry of answers) {
      if (!known.questionIds.has(entry?.q)) return null;
      rebuilt = answer(rebuilt, entry.q, entry.a);
    }
    for (const id of rejected) rebuilt = reject(rebuilt, id);
  } catch {
    return null;
  }
  if (rebuilt.rejected.length) {
    if (!Number.isInteger(missAt) || missAt < 0 || missAt > answers.length) return null;
    rebuilt = { ...rebuilt, missAt };
  }
  const path = raw.trail;
  const trailOk = Array.isArray(path) && path.length === answers.length + 1
    && path.every(entry => entry && Number.isFinite(entry.v) && entry.v >= 0 && entry.v <= 1 && (entry.id === null || model.index.has(entry.id)));
  return { game: rebuilt, played: raw.played, trail: trailOk ? path.map(entry => ({ v: entry.v, id: entry.id })) : null };
}

// 軌跡が壊れていたときだけ、いまの外れの列で読みを計算し直す（外す前の点は少し変わるが、遊ぶのには困らない）
function rebuildTrail() {
  return Array.from({ length: game.answers.length + 1 }, (_, count) => {
    const now = reading(model, { ...game, answers: game.answers.slice(0, count) });
    return { v: now.value, id: now.id };
  });
}

function restoreSession() {
  let saved = null;
  try {
    const text = sessionStore.getItem(SESSION_SLOT);
    if (text !== null) saved = checkSession(JSON.parse(text));
    if (text !== null && !saved) sessionStore.removeItem(SESSION_SLOT);
  } catch {
    saved = null;
  }
  if (!saved) return false;
  game = saved.game;
  seed = game.seed;
  played = saved.played;
  step = nextStep(model, game);
  read = reading(model, game, step);
  trail = saved.trail ?? rebuildTrail();
  meterCause = 'reset';
  setState(stateOf(step));
  return true;
}

// ---------------------------------------------------------------- 進行

function stateOf(next) {
  return next.type === 'ask' ? 'asking' : next.type === 'guess' ? 'guessing' : 'teaching';
}

function startGame() {
  clearTimeout(mistTimer);
  shownQuestion = null;
  busy = false;
  upcoming = null;
  if (played > 0) seed = fixedSeed === null ? Date.now() >>> 0 : (seed + 1) >>> 0;
  played += 1;
  repairNotice = false;
  $('memory-said').textContent = '';
  model = buildModel(memory);
  // 直前の占いの出だしを避けて、続けて遊んでも同じ質問から始まらないようにする
  game = newGame(seed, { avoid: readOpeners() ?? openers });
  result = null;
  trail = [];
  hintOn = takeHint();
  justStarted = true;
  meterCause = 'reset';
  announce('');
  proceed();
}

function proceed() {
  step = nextStep(model, game);
  read = reading(model, game, step);
  // 軌跡は答えた問数＋1件（答える前の読み）。戻したときは降ろし、答えたときだけ積む
  trail = trail.slice(0, game.answers.length + 1);
  if (trail.length <= game.answers.length) trail.push({ v: read.value, id: read.id });
  setState(stateOf(step));
}

function setState(next) {
  const entering = next !== state;
  state = next;
  if (next === 'guessing') guardUntil = performance.now() + GUESS_GUARD_MS;
  if (entering && (next === 'won' || next === 'taught' || next === 'ended')) finishGuardUntil = performance.now() + FINISH_GUARD_MS;
  if (entering && next === 'teaching') resetTeachForm();
  if (entering) {
    $('result-said').textContent = '';
    // 前の画面の読み上げ（質問や霧の知らせ）が残らないようにする。新しい画面は見出しへ焦点を移して読ませる
    announce('');
  }
  render();
  if (next === 'guessing') replay($('guess-title'), 'is-revealing');
  if (entering) {
    if (window.scrollY > 0) window.scrollTo(0, 0);
    focusHeading();
  }
}

function focusHeading() {
  const target = { intro: 'start', asking: 'question', guessing: 'guess-title', won: 'won-title', teaching: 'teach-title', taught: 'taught-title', ended: 'ended-title' }[state];
  $(target)?.focus({ preventScroll: true });
}

function announceQuestion(change = null) {
  announce(`${readingSpeech(read.value, change)}。${counterSpeech(game.answers.length, game.rejected.length)}。それは、${questionText(step.q)}`);
}

function onAnswer(id) {
  if (state !== 'asking' || busy || step?.type !== 'ask' || performance.now() < guardUntil) return;
  const before = shown;
  game = answer(game, step.q, id);
  if (game.answers.length <= 2) saveOpeners();
  hintOn = false;
  markChosen(id);
  meterCause = 'answer';
  proceed();
  const change = delta(before, read.value);
  // 読みが下がった答えには、占い師が短く驚く
  if (change !== null && change < 0) flash('surprised', SURPRISE_MS);
  else flash('thinking', THINK_MS);
  if (state === 'asking') announceQuestion(change);
}

function markChosen(id) {
  clearTimeout(chosenTimer);
  for (const button of $('answers').children) button.classList.toggle('is-chosen', button.dataset.answer === id);
  chosenTimer = setTimeout(() => {
    for (const button of $('answers').children) button.classList.remove('is-chosen');
  }, CHOSEN_MS);
}

function onBack() {
  if (busy || !game.answers.length || (state !== 'asking' && state !== 'guessing')) return;
  const was = state;
  game = undo(game);
  meterCause = 'undo';
  proceed();
  if (was === 'asking' && state === 'asking') announceQuestion();
  // 1問目まで戻ると「ひとつ戻る」は押せなくなる。焦点が行き場を失わないよう質問へ移す
  if (document.activeElement === $('back') && $('back').disabled) $('question').focus({ preventScroll: true });
}

function onGuessYes() {
  if (state !== 'guessing' || busy || performance.now() < guardUntil) return;
  const id = step.id;
  const item = itemOf(model, id);
  const reasons = deciders(model, game, id);
  let saved = false;
  try {
    memory = recordPlay(remember(memory, { id }, game.answers, localDay()).memory, true);
    saved = saveMemory(storage, memory);
  } catch {
    saved = false;
  }
  result = { kind: 'won', name: item.name, art: artOf(item), count: game.answers.length, guesses: game.rejected.length + 1, suggest: Boolean(step.suggest), reasons, saved };
  setState('won');
}

function onGuessNo() {
  if (state !== 'guessing' || busy || performance.now() < guardUntil) return;
  const before = shown;
  game = reject(game, step.id);
  const next = nextStep(model, game);
  meterCause = 'miss';
  if (next.type === 'ask') {
    busy = true;
    upcoming = next;
    read = reading(model, game, next);
    render(); // 驚いた顔と、下がった読み（赤く光って縮む輪）を霧の知らせと一緒に見せる
    announce(`${readingSpeech(read.value, delta(before, read.value))}。まだ霧が晴れません。もう少し聞かせてください。`);
    mistTimer = setTimeout(() => {
      busy = false;
      upcoming = null;
      step = next;
      setState('asking');
    }, MIST_MS);
    return;
  }
  step = next;
  read = reading(model, game, next);
  // 質問を出し尽くしたあとなどは、続けて次の推測か参りましたになる。驚いた顔を挟んで、外れたことを見せる
  flash('surprised', SURPRISE_MS);
  if (next.type === 'guess') {
    setState('guessing');
    $('guess-title').focus({ preventScroll: true });
  } else setState('teaching');
}

function teach(target) {
  let saved = false;
  try {
    memory = recordPlay(remember(memory, target, game.answers, localDay()).memory, false);
    saved = saveMemory(storage, memory);
  } catch {
    saved = false;
  }
  const item = target.id ? itemOf(model, target.id) : null;
  const name = item ? item.name : normalizeName(target.name).name;
  // 一覧に無い料理は、次の占いで model に入るまで item が無い。覆いをかけた皿の絵で出す
  const art = item ? artOf(item) : { key: `new:${name}`, src: dishImage({ custom: true }), emoji: CUSTOM_EMOJI, name };
  result = { kind: 'taught', name, art, count: game.answers.length, saved };
  setState('taught');
}

// 教えずに終える。いきなり始めの画面に戻さず、結果の共有とやり直しを出す
function endWithoutTeaching() {
  if (state !== 'teaching') return;
  result = { kind: 'ended', count: game.answers.length, guesses: game.rejected.length };
  setState('ended');
}

// 「最初から」。3問以上答えていたら、答えが消えることを確かめてから
function requestRestart() {
  if ((state === 'asking' || state === 'guessing') && game.answers.length >= 3) {
    restartDialog.showModal();
    return;
  }
  restart();
}

function restart() {
  clearTimeout(mistTimer);
  shownQuestion = null;
  busy = false;
  upcoming = null;
  hintOn = false;
  setState('intro');
}

// ---------------------------------------------------------------- 表示

function render() {
  app.dataset.state = state;
  app.dataset.busy = String(busy);
  for (const panel of panels) panel.hidden = panel.dataset.panel !== state;
  const finished = state === 'won' || state === 'taught' || state === 'ended';
  $('finale').hidden = !finished;
  $('aux').hidden = state === 'intro' || state === 'teaching';
  $('back').hidden = finished;
  $('back').disabled = busy || game.answers.length === 0;
  if (state === 'intro') renderIntro();
  if (state === 'asking') renderAsking();
  if (state === 'guessing') renderGuessing();
  if (state === 'won') renderWon();
  if (state === 'taught') renderTaught();
  if (state === 'ended') $('ended-count').textContent = giveupCountText(result.count, result.guesses);
  if (finished) $('result-x').href = xIntentUrl(resultText(), shareUrl());
  $('ring-hint').hidden = !(hintOn && state === 'asking' && game.answers.length === 0);
  renderStage();
  renderMeter();
  renderReveal();
  saveSession();
}

function renderIntro() {
  const count = learnedCount(memory);
  $('memory').hidden = !(storageState.available && count > 0);
  $('learned').textContent = `${count}品`;
  $('storage-off').hidden = storageState.available;
  const repaired = $('storage-repaired');
  repaired.hidden = !repairNotice;
  // 一部だけ読めたときは、覚えている分が残っているので「まっさら」とは言わない
  repaired.textContent = count > 0
    ? '覚えていた記録の一部が読めなかったので、その分は忘れました。'
    : '覚えていた記録が読めなかったので、まっさらからにしました。';
}

function renderAsking() {
  $('counter').textContent = counterText(game.answers.length);
  $('guesses-left').textContent = guessesLeftText(game.rejected.length);
  $('question-text').textContent = questionText(step.q);
  if (step.q !== shownQuestion) {
    // 質問が替わったことを、押した答えが光るのと同時に見せる（光ったボタンが次の質問への答えに見えないように）
    replay($('question-text'), 'is-new');
    guardUntil = performance.now() + (justStarted ? START_GUARD_MS : ASK_GUARD_MS);
  }
  justStarted = false;
  shownQuestion = step.q;
  renderTrail();
}

function renderTrail() {
  const points = trailPoints(trail);
  $('trail-line').setAttribute('points', trailLine(points));
  $('trail-points').replaceChildren(...points.flatMap(point => {
    const dot = svg('circle', { class: point.dropped ? 'trail__point is-down' : 'trail__point', cx: point.x, cy: point.y, r: point.dropped ? 2.2 : 1.5 });
    return point.switched ? [svg('circle', { class: 'trail__switch', cx: point.x, cy: point.y, r: 3.2 }), dot] : [dot];
  }));
}

function renderGuessing() {
  const note = guessNote(game.rejected.length, Boolean(step.final));
  $('guess-note').textContent = note;
  $('guess-note').hidden = busy || !note;
  // 気分で答えている人（「たぶん」「わからない」が半分以上）への推測は、心を読んだ答えではなく提案として出す
  $('guess-lead').textContent = step.suggest ? '迷っているなら……' : 'あなたの心にあるのは……';
  $('guess-title').hidden = busy;
  $('guess-mist').hidden = !busy;
  $('guess-name').textContent = itemOf(model, step.id)?.name ?? '';
  for (const id of ['guess-yes', 'guess-no']) $(id).setAttribute('aria-disabled', String(busy));
}

function renderWon() {
  const { lead, tail } = wonHeadline(result.guesses);
  $('won-title').replaceChildren(span('phrase', lead), span('phrase', span('name', result.name), tail));
  $('won-suggest').hidden = !result.suggest;
  $('won-count').textContent = wonCountText(result.count, result.guesses);
  $('deciders').hidden = result.reasons.length === 0;
  $('decider-list').replaceChildren(...result.reasons.map(({ q, a }) => {
    const arrow = span('arrow', '→ ');
    arrow.setAttribute('aria-hidden', 'true');
    const row = document.createElement('li');
    row.append(span('decider__q', `${questionText(q)} `), span('decider__a', arrow, span('reply', answerLabel(a))));
    return row;
  }));
  $('won-memory').textContent = result.saved ? 'この答え方を覚えました。次はもっと早く読めます。' : 'この端末では覚えられませんでした。';
}

// 句ごとに包んで、「次は「／ばあちゃんの煮しめ」も読め／ます。」のような折り返しを防ぐ。かっこは中身とくっつける。
// 「覚えました。」のあとは必ず改行する（広い画面で「…」も／読めます。」と最後だけ落ちるのを防ぐ）
function renderTaught() {
  const name = span('name', result.name);
  if (result.saved) $('taught-title').replaceChildren(span('phrase phrase--line', '覚えました。'), span('chunk', '次は'), span('chunk', '「', name, '」も'), span('chunk', '読めます。'));
  else $('taught-title').replaceChildren(span('chunk', '「', name, '」'), span('chunk', 'でしたか。'));
  $('taught-memory').hidden = result.saved;
}

function baseMood() {
  if (state === 'asking') return read.value >= 0.6 ? 'confident' : 'idle';
  if (state === 'guessing') return busy ? 'surprised' : 'reveal';
  if (state === 'won') return 'confident';
  if (state === 'teaching' || state === 'taught' || state === 'ended') return 'defeated';
  return 'idle';
}

// 表情を短く切り替えてから戻す。動きを減らす設定では、CSS 側で切り替えが瞬時になる
function flash(mood, ms) {
  clearTimeout(thinkTimer);
  stage.dataset.mood = mood;
  thinkTimer = setTimeout(() => {
    thinkTimer = 0;
    stage.dataset.mood = baseMood();
  }, ms);
}

function renderStage() {
  if (!thinkTimer) stage.dataset.mood = baseMood();
  let mode = 'hidden';
  let art = null;
  let clarity = 0;
  if (state === 'asking' || (state === 'guessing' && busy)) {
    // 映すのは reading() の料理（答えと2つ以上食い違う料理は推測しないので、映すと推測と食い違う）
    const item = read.id ? itemOf(model, read.id) : null;
    if (item) {
      art = artOf(item);
      mode = 'haze';
      // 読みの値そのままでは、半ばまでぼかしが強く残って形が読めない。平方根にして見え始めを早める
      clarity = Math.sqrt(read.value);
    }
    const lead = read.id ?? (busy ? upcoming : step).ranked[0]?.id;
    if (lead !== preloadedLead) {
      preloadedLead = lead;
      // 次に推測・まぼろしで出そうな上位3品の絵を先に読んでおく
      preload([read.id, ...(busy ? upcoming : step).ranked.slice(0, 3).map(entry => entry.id)]);
    }
  } else if (state === 'guessing' || state === 'won') {
    art = artOf(itemOf(model, step.id));
    mode = 'clear';
  } else if (state === 'taught') {
    art = result.art;
    mode = 'clear';
  }
  vision.dataset.mode = mode;
  stage.style.setProperty('--clarity', clarity.toFixed(3));
  if (art && art.key !== shownArt) {
    // 映す料理が入れ替わったら、裏の層に描いて重ね替える（CSS の opacity の遷移でクロスフェード）
    const next = 1 - activeLayer;
    paint(layers[next], art);
    layers[next].classList.add('is-on');
    layers[activeLayer].classList.remove('is-on');
    activeLayer = next;
    shownArt = art.key;
  }
}

// 読みの輪・「読み 63%」・前回との差の札
function renderMeter() {
  const cause = meterCause;
  meterCause = null;
  if (state !== 'asking' && state !== 'guessing') {
    shown = null;
    return;
  }
  const value = read.value;
  const previous = shown;
  // 差の札は、答えたときと外れたとき（質問に戻るとき）だけ。戻す操作と始めは値だけ切り替える
  const change = cause === 'answer' || (cause === 'miss' && value < 1) ? delta(previous, value) : null;
  // 下がった答え・外れでは金の輪を先に切って赤い輪で失った分を見せる。ひとつ戻したときは、上下どちらもなめらかに動かす
  ring.dataset.dir = cause === 'reset' || previous === null ? 'reset' : change !== null && change < 0 ? 'down' : 'up';
  ring.dataset.empty = String(percent(value) === 0);
  $('ring-fill').style.strokeDashoffset = String(100 - percent(value));
  ring.classList.toggle('is-full', value >= 1);
  $('reading-value').textContent = `${percent(value)}%`;
  if (change !== null && change < 0) showLoss(previous, value);
  if (change !== null) showDelta(change);
  shown = value;
}

// 失った分の輪を赤く光らせてから縮める。金の輪は先に新しい値へ切ってあるので、赤い部分が失った分になる
function showLoss(from, to) {
  if (calm.matches) return;
  const loss = $('ring-loss');
  clearTimeout(lossTimer);
  loss.classList.remove('is-losing');
  loss.style.transition = 'none';
  loss.style.strokeDashoffset = String(100 - percent(from));
  void loss.getBoundingClientRect();
  loss.style.transition = '';
  loss.classList.add('is-losing');
  loss.style.strokeDashoffset = String(100 - percent(to));
  lossTimer = setTimeout(() => loss.classList.remove('is-losing'), LOSS_MS);
}

function showDelta(change) {
  const chip = $('delta');
  chip.textContent = deltaLabel(change);
  chip.dataset.dir = direction(change);
  clearTimeout(deltaTimer);
  chip.classList.remove('is-shown');
  void chip.offsetWidth;
  chip.classList.add('is-shown');
  deltaTimer = setTimeout(() => chip.classList.remove('is-shown'), DELTA_MS);
}

// 推測・結果の画面で、料理の絵を玉から浮かび上がらせる。ここでだけ料理名を代替テキストにする
function renderReveal() {
  let art = null;
  if (state === 'guessing' && !busy) art = artOf(itemOf(model, step.id));
  else if (state === 'won' || state === 'taught') art = result.art;
  reveal.classList.toggle('is-shown', Boolean(art));
  reveal.setAttribute('aria-hidden', String(!art));
  if (!art) {
    reveal.classList.remove('is-rising');
    revealedArt = null;
    return;
  }
  if (art.key !== revealedArt) {
    paint($('reveal-art'), art, art.name);
    replay(reveal, 'is-rising');
    revealedArt = art.key;
  }
}

function artOf(item) {
  return { key: item.id, src: dishImage(item), emoji: item.emoji, name: item.name };
}

// 料理の絵を入れる。読めなければその場で絵文字に差し替え、以後その絵は最初から絵文字で出す。
// label があるときだけ代替テキストにし、無ければ飾りとして読み上げから外す
function paint(holder, art, label = '') {
  const emoji = span('art__emoji', art.emoji);
  if (label) {
    emoji.setAttribute('role', 'img');
    emoji.setAttribute('aria-label', label);
  } else emoji.setAttribute('aria-hidden', 'true');
  if (broken.has(art.src)) {
    holder.replaceChildren(emoji);
    return;
  }
  const img = Object.assign(document.createElement('img'), { className: 'art__img', alt: label, decoding: 'async', width: 320, height: 320 });
  img.addEventListener('error', () => {
    broken.add(art.src);
    img.remove();
    emoji.hidden = false;
  }, { once: true });
  img.src = art.src;
  emoji.hidden = true;
  holder.replaceChildren(img, emoji);
}

function preload(ids) {
  for (const id of [...new Set(ids.filter(Boolean))].slice(0, 3)) {
    const item = itemOf(model, id);
    if (!item) continue;
    const src = dishImage(item);
    if (preloaded.has(src) || broken.has(src)) continue;
    preloaded.add(src);
    const img = new Image();
    img.addEventListener('error', () => broken.add(src), { once: true });
    img.src = src;
  }
}

function span(className, ...children) {
  const node = document.createElement('span');
  node.className = className;
  node.append(...children);
  return node;
}

function svg(name, attributes) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function replay(node, className) {
  node.classList.remove(className);
  void node.offsetWidth; // 同じ要素のまま中身だけ替わったとき（次の質問・続けての推測）も、出てくる動きをやり直す
  node.classList.add(className);
}

function announce(text) {
  $('live').textContent = text;
}

// ---------------------------------------------------------------- 教える

function resetTeachForm() {
  teachInput.value = '';
  teachTouched = false;
  renderTeachForm();
}

function renderTeachForm(submitted = false) {
  const value = teachInput.value;
  const name = normalizeName(value);
  const ids = searchDishes(model, value);
  $('candidates').replaceChildren(...ids.map(id => {
    const item = itemOf(model, id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'candidate';
    button.dataset.id = id;
    const picture = span('art candidate__art');
    picture.setAttribute('aria-hidden', 'true');
    paint(picture, artOf(item));
    button.append(picture, item.name);
    const row = document.createElement('li');
    row.append(button);
    return row;
  }));
  $('candidates-label').hidden = ids.length === 0;
  const submit = $('teach-new');
  submit.disabled = !name.ok;
  submit.textContent = name.ok ? `「${name.name}」として教える` : 'この名前で教える';
  let error = '';
  if (name.reason === 'long') error = `${MEMORY_LIMITS.nameLength}文字以内で入れてください。`;
  // 空のときは、一度書いてから消したか、空のまま決めようとしたときだけ知らせる
  else if (name.reason === 'empty' && (submitted || teachTouched)) error = '料理の名前を入れてください。';
  $('teach-error').textContent = error;
  teachInput.setAttribute('aria-invalid', String(Boolean(error)));
}

function submitTeach() {
  const name = normalizeName(teachInput.value);
  if (!name.ok) {
    renderTeachForm(true);
    teachInput.focus();
    return;
  }
  const id = findExact(model, name.name);
  teach(id ? { id } : { name: name.name });
}

// ---------------------------------------------------------------- 共有

// 公開URLはビルドが <link rel="canonical"> に入れる。手元で開いたときは今いるURL
function shareUrl() {
  return document.querySelector('link[rel="canonical"]')?.href || location.href;
}

function resultText() {
  return result.kind === 'won' ? wonShareText(result.name, result.count) : taughtShareText(result.count);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // クリップボードAPIが使えない環境向け
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

// ---------------------------------------------------------------- 操作

$('start').addEventListener('click', startGame);
$('again').addEventListener('click', startGame);
$('restart').addEventListener('click', requestRestart);
$('restart-cancel').addEventListener('click', () => restartDialog.close());
$('restart-confirm').addEventListener('click', () => {
  restartDialog.close();
  restart();
});
$('teach-skip').addEventListener('click', endWithoutTeaching);
$('back').addEventListener('click', onBack);
$('guess-yes').addEventListener('click', onGuessYes);
$('guess-no').addEventListener('click', onGuessNo);
$('answers').addEventListener('click', event => {
  const button = event.target.closest('button[data-answer]');
  if (button) onAnswer(button.dataset.answer);
});
$('candidates').addEventListener('click', event => {
  const button = event.target.closest('button[data-id]');
  if (button && state === 'teaching') teach({ id: button.dataset.id });
});
teachInput.addEventListener('input', () => {
  if (teachInput.value) teachTouched = true;
  renderTeachForm();
});
// 日本語入力の変換確定の Enter では決めない
teachInput.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  submitTeach();
});
$('teach-form').addEventListener('submit', event => {
  event.preventDefault();
  submitTeach();
});
$('result-copy').addEventListener('click', async () => {
  const text = `${resultText()}\n${shareUrl()}`;
  const ok = await copyText(text);
  $('result-said').textContent = ok ? '結果をコピーしました' : `コピーできませんでした。次の文を選んでコピーしてください：${text}`;
});
$('forget').addEventListener('click', () => forgetDialog.showModal());
$('forget-cancel').addEventListener('click', () => forgetDialog.close());
$('forget-confirm').addEventListener('click', () => {
  const ok = forgetMemory(storage);
  if (ok) {
    memory = emptyMemory();
    model = buildModel(memory);
  }
  forgetDialog.close();
  $('memory-said').textContent = ok ? '覚えたことを忘れさせました。' : '記録を消せませんでした。';
  render();
  $('start').focus({ preventScroll: true });
});

document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (document.querySelector('dialog[open]')) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, [contenteditable]')) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  // ボタンやリンクの上の Enter は、その部品の働きを優先する
  const onControl = Boolean(target?.closest('button, a'));
  if (state === 'intro') {
    if (key !== '1' && (key !== 'Enter' || onControl)) return;
    event.preventDefault();
    if (!event.repeat) startGame();
    return;
  }
  if (state === 'won' || state === 'taught' || state === 'ended') {
    if (key !== 'Enter' || onControl) return;
    event.preventDefault();
    if (!event.repeat && performance.now() >= finishGuardUntil) startGame();
    return;
  }
  if ((state === 'asking' || state === 'guessing') && (key === 'Backspace' || key === 'z')) {
    event.preventDefault();
    if (!event.repeat) onBack();
    return;
  }
  if (state === 'asking') {
    const index = ['1', '2', '3', '4', '5'].indexOf(key);
    if (index < 0) return;
    event.preventDefault();
    if (!event.repeat) onAnswer(ANSWERS[index].id);
    return;
  }
  if (state !== 'guessing' || !['y', 'n', 'Enter'].includes(key)) return;
  if (key === 'Enter' && onControl) return;
  event.preventDefault();
  if (event.repeat) return;
  if (key === 'n') onGuessNo();
  else onGuessYes();
});

// ---------------------------------------------------------------- テスト・デモ用の窓口

window.__day048 = {
  snapshot: () => {
    const now = state !== 'intro' && step ? (busy ? upcoming : step) : null;
    const top = now?.ranked?.[0] ?? null;
    const finished = state === 'won' || state === 'taught' || state === 'ended';
    return {
      state,
      count: game.answers.length,
      answers: game.answers.map(entry => entry.a),
      q: state === 'asking' && step?.type === 'ask' ? step.q : null,
      guesses: game.rejected.length,
      guess: state === 'guessing' && !busy ? step.id : null,
      suggest: state === 'guessing' && !busy ? Boolean(step.suggest) : false,
      top: top ? { id: top.id, p: top.p } : null,
      reading: { value: read.value, id: read.id },
      points: Math.max(0, trail.length - 1),
      accepting: performance.now() >= (finished ? finishGuardUntil : guardUntil),
      learned: learnedCount(memory),
      storage: { ...storageState },
      busy,
    };
  },
  model: () => model,
  // 答えの列そのもの（写し）。E2E が「読みを下げる答え」を画面と同じ推理で探すのに使う
  game: () => JSON.parse(JSON.stringify(game)),
};

if (!restoreSession()) render();
document.documentElement.dataset.ready = 'true';
