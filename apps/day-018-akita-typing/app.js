/* 画面まわり。ゲームの中身は lib/game.js にあり、ここは DOM と入力の橋渡しだけをする。

   クエリで3つだけ入口を開けてある（どれも記録に残す仕様）：
     ?force=error … 料理データの読み込み失敗を再現する（E2Eと動作確認用）
     ?seed=12345  … 皿の出る順を固定する（デモ録画を同じ流れで撮り直すため）
     ?duration=15 … 1回の長さを秒で上書きする（5〜120秒。結果画面まで15秒で見せるため）

   3つとも遊びやすさを変える方向には働かない。既定は60秒・順番はランダム・エラーは起きない。 */

import { createGame } from './lib/game.js';
import { accuracy, formatYen, keysPerSecond, scaledTarget, settle, stumbles } from './lib/scoring.js';

const $ = (id) => document.getElementById(id);

const el = {
  empty: $('state-empty'),
  countdown: $('state-countdown'),
  countdownNumber: $('countdown'),
  error: $('state-error'),
  errorDetail: $('error-detail'),
  game: $('game'),
  result: $('result'),
  courseList: $('course-list'),
  start: $('start'),
  reload: $('reload'),
  again: $('again'),
  changeCourse: $('change-course'),
  eaten: $('eaten'),
  gain: $('gain'),
  missed: $('missed'),
  missedCount: $('missed-count'),
  courseName: $('course-name'),
  resultCourse: $('result-course'),
  targetAmount: $('target-amount'),
  timerFill: $('timer-fill'),
  lane: $('lane'),
  invalid: $('invalid'),
  heldBadge: $('held-badge'),
  targetImg: $('target-img'),
  keys: $('keys'),
  tapHint: $('tap-hint'),
  target: $('target'),
  name: $('target-name'),
  note: $('target-note'),
  reading: $('target-reading'),
  romajiDone: $('romaji-done'),
  romajiNext: $('romaji-next'),
  romajiRest: $('romaji-rest'),
  verdict: $('verdict'),
  verdictDetail: $('verdict-detail'),
  statEaten: $('stat-eaten'),
  statSpeed: $('stat-speed'),
  statAccuracy: $('stat-accuracy'),
  statMissed: $('stat-missed'),
  stumbleList: $('stumble-list'),
  stumbleEmpty: $('stumble-empty')
};

const params = new URLSearchParams(location.search);

/* 乱数を固定できるようにしておく。デモを撮り直すたびに皿の順が変わると振り付けが合わない */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seed = params.get('seed');
const random = seed !== null && seed !== '' ? mulberry32(Number(seed)) : Math.random;

let data = null;
let course = null;
let duration = 0;
let target = 0;
let game = null;
let raf = 0;
let phase = 'empty';
let laneWidth = 0;
let plateWidth = 0;
let roundsPlayed = 0;

/* 食べた皿が弾けて消えるまで。レーンは overflow:hidden なので、
   飛ばす高さはレーンの内側に収まる範囲にする（超えると途中で切られて見える） */
const POP_MS = 360;
const POP_RISE_PX = 26;
const plateNodes = new Map();

function show(name) {
  phase = name;
  el.empty.hidden = name !== 'empty';
  el.countdown.hidden = name !== 'countdown';
  el.error.hidden = name !== 'error';
  el.game.hidden = name !== 'playing';
  el.result.hidden = name !== 'result';
}

/* ---- 料理データの読み込み（ここが失敗するとエラー状態） ---- */

async function load() {
  if (params.get('force') === 'error') throw new Error('?force=error が指定されています');
  const mod = await import('./lib/dishes.js');
  if (!Array.isArray(mod.DISHES) || mod.DISHES.length === 0) throw new Error('料理が0件でした');
  if (!Array.isArray(mod.COURSES) || mod.COURSES.length === 0) throw new Error('コースが0件でした');
  return mod;
}

function renderCourses() {
  el.courseList.replaceChildren();
  data.COURSES.forEach((c, i) => {
    const id = `course-${c.id}`;
    const label = document.createElement('label');
    label.className = 'course';
    label.htmlFor = id;

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'course';
    input.id = id;
    input.value = c.id;
    input.className = 'course__input';
    if (i === 1 || data.COURSES.length === 1) input.checked = true;

    const body = document.createElement('span');
    body.className = 'course__body';
    const title = document.createElement('b');
    title.className = 'course__label';
    title.textContent = c.label;
    const amount = document.createElement('span');
    amount.className = 'course__amount';
    amount.textContent = formatYen(c.target);
    const hint = document.createElement('span');
    hint.className = 'course__hint';
    hint.textContent = c.hint;
    body.append(title, amount, hint);

    label.append(input, body);
    el.courseList.append(label);
  });
}

