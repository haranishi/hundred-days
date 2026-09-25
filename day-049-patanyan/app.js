import { nextGoal, courseBest, goalLabel, resultGoal, collisionReason } from './lib/feedback.js';
import { skyForScore } from './lib/sky.js';
import { PHYS, WORLD } from './lib/physics.js';
import { createGame, queueFlap, advanceTo, drainEvents, snapshot, CRASH } from './lib/game.js';
import { createFrameClock } from './lib/loop.js';
import { computeLayout } from './lib/layout.js';
import { drawScene } from './lib/render.js';
import { drawCat } from './lib/cat.js';
import { drawNumber, numberWidth } from './lib/digits.js';
import { drawResultCard, drawStamp, CARD } from './lib/card.js';
import { createStore, recordRun, STAMPS } from './lib/storage.js';
import { CATS, catById, isUnlocked, nextUnlock, newlyUnlocked } from './lib/cats.js';
import { shareText, shareUrl, intentX, intentLine, modeLabel, cardFileName } from './lib/share.js';
import { SITE_URL } from './lib/site.js';
import { jstDateKey, parseCourseParam, dateLabel } from './lib/date.js';
import { randomSeed } from './lib/rng.js';
import { createAudio } from './lib/audio.js';
import { initialUi, onTap, onButton, onCrash, onResult, onHide, onTick, isResultReady, TIMING } from './lib/state.js';

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

let storage = null;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const store = createStore(storage);
let profile = store.load();

const todayKey = jstDateKey(Date.now());
const linkKey = parseCourseParam(params.get('course'));
const courseKey = linkKey ?? todayKey;
let mode = linkKey ? 'daily' : profile.mode;
let fixedSeed = TEST && /^\d+$/.test(params.get('seed') || '') ? Number(params.get('seed')) >>> 0 : null;

const audio = createAudio({
  createContext: () => new (window.AudioContext || window.webkitAudioContext)(),
});
audio.setMuted(profile.muted);

const canvas = $('#game');
const ctx = canvas.getContext('2d');
const stage = $('#stage');
let layout = computeLayout(window.innerWidth || 390, window.innerHeight || 844);
let dpr = 1;

let ui = initialUi();
let game = null;
let gameClock = 0;
let runBest = 0;
let goalAt = -Infinity;
let skyFrom = skyForScore(0);
let skySince = 0;
let appTime = 0;
let manual = false;
let crashAt = 0;
let landedAt = null;
let resultUnlocked = false;
let lastRun = null;
let opener = null;
let card = null;
const pendingReal = [];
const clock = createFrameClock();

function seedNow() {
  return mode === 'daily' ? courseKey : fixedSeed ?? randomSeed();
}

function newGame() {
  game = createGame({ seed: seedNow(), idleBob: motion.matches ? 0 : 4, skyTop: layout.skyTop });
  gameClock = 0;
  runBest = courseBest(profile, mode, courseKey);
  goalAt = -Infinity;
  skyFrom = skyForScore(0);
  skySince = 0;
  landedAt = null;
}

function save() {
  store.save(profile);
}

function label() {
  return modeLabel({ mode, dateKey: courseKey, todayKey });
}

