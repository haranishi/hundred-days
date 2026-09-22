import { LEVELS, levelId } from './lib/levels.js';
import { createState, step, DT } from './lib/physics.js';
import { readStore, writeStore, recordClear } from './lib/store.js';
import { createAudio } from './lib/audio.js';
import { render } from './lib/render.js';
import { createAutopilot } from './lib/autopilot.js';
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
        button = document.createElement('button');
      button.dataset.level = id;
      button.disabled = w > saved.unlockedWorld;
      button.textContent = id;
      button.title = LEVELS[(w - 1) * 5 + n - 1].name;
      const best = document.createElement('small');
      best.textContent = saved.bestMs[id]
        ? `${(saved.bestMs[id] / 1000).toFixed(1)}秒`
        : '—';
      button.append(best);
      button.addEventListener('click', () => begin(id));
      grid.append(button);
    }
    section.append(grid);
    $('levels').append(section);
  }
  document.querySelector('#levels button:not(:disabled)')?.focus();
}
function begin(id, options = {}) {
  if (Number(id[0]) > saved.unlockedWorld) {
    return;
  }
  state = createState(id, options);
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
      Math.floor((innerHeight - 180) / 192),
    ),
  );
  canvas.style.width = `${320 * scale}px`;
  canvas.style.height = `${192 * scale}px`;
}
function paint() {
  render(ctx, state);
  $('level-label').textContent = state.id;
  $('mochi').textContent = state.mochi;
  $('form').textContent = ['● ちび', '◆ なまはげ', '✦ 荒鬼'][state.stage];
  $('lives').textContent = state.lives;
  $('time').textContent = `${(state.elapsedTicks * DT).toFixed(1)}秒`;
}
function tick() {
  state = step(state, input());
  for (const name of state.events) {
    sound.effect(name);
    if (recording) {
      recordedEvents.push({ name, at: recordSeconds });
    }
  }
  if (state.status === 'clear') {
    saved = recordClear(saved, state.id, state.elapsedTicks * DT * 1000);
    persist();
    setMode('clear');
    $('clear-time').textContent =
      `${(state.elapsedTicks * DT).toFixed(1)}秒 / ${state.score}点`;
    $('next').textContent =
      state.id === '4-5' ? '里を巡り終えた · 面えらびへ' : '次へ';
    $('next').focus();
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
window.__day047 = {
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