function selectedCourse() {
  const picked = el.courseList.querySelector('input[name="course"]:checked');
  return data.courseById(picked ? picked.value : 'standard');
}

/** 1回の長さ。既定は60秒で、?duration= が来たときだけ5〜120秒の範囲で上書きする */
function roundDuration() {
  const given = Number(params.get('duration'));
  if (!Number.isFinite(given) || given <= 0) return data.DURATION_MS;
  return Math.min(120, Math.max(5, given)) * 1000;
}

/* ---- 開始前カウント ---- */

function countdown() {
  show('countdown');
  el.lane.replaceChildren();
  plateNodes.clear();
  // 2回目以降は待たせない。再挑戦までの時間が長いのが1周目の指摘だった
  let n = roundsPlayed === 0 ? 3 : 1;
  el.countdownNumber.textContent = String(n);
  const timer = setInterval(() => {
    n -= 1;
    if (n > 0) {
      el.countdownNumber.textContent = String(n);
      return;
    }
    clearInterval(timer);
    begin();
  }, 700);
}

/* ---- 本編 ---- */

/** タッチで操作している端末か（案内を出すかどうかの判断だけに使う） */
function isTouch() {
  return navigator.maxTouchPoints > 0 && !window.matchMedia('(hover: hover)').matches;
}

function begin() {
  course = selectedCourse();
  duration = roundDuration();
  target = scaledTarget(course.target, duration, data.DURATION_MS);
  el.targetAmount.textContent = formatYen(target);
  el.courseName.textContent = course.label;
  el.eaten.textContent = formatYen(0);
  el.missed.textContent = '0';
  el.missedCount.hidden = true;
  el.invalid.hidden = true;
  game = createGame({ course, dishes: data.dishesForCourse(course), duration, random });

  show('playing');
  laneWidth = el.lane.clientWidth;
  plateWidth = 0;
  if (el.keys) {
    el.keys.value = '';
    el.keys.focus({ preventScroll: true });
  }
  if (el.tapHint) el.tapHint.hidden = !isTouch() || document.activeElement === el.keys;

  const started = performance.now();
  game.start(started);
  raf = requestAnimationFrame(frame);
}

function frame(now) {
  game.tick(now);
  render(now);
  if (game.isOver(now)) {
    finish(now);
    return;
  }
  raf = requestAnimationFrame(frame);
}

/** 料理の絵。読み込めなかったら消して、文字だけで成立させる */
function dishImage(dish, className = 'plate__img') {
  if (!dish.image) return null;
  const img = document.createElement('img');
  img.className = className;
  img.src = `./assets/dish/${dish.image}.webp`;
  img.alt = '';
  img.decoding = 'async';
  img.addEventListener('error', () => img.remove(), { once: true });
  return img;
}

function plateNode(plate) {
  let node = plateNodes.get(plate.id);
  if (node) return node;
  node = document.createElement('div');
  node.className = 'plate';
  node.dataset.plate = String(plate.id);
  const img = dishImage(plate.dish);
  if (img) node.append(img);
  const name = document.createElement('span');
  name.className = 'plate__name';
  name.textContent = plate.dish.name;
  const price = document.createElement('span');
  price.className = 'plate__price';
  price.textContent = formatYen(plate.price);
  node.append(name, price);
  el.lane.append(node);
  plateNodes.set(plate.id, node);
  return node;
}

