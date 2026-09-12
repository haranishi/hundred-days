import { normalizeInput, MAX_CHARS } from './lib/text.js';
import { createLoader } from './lib/data.js';
import { prepareStroke } from './lib/path.js';
import { endingOf, strokeOutline, numberAnchor } from './lib/brush.js';
import { board, strokeOrder, CELL, MAX_CELLS } from './lib/layout.js';
import { buildTimeline, stateAt, timeFor, SPEEDS, DEFAULT_SPEED } from './lib/timing.js';
import * as store from './lib/store.js';

const el = (id) => document.getElementById(id);
const app = el('app');
const canvas = el('board');
const ctx = canvas.getContext('2d');

/* 筆の基準の太さ（109四方の中での値）。下書きの線はこれより細い。 */
const BRUSH = 5.8;
const GUIDE_WIDTH = 1.9;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  phase: 'empty',
  word: '',
  cells: [],
  order: [],
  timeline: { items: [], total: 0 },
  time: 0,
  playing: false,
  speed: DEFAULT_SPEED,
  guide: true,
  numbers: true,
  sound: false,
  recording: false,
  recent: [],
};

let view = { board: board(1), k: 1 };
let theme = null;
let raf = 0;
let lastFrame = 0;

const loader = createLoader({
  fetchJson: async (url) => {
    const res = await fetch(url, { cache: 'force-cache' });
    /* その並びの字が1つも入っていないファイルは置いていない。404 は「その字の
       データが無い」であって読み込みの失敗ではないので、空として扱う。ここを
       落とすと、絵文字を1つ混ぜただけで言葉ぜんぶが書けなくなる。 */
    if (res.status === 404) return {};
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  },
});

/* ---------- 色 ---------- */

function readTheme() {
  const cs = getComputedStyle(canvas);
  const pick = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  theme = {
    paper: pick('--paper', '#f7f4ec'),
    ink: pick('--ink', '#22201c'),
    guide: pick('--guide', '#c9cfd8'),
    grid: pick('--grid', '#9fb0c4'),
    number: pick('--number', '#a8442e'),
    missing: pick('--missing', '#b6b0a4'),
  };
}

/* ---------- 盤面を描く ---------- */

function paint(target, layout, scale, snapshot) {
  target.save();
  target.setTransform(scale, 0, 0, scale, 0, 0);
  target.fillStyle = theme.paper;
  target.fillRect(0, 0, layout.width, layout.height);

  layout.cells.forEach((cell, index) => {
    drawCell(target, cell);
    const data = state.cells[index];
    if (!data) return;
    if (!data.prepared) {
      drawMissing(target, cell, data.char);
      return;
    }
    data.prepared.forEach((stroke, indexInChar) => {
      const progress = progressOf(stroke, snapshot);
      if (progress <= 0) {
        if (state.guide) drawGuide(target, cell, stroke);
        return;
      }
      drawStroke(target, cell, stroke, progress);
      if (state.numbers) drawNumber(target, cell, stroke, indexInChar + 1);
    });
  });
  target.restore();
}

function drawCell(target, cell) {
  target.save();
  target.translate(cell.x, cell.y);
  target.strokeStyle = theme.grid;
  target.globalAlpha = 0.5;
  target.lineWidth = 1;
  target.strokeRect(0.5, 0.5, CELL - 1, CELL - 1);
  target.globalAlpha = 0.32;
  target.setLineDash([5, 6]);
  target.beginPath();
  target.moveTo(CELL / 2, 3);
  target.lineTo(CELL / 2, CELL - 3);
  target.moveTo(3, CELL / 2);
  target.lineTo(CELL - 3, CELL / 2);
  target.stroke();
  target.restore();
}

function drawMissing(target, cell, char) {
  target.save();
  target.translate(cell.x, cell.y);
  target.fillStyle = theme.missing;
  target.textAlign = 'center';
  target.textBaseline = 'middle';
  target.font = '64px "Hiragino Mincho ProN", "Yu Mincho", serif';
  target.fillText(char, CELL / 2, CELL / 2 - 6);
  target.font = '11px "Hiragino Sans", system-ui, sans-serif';
  target.fillText('筆順データなし', CELL / 2, CELL - 16);
  target.restore();
}

