import { LEVELS, levelId } from './lib/levels.js';
import { createState, step, DT } from './lib/physics.js';
import { readStore, writeStore, recordClear } from './lib/store.js';
import { createAudio } from './lib/audio.js';
import { render } from './lib/render.js';
import { createAutopilot } from './lib/autopilot.js';
// ここから下は lib/store.js と同じ定義。tests/helpers.mjs はアプリを
// 1行の import だけ外して読み込むので、app.js は注入された名前しか使えない。
const SEAL = { dash: 1, fortune: 2, unhurt: 4 };
const sealCount = seals =>
  Number.isInteger(seals) ? [1, 2, 4].filter(bit => seals & bit).length : 0;
const later = (fn, ms) => {
  if (typeof setTimeout === 'function') setTimeout(fn, ms);
};
const $ = id => document.getElementById(id),
  app = $('app'),
  canvas = $('game'),
  ctx = canvas.getContext('2d');
let storage;
try {
  storage = window.localStorage;
} catch {
  /* 保存不可でも続ける */
}
let saved = readStore(storage),
  state = createState(),
  mode = 'title',
  accumulator = 0,
  previous = 0;
// 紹介動画に音を後付けするため、鳴った効果音を「記録開始からの秒」つきで貯める。
// 時計は requestAnimationFrame の時刻＝実時間。クリア画面でゲームが止まっている間も
// 進むので、録画の経過とずれない。
let recording = false,
  recordedEvents = [],
  recordStart = null,
  recordSeconds = 0;
const sound = createAudio(saved.muted),
  keys = new Set(),
  pointers = new Map();