function render(now) {
  el.eaten.textContent = formatYen(game.totals.eaten);
  const left = game.remaining(now) / duration;
  el.timerFill.style.width = `${Math.max(0, left) * 100}%`;
  el.timerFill.dataset.low = String(left < 0.25);

  const missed = game.totals.dishesMissed;
  el.missed.textContent = String(missed);
  el.missedCount.hidden = missed === 0;

  const active = game.active();
  const alive = new Set();
  el.lane.dataset.holding = String(Boolean(active && active.held));
  el.heldBadge.hidden = !(active && active.held);

  for (const plate of game.plates) {
    alive.add(plate.id);
    const node = plateNode(plate);
    // 皿の幅はCSSで画面幅に追従するので実測する。毎フレーム読むとレイアウトが走るので1度だけ
    if (!plateWidth) plateWidth = node.offsetWidth;

    // つかんだ皿は左端で止まって待つ。流れ切った位置に置くと画面外に出てしまう
    const x = plate.held ? 0 : laneWidth - game.progress(plate, now) * (laneWidth + plateWidth);

    if (plate.state === 'eaten') {
      // 食べた皿は上に弾けて消える。ここが動かないと「増えた」が目に残らない
      const t = Math.min(1, (now - plate.eatenAt) / POP_MS);
      const rise = 1 - (1 - t) * (1 - t);          // 動きは最初に速く
      const fade = 1 - t * t * t;                  // 透明度は最後まで粘る（早く消えると目に残らない）
      node.style.transform = `translateX(${x}px) translateY(${-POP_RISE_PX * rise}px) scale(${1 + 0.3 * rise})`;
      node.style.opacity = String(fade);
    } else {
      node.style.transform = `translateX(${x}px)`;
      node.style.opacity = '';
    }

    node.dataset.state = plate.state;
    node.dataset.active = String(Boolean(active) && active.id === plate.id);
    node.dataset.held = String(Boolean(plate.held));
    node.dataset.expiring = String(game.isExpiring(plate, now));
  }
  for (const [id, node] of plateNodes) {
    if (alive.has(id)) continue;
    node.remove();
    plateNodes.delete(id);
  }

  if (!active) {
    el.targetImg.hidden = true;
    el.name.textContent = 'つぎの皿を待っています';
    el.note.textContent = '';
    el.reading.textContent = '';
    el.romajiDone.textContent = '';
    el.romajiNext.textContent = '';
    el.romajiRest.textContent = '';
    return;
  }

  if (active.dish.image) {
    const src = `./assets/dish/${active.dish.image}.webp`;
    if (!el.targetImg.src.endsWith(src.slice(1))) el.targetImg.src = src;
    el.targetImg.hidden = false;
  } else {
    el.targetImg.hidden = true;
  }
  el.name.textContent = active.dish.name;
  el.note.textContent = active.dish.note;
  el.reading.textContent = active.dish.reading;
  const rest = active.matcher.remaining();
  el.romajiDone.textContent = active.matcher.typed;
  el.romajiNext.textContent = rest.slice(0, 1);
  el.romajiRest.textContent = rest.slice(1);
}

/* ---- 入力 ---- */

/* 増えた額をその場に浮かせて、金額そのものも跳ねさせる。
   アニメーションを撒き直すために一度属性を外して強制的にレイアウトを読む */
function celebrate(price) {
  el.gain.textContent = `+${formatYen(price)}`;
  delete el.gain.dataset.show;
  delete el.eaten.dataset.bump;
  delete el.target.dataset.ate;
  void el.gain.offsetWidth;
  el.gain.dataset.show = 'true';
  el.eaten.dataset.bump = 'true';
  // 視線は中央の料理名にあるので、そこでも返す
  el.target.dataset.ate = 'true';
  setTimeout(() => { delete el.target.dataset.ate; }, 320);
}

function flashMiss() {
  el.name.parentElement.dataset.miss = 'true';
  setTimeout(() => { delete el.name.parentElement.dataset.miss; }, 180);
}

function showInvalid() {
  el.invalid.hidden = false;
}

/**
 * 1文字を受けてゲームに渡す。物理キーボードもソフトキーボードもここに集める。
 * 受け取れた（＝ゲームに渡した）かどうかを返す。
 */
function feedKey(raw) {
  if (phase !== 'playing') return false;
  const key = raw.toLowerCase();
  if (!/^[a-z-]$/.test(key)) {
    // ひらがな・カタカナが直接来た＝日本語入力がON。記号や数字はただ無視する
    if (raw.codePointAt(0) > 127) showInvalid();
    return false;
  }

  el.invalid.hidden = true;
  const res = game.press(key, performance.now());
  if (res.kind === 'miss') flashMiss();
  if (res.kind === 'ate') {
    const node = plateNodes.get(res.plate.id);
    if (node) node.dataset.state = 'eaten';
    celebrate(res.plate.price);
  }
  render(performance.now());
  return true;
}

