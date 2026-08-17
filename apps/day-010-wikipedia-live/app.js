import { STREAM_URL, createSeen, isReadable, normalize, shorten } from './lib/events.js';
import { createRate } from './lib/rate.js';
import { createDrop, createRipple, createSink, stepDrops, stepRipples, stepSinks } from './lib/particles.js';
import { toneFor } from './lib/sound.js';

const FEED_MAX = 10;
const DROP_MAX = 300;
const WATER_RATIO = 0.72; // styles.css の水面グラデーション（71〜73%）と合わせる

const el = (id) => document.getElementById(id);
const nodes = {
  canvas: el('water'),
  linkState: el('link-state'),
  sound: el('sound-toggle'),
  pause: el('pause-toggle'),
  world: el('world-count'),
  ja: el('ja-count'),
  rate: el('rate'),
  list: el('feed-list'),
  empty: el('feed-empty'),
  live: el('live-region'),
};

const context = nodes.canvas.getContext('2d');
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
const seen = createSeen();
const rate = createRate();

const state = {
  world: 0,
  ja: 0,
  paused: false,
  sound: false,
  link: 'connecting',
};

let drops = [];
let ripples = [];
let sinks = [];
let size = { width: 0, height: 0, waterY: 0, scale: 1 };
let frameId = 0;
let audio = null;

// ---------------------------------------------------------------- 数字

const formatCount = (value) => value.toLocaleString('ja-JP');

function renderCounts() {
  nodes.world.textContent = formatCount(state.world);
  nodes.ja.textContent = formatCount(state.ja);
  const perSecond = rate.perSecond(Date.now());
  nodes.rate.textContent = perSecond === null ? '—' : perSecond.toFixed(1);
}

function announce() {
  if (!state.world) return;
  nodes.live.textContent = `開いてから世界で${formatCount(state.world)}回、日本語版で${formatCount(state.ja)}回の編集がありました。`;
}

// ---------------------------------------------------------------- 一覧

function renderEdit(event) {
  const item = document.createElement('li');
  item.className = 'edit';
  item.dataset.title = event.title;
  item.dataset.delta = String(event.delta);

  const head = document.createElement('p');
  head.className = 'edit__head';

  // 記事名から本物のウィキペディアへ飛べるようにする（これは本当のデータだ、と自分で確かめられる）
  const title = document.createElement(event.url ? 'a' : 'span');
  title.className = 'edit__title';
  title.textContent = event.title;
  if (event.url) {
    title.href = event.url;
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
  }

  const delta = document.createElement('span');
  delta.className = 'edit__delta';
  delta.dataset.dir = event.delta < 0 ? 'down' : 'up';
  delta.textContent = `${event.delta >= 0 ? '+' : '−'}${formatCount(Math.abs(event.delta))}バイト`;

  head.append(title, delta);
  item.append(head);

  if (event.comment) {
    const comment = document.createElement('p');
    comment.className = 'edit__comment';
    // 一覧の見た目が1件で崩れないよう、要約はカード2行ぶんで切る
    comment.textContent = shorten(event.comment, 60);
    item.append(comment);
  }

  const badges = [];
  if (event.type === 'new') badges.push('新しい記事');
  if (event.bot) badges.push('ボット');
  if (event.minor) badges.push('細部の編集');
  if (event.commentMasked) badges.push('利用者名を伏せました');
  if (badges.length) {
    const row = document.createElement('p');
    row.className = 'edit__badges';
    for (const text of badges) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = text;
      row.append(badge);
    }
    item.append(row);
  }

  nodes.list.prepend(item);
  while (nodes.list.children.length > FEED_MAX) nodes.list.lastElementChild.remove();
  nodes.empty.hidden = true;
}

// ---------------------------------------------------------------- 音（日本語版だけ鳴らす）