function drawGuide(target, cell, stroke) {
  target.save();
  target.translate(cell.x, cell.y);
  target.strokeStyle = theme.guide;
  target.lineWidth = GUIDE_WIDTH;
  target.lineCap = 'round';
  target.lineJoin = 'round';
  target.beginPath();
  stroke.points.forEach((p, i) => (i ? target.lineTo(p[0], p[1]) : target.moveTo(p[0], p[1])));
  target.stroke();
  target.restore();
}

function drawStroke(target, cell, stroke, progress) {
  const outline = strokeOutline(stroke.points, stroke.ending, BRUSH, progress);
  if (outline.length < 3) return;
  target.save();
  target.translate(cell.x, cell.y);
  target.fillStyle = theme.ink;
  target.beginPath();
  outline.forEach((p, i) => (i ? target.lineTo(p[0], p[1]) : target.moveTo(p[0], p[1])));
  target.closePath();
  target.fill();
  target.restore();
}

function drawNumber(target, cell, stroke, n) {
  const [x, y] = numberAnchor(stroke.points);
  target.save();
  target.translate(cell.x, cell.y);
  target.fillStyle = theme.number;
  target.textAlign = 'center';
  target.textBaseline = 'middle';
  target.font = '600 7.6px "Hiragino Sans", system-ui, sans-serif';
  const cx = Math.max(5, Math.min(CELL - 5, x));
  const cy = Math.max(5, Math.min(CELL - 5, y));
  /* 番号が画に重なっても読めるよう、紙の色で縁を取る */
  target.strokeStyle = theme.paper;
  target.lineWidth = 2.4;
  target.lineJoin = 'round';
  target.strokeText(String(n), cx, cy);
  target.fillText(String(n), cx, cy);
  target.restore();
}

/* いまの時刻で、その画をどこまで描くか。position は画の通し番号で、
   時間割を組むときに1回だけ入れてある。 */
function progressOf(stroke, snapshot) {
  if (stroke.position < snapshot.index) return 1;
  if (stroke.position > snapshot.index) return 0;
  return snapshot.progress;
}

/* ---------- 画面の大きさ ---------- */

function layoutFor(count, cssWidth) {
  const maxCols = cssWidth < 520 ? 2 : 4;
  return board(count, maxCols);
}

function resize() {
  const wrap = el('board-wrap');
  const cssWidth = Math.max(240, wrap.clientWidth);
  const layout = layoutFor(state.cells.length || 1, cssWidth);
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const fit = cssWidth / layout.width;
  canvas.style.height = `${Math.round(layout.height * fit)}px`;
  canvas.width = Math.round(layout.width * fit * dpr);
  canvas.height = Math.round(layout.height * fit * dpr);
  view = { board: layout, k: fit * dpr };
  draw();
}

function draw() {
  if (!theme) readTheme();
  paint(ctx, view.board, view.k, stateAt(state.timeline, state.time));
}

/* ---------- 状態 ---------- */

const STATUS = {
  empty: '言葉を入れて「書く」を押してください',
  loading: '筆順を読み込んでいます…',
  writing: '書いています',
  done: '書き終わりました',
  error: '筆順データを読み込めませんでした',
};

/* 状態の切り替えと描き直しは必ずここを通す。片方だけ呼ぶと画面が置いていかれる。 */
function setPhase(next, message) {
  state.phase = next;
  app.dataset.state = next;
  el('status').textContent = message || STATUS[next] || '';
  const active = next === 'writing' || next === 'done';
  el('progress').hidden = !active;
  /* 速さは書く前から選べる設定なので出したまま。「もう一度」だけ書いたあとに出す */
  el('replay').hidden = !active;
  el('ready-actions').hidden = next !== 'done';
  el('write').disabled = next === 'loading' || state.recording;
  canvas.setAttribute(
    'aria-label',
    active ? `${state.word} を筆順どおりに書いています` : STATUS[next] || ''
  );
  updateProgress();
  draw();
}