const bindings = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'jump',
  ArrowUp: 'jump',
  KeyW: 'jump',
  KeyZ: 'jump',
};
// 面ごとの「新しく覚えること1つ」と、上段の米俵3個＋任意餅へ入る手段。
// 面の頭の安全な区間に3秒ずつ出す。文字列の代わりに { text, from, to }（tick）で時刻を指定できる。
// 1-1 だけは、最初のうさぎが画面にいるうちに踏みの説明を出すため時刻を明示する。
const LESSONS = {
  '1-1': [
    { text: '→ で進む。押し続けると高く跳ぶ', from: 0, to: 144 },
    { text: '雪うさぎは上から踏むとはずむ。反動で上の棚へ', from: 144, to: 504 },
  ],
  '1-2': ['雪台は押し続けるともっと高く跳ぶ。上の棚へは雪台から'],
  '1-3': ['風呂敷を持つと下りがゆっくり。上の棚へは滑空で渡る'],
  '1-4': ['二マスの穴は走ったまま跳び越す。上の棚へは雪台から'],
  '1-5': ['着地しないで続けて踏むと点が倍。上の棚へは雪台から'],
  '2-1': ['枝は乗るとすぐ折れる。止まらずに渡って上の棚へ'],
  '2-2': ['折れる枝を2枚続けて跳ぶ。その先の三段目が上の棚'],
  '2-3': ['カラスの高さを見てから跳ぶ。踏んだ反動で上の棚へ'],
  '2-4': ['上下する床は上まで来たら降りる。上の棚へもこの床で'],
  '2-5': ['枝を止まらずに渡って上の棚へ。風呂敷は着地を延ばす'],
  '3-1': ['横風では逆を押して着地を合わせる。上の棚へは滑空で'],
  '3-2': ['駆け鈴を持つと速い。助走をつけて上の棚へ跳ぶ'],
  '3-3': ['イノシシは近づくと構える。誘って踏み、反動で上の棚へ'],
  '3-4': ['氷では早めに逆を押して止まる。上の棚へは駆け鈴の助走で'],
  '3-5': ['氷から雪床へ移って足を止める。上の棚へは滑空で渡る'],
  '4-1': ['屋根と下道。上の棚へは屋根の切れ目を枝で渡る'],
  '4-2': ['歩く犬との間合いを測る。上の屋根へは駆け鈴の助走で'],
  '4-3': ['能力はひとつだけ。拾い替えて、滑空で上の棚へ'],
  '4-4': ['つららを誘って落ちる場所から離れる。上の棚へは枝で渡る'],
  '4-5': ['最後は速さより着地を整える。上の棚へは雪台から'],
};
const ABILITY_LABEL = { F: '風呂敷', S: '駆け鈴' };
function clearInput() {
  keys.clear();
  pointers.clear();
  accumulator = 0;
}
// 自動操作中は実キー・タッチ入力と混ぜない。
let inputOverride = null;
let autopilot = null;
// 紹介動画の撮影用。true のあいだは実時間で進めず、advance(ms) で刻んだぶんだけ進む。
let manual = false;
// 得点の浮き文字（60tickで消える）と、直前の値。物理側の telemetry を読み、
// 無ければ面内得点の増分から作る。
let pops = [];
let lastScore = 0;
let lastCombo = 0;
function input() {
  if (autopilot !== null) {
    return autopilot(state);
  }
  if (inputOverride !== null) {
    return inputOverride;
  }
  const values = [...keys]
    .map(key => bindings[key])
    .concat([...pointers.values()]);
  return {
    left: values.includes('left'),
    right: values.includes('right'),
    jump: values.includes('jump'),
  };
}
function persist() {
  $('save-note').hidden = writeStore(storage, saved);
}
function setMode(value) {
  mode = value;
  app.dataset.state = value;
  $('title').hidden = value !== 'title';
  $('select').hidden = value !== 'select';
  $('play').hidden = !['playing', 'clear'].includes(value);
  $('clear').hidden = value !== 'clear';
  $('touch').hidden = value !== 'playing';
  clearInput();
  sound.setPlaying(value === 'playing');
}
const seconds = ticks => (ticks / 120).toFixed(1);
const record = id => saved.recordsV2[id];
// 3条件のお札を ●/○ で書く。別の挑戦で取ったものも積み上がる。
function sealText(seals = 0) {
  return [SEAL.dash, SEAL.fortune, SEAL.unhurt]
    .map(bit => (seals & bit ? '●' : '○'))
    .join('');
}
function select(message = '各地の5面目を終えると、次の土地へ。') {
  setMode('select');
  $('selection-note').textContent = message;
  $('levels').replaceChildren();
  for (let w = 1; w <= 4; w++) {
    const section = document.createElement('section');
    section.className = 'world';
    const heading = document.createElement('h3');
    heading.textContent = `${w} / ${['山', '杉林', '吹雪', '里'][w - 1]}${w > saved.unlockedWorld ? ' · 未解放' : ''}`;
    section.append(heading);
    const grid = document.createElement('div');
    grid.className = 'world-buttons';
    for (let n = 1; n <= 5; n++) {
      const id = `${w}-${n}`,
        button = document.createElement('button'),
        best = record(id);
      button.dataset.level = id;
      button.dataset.seals = String(best?.seals ?? 0);
      button.disabled = w > saved.unlockedWorld;
      button.textContent = id;
      button.title = LEVELS[(w - 1) * 5 + n - 1].name;
      const seal = document.createElement('small');
      seal.className = 'seal-row';
      seal.textContent = sealText(best?.seals ?? 0);
      const time = document.createElement('small');
      time.textContent = best ? `${seconds(best.bestTicks)}秒` : '—';
      button.append(seal, time);
      button.setAttribute(
        'aria-label',
        `${id} ${LEVELS[(w - 1) * 5 + n - 1].name}。お札 ${sealCount(best?.seals ?? 0)}/3。${best ? `ベスト ${seconds(best.bestTicks)}秒` : '記録なし'}`,
      );
      button.addEventListener('click', () => begin(id));
      grid.append(button);
    }
    section.append(grid);
    $('levels').append(section);
  }
  document.querySelector('#levels button:not(:disabled)')?.focus();
}
let lessonQueue = [];
function begin(id, options = {}) {
  if (Number(id[0]) > saved.unlockedWorld) {
    return;
  }
  state = createState(id, options);
  pops = [];
  lastScore = attemptScore();
  lastCombo = 0;
  lessonQueue = (LESSONS[id] ?? []).map((lesson, i) =>
    typeof lesson === 'string'
      ? { text: lesson, from: i * 360, to: i * 360 + 360 }
      : { ...lesson });
  setMode('playing');
  resize();
  paint();
  canvas.focus({ preventScroll: true });
  $('play').scrollIntoView({ block: 'start' });
}
function resize() {
  const scale = Math.max(
    1,
    Math.min(
      Math.floor($('app').clientWidth / 320),
      Math.floor((innerHeight - 220) / 192),
    ),
  );
  canvas.style.width = `${320 * scale}px`;
  canvas.style.height = `${192 * scale}px`;
}
const attemptScore = () => state.attemptScore ?? state.score ?? 0;
const riceOf = () => state.collectedRice ?? 0;
// 早駆け・福集め・無傷の見込み。物理側が seals を確定していれば、それを優先する。
function sealState() {
  const par = state.level.parTicks ?? 2400;
  const hits = (state.runHits ?? 0) + (state.runMisses ?? 0);
  return [
    state.elapsedTicks <= par ? (state.status === 'clear' ? 'on' : 'maybe') : 'off',
    riceOf() >= 6 && state.secretCollected ? 'on' : 'maybe',
    hits === 0 ? (state.status === 'clear' ? 'on' : 'maybe') : 'off',
  ];
}
const abilityCtx = $('ability-icon').getContext('2d');
function paintAbility() {
  const ability = state.ability ?? null;
  const ticks = state.abilityTicks ?? 0;
  $('ability-text').textContent = ability
    ? `${ABILITY_LABEL[ability]} ${Math.ceil(ticks / 120)}秒`
    : '能力なし';
  // 残り2秒を切ったら枠を点滅させる（描画側の足元アイコンも同じ周期で点滅する）。
  $('ability').dataset.blink =
    ability && ticks > 0 && ticks <= 240 ? 'on' : 'off';
}
function paint() {
  // 能力の小アイコンは HUD の 16×16 canvas に、ゲーム画面と同じ原画で描く。
  render(ctx, state, { pops, iconCtx: abilityCtx });
  $('level-label').textContent = state.id;
  $('form').textContent = ['● ちび', '◆ なまはげ', '✦ 荒鬼'][state.stage];
  $('lives').textContent = `残 ${state.lives}`;
  $('rice').textContent = `米 ${riceOf()}/6`;
  $('time').textContent = `${seconds(state.elapsedTicks)}秒`;
  paintAbility();
  sealState().forEach((value, i) => {
    $(['seal-dash', 'seal-fortune', 'seal-unhurt'][i]).dataset.on = value;
  });
  const lesson = lessonQueue.find(
    l => state.elapsedTicks >= l.from && state.elapsedTicks < l.to,
  );
  $('lesson').textContent = lesson?.text ?? '';
  $('lesson').hidden = !lesson;
}
// 物理側の telemetry から浮き文字を作る。形が違っても落ちないように、
// 数値と座標が読めたものだけ使い、読めなければ面内得点の増分で代用する。
// 近い場所で続けて入った得点は1つにまとめる（米俵を続けて拾うと重なって読めないため）。
function addPop(x, y, amount) {
  const near = pops.find(
    pop =>
      pop.amount > 0 &&
      pop.ticks > 40 &&
      Math.abs(pop.x - x) < 40 &&
      Math.abs(pop.y - y) < 24,
  );
  if (near) {
    near.amount += amount;
    near.text = `+${near.amount}`;
    near.ticks = 60;
    return;
  }
  pops.push({ x, y, amount, text: `+${amount}`, ticks: 60 });
}
function collectPops() {
  // 戸口に着いた刻みは浮き文字を全部消す。clear の総得点（500＋早駆け＋無傷＋福集め）を
  // 拾って画面に出すと、結果画面の「この挑戦 n点」と違う数が同時に見えるため。
  if (state.status === 'clear' || state.status === 'over') {
    pops = [];
    lastScore = attemptScore();
    lastCombo = state.combo ?? 0;
    return;
  }
  const p = state.player;
  let made = false;
  for (const event of state.telemetry ?? []) {
    if (!event || typeof event !== 'object' || event.type === 'clear') {
      continue;
    }
    const amount = [event.points, event.amount].find(v => Number.isFinite(v));
    const x = Number.isFinite(event.x) ? event.x + 8 : p.x + p.w / 2;
    const y = Number.isFinite(event.y) ? event.y - 4 : p.y - 4;
    if (Number.isFinite(amount) && amount > 0) {
      addPop(x, y - 20, amount);
      made = true;
    }
    const combo = [event.combo, event.multiplier].find(v => Number.isFinite(v));
    if (Number.isFinite(combo) && combo >= 2) {
      pops.push({ x, y: y - 34, amount: 0, text: `×${combo}`, ticks: 60 });
      made = true;
    }
  }
  const score = attemptScore();
  if (!made && score > lastScore) {
    addPop(p.x + p.w / 2, p.y - 24, score - lastScore);
  }
  const combo = state.combo ?? 0;
  if (!made && combo >= 2 && combo > lastCombo) {
    pops.push({
      x: p.x + p.w / 2,
      y: p.y - 38,
      amount: 0,
      text: `×${combo}`,
      ticks: 60,
    });
  }
  lastScore = score;
  lastCombo = combo;
  pops = pops.filter(pop => --pop.ticks > 0).slice(-6);
}
// 戸口に着いたときの成績。物理側が clearResult を出していればそれを使う。
function clearResult() {
  const par = state.level.parTicks ?? 2400;
  const base = state.clearResult ?? {
    ticks: state.elapsedTicks,
    score: attemptScore(),
    rice: riceOf(),
    secret: !!state.secretCollected,
    hits: state.runHits ?? 0,
    misses: state.runMisses ?? 0,
  };
  const seals = Number.isInteger(base.seals)
    ? base.seals
    : (base.ticks <= par ? SEAL.dash : 0) |
      (base.rice >= 6 && base.secret ? SEAL.fortune : 0) |
      (base.hits === 0 && base.misses === 0 ? SEAL.unhurt : 0);
  return { ...base, seals, par };
}
function showClear() {
  const result = clearResult(),
    before = record(state.id),
    newBest =
      !before ||
      result.ticks < before.bestTicks ||
      result.score > before.bestScore ||
      (result.seals & ~before.seals) !== 0;
  saved = recordClear(saved, state.id, result);
  persist();
  setMode('clear');
  // 結果画面の裏に得点の浮き文字を残さない（面内得点だけを結果で読ませる）。
  pops = [];
  lessonQueue = [];
  $('lesson').hidden = true;
  paint();
  const gap = (result.par - result.ticks) / 120;
  $('clear-score').textContent =
    `この挑戦 ${result.score}点 · 通算 ${state.score ?? 0}点`;
  $('clear-best').textContent = newBest
    ? `自己ベスト更新（${seconds(result.ticks)}秒 / ${record(state.id).bestScore}点）`
    : `ベスト ${seconds(record(state.id).bestTicks)}秒 / ${record(state.id).bestScore}点`;
  $('clear-seals').replaceChildren(
    ...[
      [
        '早駆け',
        result.seals & SEAL.dash,
        `${seconds(result.ticks)}秒 / 目標 ${seconds(result.par)}秒（${gap >= 0 ? '−' : '+'}${Math.abs(gap).toFixed(1)}秒）`,
      ],
      [
        '福集め',
        result.seals & SEAL.fortune,
        `米俵 ${result.rice}/6 · 隠し餅 ${result.secret ? 1 : 0}/1`,
      ],
      [
        '無傷',
        result.seals & SEAL.unhurt,
        `被弾 ${result.hits}回 · ミス ${result.misses}回`,
      ],
    ].map(([name, got, detail]) => {
      const li = document.createElement('li');
      li.dataset.on = got ? 'on' : 'off';
      li.textContent = `${got ? '●' : '○'} ${name}：${detail}`;
      return li;
    }),
  );
  const last = state.id === '4-5';
  $('next').hidden = last;
  $('clear-title').textContent = last
    ? '戸口は、ここまで。'
    : 'よい年を、迎えれよ。';
  const visited = Object.keys(saved.recordsV2).length;
  const total = Object.values(saved.recordsV2).reduce(
    (sum, r) => sum + sealCount(r.seals),
    0,
  );
  $('clear-note').textContent = last
    ? `${visited >= 20 ? '二十の戸口を巡った。よい年を、迎えれよ。' : '今夜の戸口に、祝福を。'} 訪問した戸口 ${visited}/20 · お札 ${total}/60`
    : '';
  if (last) {
    // 吠える演出と灯りを見せてから操作できるようにする。
    for (const id of ['again', 'to-select']) $(id).disabled = true;
    later(() => {
      for (const id of ['again', 'to-select']) $(id).disabled = false;
      $('to-select').focus();
    }, 1500);
  } else {
    $('next').focus();
  }
}
function tick() {
  state = step(state, input());
  for (const name of state.events) {
    sound.effect(name);
    if (recording) {
      recordedEvents.push({ name, at: recordSeconds });
    }
  }
  collectPops();
  if (state.status === 'clear') {
    showClear();
  }
  if (state.status === 'over') {
    select('今夜はここでひと休み。また、里へ出かけよう。');
  }
}
function frame(now) {
  const delta = previous ? (now - previous) / 1000 : 0;
  previous = now;
  if (recording) {
    recordStart ??= now;
    recordSeconds = (now - recordStart) / 1000;
  }
  if (mode === 'playing' && !document.hidden && !manual) {
    advanceBy(delta);
  }
  requestAnimationFrame(frame);
}
// 溜めた時間ぶんだけ固定刻みで進めて描く。実時間の frame() と手動の advance() の両方がここを通る。
function advanceBy(seconds) {
  accumulator += seconds;
  while (accumulator + 1e-10 >= DT && mode === 'playing') {
    accumulator -= DT;
    tick();
  }
  paint();
}
$('start').addEventListener('click', () => select());
$('back').addEventListener('click', () => select());
$('retry').addEventListener('click', () => begin(state.id));
$('again').addEventListener('click', () => begin(state.id));
$('to-select').addEventListener('click', () => select());
$('next').addEventListener('click', () => {
  const i = LEVELS.indexOf(state.level) + 1;
  if (i >= 20) {
    select('家々を巡り終えた。よい年を、迎えれよ。');
  } else {
    begin(levelId(i), {
      lives: state.lives,
      stage: state.stage,
      score: state.score,
      rice: state.rice,
    });
  }
});
function showMute() {
  $('mute').textContent = `音：${saved.muted ? 'オフ' : 'オン'}`;
  $('mute').setAttribute('aria-pressed', String(saved.muted));
}
$('mute').addEventListener('click', () => {
  saved.muted = !saved.muted;
  sound.setMuted(saved.muted);
  showMute();
  persist();
});
window.addEventListener('keydown', e => {
  sound.unlock();
  if (mode === 'playing' && bindings[e.code]) {
    e.preventDefault();
    keys.add(e.code);
  }
  if (e.repeat) {
    return;
  }
  if (e.code === 'Escape' && mode !== 'title') {
    select();
  }
  if (e.code === 'KeyR' && mode === 'playing') {
    begin(state.id);
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('pointerdown', () => sound.unlock(), { passive: true });
for (const button of document.querySelectorAll('[data-input]')) {
  button.addEventListener('pointerdown', e => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, button.dataset.input);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, e => pointers.delete(e.pointerId));
  }
}
window.addEventListener('blur', () => {
  clearInput();
  previous = 0;
  sound.setPlaying(false);
});
window.addEventListener('focus', () => {
  previous = 0;
  sound.setPlaying(mode === 'playing');
});
document.addEventListener('visibilitychange', () => {
  clearInput();
  previous = 0;
  sound.setPlaying(!document.hidden && mode === 'playing');
});
window.addEventListener('resize', resize);
showMute();
resize();
paint();
requestAnimationFrame(frame);

// E2Eとデモ録画から使う操作・観測の窓口。
window.__day046 = {
  mode: () => mode,
  snapshot: () => ({
    id: state.id,
    stage: state.stage,
    lives: state.lives,
    mochi: state.mochi,
    rice: state.rice,
    x: state.player.x,
    y: state.player.y,
    status: state.status,
    seconds: state.elapsedTicks / 120,
    // v2 で足したもの。物理側が未対応でも既定値を返す。
    attemptScore: attemptScore(),
    collectedRice: riceOf(),
    secret: !!state.secretCollected,
    ability: state.ability ?? null,
    abilityTicks: state.abilityTicks ?? 0,
    combo: state.combo ?? 0,
    seals: state.clearResult?.seals ?? 0,
    // 画面に出ている得点の浮き文字の数。clear では0になる。
    pops: pops.length,
    lesson: lessonQueue.find(
      l => state.elapsedTicks >= l.from && state.elapsedTicks < l.to,
    )?.text ?? '',
  }),
  begin: id => begin(id),
  setInput: next => {
    inputOverride =
      next === null
        ? null
        : {
            left: !!next.left,
            right: !!next.right,
            jump: !!next.jump,
          };
  },
  // 紹介動画の撮影で、テストと同じ判断ロジックに操作を任せる。
  autopilot: on => {
    autopilot = on ? createAutopilot(state.level) : null;
  },
  // 紹介動画の音を後から合成するための記録窓口。
  // recordEvents(true) で貯め直し、events() が [{ name, at }] を返す（at は記録開始からの秒）。
  recordEvents: on => {
    recording = !!on;
    if (recording) {
      recordedEvents = [];
      recordStart = null;
      recordSeconds = 0;
    }
  },
  events: () => recordedEvents.map(event => ({ ...event })),
  recordedSeconds: () => recordSeconds,
  // 手動の時計。setManual(true) のあと advance(ms) を呼んだぶんだけ進む（紹介動画の撮影用）。
  setManual: on => {
    manual = !!on;
    accumulator = 0;
    previous = 0;
  },
  advance: ms => {
    if (mode === 'playing') advanceBy(ms / 1000);
  },
  unlockAll: () => {
    saved.unlockedWorld = 4;
    persist();
    if (mode === 'select') {
      select();
    }
  },
};
