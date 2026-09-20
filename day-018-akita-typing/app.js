/* 画面まわり。ゲームの中身は lib/game.js にあり、ここは DOM と入力の橋渡しだけをする。

   クエリで4つだけ入口を開けてある（どれも記録に残す仕様）：
     ?force=error … 料理データの読み込み失敗を再現する（E2Eと動作確認用）
     ?seed=12345  … 皿の出る順を固定する（デモ録画を同じ流れで撮り直すため）
     ?duration=15 … 1回の長さを秒で上書きする（5〜120秒。結果画面まで15秒で見せるため）
     ?sound=off   … 音を鳴らさずに始める（既定は on。デモ収録とE2Eで要る）

   4つとも遊びやすさを変える方向には働かない。既定は60秒・順番はランダム・エラーは起きない。 */

import { createGame } from './lib/game.js';
import { createMatcher, primaryRomaji } from './lib/romaji.js';
import { accuracy, formatYen, keysPerSecond, paceDelta, scaledTarget, settle, stumbles } from './lib/scoring.js';
import { sound } from './lib/sound.js';

const $ = (id) => document.getElementById(id);

const el = {
  body: document.body,
  foot: document.querySelector('.site-foot'),
  empty: $('state-empty'),
  emptyHeading: $('empty-heading'),
  countdown: $('state-countdown'),
  countdownNumber: $('countdown'),
  error: $('state-error'),
  errorHeading: $('error-heading'),
  errorDetail: $('error-detail'),
  game: $('game'),
  result: $('result'),
  courseList: $('course-list'),
  start: $('start'),
  reload: $('reload'),
  again: $('again'),
  changeCourse: $('change-course'),
  quit: $('quit'),
  soundToggle: $('sound-toggle'),
  soundOn: $('sound-on'),
  soundOff: $('sound-off'),
  eaten: $('eaten'),
  gain: $('gain'),
  missed: $('missed'),
  missedCount: $('missed-count'),
  courseName: $('course-name'),
  resultCourse: $('result-course'),
  targetAmount: $('target-amount'),
  timeLeft: $('time-left'),
  seconds: $('seconds'),
  meterFill: $('meter-fill'),
  meterOver: $('meter-over'),
  meterPace: $('meter-pace'),
  paceNote: $('pace-note'),
  lane: $('lane'),
  invalid: $('invalid'),
  heldBadge: $('held-badge'),
  keys: $('keys'),
  tapHint: $('tap-hint'),
  target: $('target'),
  name: $('target-name'),
  /* 名前は必ずこの内側のspanへ入れる。#target-name は flex なので、<ruby> を直下に置くと
     flexアイテムとして block 化され、ふりがなが name の上に乗らなくなる */
  nameInner: document.querySelector('.target__name-inner'),
  romajiDone: $('romaji-done'),
  romajiNext: $('romaji-next'),
  romajiRest: $('romaji-rest'),
  verdict: $('verdict'),
  verdictDetail: $('verdict-detail'),
  tallyFill: $('tally-fill'),
  tallyOver: $('tally-over'),
  tallyNote: $('tally-note'),
  sessionDiff: $('session-diff'),
  advice: $('advice'),
  statEaten: $('stat-eaten'),
  statSpeed: $('stat-speed'),
  statAccuracy: $('stat-accuracy'),
  statMissed: $('stat-missed'),
  stumbleList: $('stumble-list'),
  stumbleEmpty: $('stumble-empty'),
  unfinished: $('unfinished'),
  ateList: $('ate-list'),
  ateEmpty: $('ate-empty'),
  tryout: $('tryout'),
  tryoutName: $('tryout-name'),
  tryoutDone: $('tryout-done'),
  tryoutRest: $('tryout-rest'),
  tryoutNote: $('tryout-note')
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
let heldWidth = 0;
let roundsPlayed = 0;
let keysTaken = 0;
let heldBadgeUsed = false;
let paidOff = false;
let shownPlateId = 0;
let missedSeen = 0;
/* ためし打ちの途中経過。このページを開いているあいだだけの値で、保存はしない */
let tryout = null;
const warned = new Set();

/* 同じセッションのあいだだけ、コースごとの前回と最高額を覚えておく。
   localStorage は使わない（このチャレンジでは保存がまだ解禁されていない）。
   タブを閉じれば消えるので、結果画面にもその旨を書いてある。 */
const sessionStats = new Map();

/* 食べた皿が弾けて消えるまで。レーンは overflow:hidden なので、
   飛ばす高さはレーンの内側に収まる範囲にする（超えると途中で切られて見える）。
   皿の上下の余白は13.6px（レーン120px・皿92.8px）しかないので、
   上げる高さと膨らむぶんの合計をそこに収めている。26pxだと弾けが切り落とされていた。 */
const POP_MS = 360;
const POP_RISE_PX = 9;
const POP_SCALE = 0.09;
/* 皿どうしの最小の間。つかみ中スロットと走行中の皿のあいだも同じだけ空ける */
const PLATE_GAP_PX = 10;
/* 逃した皿が、着いたところから左へ抜け切るまで（game.js が皿を捨てる 900ms より短くする） */
const EXIT_MS = 420;
/* 残りこれだけになったら「終盤」。打鍵行を縁取り、残り秒数も色を変える */
const URGENT_MS = 10_000;
/* これ以上ペースから離れたら「遅れ気味」と言う。いちばん安い皿1枚ぶん */
const BEHIND_YEN = 100;
const plateNodes = new Map();
/* 皿に出す「先頭キーの札」。皿ごとに1つで、書き換えるのは文字だけ */
const plateKeys = new Map();

/** 画面が切り替わったときのフォーカスの行き先。ここが無いと activeElement が BODY に落ちる */
function focusFor(name) {
  if (name === 'empty') return el.emptyHeading;
  if (name === 'result') return el.verdict;
  if (name === 'error') return el.errorHeading;
  if (name === 'playing') return el.keys;
  return null;
}

function show(name, opts = {}) {
  phase = name;
  el.body.dataset.phase = name;
  el.empty.hidden = name !== 'empty';
  el.countdown.hidden = name !== 'countdown';
  el.error.hidden = name !== 'error';
  el.game.hidden = name !== 'playing';
  el.result.hidden = name !== 'result';
  // 対戦中はフッター（シェア）をTab順から外す。畳んでいる最中に手が迷子にならないように
  if (el.foot) el.foot.inert = name === 'playing';
  if (opts.focus === false) return;
  const node = focusFor(name);
  if (node) node.focus({ preventScroll: true });
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
    /* 何品出るかと、必要な速さ（実測値）は選ぶ前に要る情報。ただし2行に分けると、
       狭い画面で3枚積んだときに「はじめる」を折り返しの下へ押し出すので1行にまとめる */
    const hint = document.createElement('span');
    hint.className = 'course__hint';
    hint.textContent = `${c.hint}／${c.pace}`;
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

/* ---- ためし打ち ----

   何も選ばずに はじめる を押した既定は おすすめ（要2.5打/秒）で、1打/秒の人はそこで必ず負ける。
   結果画面の助言は「負けた60秒のあと」に出るので、始める前に測れる場所をここに置く。
   コース札の「約2.5打/秒から」も、自分が何打/秒か知らない初回の人には判断材料にならない。 */

/** ためし打ちに使う1品。いちばん短い料理を選ぶ（測るのに時間をかけさせない） */
function tryoutDish() {
  return data.DISHES.reduce((min, d) => (
    primaryRomaji(d.reading).length < primaryRomaji(min.reading).length ? d : min
  ));
}

function tryoutReset() {
  const dish = tryoutDish();
  tryout = { matcher: createMatcher(dish.reading), startedAt: 0, lastAt: 0, presses: 0, hits: 0 };
  const romaji = tryout.matcher.remaining();
  el.tryoutName.textContent = dish.name;
  el.tryoutDone.textContent = '';
  el.tryoutRest.textContent = romaji;
  // 入力欄そのものは透明なので、何を打つのかは名前で伝える（画面の文字は隣のspanにある）
  el.tryout.setAttribute('aria-label', `ためし打ちの入力欄。${dish.name} を ${romaji} と打ちます`);
}

/* 1打50ms（20打/秒）より速いのは人の手ではない。スマホの予測入力は1語まるごと差し込んでくるので、
   そのまま信じると「大食い」を勧めて逆に負けさせることになる。測れなかったことにして既定を動かさない */
const MAX_HUMAN_KPS = 20;
/* これだけ手が止まったら、次の1打から測り直す。読んでいる途中に触ったキーや、
   考え込んでいた時間まで速さに入れないため */
const TRYOUT_PAUSE_MS = 3000;

function tryoutFinish(now) {
  /* n打は n-1 個の間隔ぶんしか時間を使っていない（最初の打鍵から測っているので）。
     打ち間違えるとそのぶん時間が延びて速さが下がる＝迷った人には軽いコースが出る。
     判定に渡す値は画面に出す値と同じところまで丸める（結果画面の助言と同じ作法）。 */
  const seconds = Math.max(1, now - tryout.startedAt) / 1000;
  const kps = Math.max(0, tryout.hits - 1) / seconds;
  if (!Number.isFinite(kps) || kps > MAX_HUMAN_KPS) {
    el.tryoutNote.textContent = 'うまく測れませんでした。コースはそのままにしてあります。';
    return;
  }
  const shown = Number(kps.toFixed(1));
  const rec = data.recommendCourse(shown);
  const picked = $(`course-${rec.id}`);
  if (picked) picked.checked = true;
  el.tryoutNote.textContent =
    `${shown.toFixed(1)} 打/秒 でした。${rec.label}（${formatYen(rec.target)}）を選んでおきました。`;
}

/** ためし打ちに1文字入れる。受け取れたら true */
function tryoutKey(raw) {
  if (phase !== 'empty' || !tryout) return false;
  const key = raw.toLowerCase();
  if (!/^[a-z-]$/.test(key)) return false;

  const now = performance.now();
  // 打ち終わったあとにまた打つか、手が止まってから打ち直したときは、そこから測り直す
  if (tryout.matcher.done || (tryout.presses > 0 && now - tryout.lastAt > TRYOUT_PAUSE_MS)) tryoutReset();
  if (tryout.presses === 0) tryout.startedAt = now;
  tryout.presses += 1;
  tryout.lastAt = now;
  const res = tryout.matcher.input(key);
  if (res.ok) tryout.hits += 1;
  el.tryoutDone.textContent = tryout.matcher.typed;
  el.tryoutRest.textContent = tryout.matcher.remaining();
  if (res.done) tryoutFinish(now);
  return true;
}

/* ---- 音 ---- */

function syncSoundUi() {
  const on = sound.isEnabled();
  if (el.soundToggle) {
    el.soundToggle.textContent = on ? '音あり' : '音なし';
    el.soundToggle.setAttribute('aria-pressed', String(on));
  }
  if (el.soundOn) el.soundOn.checked = on;
  if (el.soundOff) el.soundOff.checked = !on;
}

/** 音の入切。AudioContext を作ってよいのは操作の中だけなので、ここからしか arm() しない */
function setSound(next) {
  sound.setEnabled(next);
  if (next) sound.arm();
  syncSoundUi();
}

/* ---- 開始前カウント ---- */

function countdown() {
  // 「はじめる」を押したこの瞬間が、音を作ってよい唯一のタイミング
  if (sound.isEnabled()) sound.arm();
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

/* 案内を出すのは「まだ1打も受け取っていない」か「入力欄からフォーカスが外れている」あいだ。
   条件が2つ要る理由は別々にある。
   ① 1打も受け取っていないうちは出し続ける。カウントの途中（クリックから700〜2100ms後）に呼ぶ
      focus() では仮想キーボードを開かない端末があり、フォーカスだけを見ると
      キーボードが出ていないのに案内だけ消える。
   ② 1打受け取ったあとでも、フォーカスが外れたら出し直す。対戦中に音の切り替えを押すと
      そこでキーボードが閉じるのに、旧仕様（1打で消えたきり）では戻し方が画面のどこにも無かった
      ——代わりの案内は Ctrl+M だけで、スマホには Ctrl が無い。 */
function updateTapHint() {
  if (!el.tapHint) return;
  const focused = el.keys && document.activeElement === el.keys;
  const needed = keysTaken === 0 || !focused;
  el.tapHint.hidden = !(phase === 'playing' && isTouch() && needed);
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
  keysTaken = 0;
  heldBadgeUsed = false;
  paidOff = false;
  shownPlateId = 0;
  missedSeen = 0;
  warned.clear();
  game = createGame({ course, dishes: data.dishesForCourse(course), duration, random });

  show('playing');
  laneWidth = el.lane.clientWidth;
  plateWidth = 0;
  heldWidth = 0;
  if (el.keys) el.keys.value = '';
  updateTapHint();

  sound.beginRound(Math.floor(random() * 2 ** 30));

  const started = performance.now();
  game.start(started);
  raf = requestAnimationFrame(frame);
}

function frame(now) {
  game.tick(now);
  render(now);
  sound.tick(game.elapsed(now) / duration);
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

/* 名前の表示。漢字を含む5品だけ、よみをふりがなとして名前の上に乗せる。
   カタカナの品（ハタハタ等）に振っても情報が増えないので振らない。
   説明文としてよみを別行に出すのはやめた——1皿につき1度しか読まないものが、
   1文字ごとに見る打鍵行を画面の外へ押し出していた。 */
function nameNode(dish) {
  if (!data.hasKanji(dish.name)) return document.createTextNode(dish.name);
  const ruby = document.createElement('ruby');
  ruby.append(document.createTextNode(dish.name));
  const open = document.createElement('rp');
  open.textContent = '（';
  const rt = document.createElement('rt');
  rt.textContent = dish.reading;
  const close = document.createElement('rp');
  close.textContent = '）';
  ruby.append(open, rt, close);
  return ruby;
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
  /* 名前は必ずこの内側のspanへ入れる。.plate__name は「ふりがなの有無で絵と値段の高さが
     変わらないように」flexで場所を取っているので、<ruby> を直下に置くとflexアイテムとして
     block化され、ふりがなが名前の上に乗らなくなる（打鍵行と同じ作り） */
  const nameInner = document.createElement('span');
  nameInner.className = 'plate__name-inner';
  nameInner.append(nameNode(plate.dish));
  name.append(nameInner);
  const price = document.createElement('span');
  price.className = 'plate__price';
  price.textContent = formatYen(plate.price);
  /* その皿から打ち始めるときに押すキー。これが見えているから「次はどれから」が選べる。
     皿の内側に絶対配置する（外へ出すと皿からはみ出す） */
  const key = document.createElement('span');
  key.className = 'plate__key';
  node.append(name, price, key);
  el.lane.append(node);
  plateNodes.set(plate.id, node);
  plateKeys.set(plate.id, key);
  return node;
}

/** HUDの会計まわり。達成率・必要ペース・残り秒数はここでまとめて描く */
function renderHud(totals, now) {
  el.eaten.textContent = formatYen(totals.eaten);

  const remain = game.remaining(now);
  const elapsed = Math.min(duration, duration - remain);
  el.seconds.textContent = String(Math.ceil(remain / 1000));
  const urgent = remain <= URGENT_MS;
  el.timeLeft.dataset.low = String(urgent);
  el.target.dataset.urgent = String(urgent);

  // バーの全体は「目標額」か「食べた額」の大きいほう。超えても伸びしろが見える
  const denom = Math.max(target, totals.eaten, 1);
  const targetAt = target / denom;
  el.meterFill.style.width = `${(Math.min(totals.eaten, target) / denom) * 100}%`;
  el.meterOver.style.left = `${targetAt * 100}%`;
  el.meterOver.style.width = `${(Math.max(0, totals.eaten - target) / denom) * 100}%`;
  el.meterPace.style.left = `${Math.min(1, elapsed / duration) * targetAt * 100}%`;

  /* いちばん安い皿1枚ぶんより小さいずれは「遅れ」と呼ばない。
     開始1秒で「ペースが足りません」と出るのは正しくても役に立たない */
  const short = target - totals.eaten;
  if (short <= 0) {
    el.paceNote.textContent = `元が取れた（+${formatYen(-short)}）`;
    el.paceNote.dataset.tone = 'paid';
  } else if (paceDelta(totals.eaten, target, elapsed, duration) <= -BEHIND_YEN) {
    el.paceNote.textContent = `元まであと ${formatYen(short)}・遅れ気味`;
    el.paceNote.dataset.tone = 'behind';
  } else {
    el.paceNote.textContent = `元まであと ${formatYen(short)}`;
    el.paceNote.dataset.tone = 'ok';
  }

  const missed = totals.dishesMissed;
  el.missed.textContent = String(missed);
  el.missedCount.hidden = missed === 0;
  if (missed > missedSeen) {
    missedSeen = missed;
    sound.lost();
  }

  if (!paidOff && totals.eaten >= target) {
    paidOff = true;
    // 60秒のなかでいちばん大事な瞬間。settle() は結果画面でしか呼ばれないので、その場では何も起きていなかった
    sound.payoff();
  }
}

/* 走行中の皿の横位置を、レーンの左から順に決める。
   つかみ中スロットがあるあいだ、走っている皿を「全部同じ下限でクランプ」すると
   2枚目以降が同じxに積み上がって名前が重なる（20px以上の重なりが全フレームの47%あった）。
   前の皿の右端から詰めていくことで、列になって並ぶだけになる。 */
function ridingLayout(now, holding) {
  const xs = new Map();
  let prevRight = holding && heldWidth ? heldWidth + PLATE_GAP_PX : 0;
  for (const plate of game.plates) {
    if (plate.state !== 'riding' || plate.held) continue;
    const x = Math.max(laneWidth * (1 - game.progress(plate, now)), prevRight);
    xs.set(plate.id, x);
    prevRight = x + plateWidth + PLATE_GAP_PX;
  }
  return xs;
}

/* 皿の横位置。皿は「レーンの左端（x=0）に着いたら止まる」。
   走り切った位置（-皿の幅）に置く式にすると、つかんだ瞬間に画面外から左端へ瞬間移動して見える
   （1試合11回起きていた）。逃した皿だけは、着いたところから時間をかけて左へ抜ける。 */
function plateX(plate, now, xs) {
  const riding = xs.get(plate.id);
  if (riding !== undefined) return riding;
  const rest = plate.held ? 0 : laneWidth * (1 - Math.min(1, game.progress(plate, now)));
  if (plate.state !== 'missed') return rest;
  const out = Math.min(1, Math.max(0, now - (plate.missedAt ?? now)) / EXIT_MS);
  return rest - (plateWidth + PLATE_GAP_PX) * out;
}

function render(now) {
  const totals = game.totals;
  renderHud(totals, now);

  const active = game.active();
  const holding = Boolean(active && active.held);
  const alive = new Set();

  /* つかみ中バッジは、そのラウンドで最初につかんだときだけ出す。
     毎回出すと試合の7割で点灯して1試合に22回出入りし、しかも料理名と打鍵行のちょうど間
     ＝1文字ごとに見る場所の真上で明滅し続ける。2回目からは左端の琥珀の太枠スロットが同じことを示す。 */
  const showHeld = holding && !heldBadgeUsed;
  if (!showHeld && el.heldBadge.dataset.show === 'true') heldBadgeUsed = true;
  el.heldBadge.dataset.show = String(showHeld);

  // ① 皿の状態を書いてから幅を測る（幅はCSSで画面幅に追従する。毎フレーム読むとレイアウトが走るので1度だけ）
  for (const plate of game.plates) {
    alive.add(plate.id);
    const node = plateNode(plate);
    node.dataset.state = plate.state;
    node.dataset.active = String(Boolean(active) && active.id === plate.id);
    node.dataset.held = String(Boolean(plate.held));
    const expiring = game.isExpiring(plate, now);
    node.dataset.expiring = String(expiring);
    if (expiring && !warned.has(plate.id)) {
      warned.add(plate.id);
      sound.soon();
    }

    /* その皿から打ち始めるときに押すキーの札。的の皿には出さない（打つ文字は下の打鍵行にフルで出ている）。
       押して移れるのは語の1打目だけ（語の途中はただのミス）。札そのものは出しっぱなしにする——
       1語ごとに20回以上つけ消しすると、レーンの上でいちばん明滅する物になる */
    const head = game.headKey(plate);
    const takeable = Boolean(head) && !(active && active.id === plate.id);
    node.dataset.takeable = String(takeable);
    const keyNode = plateKeys.get(plate.id);
    if (keyNode && takeable && keyNode.textContent !== head) keyNode.textContent = head;

    if (plate.held) {
      if (!heldWidth) heldWidth = node.offsetWidth;
    } else if (!plateWidth) {
      plateWidth = node.offsetWidth;
    }
  }

  // ② 走行中の皿を列に並べる
  const xs = ridingLayout(now, holding);

  // ③ 位置と演出を書き込む
  for (const plate of game.plates) {
    const node = plateNodes.get(plate.id);
    const x = plateX(plate, now, xs);
    if (plate.state === 'eaten') {
      // 食べた皿は上に弾けて消える。ここが動かないと「増えた」が目に残らない
      const t = Math.min(1, (now - plate.eatenAt) / POP_MS);
      const rise = 1 - (1 - t) * (1 - t);          // 動きは最初に速く
      const fade = 1 - t * t * t;                  // 透明度は最後まで粘る（早く消えると目に残らない）
      node.style.transform = `translateX(${x}px) translateY(${-POP_RISE_PX * rise}px) scale(${1 + POP_SCALE * rise})`;
      node.style.opacity = String(fade);
    } else {
      node.style.transform = `translateX(${x}px)`;
      node.style.opacity = '';
    }
  }
  for (const [id, node] of plateNodes) {
    if (alive.has(id)) continue;
    node.remove();
    plateNodes.delete(id);
    plateKeys.delete(id);
  }

  if (!active) {
    if (shownPlateId !== 0) {
      shownPlateId = 0;
      el.nameInner.replaceChildren('つぎの皿を待っています');
    }
    el.romajiDone.textContent = '';
    el.romajiNext.textContent = '';
    el.romajiRest.textContent = '';
    return;
  }

  if (shownPlateId !== active.id) {
    shownPlateId = active.id;
    el.nameInner.replaceChildren(nameNode(active.dish));
  }
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
  el.target.dataset.miss = 'true';
  setTimeout(() => { delete el.target.dataset.miss; }, 180);
}

/* 別の皿から打ち始めた合図。料理名も打鍵行も一斉に別の語へ入れ替わるので、
   何も出さないと「打っていた語が急に変わった」としか見えない。
   アニメーションではなく色を一定時間置くだけにしてある（reduced-motion で合図ごと消えないように） */
let switchTimer = 0;
function flashSwitch() {
  clearTimeout(switchTimer);
  el.target.dataset.switch = 'true';
  switchTimer = setTimeout(() => { delete el.target.dataset.switch; }, 320);
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
  const now = performance.now();
  const res = game.press(key, now);
  if (res.kind === 'miss') {
    flashMiss();
    sound.missKey(now);
  }
  if (res.switched) flashSwitch();
  if (res.kind === 'ate') {
    const node = plateNodes.get(res.plate.id);
    if (node) node.dataset.state = 'eaten';
    celebrate(res.plate.price);
    sound.eat(res.plate.price);
  }
  if (res.kind !== 'idle') {
    keysTaken += 1;
    if (keysTaken === 1) updateTapHint();
  }
  render(now);
  return true;
}

/** 対戦を途中でやめる。60秒待つかリロードするしかない状態を作らない */
function quit() {
  cancelAnimationFrame(raf);
  sound.stopBgm();
  show('empty');
}

function onKeyDown(e) {
  // 音の切り替え。英字1文字は打鍵として全部消費されるので、修飾キーが要る
  if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'm' || e.key === 'M')) {
    e.preventDefault();
    setSound(!sound.isEnabled());
    return;
  }
  // 結果画面はEnterで同じコースへ即復帰する。タイピングゲームで手を離させない
  if (phase === 'result' && e.key === 'Enter') {
    e.preventDefault();
    countdown();
    return;
  }
  // 開始画面もEnterで始まる。フォーカスがボタンの上にあるときは本来の動きに任せる
  if (phase === 'empty' && e.key === 'Enter') {
    const from = e.target instanceof Element ? e.target.closest('button, a, summary') : null;
    if (from) return;
    e.preventDefault();
    countdown();
    return;
  }
  /* 開始画面で英字を打ったら、ためし打ちに入れる。タイピングゲームなので、
     「まず入力欄をクリックしてください」を挟まない。
     入力欄・ボタンの上にフォーカスがあるときは、そちらの本来の動きに任せる（二重にも数えない） */
  if (phase === 'empty' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && e.key.length === 1) {
    const from = e.target instanceof Element ? e.target.closest('input, button, a, summary') : null;
    if (!from && tryoutKey(e.key)) e.preventDefault();
    return;
  }
  if (phase !== 'playing') return;
  // 中断。onKeyDown は1文字以外を素通りするので、打鍵と衝突しない
  if (e.key === 'Escape') {
    e.preventDefault();
    quit();
    return;
  }
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

/** 目標額と食べた額を1本のバーで見せる。対戦中と同じ形にして地続きにする */
function renderTally(totals) {
  const denom = Math.max(target, totals.eaten, 1);
  el.tallyFill.style.width = `${(Math.min(totals.eaten, target) / denom) * 100}%`;
  el.tallyOver.style.left = `${(target / denom) * 100}%`;
  el.tallyOver.style.width = `${(Math.max(0, totals.eaten - target) / denom) * 100}%`;
  el.tallyNote.textContent =
    `コース ${formatYen(target)} ／ 食べた ${formatYen(totals.eaten)}（${totals.dishesEaten}皿）`;
}

/** 同じセッション内の前回と最高額。ページを閉じたら消える */
function renderSession(totals) {
  const stat = sessionStats.get(course.id) || { last: null, best: 0, rounds: 0 };
  if (stat.rounds > 0) {
    const diff = totals.eaten - stat.last;
    const best = Math.max(stat.best, totals.eaten);
    const word = diff > 0 ? `${formatYen(diff)} 多い` : diff < 0 ? `${formatYen(-diff)} 少ない` : '同じ';
    el.sessionDiff.replaceChildren();
    const lead = document.createElement('span');
    lead.textContent = '前回より ';
    const value = document.createElement('b');
    value.textContent = word;
    const tail = document.createElement('span');
    tail.textContent = `（このコースの最高は ${formatYen(best)}）`;
    el.sessionDiff.append(lead, value, tail);
    el.sessionDiff.dataset.tone = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
    el.sessionDiff.hidden = false;
  } else {
    el.sessionDiff.hidden = true;
  }
  sessionStats.set(course.id, {
    last: totals.eaten,
    best: Math.max(stat.best, totals.eaten),
    rounds: stat.rounds + 1
  });
}

/** 食べた料理と豆知識。対戦中は読む暇が無いので、ここに置く */
function renderAte() {
  const seen = new Map();
  for (const dish of game.eatenDishes) if (!seen.has(dish.name)) seen.set(dish.name, dish);
  const list = [...seen.values()];
  el.ateList.replaceChildren();
  el.ateEmpty.hidden = list.length > 0;
  for (const dish of list.slice(0, 6)) {
    const li = document.createElement('li');
    const name = document.createElement('b');
    name.textContent = dish.name;
    li.append(name, ` — ${dish.note}`);
    el.ateList.append(li);
  }
  if (list.length > 6) {
    const li = document.createElement('li');
    li.textContent = `ほか ${list.length - 6}品`;
    el.ateList.append(li);
  }
}

function finish(now) {
  cancelAnimationFrame(raf);
  sound.stopBgm();
  const totals = game.totals;
  const result = settle(totals.eaten, target);

  roundsPlayed += 1;
  el.resultCourse.textContent = `${course.label}（${formatYen(target)}）`;
  el.verdict.textContent = result.label;
  el.verdict.dataset.verdict = result.verdict;
  el.verdictDetail.textContent = result.verdict === 'even'
    ? `${formatYen(target)} のコースをちょうど食べ切りました。`
    : `${formatYen(target)} のコースで ${formatYen(totals.eaten)} ぶん食べたので、${formatYen(Math.abs(result.diff))} の${result.verdict === 'profit' ? '得' : '損'}です。`;

  renderTally(totals);
  renderSession(totals);

  const kps = keysPerSecond(totals.hits, game.elapsed(now));
  el.statEaten.textContent = `${formatYen(totals.eaten)}（${totals.dishesEaten}皿）`;
  el.statSpeed.textContent = `${kps.toFixed(1)} 打/秒`;
  el.statAccuracy.textContent = totals.hits + totals.misses === 0
    ? '—'
    : `${accuracy(totals.hits, totals.misses).toFixed(1)}%`;
  el.statMissed.textContent = `${totals.dishesMissed}皿`;

  // 初回だけ、自分の速さに合うコースを言う（既定のおすすめで初回から負ける人がいるため）
  if (roundsPlayed === 1 && totals.hits > 0) {
    /* 判定に渡す値は、画面に出す値と同じところまで丸める。
       生の値で判定すると 2.49 のとき「2.5 打/秒でした。この速さなら お手軽 が…」と、
       同じ文の中で数字と結論が食い違う（コース札の「約2.5打/秒から」とも突き合わない） */
    const shown = Number(kps.toFixed(1));
    const rec = data.recommendCourse(shown);
    el.advice.textContent = rec.id === course.id
      ? `あなたは ${shown.toFixed(1)} 打/秒 でした。この速さなら ${rec.label} がちょうど合っています。`
      : `あなたは ${shown.toFixed(1)} 打/秒 でした。この速さなら ${rec.label}（${formatYen(rec.target)}）が向いています。`;
    el.advice.hidden = false;
  } else {
    el.advice.hidden = true;
  }

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

  const left = game.unfinished();
  if (left) {
    el.unfinished.replaceChildren();
    const lead = document.createElement('span');
    lead.textContent = '打ち切れずに流れたのは ';
    const name = document.createElement('b');
    name.textContent = left.dish.name;
    const tail = document.createElement('span');
    tail.textContent = left.rest ? `（あと ${left.rest}）でした。` : ' でした。';
    el.unfinished.append(lead, name, tail);
    el.unfinished.hidden = false;
  } else {
    el.unfinished.hidden = true;
  }

  renderAte();
  show('result');
}

/* ---- 起動 ---- */

function fail(err) {
  el.errorDetail.textContent = err && err.message ? err.message : String(err);
  show('error');
}

el.start.addEventListener('click', countdown);
el.again.addEventListener('click', countdown);
if (el.changeCourse) el.changeCourse.addEventListener('click', () => show('empty'));
if (el.quit) el.quit.addEventListener('click', quit);
if (el.soundToggle) {
  el.soundToggle.addEventListener('click', () => {
    setSound(!sound.isEnabled());
    /* 対戦中に押せて画面がそのまま残るボタンはこれだけ。押した時点で入力欄からフォーカスが外れ、
       スマホではソフトキーボードが閉じる＝打てなくなるので、打鍵の口へ戻す
       （「やめる」は開始画面へ移るので show() のフォーカス移動に任せる） */
    if (phase === 'playing' && el.keys) el.keys.focus({ preventScroll: true });
  });
}
for (const node of [el.soundOn, el.soundOff]) {
  if (node) node.addEventListener('change', () => setSound(node.value === 'on'));
}
// 読み込み直すときも音の設定だけは持ち越す（既定はonなので、offのときだけ書く）
el.reload.addEventListener('click', () => {
  location.href = sound.isEnabled() ? location.pathname : `${location.pathname}?sound=off`;
});
/* ためし打ちの入力欄。打鍵の受け方はレーンと同じ（物理キーは keydown、ソフトキーは beforeinput）。
   物理キーは preventDefault するので beforeinput へは流れない＝二重に数えない */
if (el.tryout) {
  el.tryout.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.key.length !== 1) return;
    if (tryoutKey(e.key)) e.preventDefault();
  });
  el.tryout.addEventListener('beforeinput', (e) => {
    if (e.isComposing || e.inputType !== 'insertText' || !e.data) return;
    e.preventDefault();
    for (const ch of e.data) tryoutKey(ch);
    el.tryout.value = '';
  });
  el.tryout.addEventListener('input', () => { el.tryout.value = ''; });
}
window.addEventListener('keydown', onKeyDown);
window.addEventListener('compositionstart', () => { if (phase === 'playing') showInvalid(); });
window.addEventListener('resize', () => {
  laneWidth = el.lane.clientWidth;
  plateWidth = 0;
  heldWidth = 0;
});
// レーンに重ねた入力欄。タップでスマホのキーボードが出る
if (el.keys) {
  el.keys.addEventListener('beforeinput', onBeforeInput);
  el.keys.addEventListener('input', () => { el.keys.value = ''; });
  el.keys.addEventListener('pointerdown', () => el.keys.focus({ preventScroll: true }));
  // 案内の出し入れはフォーカスが動いたときだけ。毎フレーム呼ぶ必要はない
  el.keys.addEventListener('focus', updateTapHint);
  el.keys.addEventListener('blur', updateTapHint);
}

sound.setEnabled(params.get('sound') !== 'off');
syncSoundUi();

load()
  .then((mod) => {
    data = mod;
    renderCourses();
    tryoutReset();
    // 開いた直後にフォーカスを動かさない（読み上げの位置を勝手に飛ばさないため）
    show('empty', { focus: false });
  })
  .catch(fail);
