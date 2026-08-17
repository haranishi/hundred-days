import { STREAM_URL, createSeen, isReadable, normalize, shorten } from './lib/events.js';
import { createRate } from './lib/rate.js';
import { createLookup } from './lib/coords.js';
import { createHotspot } from './lib/hotspot.js';
import { BOUNDS, countryAt, inBounds, project } from './lib/geo.js';
import { createMark, createRipple, stepMarks, stepRipples } from './lib/particles.js';
import { toneFor } from './lib/sound.js';

const FEED_MAX = 10;
const MARK_MAX = 900;

const el = (id) => document.getElementById(id);
const nodes = {
  canvas: el('map'),
  linkState: el('link-state'),
  sound: el('sound-toggle'),
  pause: el('pause-toggle'),
  world: el('world-count'),
  ja: el('ja-count'),
  rate: el('rate'),
  pins: el('pin-count'),
  noPlace: el('no-place-count'),
  hotName: el('hot-name'),
  hotDetail: el('hot-detail'),
  list: el('feed-list'),
  empty: el('feed-empty'),
  live: el('live-region')
};

const context = nodes.canvas.getContext('2d');
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
const seen = createSeen();
const rate = createRate();
const hotspot = createHotspot();

const state = {
  world: 0,
  ja: 0,
  pins: 0,
  noPlace: 0,
  paused: false,
  sound: false,
  link: 'connecting'
};

let countries = [];
let ripples = [];
let marks = [];
let size = { width: 0, height: 0, scale: 1 };
let frameId = 0;
let audio = null;

// ---------------------------------------------------------------- 座標の問い合わせ

/* 座標が返ってくるのは問い合わせたあとなので、届いた編集の増減バイトを覚えておいて、
   返事が来たときに点の大きさへ渡す。覚えておく数には上限をつける */
const pendingDelta = new Map();
const rememberDelta = (event) => {
  pendingDelta.set(`${event.wiki}:${event.title}`, event.delta);
  if (pendingDelta.size > 2000) pendingDelta.delete(pendingDelta.keys().next().value);
};

const lookup = createLookup({
  fetchJson: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  onFound: (spot) => pin(spot)
});

// ---------------------------------------------------------------- 数字

const formatCount = (value) => value.toLocaleString('ja-JP');

function renderCounts() {
  nodes.world.textContent = formatCount(state.world);
  nodes.ja.textContent = formatCount(state.ja);
  nodes.pins.textContent = formatCount(state.pins);
  nodes.noPlace.textContent = formatCount(state.noPlace);
  const perSecond = rate.perSecond(Date.now());
  nodes.rate.textContent = perSecond === null ? '—' : perSecond.toFixed(1);
}

function renderHotspot() {
  const top = hotspot.top(Date.now());
  if (!top) {
    nodes.hotName.textContent = 'まだ分かりません';
    nodes.hotDetail.textContent = '場所のわかる編集が届くと出ます';
    return;
  }
  nodes.hotName.textContent = top.name;
  nodes.hotDetail.textContent = `直近5分で${formatCount(top.count)}件（${formatCount(top.total)}件中・${formatCount(top.countries)}か国）`;
}

function announce() {
  if (!state.world) return;
  const top = hotspot.top(Date.now());
  nodes.live.textContent =
    `開いてから世界で${formatCount(state.world)}回、日本語版で${formatCount(state.ja)}回の編集がありました。` +
    (top ? `いちばん書き換わっている場所は${top.name}です。` : '');
}

// ---------------------------------------------------------------- 地図