// ---------------------------------------------------------------- 画面の大きさ
function resize() {
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  layout = computeLayout(vw, vh);
  // 天井は画面の上端。画面の大きさが変わったら飛行中でも合わせる
  if (game) game.skyTop = layout.skyTop;
  const L = layout;
  const box = L.side ? { x: 0, y: 0, w: vw, h: vh } : { x: L.playX, y: L.playY, w: L.playW, h: L.playH };
  Object.assign(stage.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
  document.body.classList.toggle('layout-side', L.side);
  const catY = L.playY - box.y + (L.ceilingY + WORLD.bandH / 2 - L.titleLift) * L.scale;
  stage.style.setProperty('--cat-y', `${catY}px`);
  stage.style.setProperty('--cat-clear', `${38 * L.scale}px`);
  stage.style.setProperty('--gap-w', `${L.playW}px`);
  stage.style.setProperty('--u', String(L.scale));
  if (ui.screen === 'result' && lastRun) {
    paintResultCanvases(lastRun);
    placeResult();
  }
  draw();
}

// 主ボタンは下半分に置く。カードが長い小さな画面ではカードの下まで下げて重ならないようにする
function placeResult() {
  const actions = $('.result__actions');
  if (layout.side) {
    actions.style.top = '';
    return;
  }
  const card = $('.result__card');
  const below = card.offsetTop + card.offsetHeight + 10;
  actions.style.top = `${Math.max(below, stage.clientHeight / 2 + 10)}px`;
}

// ---------------------------------------------------------------- 描画
function draw() {
  const L = layout;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.setTransform(dpr * L.scale, 0, 0, dpr * L.scale, dpr * L.playX, dpr * L.playY);
  const S = game.steps * PHYS.dt;
  const a = manual ? 1 : Math.max(0, Math.min(1, 1 - (S - gameClock) / PHYS.dt));
  drawScene(ctx, L, game, {
    rt: manual ? S : gameClock,
    a,
    appTime,
    goalAt, skyFrom, skySince,
    reduced: motion.matches,
    pattern: profile.cat,
    hud: ui.screen === 'flying' || ui.screen === 'crashing',
  });
}

function fitCanvas(el, cssW, cssH) {
  const k = Math.min(window.devicePixelRatio || 1, 3);
  el.style.width = `${cssW}px`;
  el.style.height = `${cssH}px`;
  el.width = Math.round(cssW * k);
  el.height = Math.round(cssH * k);
  const c = el.getContext('2d');
  c.setTransform(k, 0, 0, k, 0, 0);
  c.clearRect(0, 0, cssW, cssH);
  return c;
}

// ---------------------------------------------------------------- 1フレーム
function afterAdvance() {
  for (const ev of drainEvents(game)) {
    if (ev.type === 'flap') audio.play('flap');
    else if (ev.type === 'pass') {
      audio.play('pass');
      if (ev.score === (nextGoal(runBest) ?? runBest + 1)) goalAt = ev.t;
      if (ev.score % 10 === 0) {
        skyFrom = skyForScore(ev.score - 1);
        skySince = ev.t;
      }
    }
    else if (ev.type === 'fish') audio.play('fish');
    else if (ev.type === 'hit') {
      audio.play('bonk');
      audio.play('meow', 0.16);
      ui = onCrash(ui, appTime);
      crashAt = appTime;
      sync();
    } else if (ev.type === 'land') landedAt = appTime;
  }
  if (ui.screen === 'crashing') {
    const landed = landedAt !== null && appTime - landedAt >= CRASH.resultAfterLand;
    if (landed || appTime - crashAt >= CRASH.resultMax) showResult();
  }
  if (ui.screen === 'result' && !resultUnlocked) {
    $('#retry').style.setProperty('--retry-progress', String(Math.min(1, Math.max(0, (appTime - ui.resultAt) / TIMING.inputLock))));
    if (isResultReady(ui, appTime)) unlockResult();
  }
  const t = onTick(ui, appTime);
  if (t.action === 'resume') {
    ui = t.ui;
    sync();
  }
}

function frame(ms) {
  const { delta, offsets } = clock.frame(ms / 1000, pendingReal.splice(0));
  if (!manual) {
    appTime += delta;
    if (!ui.paused) {
      for (const off of offsets) queueFlap(game, gameClock + off);
      gameClock += delta;
      advanceTo(game, gameClock);
    }
    afterAdvance();
  }
  draw();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- 入力
function gameInput() {
  const r = onTap(ui, appTime);
  ui = r.ui;
  if (r.action === 'start' || r.action === 'flap') {
    if (manual) queueFlap(game, gameClock);
    else pendingReal.push(performance.now() / 1000);
    if (r.action === 'start') sync();
  } else if (r.action === 'retry') retry();
  else if (r.action === 'grace') sync();
}

function isControl(el) {
  return !!(el && el.closest && el.closest('button, a, input, select, textarea, .dialog'));
}

function wakeAudio() {
  audio.ensure();
  audio.resume();
}

window.addEventListener(
  'pointerdown',
  (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    wakeAudio();
    if (isControl(e.target)) return;
    gameInput();
  },
  { passive: true },
);
// iOS は pointerdown では音を出す許可が下りない。指を離した時にもう一度起こす
window.addEventListener('pointerup', () => audio.resume(), { passive: true });
window.addEventListener('touchend', () => audio.resume(), { passive: true });
window.addEventListener('contextmenu', (e) => {
  if (!isControl(e.target)) e.preventDefault();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && ui.panel) {
    e.preventDefault();
    closePanel();
    return;
  }
  if (e.code === 'KeyM' && !e.repeat && !ui.panel && !e.metaKey && !e.ctrlKey) {
    toggleMute();
    return;
  }
  const gameKey = e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
  if (!gameKey || ui.panel) return;
  // 直前に隠したボタンにフォーカスが残っていることがある。見えないボタンはボタンとして扱わない
  const onControl = isControl(e.target) && !e.target.closest('[hidden]');
  // 飛行中はどこにフォーカスがあってもゲームの操作。それ以外で Space がボタンの上なら、そのボタンを押させる
  if (e.code === 'Space' && onControl && ui.screen !== 'flying' && !ui.paused) return;
  e.preventDefault();
  if (onControl && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  if (e.repeat) return;
  wakeAudio();
  gameInput();
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const fromPointer = e.detail > 0;
  if (action === 'retry') {
    const r = onButton(ui, 'retry', appTime);
    ui = r.ui;
    if (r.action === 'retry') retry();
  } else if (action === 'share') {
    const r = onButton(ui, 'share', appTime);
    ui = r.ui;
    if (r.action === 'open-share') openShare(el);
  } else if (action === 'cats') {
    const r = onButton(ui, 'cats', appTime);
    ui = r.ui;
    if (r.action === 'open-cats') openCats(el);
  } else if (action === 'app-share') {
    const r = onButton(ui, 'app-share', appTime);
    ui = r.ui;
    if (r.action === 'open-app-share') openAppShare(el);
  } else if (action === 'close') closePanel();
  else if (action === 'mode') setMode(el.dataset.mode);
  else if (action === 'sound') toggleMute();
  else if (action === 'pick') pickCat(el.dataset.cat);
  else if (action === 'share-files') shareFiles();
  else if (action === 'share-sheet') shareSheet();
  else if (action === 'copy') copyLink();
  // マウスで押したボタンにフォーカスが残ると、次の Space がそのボタンを押してしまう
  if (fromPointer && el.tagName === 'BUTTON' && !ui.panel && document.activeElement === el) el.blur();
});

document.addEventListener('visibilitychange', () => handleVisibility(document.hidden));

function handleVisibility(hidden) {
  if (hidden) ui = onHide(ui);
  else clock.reset(performance.now() / 1000);
  sync();
}

// ---------------------------------------------------------------- 画面の切り替え
function sync() {
  document.body.dataset.screen = ui.screen;
  $('#title').hidden = ui.screen !== 'title';
  $('#result').hidden = ui.screen !== 'result';
  $('#pause').hidden = !ui.paused;
  $('#pause-tap').hidden = !!ui.graceUntil;
  $('#pause-ready').hidden = !ui.graceUntil;
  $('#share-dialog').hidden = ui.panel !== 'share';
  $('#app-share-dialog').hidden = ui.panel !== 'app-share';
  $('#cats-dialog').hidden = ui.panel !== 'cats';
  for (const id of ['#title', '#result', '#sound']) $(id).inert = !!ui.panel;
}

function syncTitle() {
  const daily = linkKey && linkKey !== todayKey ? `${dateLabel(linkKey)} のコース` : `きょうのコース ${dateLabel(todayKey)}`;
  const [bd, ba] = document.querySelectorAll('.mode__btn');
  bd.textContent = daily;
  ba.textContent = 'いつでもモード';
  bd.setAttribute('aria-pressed', String(mode === 'daily'));
  ba.setAttribute('aria-pressed', String(mode !== 'daily'));
  $('#title-mode').textContent = label();
  $('#title-goal').textContent = `目標 ${goalLabel(nextGoal(courseBest(profile, mode, courseKey)))}`;
  $('#title-cat').textContent = `ねこ：${catById(profile.cat).name}`;
}

function syncSound() {
  const b = $('#sound');
  b.textContent = profile.muted ? '音：なし' : '音：あり';
  b.dataset.muted = String(profile.muted);
}

function setMode(next) {
  if (ui.screen !== 'title' || (next !== 'daily' && next !== 'any')) return;
  mode = next;
  profile = { ...profile, mode };
  save();
  newGame();
  syncTitle();
}

function toggleMute() {
  profile = { ...profile, muted: !profile.muted };
  audio.setMuted(profile.muted);
  save();
  syncSound();
}

function retry() {
  // 隠れる「もう一回」ボタンにフォーカスを残すと、次の Space がそこへ吸われて飛べない
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
  newGame();
  lastRun = null;
  resultUnlocked = false;
  ui = { ...ui, screen: 'title', panel: null };
  syncTitle();
  sync();
}

// ---------------------------------------------------------------- 結果
function showResult() {
  const before = profile.fishTotal;
  const run = { mode, dateKey: courseKey, score: game.score, fish: game.fish };
  const rec = recordRun(profile, run);
  profile = rec.profile;
  save();
  lastRun = {
    ...run,
    reason: collisionReason(game.hit, game.course.poles),
    goal: resultGoal(game.score, runBest),
    sky: skyForScore(game.score),
    best: rec.best,
    isNewBest: rec.isNewBest,
    reached: rec.reached,
    fishTotal: profile.fishTotal,
    unlockedNow: newlyUnlocked(before, profile.fishTotal),
    label: label(),
  };
  ui = onResult(ui, appTime);
  resultUnlocked = false;
  fillResult(lastRun);
  for (const b of document.querySelectorAll('#result button')) b.disabled = true;
  $('#result').dataset.ready = 'false';
  $('#retry').style.setProperty('--retry-progress', '0');
  sync();
  placeResult();
  if (rec.isNewBest) audio.play('fanfare', 0.05);
  const bestName = mode === 'daily' ? 'このコースのベスト' : '自己ベスト';
  $('#live').textContent = `${run.score}本くぐりました。${bestName}${rec.best}本${rec.isNewBest ? '、ベスト更新' : ''}。${lastRun.reason}。${lastRun.goal}。魚${run.fish}匹。`;
}

function unlockResult() {
  resultUnlocked = true;
  for (const b of document.querySelectorAll('#result button')) b.disabled = false;
  $('#result').dataset.ready = 'true';
  $('#retry').focus({ preventScroll: true });
}

function fillResult(r) {
  $('#result-mode').textContent = r.label;
  $('#result-reason').textContent = r.reason;
  $('#result-goal').textContent = r.goal;
  $('#result-best').textContent = `${r.mode === 'daily' ? 'このコースのベスト' : '自己ベスト'} ${r.best}本`;
  $('#result-new').hidden = !r.isNewBest;
  $('#result-fish').textContent = `今回の魚 🐟${r.fish}　合計 ${r.fishTotal}匹`;
  const next = nextUnlock(r.fishTotal);
  $('#result-next').textContent = next ? `次の猫（${next.cat.name}）まで あと${next.remaining}匹` : 'ぜんぶの猫がそろいました';
  const un = $('#result-unlock');
  un.hidden = !r.unlockedNow.length;
  un.textContent = r.unlockedNow.length ? `${r.unlockedNow.map((c) => c.name).join('と')}が なかまになりました！` : '';
  $('#result-digits').setAttribute('aria-label', `${r.score}本`);
  $('#result-stamps').setAttribute(
    'aria-label',
    `肉球スタンプ：${STAMPS.map((s) => `${s}本${r.reached.includes(s) ? ' 達成' : ' まだ'}`).join('、')}`,
  );
  paintResultCanvases(r);
}

function paintResultCanvases(r) {
  // 小さい画面でも、魚で猫が仲間になった行までカードに収まる高さにする
  const h = Math.round(Math.min(92, Math.max(54, layout.scale * 47)));
  const w = Math.ceil(numberWidth(r.score, h) + h * 0.5);
  const dc = fitCanvas($('#result-digits'), w, h + Math.round(h * 0.22));
  drawNumber(dc, r.score, w / 2, h * 0.1, h);
  const cs = Math.round(h * 1.05);
  const cc = fitCanvas($('#result-cat'), cs, cs);
  const k = cs / 52;
  drawCat(cc, { x: cs * 0.5, y: cs - 21 * k, scale: k, pattern: profile.cat, pose: 'sit', face: r.isNewBest ? 'happy' : 'grumpy', tail: 0.2, puff: !r.isNewBest, t: 0 });
  const sc = fitCanvas($('#result-stamps'), 224, 56);
  STAMPS.forEach((s, i) => drawStamp(sc, 28 + i * 56, 19, 34, r.reached.includes(s), `${s}本`));
}

// ---------------------------------------------------------------- シェア
async function buildCard(r) {
  const c = document.createElement('canvas');
  c.width = CARD.w;
  c.height = CARD.h;
  drawResultCard(c.getContext('2d'), {
    score: r.score,
    sky: r.sky,
    fish: r.fish,
    best: r.best,
    isNewBest: r.isNewBest,
    label: r.label,
    reached: r.reached,
    pattern: profile.cat,
    url: SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, ''),
  });
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  if (!blob) return null;
  const name = cardFileName(r);
  let file = null;
  try {
    file = new File([blob], name, { type: 'image/png' });
  } catch {
    file = null;
  }
  return { blob, file, name, url: URL.createObjectURL(blob), width: c.width, height: c.height };
}

function canShareFiles(file) {
  try {
    return !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

async function openShare(from) {
  opener = from;
  sync();
  const r = lastRun;
  const text = shareText({ mode: r.mode, dateKey: r.dateKey, todayKey, score: r.score, fish: r.fish });
  const url = shareUrl({ mode: r.mode, dateKey: r.dateKey });
  $('#share-x').href = intentX(text, url);
  $('#share-line').href = intentLine(url);
  $('#share-said').textContent = '';
  $('#share-files').hidden = true;
  $('#share-save').hidden = true;
  $('#share-sheet').hidden = true;
  $('#share-preview').alt = `結果カード：${r.label}で${r.score}本くぐった。魚${r.fish}匹。`;
  const firstControl = $('#share-x');
  firstControl.focus({ preventScroll: true });
  if (card) URL.revokeObjectURL(card.url);
  card = null;
  const built = await buildCard(r);
  if (ui.panel !== 'share' || lastRun !== r) {
    if (built) URL.revokeObjectURL(built.url);
    return;
  }
  card = built ? { ...built, text, link: url } : { text, link: url };
  if (built) $('#share-preview').src = built.url;
  const files = built && canShareFiles(built.file);
  $('#share-files').hidden = !files;
  const saveLink = $('#share-save');
  saveLink.hidden = files || !built;
  if (built) {
    saveLink.href = built.url;
    saveLink.download = built.name;
  }
  $('#share-sheet').hidden = files || typeof navigator.share !== 'function';
  // 最後の句はひとかたまりで折り返す。text-wrap: pretty が効かない WebKit でも「い。」だけが次の行に落ちない
  const [noteHead, noteTail] = files
    ? ['InstagramとYouTubeはWebから投稿画面を開けないので、「画像つきで共有」かリンクのコピーで', '渡してください。']
    : ['InstagramとYouTubeはWebから投稿画面を開けないので、画像を保存するかリンクをコピーして', '貼ってください。'];
  const keep = document.createElement('span');
  keep.className = 'keep';
  keep.textContent = noteTail;
  $('#share-note').replaceChildren(noteHead, keep);
  $('#share-dialog').dataset.ready = 'true';
  // 生成中に利用者が移動していたら、その操作を奪わない
  if (document.activeElement === firstControl) {
    $('#share-dialog').querySelector('button:not([hidden]), a[href]:not([hidden])').focus({ preventScroll: true });
  }
}

async function shareFiles() {
  if (!card || !card.file) return;
  try {
    await navigator.share({ files: [card.file], text: `${card.text} ${card.link}` });
  } catch {
    /* 共有シートを閉じただけなら何も出さない */
  }
}

async function shareSheet() {
  if (!card) return;
  try {
    await navigator.share({ title: 'ぱたにゃん', text: card.text, url: card.link });
  } catch {
    /* 同上 */
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http 接続や古い Safari ではクリップボードAPIが使えない
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

async function copyLink() {
  const link = card?.link || shareUrl({ mode: lastRun?.mode || mode, dateKey: courseKey });
  const ok = await copyText(link);
  $('#share-said').textContent = ok ? 'リンクをコピーしました' : `コピーできませんでした。${link} を選んでコピーしてください`;
}

// ---------------------------------------------------------------- ねこえらび
function buildCatGrid() {
  const grid = $('#cats-grid');
  grid.textContent = '';
  for (const c of CATS) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cat-tile';
    b.dataset.action = 'pick';
    b.dataset.cat = c.id;
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'cat-tile__name';
    const state = document.createElement('span');
    state.className = 'cat-tile__state';
    b.append(cv, name, state);
    li.append(b);
    grid.append(li);
  }
}

function syncCats() {
  $('#cats-total').textContent = `あつめた魚 🐟${profile.fishTotal}匹`;
  const size = Math.min(72, Math.max(56, Math.round(window.innerHeight < 520 ? 56 : 72)));
  for (const b of document.querySelectorAll('.cat-tile')) {
    const c = catById(b.dataset.cat);
    const open = isUnlocked(c.id, profile.fishTotal);
    const chosen = profile.cat === c.id;
    b.setAttribute('aria-pressed', String(chosen));
    b.setAttribute('aria-disabled', String(!open));
    b.querySelector('.cat-tile__name').textContent = open ? c.name : '？？？';
    b.querySelector('.cat-tile__state').textContent = open ? (chosen ? '✓ えらび中' : 'えらぶ') : `🐟あと${c.need - profile.fishTotal}匹`;
    b.setAttribute('aria-label', open ? `${c.name}${chosen ? '（えらび中）' : ''}` : `まだ仲間になっていない猫。魚あと${c.need - profile.fishTotal}匹`);
    const cc = fitCanvas(b.querySelector('canvas'), size, size);
    const k = size / 52;
    drawCat(cc, { x: size * 0.5, y: size * 0.56, scale: k, pattern: c.id, pose: 'fly', face: chosen ? 'happy' : 'normal', paw: 0.3, tail: 0.25, silhouette: !open, t: 0 });
  }
}

function openCats(from) {
  opener = from;
  syncCats();
  sync();
  $('#cats-dialog button').focus({ preventScroll: true });
}

// 共有欄の中身は shared/share.js が #share に据え付ける（X・LINE・共有シート・リンクのコピー）
function openAppShare(from) {
  opener = from;
  sync();
  $('#app-share-dialog').querySelector('a[href], button:not([hidden])').focus({ preventScroll: true });
}

function pickCat(id) {
  if (!isUnlocked(id, profile.fishTotal)) return;
  profile = { ...profile, cat: id };
  save();
  syncCats();
  syncTitle();
  if (lastRun && ui.screen === 'result') paintResultCanvases(lastRun);
}

function closePanel() {
  if (!ui.panel) return;
  ui = onButton(ui, 'close', appTime).ui;
  $('#share-dialog').dataset.ready = 'false';
  sync();
  if (opener && opener.isConnected && !opener.closest('[hidden]')) opener.focus({ preventScroll: true });
  opener = null;
}

// ---------------------------------------------------------------- テスト用のつまみ（?test=1 のときだけ）
const bootMs = performance.now();

function stateForTest() {
  return {
    bootMs,
    screen: ui.screen,
    panel: ui.panel,
    paused: ui.paused,
    grace: !!ui.graceUntil,
    ready: isResultReady(ui, appTime),
    appTime,
    manual,
    mode,
    courseKey,
    todayKey,
    muted: profile.muted,
    cat: profile.cat,
    fishTotal: profile.fishTotal,
    lastRun,
    layout: { side: layout.side, scale: layout.scale, playX: layout.playX, playY: layout.playY, playW: layout.playW, playH: layout.playH, ceilingY: layout.ceilingY, groundY: layout.groundY, skyTop: layout.skyTop },
    game: snapshot(game),
  };
}

if (TEST) {
  window.__patanyan = {
    setManual(on) {
      manual = !!on;
      pendingReal.length = 0;
      clock.reset(performance.now() / 1000);
      return stateForTest();
    },
    advance(seconds) {
      const n = Math.max(1, Math.round(seconds / PHYS.dt));
      for (let i = 0; i < n; i += 1) {
        appTime += PHYS.dt;
        if (!ui.paused) {
          gameClock += PHYS.dt;
          advanceTo(game, gameClock);
        }
        afterAdvance();
      }
      return stateForTest();
    },
    flap() {
      gameInput();
      return stateForTest();
    },
    state: stateForTest,
    setSeed(n) {
      fixedSeed = n >>> 0;
      if (ui.screen === 'title') newGame();
      return stateForTest();
    },
    setMode(m) {
      setMode(m);
      return stateForTest();
    },
    giveFish(n) {
      profile = { ...profile, fishTotal: profile.fishTotal + n };
      save();
      return stateForTest();
    },
    hide() {
      handleVisibility(true);
      return stateForTest();
    },
    show() {
      handleVisibility(false);
      return stateForTest();
    },
  };
}

// ---------------------------------------------------------------- はじめ
newGame();
buildCatGrid();
syncTitle();
syncSound();
sync();
resize();
window.addEventListener('resize', resize);
motion.addEventListener?.('change', () => draw());
requestAnimationFrame(frame);
document.body.dataset.boot = 'ready';