function onKeyDown(e) {
  // 結果画面はEnterで同じコースへ即復帰する。タイピングゲームで手を離させない
  if (phase === 'result' && e.key === 'Enter') {
    e.preventDefault();
    countdown();
    return;
  }
  if (phase !== 'playing') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  // 変換中のキーは捨てる。keyCode 229 は見ない——Androidのソフトキーボードは
  // 変換していなくても229を返すので、ここで弾くとスマホで1文字も打てなくなる
  if (e.isComposing) {
    showInvalid();
    e.preventDefault();
    return;
  }
  if (e.key.length !== 1) return;
  if (feedKey(e.key)) e.preventDefault();
}

/* ソフトキーボードは keydown に文字を載せてこないことがある（Androidの予測入力など）。
   入力欄に入った文字をここで拾い、同じ道へ流す。物理キーは feedKey で preventDefault
   しているのでここには来ない＝二重に数えない。 */
function onBeforeInput(e) {
  if (phase !== 'playing') { el.keys.value = ''; return; }
  if (e.isComposing || e.inputType !== 'insertText' || !e.data) return;
  e.preventDefault();
  for (const ch of e.data) feedKey(ch);
  el.keys.value = '';
}

/* ---- 結果 ---- */

function finish(now) {
  cancelAnimationFrame(raf);
  const totals = game.totals;
  const result = settle(totals.eaten, target);

  roundsPlayed += 1;
  el.resultCourse.textContent = `${course.label}（${formatYen(target)}）`;
  el.verdict.textContent = result.label;
  el.verdict.dataset.verdict = result.verdict;
  el.verdictDetail.textContent = result.verdict === 'even'
    ? `${formatYen(target)} のコースをちょうど食べ切りました。`
    : `${formatYen(target)} のコースで ${formatYen(totals.eaten)} ぶん食べたので、${formatYen(Math.abs(result.diff))} の${result.verdict === 'profit' ? '得' : '損'}です。`;

  el.statEaten.textContent = `${formatYen(totals.eaten)}（${totals.dishesEaten}皿）`;
  el.statSpeed.textContent = `${keysPerSecond(totals.hits, game.elapsed(now)).toFixed(1)} 打/秒`;
  el.statAccuracy.textContent = totals.hits + totals.misses === 0
    ? '—'
    : `${accuracy(totals.hits, totals.misses).toFixed(1)}%`;
  el.statMissed.textContent = `${totals.dishesMissed}皿`;

  const top = stumbles(game.missMap);
  el.stumbleList.replaceChildren();
  el.stumbleEmpty.hidden = top.length > 0;
  el.stumbleEmpty.textContent = totals.hits === 0
    ? '打鍵がありませんでした。'
    : '1度もミスしませんでした。';
  for (const item of top) {
    const li = document.createElement('li');
    li.className = 'stumble';
    const key = document.createElement('b');
    key.className = 'stumble__key';
    key.textContent = item.key;
    const count = document.createElement('span');
    count.className = 'stumble__count';
    count.textContent = `${item.count}回`;
    li.append(key, count);
    el.stumbleList.append(li);
  }

  show('result');
}

/* ---- 起動 ---- */

function fail(err) {
  el.errorDetail.textContent = err && err.message ? err.message : String(err);
  show('error');
}

// 絵が1枚も読めない環境でも遊べるように、読み込み失敗は黙って隠す
el.targetImg.addEventListener('error', () => { el.targetImg.hidden = true; });

el.start.addEventListener('click', countdown);
el.again.addEventListener('click', countdown);
if (el.changeCourse) el.changeCourse.addEventListener('click', () => show('empty'));
el.reload.addEventListener('click', () => { location.href = location.pathname; });
window.addEventListener('keydown', onKeyDown);
window.addEventListener('compositionstart', () => { if (phase === 'playing') showInvalid(); });
window.addEventListener('resize', () => {
  laneWidth = el.lane.clientWidth;
  plateWidth = 0;
});
// レーンに重ねた入力欄。タップでスマホのキーボードが出る
if (el.keys) {
  el.keys.addEventListener('beforeinput', onBeforeInput);
  el.keys.addEventListener('input', () => { el.keys.value = ''; });
  el.keys.addEventListener('pointerdown', () => el.keys.focus({ preventScroll: true }));
  el.keys.addEventListener('focus', () => { if (el.tapHint) el.tapHint.hidden = true; });
  el.keys.addEventListener('blur', () => { if (el.tapHint) el.tapHint.hidden = !isTouch(); });
}

load()
  .then((mod) => {
    data = mod;
    renderCourses();
    show('empty');
  })
  .catch(fail);