function updateProgress() {
  const total = state.order.length;
  if (!total) return;
  const snapshot = stateAt(state.timeline, state.time);
  const current = Math.min(total, snapshot.index + 1);
  el('progress-text').textContent = `${current}画目 / 全${total}画`;
  const ratio = state.timeline.total ? Math.min(1, state.time / state.timeline.total) : 0;
  el('progress-bar').style.width = `${(ratio * 100).toFixed(1)}%`;
}

/* ---------- 書く ---------- */

async function write(raw) {
  const { chars, trimmed } = normalizeInput(raw);
  el('error').hidden = true;
  if (!chars.length) {
    el('notice').hidden = true;
    setPhase('empty');
    state.cells = [];
    state.order = [];
    state.timeline = { items: [], total: 0 };
    resize();
    return;
  }
  const word = chars.join('');
  state.word = word;
  stop();
  setPhase('loading');

  let found;
  try {
    found = await loader.strokesFor(chars);
  } catch {
    setPhase('error');
    el('error').hidden = false;
    el('error').textContent = '筆順データを読み込めませんでした。通信を確かめて、もう一度お試しください。';
    return;
  }

  state.cells = found.map((item) => ({
    char: item.char,
    prepared: item.strokes
      ? item.strokes.map(([type, d]) => {
          const { points, length } = prepareStroke(d);
          return { points, length, ending: endingOf(type) };
        })
      : null,
  }));
  state.order = strokeOrder(state.cells.map((c) => ({ strokes: c.prepared })));
  state.order.forEach((entry, position) => {
    entry.stroke.position = position;
  });
  state.timeline = buildTimeline(state.order, state.speed);
  state.time = 0;

  const missing = state.cells.filter((c) => !c.prepared).map((c) => c.char);
  const notes = [];
  if (trimmed) notes.push(`${MAX_CHARS}字まで書けます。${MAX_CHARS}字目までを書きました`);
  if (missing.length) notes.push(`「${missing.join('」「')}」の筆順データがありません`);
  el('notice').hidden = notes.length === 0;
  el('notice').textContent = notes.join('。');

  state.recent = store.remember(word, state.recent);
  store.save(state.recent);
  renderRecent();

  resize();
  if (!state.order.length) {
    setPhase('done', 'この字の筆順データがありません');
    return;
  }
  if (reduceMotion.matches) {
    state.time = state.timeline.total;
    setPhase('done');
    return;
  }
  start();
}