function resize() {
  const rect = nodes.canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);

  /* 経度360度・緯度142度をそのまま枠いっぱいに引き伸ばすと、南米やアフリカが縦長になる。
     縦横の比を保った矩形を枠の中に置き、余りは上下（または左右）の余白にする */
  const aspect = (BOUNDS.east - BOUNDS.west) / (BOUNDS.north - BOUNDS.south);
  let viewWidth = rect.width;
  let viewHeight = viewWidth / aspect;
  if (viewHeight > rect.height) {
    viewHeight = rect.height;
    viewWidth = viewHeight * aspect;
  }

  size = {
    width: rect.width,
    height: rect.height,
    scale: Math.max(0.55, Math.min(1, rect.width / 900)),
    view: { x: (rect.width - viewWidth) / 2, y: (rect.height - viewHeight) / 2, w: viewWidth, h: viewHeight }
  };
  nodes.canvas.width = Math.max(1, Math.round(rect.width * ratio));
  nodes.canvas.height = Math.max(1, Math.round(rect.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

/** 緯度経度 → キャンバス上の座標（縦横比を保った矩形の中に置く）。 */
function toScreen(lon, lat) {
  const [x, y] = project(lon, lat, size.view.w, size.view.h);
  return [x + size.view.x, y + size.view.y];
}

function drawWorld() {
  /* 南極は画面に入れない緯度で切っているが、多角形そのものは枠の下へはみ出す。
     切り口がそのまま見えると壊れて見えるので、枠の内側だけを描く */
  context.save();
  context.beginPath();
  context.rect(size.view.x, size.view.y, size.view.w, size.view.h);
  context.clip();

  context.fillStyle = 'rgba(24, 36, 52, 0.95)';
  context.strokeStyle = 'rgba(127, 147, 173, 0.45)';
  context.lineWidth = 0.7;

  for (const country of countries) {
    for (const ring of country.r) {
      context.beginPath();
      let started = false;
      for (const [lon, lat] of ring) {
        const [x, y] = toScreen(lon, lat);
        if (started) context.lineTo(x, y);
        else {
          context.moveTo(x, y);
          started = true;
        }
      }
      context.closePath();
      context.fill();
      context.stroke();
    }
  }

  context.restore();
}

function draw() {
  context.clearRect(0, 0, size.width, size.height);
  drawWorld();

  // 残っているしるし（集中している場所ほど重なって濃くなる）
  for (const mark of marks) {
    const [x, y] = toScreen(mark.lon, mark.lat);
    context.fillStyle = mark.isJa
      ? `rgba(111, 227, 196, ${mark.alpha * 0.95})`
      : `rgba(242, 169, 106, ${mark.alpha * 0.85})`;
    context.beginPath();
    context.arc(x, y, mark.r * size.scale, 0, Math.PI * 2);
    context.fill();
  }

  // 記事名は「いちばん新しい日本語版の波紋」1つだけ。全部に出すと重なって読めない
  let newestJa = null;
  for (const ripple of ripples) if (ripple.isJa && ripple.title) newestJa = ripple;

  for (const ripple of ripples) {
    const [x, y] = toScreen(ripple.lon, ripple.lat);
    const radius = (ripple.radius ?? ripple.r) * size.scale;
    const alpha = ripple.alpha ?? 1;
    context.strokeStyle = ripple.isJa ? `rgba(111, 227, 196, ${alpha})` : `rgba(242, 169, 106, ${alpha * 0.85})`;
    context.lineWidth = ripple.isJa ? 1.8 : 1.2;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();

    if (ripple === newestJa) {
      const label = shorten(ripple.title, 14);
      context.font = `${size.width < 520 ? 12 : 15}px system-ui, sans-serif`;
      context.textAlign = 'center';
      // 地図の上に直接置くと陸の色と混ざるので、下敷きを引いてから書く
      /* 広がりきった波紋の外側に置くと、記事名だけが遠くに浮いてどのピンの話か分からなくなる。
         点のすぐ上に固定する */
      const width = context.measureText(label).width;
      const top = y - 26;
      context.fillStyle = `rgba(10, 16, 23, ${alpha * 0.8})`;
      context.fillRect(x - width / 2 - 5, top, width + 10, 18);
      context.fillStyle = `rgba(234, 240, 247, ${Math.min(1, alpha * 1.3)})`;
      context.fillText(label, x, top + 13);
    }
  }
}

let lastFrame = 0;
function frame(now) {
  const delta = lastFrame ? Math.min(64, now - lastFrame) : 16;
  lastFrame = now;
  ripples = stepRipples(ripples, delta);
  marks = stepMarks(marks, delta);
  draw();
  frameId = requestAnimationFrame(frame);
}

/** 座標が取れた編集を地図に立てる。 */
function pin(spot) {
  if (state.paused) return;
  state.pins += 1;
  hotspot.add(countryAt(spot.lon, spot.lat, countries), Date.now());
  renderCounts();
  renderHotspot();

  if (!inBounds(spot.lon, spot.lat, BOUNDS) || !size.width) return;
  const isJa = spot.wiki === 'jawiki';
  const key = `${spot.wiki}:${spot.title}`;
  const delta = spot.delta ?? pendingDelta.get(key) ?? 0;
  pendingDelta.delete(key);

  marks.push(createMark({ lon: spot.lon, lat: spot.lat, delta, isJa }));
  if (marks.length > MARK_MAX) marks.splice(0, marks.length - MARK_MAX);
  if (!calm.matches) ripples.push(createRipple({ lon: spot.lon, lat: spot.lat, delta, isJa, title: spot.title }));
  if (calm.matches) draw();
}

// ---------------------------------------------------------------- 一覧

function renderEdit(event) {
  const item = document.createElement('li');
  item.className = 'edit';
  item.dataset.title = event.title;
  item.dataset.delta = String(event.delta);

  const head = document.createElement('p');
  head.className = 'edit__head';

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

// ---------------------------------------------------------------- ストリーム

function setLink(next) {
  state.link = next;
  const label = {
    connecting: 'つないでいます',
    live: 'つながっています',
    reconnecting: 'つなぎ直しています',
    error: 'つながりません'
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
  if (!seen.accept(event.id)) return;

  state.world += 1;
  rate.push(Date.now());

  // 記事本体の編集だけが場所を持ちうる（ノートや利用者ページに座標は無い）
  if (event.namespace === 0) {
    rememberDelta(event);
    lookup.push(event);
  }

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

async function loadWorld() {
  try {
    const response = await fetch('./data/world.json');
    const world = await response.json();
    countries = Array.isArray(world.countries) ? world.countries : [];
  } catch {
    countries = [];
  }
  resize();
}

setLink('connecting');
renderCounts();
renderHotspot();
resize();
window.addEventListener('resize', resize);
await loadWorld();
connect();

if (!calm.matches) frameId = requestAnimationFrame(frame);
setInterval(renderCounts, 1000);
setInterval(renderHotspot, 2000);
setInterval(announce, 10_000);

/* 座標の問い合わせ。間隔そのものは lib/coords.js が守るので、ここは声をかけるだけ。
   「聞いたのに座標が無かった」件数＝地図に出せない編集として画面に出す */
setInterval(async () => {
  if (state.paused) return;
  const before = lookup.stats.asked;
  await lookup.tick();
  if (lookup.stats.asked !== before) {
    state.noPlace = Math.max(0, lookup.stats.asked - lookup.stats.found);
    renderCounts();
  }
}, 500);

// E2Eから中身を確かめるための覗き穴
window.__day010 = {
  get stats() {
    return {
      ...state,
      marks: marks.length,
      ripples: ripples.length,
      countries: countries.length,
      lookup: lookup.stats,
      calm: calm.matches,
      frameId
    };
  },
  pin
};