function play(delta) {
  if (!state.sound || !audio) return;
  const tone = toneFor(delta);
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const seconds = tone.durationMs / 1000;

  oscillator.type = tone.timbre;
  oscillator.frequency.setValueAtTime(tone.freq, now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(tone.gain, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + seconds + 0.05);
}

// ---------------------------------------------------------------- 水面

function resize() {
  const rect = nodes.canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  size = {
    width: rect.width,
    height: rect.height,
    waterY: rect.height * WATER_RATIO,
    // 狭い画面では粒を小さくする。同じ半径のままだと、スマホでは風船のように見える
    scale: Math.max(0.5, Math.min(1, rect.width / 900)),
  };
  nodes.canvas.width = Math.max(1, Math.round(rect.width * ratio));
  nodes.canvas.height = Math.max(1, Math.round(rect.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (calm.matches) draw();
}

function spawn(event) {
  if (calm.matches || !size.width) return;
  const margin = 24;
  const x = margin + Math.random() * Math.max(1, size.width - margin * 2);
  drops.push(
    createDrop({
      id: event.id,
      x,
      delta: event.delta,
      isJa: event.isJa,
      title: event.title,
      // 日本語版は5〜6秒に1件しか来ない。ゆっくり落として、画面にいる時間を長くする
      speed: event.isJa ? 130 + Math.random() * 60 : 230 + Math.random() * 150,
    }),
  );
  if (drops.length > DROP_MAX) drops.splice(0, drops.length - DROP_MAX);
}

function drawWaterline() {
  context.strokeStyle = 'rgba(111, 227, 196, 0.32)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, size.waterY);
  context.lineTo(size.width, size.waterY);
  context.stroke();
}

function draw() {
  context.clearRect(0, 0, size.width, size.height);
  drawWaterline();

  // 沈んでいく粒（水面下を空白にしないための余韻）
  for (const sink of sinks) {
    context.fillStyle = sink.isJa
      ? `rgba(111, 227, 196, ${sink.alpha ?? 0.4})`
      : `rgba(127, 147, 173, ${(sink.alpha ?? 0.4) * 0.8})`;
    context.beginPath();
    context.ellipse(sink.x, sink.y, (sink.radius ?? sink.r) * size.scale, (sink.radius ?? sink.r) * size.scale * 0.6, 0, 0, Math.PI * 2);
    context.fill();
  }

  // 記事名は「いちばん新しい日本語版の波紋」1つだけに出す。
  // 全部に出すと、近い場所に落ちた2件の文字が重なってどちらも読めなくなる
  let newestJa = null;
  for (const ripple of ripples) if (ripple.isJa && ripple.title) newestJa = ripple;

  for (const ripple of ripples) {
    const radius = (ripple.radius ?? ripple.r) * size.scale;
    const alpha = ripple.alpha ?? 1;
    context.strokeStyle = ripple.isJa
      ? `rgba(111, 227, 196, ${alpha})`
      : `rgba(127, 147, 173, ${alpha * 0.75})`;
    context.lineWidth = ripple.isJa ? 1.8 : 1.2;
    context.beginPath();
    context.ellipse(ripple.x, ripple.y, radius, radius * 0.32, 0, 0, Math.PI * 2);
    context.stroke();

    if (ripple === newestJa) {
      context.fillStyle = `rgba(234, 240, 247, ${Math.min(1, alpha * 1.3)})`;
      context.font = `${size.width < 520 ? 13 : 17}px system-ui, sans-serif`;
      context.textAlign = 'center';
      context.fillText(shorten(ripple.title, 14), ripple.x, ripple.y - 14 - radius * 0.32);
    }
  }

  for (const drop of drops) {
    const radius = drop.r * size.scale;
    // 縦にのばして雨粒の形にする（丸のままだと落ちている感じが出ない）
    context.fillStyle = drop.isJa ? 'rgba(111, 227, 196, 0.95)' : 'rgba(127, 147, 173, 0.62)';
    context.beginPath();
    context.ellipse(drop.x, drop.y, radius, radius * 1.45, 0, 0, Math.PI * 2);
    context.fill();

    if (drop.isJa) {
      // 日本語版はめったに落ちてこないので、落下中から光らせて見つけやすくする
      context.strokeStyle = 'rgba(111, 227, 196, 0.28)';
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(drop.x, drop.y, radius + 4, radius * 1.45 + 4, 0, 0, Math.PI * 2);
      context.stroke();
    }
  }
}

let lastFrame = 0;
function frame(now) {
  const delta = lastFrame ? Math.min(64, now - lastFrame) : 16;
  lastFrame = now;

  const stepped = stepDrops(drops, delta, size.waterY);
  drops = stepped.drops;
  for (const landed of stepped.landed) {
    ripples.push(createRipple(landed));
    sinks.push(createSink(landed));
  }
  ripples = stepRipples(ripples, delta);
  sinks = stepSinks(sinks, delta);

  draw();
  frameId = requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- ストリーム

function setLink(next) {
  state.link = next;
  const label = {
    connecting: 'つないでいます',
    live: 'つながっています',
    reconnecting: 'つなぎ直しています',
    error: 'つながりません',
  }[next];
  nodes.linkState.dataset.state = next;
  nodes.linkState.textContent = state.paused ? `${label}（一時停止中）` : label;
}

function receive(raw) {
  if (state.paused) return;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  const event = normalize(parsed);
  if (!event) return;
  // 再接続でストリームが同じイベントを送り直しても、数字を二重に増やさない
  if (!seen.accept(event.id)) return;

  state.world += 1;
  rate.push(Date.now());
  spawn(event);

  if (isReadable(event)) {
    state.ja += 1;
    renderEdit(event);
    play(event.delta);
  }

  renderCounts();
}

function connect() {
  const stream = new EventSource(STREAM_URL);

  stream.addEventListener('open', () => setLink('live'));
  stream.addEventListener('message', (message) => receive(message.data));
  stream.addEventListener('error', () => {
    // EventSource は自分で再接続する。閉じ切った時だけ「つながりません」にする
    setLink(stream.readyState === EventSource.CLOSED ? 'error' : 'reconnecting');
  });

  return stream;
}

// ---------------------------------------------------------------- 操作

nodes.sound.addEventListener('click', () => {
  state.sound = !state.sound;
  if (state.sound && !audio) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioCtor) audio = new AudioCtor();
  }
  if (state.sound && audio && audio.state === 'suspended') audio.resume();
  nodes.sound.setAttribute('aria-pressed', String(state.sound));
  nodes.sound.textContent = state.sound ? '音を消す' : '音を出す';
});

nodes.pause.addEventListener('click', () => {
  state.paused = !state.paused;
  nodes.pause.setAttribute('aria-pressed', String(state.paused));
  nodes.pause.textContent = state.paused ? '再開する' : '一時停止';
  setLink(state.link);
});

// ---------------------------------------------------------------- 起動

resize();
window.addEventListener('resize', resize);
setLink('connecting');
renderCounts();
connect();

if (!calm.matches) frameId = requestAnimationFrame(frame);
setInterval(renderCounts, 1000);
setInterval(announce, 10_000);

// E2Eから中身を確かめるための覗き穴
window.__day010 = {
  get stats() {
    return { ...state, drops: drops.length, ripples: ripples.length, sinks: sinks.length, calm: calm.matches, frameId };
  },
};