function start() {
  setPhase('writing');
  state.playing = true;
  lastFrame = performance.now();
  setSound(state.sound);
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

function tick(now) {
  if (!state.playing) return;
  const delta = Math.min(100, now - lastFrame);
  lastFrame = now;
  state.time += delta;
  if (state.time >= state.timeline.total) {
    state.time = state.timeline.total;
    state.playing = false;
    setSound(false);
    setPhase('done');
    if (state.recording) finishRecording();
    return;
  }
  updateProgress();
  draw();
  raf = requestAnimationFrame(tick);
}

function stop() {
  state.playing = false;
  cancelAnimationFrame(raf);
  setSound(false);
}

function replay() {
  if (!state.order.length) return;
  state.time = 0;
  start();
}

function changeSpeed(key) {
  if (!SPEEDS[key] || key === state.speed) return;
  const snapshot = stateAt(state.timeline, state.time);
  state.speed = key;
  document.querySelectorAll('.speed-btn').forEach((btn) => {
    const on = btn.dataset.speed === key;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  if (!state.order.length) return;
  state.timeline = buildTimeline(state.order, key);
  state.time = snapshot.done ? state.timeline.total : timeFor(state.timeline, snapshot.index, snapshot.progress);
  updateProgress();
  draw();
}

/* ---------- 前に書いた言葉 ---------- */

function renderRecent() {
  const list = el('recent');
  list.textContent = '';
  state.recent.forEach((word) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = word;
    button.addEventListener('click', () => {
      el('word').value = word;
      write(word);
    });
    li.appendChild(button);
    list.appendChild(li);
  });
  el('recent-wrap').hidden = state.recent.length === 0;
}

/* ---------- 音 ---------- */

let audio = null;

function ensureAudio() {
  if (audio) return audio;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const context = new Ctx();
  const length = Math.floor(context.sampleRate * 2);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1700;
  filter.Q.value = 0.8;
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(context.destination);
  const tap = context.createMediaStreamDestination ? context.createMediaStreamDestination() : null;
  if (tap) gain.connect(tap);
  source.start();
  audio = { context, gain, tap };
  return audio;
}

function setSound(on) {
  if (!on) {
    if (audio) audio.gain.gain.value = 0;
    return;
  }
  const a = ensureAudio();
  if (!a) return;
  if (a.context.state === 'suspended') a.context.resume();
  a.gain.gain.value = 0.06;
}

/* ---------- 保存 ---------- */

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileStem() {
  return `stroke-by-stroke-${state.word || 'kanji'}`;
}

function savePng() {
  const layout = view.board;
  /* 画面の見た目のまま、印刷しても粗くない大きさで書き出す */
  const scale = Math.min(8, 1400 / layout.width);
  const out = document.createElement('canvas');
  out.width = Math.round(layout.width * scale);
  out.height = Math.round(layout.height * scale);
  paint(out.getContext('2d'), layout, scale, stateAt(state.timeline, state.timeline.total));
  out.toBlob((blob) => blob && download(blob, `${fileStem()}.png`), 'image/png');
}

const VIDEO_TYPES = [
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function supportedVideoType() {
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) return null;
  return VIDEO_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || null;
}

let recorder = null;
let chunks = [];

function saveVideo() {
  const type = supportedVideoType();
  if (!type || state.recording) return;
  const stream = canvas.captureStream(30);
  if (state.sound && audio && audio.tap) {
    audio.tap.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  }
  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: type });
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type });
    const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
    download(blob, `${fileStem()}.${ext}`);
    state.recording = false;
    el('save-video').textContent = '動画で保存';
    el('save-video').disabled = false;
    el('write').disabled = false;
  };
  state.recording = true;
  el('save-video').textContent = '録画中…';
  el('save-video').disabled = true;
  recorder.start();
  replay();
}

function finishRecording() {
  if (!recorder) return;
  /* 最後の1コマを入れてから止める */
  setTimeout(() => {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorder = null;
  }, 320);
}

/* ---------- 起動 ---------- */

function bind() {
  el('write-form').addEventListener('submit', (event) => {
    event.preventDefault();
    write(el('word').value);
  });
  el('replay').addEventListener('click', replay);
  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => changeSpeed(btn.dataset.speed));
  });
  el('toggle-guide').addEventListener('change', (event) => {
    state.guide = event.target.checked;
    draw();
  });
  el('toggle-numbers').addEventListener('change', (event) => {
    state.numbers = event.target.checked;
    draw();
  });
  el('toggle-sound').addEventListener('change', (event) => {
    state.sound = event.target.checked;
    setSound(state.sound && state.playing);
  });
  el('save-png').addEventListener('click', savePng);
  el('save-video').addEventListener('click', saveVideo);
  window.addEventListener('resize', resize);
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches && state.playing) {
      stop();
      state.time = state.timeline.total;
      setPhase('done');
    }
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    readTheme();
    draw();
  });
}

function boot() {
  readTheme();
  state.recent = store.load();
  renderRecent();
  el('save-video').hidden = !supportedVideoType();
  bind();
  state.cells = [];
  resize();
  setPhase('empty');
  const preset = new URLSearchParams(location.search).get('word');
  if (preset) {
    el('word').value = preset.slice(0, MAX_CELLS * 2);
    write(preset);
  }
}

boot();
