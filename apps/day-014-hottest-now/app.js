import {
  APART, LONGITUDE_SQUEEZE, REGIONS, aliasOf, belongsApart, boundsOf, buildStations, coldestBelow,
  distanceKm, extremes, fitScale, formatClock, nearestStation, normalizeQuery, pickAt,
  rankByTemperature, rankSummary, regionBounds, searchStations, shiftStamp, stampFromIso, toScreen,
} from './lib/amedas.js';

/* 気象庁の防災情報のファイルをそのまま読む。誰でも同じものが取れる静的ファイルで、
   access-control-allow-origin が * なので中継サーバーを挟まずに済む。 */
const BASE = 'https://www.jma.go.jp/bosai/amedas';
const REFRESH_MS = 5 * 60 * 1000;
const LIST_SIZE = 10;

/* 全体を見ているか、どこかへ寄っているかの境目。寄っているときは南西諸島も
   本物の位置で描く（＝海を越えて行ける）。 */
const CLOSE_UP = 1.8;

const dom = {};
const state = {
  stations: [],
  ranked: [],
  stamp: '',
  previous: new Map(),
  selectedId: null,
  origin: null,
};
const map = {
  view: { longitude: 138, latitude: 38, scale: 20 },
  base: 20,
  home: null,
  size: { width: 0, height: 0 },
  drawn: [],
  inset: null,
  flight: null,
};

const $ = (id) => document.getElementById(id);
const fixed = (value) => value.toFixed(1);
const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${fixed(Math.abs(value))}`;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function fetchWithTimeout(url, { asText = false, timeout = 12_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
    if (!response.ok) throw new Error(`${response.status}`);
    return asText ? await response.text() : await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 読み込み ---------- */

async function load() {
  dom.loading.hidden = false;
  dom.error.hidden = true;

  const latest = await fetchWithTimeout(`${BASE}/data/latest_time.txt`, { asText: true });
  const stamp = stampFromIso(latest.trim());
  if (!/^\d{14}$/.test(stamp)) throw new Error('観測時刻を読めませんでした');

  const [table, observations] = await Promise.all([
    fetchWithTimeout(`${BASE}/const/amedastable.json`),
    fetchWithTimeout(`${BASE}/data/map/${stamp}.json`),
  ]);

  state.stamp = stamp;
  state.stations = buildStations(table, observations);
  state.ranked = rankByTemperature(state.stations);
  if (!state.ranked.length) throw new Error('気温の観測値が1件も入っていませんでした');

  dom.loading.hidden = true;
  dom.main.hidden = false;
  setUpMap();
  render();
  loadPrevious(stamp);
}

/* 1時間前のスナップショットも同じ形で置いてある。無くても画面は成り立つので、
   届いてから差分を書き足す。 */
async function loadPrevious(stamp) {
  const before = shiftStamp(stamp, -60);
  if (!before) return;
  try {
    const observations = await fetchWithTimeout(`${BASE}/data/map/${before}.json`);
    const previous = new Map();
    for (const [id, record] of Object.entries(observations)) {
      const temp = record?.temp;
      if (Array.isArray(temp) && temp[1] === 0 && Number.isFinite(temp[0])) previous.set(id, temp[0]);
    }
    if (stamp !== state.stamp) return;
    state.previous = previous;
    render();
  } catch {
    /* 1時間前が取れなくても、いまの順位は出せる */
  }
}

function failed(error) {
  dom.loading.hidden = true;
  dom.main.hidden = true;
  dom.error.hidden = false;
  dom.errorDetail.textContent =
    error?.name === 'AbortError'
      ? '気象庁の応答が返ってきませんでした。電波の届く場所で、もう一度お試しください。'
      : '気象庁のデータに繋がりませんでした。時間をおいて、もう一度お試しください。';
}

/* ---------- 文字にする ---------- */

function deltaText(id) {
  const now = state.ranked.find((station) => station.id === id) ?? state.stations.find((station) => station.id === id);
  const before = state.previous.get(id);
  if (!now || now.temperature === null || !Number.isFinite(before)) return '';
  return `1時間で ${signed(Math.round((now.temperature - before) * 10) / 10)}℃`;
}

const placeLabel = (station) => `${station.prefecture} ${station.name}`.trim();

/* 同じ名前の地点を選ばせるときと、選んだ地点を見せるときだけは、
   読みの欄に入っている別名（「ユウワ：秋田空港」の後ろ）も出す。 */
function detailedLabel(station) {
  const alias = aliasOf(station);
  return alias ? `${placeLabel(station)}（${alias}）` : placeLabel(station);
}

function render() {
  const summary = extremes(state.ranked);
  dom.stamp.textContent = formatClock(state.stamp);
  dom.gap.textContent = fixed(summary.gap);
  dom.measuredCount.textContent = String(state.ranked.length);
  /* 地点の数は増えたり減ったりする。書き置きの数字が古びないよう、注記もその日の実数で出す。 */
  dom.totalCount.textContent = state.stations.length.toLocaleString('ja-JP');
  dom.thermometerCount.textContent = state.stations
    .filter((station) => station.hasThermometer).length.toLocaleString('ja-JP');

  const parts = (station) => [
    Number.isFinite(station.altitude) ? `標高${station.altitude.toLocaleString('ja-JP')}m` : '',
    deltaText(station.id),
  ].filter(Boolean).join(' ／ ');

  dom.hotTemp.textContent = fixed(summary.hottest.temperature);
  dom.hotPlace.textContent = placeLabel(summary.hottest);
  dom.hotSub.textContent = parts(summary.hottest);
  dom.coldTemp.textContent = fixed(summary.coldest.temperature);
  dom.coldPlace.textContent = placeLabel(summary.coldest);
  dom.coldSub.textContent = parts(summary.coldest);

  const ground = coldestBelow(state.ranked, 1000);
  dom.groundNote.textContent =
    ground && ground.id !== summary.coldest.id
      ? `いちばん寒い場所は、たいてい山の上です。標高1,000mより低い観測所に限ると、いちばん低いのは${placeLabel(ground)}の${fixed(ground.temperature)}℃。`
      : '';

  renderLegend();
  renderLists();
  drawMap();
  renderYou();
}

function listItem(station) {
  const li = document.createElement('li');
  if (station.id === state.selectedId) li.className = 'is-you';
  const rank = document.createElement('span');
  rank.className = 'r';
  rank.textContent = `${station.rank}`;
  const name = document.createElement('span');
  name.className = 'n';
  const pref = document.createElement('small');
  pref.textContent = station.prefecture;
  name.append(pref, document.createTextNode(station.name));
  const temp = document.createElement('span');
  temp.className = 't';
  temp.textContent = `${fixed(station.temperature)}℃`;
  li.append(rank, name, temp);
  return li;
}

function renderLists() {
  dom.top.replaceChildren(...state.ranked.slice(0, LIST_SIZE).map(listItem));
  dom.bottom.replaceChildren(...state.ranked.slice(-LIST_SIZE).reverse().map(listItem));
}

/* ---------- 地図 ---------- */

/* 寒色から暖色へ。両端は色の見え方が違う人にも分かれる2色（青と朱）にしてある。 */
const RAMP = [
  { at: 0.00, rgb: [0, 92, 158] },
  { at: 0.30, rgb: [86, 156, 200] },
  { at: 0.52, rgb: [176, 176, 168] },
  { at: 0.74, rgb: [214, 140, 60] },
  { at: 1.00, rgb: [200, 74, 0] },
];

/* 点は900個以上あるので、上下の気温は描くたびに1回だけ出して使い回す。 */
function heat(temperature, span) {
  const { lo, hi } = span;
  const t = hi === lo ? 0.5 : Math.min(1, Math.max(0, (temperature - lo) / (hi - lo)));
  let a = RAMP[0];
  let b = RAMP[RAMP.length - 1];
  for (let i = 0; i < RAMP.length - 1; i += 1) {
    if (t >= RAMP[i].at && t <= RAMP[i + 1].at) { a = RAMP[i]; b = RAMP[i + 1]; break; }
  }
  const k = b.at === a.at ? 0 : (t - a.at) / (b.at - a.at);
  const channel = (index) => Math.round(a.rgb[index] + (b.rgb[index] - a.rgb[index]) * k);
  return `rgb(${channel(0)},${channel(1)},${channel(2)})`;
}

function temperatureSpan() {
  const summary = extremes(state.ranked);
  return { lo: summary.coldest.temperature, hi: summary.hottest.temperature };
}

function renderLegend() {
  const span = temperatureSpan();
  dom.rampLo.textContent = `${Math.floor(span.lo)}℃`;
  dom.rampHi.textContent = `${Math.ceil(span.hi)}℃`;
  dom.ramp.style.background = `linear-gradient(90deg, ${RAMP
    .map((stop) => `${heat(span.lo + (span.hi - span.lo) * stop.at, span)} ${stop.at * 100}%`)
    .join(', ')})`;
}

function setUpMap() {
  map.home = boundsOf(state.stations.filter((station) => !belongsApart(station)), 0.3);
  layoutMap();
  map.view.longitude = (map.home.west + map.home.east) / 2;
  map.view.latitude = (map.home.south + map.home.north) / 2;
  map.view.scale = map.base;
}

function layoutMap() {
  const canvas = dom.map;
  const rect = canvas.getBoundingClientRect();
  map.size = { width: rect.width, height: rect.height };
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
  if (map.home) map.base = fitScale(map.home, rect.width, rect.height, 18);
}

/* 南西諸島の別枠は、本土の点と重ならない隅に置く。画面の向きで空いている隅が
   変わるので、描くたびにいちばん空いている隅を選ぶ。 */
function placeInset(mainDots) {
  const { width, height } = map.size;
  const w = Math.min(220, Math.max(140, width * 0.32));
  const h = Math.min(140, Math.max(96, height * 0.28));
  const margin = 12;
  const candidates = [
    { x: margin, y: height - h - margin },
    { x: margin, y: margin },
    { x: width - w - margin, y: height - h - margin },
    { x: width - w - margin, y: margin + 76 },
  ];
  let best = null;
  for (const box of candidates) {
    if (box.y < 0 || box.y + h > height) continue;
    let hits = 0;
    for (const dot of mainDots) {
      if (dot.x > box.x - 8 && dot.x < box.x + w + 8 && dot.y > box.y - 8 && dot.y < box.y + h + 8) hits += 1;
    }
    if (!best || hits < best.hits) best = { ...box, hits };
  }
  const chosen = best ?? { x: margin, y: height - h - margin };
  map.inset = {
    x: chosen.x, y: chosen.y, w, h,
    scale: fitScale(APART, w, h, 10),
    longitude: (APART.west + APART.east) / 2,
    latitude: (APART.south + APART.north) / 2,
  };
}

function drawMap() {
  if (!map.home || !state.stations.length) return;
  const canvas = dom.map;
  const context = canvas.getContext('2d');
  const { width, height } = map.size;
  const styles = getComputedStyle(document.body);
  const muted = styles.getPropertyValue('--muted').trim() || '#888';
  const surface = styles.getPropertyValue('--surface').trim() || '#fff';
  const border = styles.getPropertyValue('--border').trim() || '#ccc';
  const text = styles.getPropertyValue('--text').trim() || '#000';

  const span = temperatureSpan();
  context.clearRect(0, 0, width, height);
  map.drawn = [];

  const zoom = map.view.scale / map.base;
  const overview = zoom <= CLOSE_UP;
  const radius = Math.max(1.7, Math.min(6.5, 2.0 * Math.sqrt(zoom)));

  const mainDots = [];
  for (const station of state.stations) {
    if (overview && belongsApart(station)) continue;
    const point = toScreen(station, map.view, map.size);
    if (point.x < -20 || point.x > width + 20 || point.y < -20 || point.y > height + 20) continue;
    mainDots.push({ station, x: point.x, y: point.y });
  }

  const insetDots = [];
  if (overview) {
    placeInset(mainDots);
    context.save();
    context.globalAlpha = 0.6;
    context.fillStyle = surface;
    context.beginPath();
    context.roundRect(map.inset.x, map.inset.y, map.inset.w, map.inset.h, 8);
    context.fill();
    context.globalAlpha = 1;
    context.strokeStyle = border;
    context.stroke();
    context.fillStyle = muted;
    context.font = '11px system-ui, sans-serif';
    context.textAlign = 'left';
    context.fillText('南西諸島（別の縮尺）', map.inset.x + 8, map.inset.y + 15);
    context.restore();

    for (const station of state.stations) {
      if (!belongsApart(station)) continue;
      const point = toScreen(station, { ...map.inset, scale: map.inset.scale }, { width: map.inset.w, height: map.inset.h });
      const x = map.inset.x + point.x;
      const y = map.inset.y + point.y;
      if (x < map.inset.x + 2 || x > map.inset.x + map.inset.w - 2) continue;
      if (y < map.inset.y + 19 || y > map.inset.y + map.inset.h - 2) continue;
      insetDots.push({ station, x, y });
    }
  }

  for (const dot of [...mainDots, ...insetDots]) {
    map.drawn.push(dot);
    if (dot.station.temperature === null) {
      context.fillStyle = muted;
      context.globalAlpha = 0.32;
      context.beginPath();
      context.arc(dot.x, dot.y, Math.max(1, radius * 0.5), 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      continue;
    }
    context.fillStyle = heat(dot.station.temperature, span);
    context.beginPath();
    context.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
    context.fill();
  }

  /* 地名は「拡大率」ではなく「画面に見えている点の数」で出す。南西諸島のように
     広くても点が少ない場所では、寄らなくても名前が読めたほうがいい。 */
  const visible = map.drawn.filter((dot) => dot.station.temperature !== null);
  if (visible.length <= 400) {
    context.font = '600 11px "Hiragino Sans", system-ui, sans-serif';
    context.textAlign = 'center';
    context.lineWidth = 3;
    context.strokeStyle = surface;
    context.fillStyle = text;
    const shown = [];
    for (const dot of visible) {
      if (shown.some((other) => Math.abs(other.x - dot.x) < 52 && Math.abs(other.y - dot.y) < 18)) continue;
      shown.push(dot);
      context.strokeText(dot.station.name, dot.x, dot.y - radius - 5);
      context.fillText(dot.station.name, dot.x, dot.y - radius - 5);
      if (shown.length > 80) break;
    }
  }

  if (state.selectedId) {
    const dot = map.drawn.find((item) => item.station.id === state.selectedId);
    if (dot) {
      context.strokeStyle = text;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(dot.x, dot.y, radius + 6, 0, Math.PI * 2);
      context.stroke();
    }
  }

  canvas.dataset.drawn = String(map.drawn.length);
  canvas.dataset.focus = state.selectedId ?? '';
}

function flyTo(bounds, padding = 30) {
  if (!bounds) return;
  const target = {
    longitude: (bounds.west + bounds.east) / 2,
    latitude: (bounds.south + bounds.north) / 2,
    scale: Math.max(map.base, fitScale(bounds, map.size.width, map.size.height, padding)),
  };
  if (reduceMotion) {
    Object.assign(map.view, target);
    drawMap();
    return;
  }
  const from = { ...map.view };
  const started = performance.now();
  const token = Symbol('flight');
  map.flight = token;
  const step = (now) => {
    if (map.flight !== token) return;
    const t = Math.min(1, (now - started) / 620);
    const eased = 1 - (1 - t) ** 3;
    map.view.longitude = from.longitude + (target.longitude - from.longitude) * eased;
    map.view.latitude = from.latitude + (target.latitude - from.latitude) * eased;
    map.view.scale = from.scale + (target.scale - from.scale) * eased;
    drawMap();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function flyToStation(station) {
  flyTo({
    west: station.longitude - 1.1, east: station.longitude + 1.1,
    south: station.latitude - 0.8, north: station.latitude + 0.8,
  }, 26);
}

function setUpRegions() {
  for (const region of REGIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = region.label;
    button.setAttribute('aria-pressed', region.home ? 'true' : 'false');
    button.addEventListener('click', () => {
      for (const other of dom.regions.querySelectorAll('button')) other.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
      flyTo(regionBounds(state.stations, region), region.home ? 18 : 34);
    });
    dom.regions.append(button);
  }
}

function setUpPointer() {
  const canvas = dom.map;
  const pointers = new Map();
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;
  let pinch = null;

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      dragging = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.classList.add('is-dragging');
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: map.view.scale };
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      map.view.scale = Math.min(map.base * 30, Math.max(map.base, pinch.scale * (distance / pinch.distance)));
      map.flight = null;
      drawMap();
      return;
    }
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    lastX = event.clientX;
    lastY = event.clientY;
    map.view.longitude -= dx / (LONGITUDE_SQUEEZE * map.view.scale);
    map.view.latitude += dy / map.view.scale;
    map.flight = null;
    drawMap();
  });

  const release = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      dragging = false;
      canvas.classList.remove('is-dragging');
    }
  };

  canvas.addEventListener('pointerup', (event) => {
    const wasMoved = moved;
    release(event);
    if (wasMoved) return;
    const rect = canvas.getBoundingClientRect();
    const hit = pickAt(map.drawn, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (hit) select(hit.station.id, { fly: false });
  });
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left - map.size.width / 2;
    const y = event.clientY - rect.top - map.size.height / 2;
    const before = map.view.scale;
    const after = Math.min(map.base * 30, Math.max(map.base, before * (event.deltaY < 0 ? 1.16 : 0.86)));
    // 指のある場所を動かさずに寄る
    map.view.longitude += (x / LONGITUDE_SQUEEZE) * (1 / before - 1 / after);
    map.view.latitude -= y * (1 / before - 1 / after);
    map.view.scale = after;
    map.flight = null;
    drawMap();
  }, { passive: false });
}

/* ---------- あなたの街（空・読込中・エラー・不正入力はここに集まる） ---------- */

function youCard(children, { empty = false } = {}) {
  const card = document.createElement('div');
  card.className = empty ? 'you__card you__card--empty' : 'you__card';
  card.append(...children);
  dom.you.replaceChildren(card);
}

function message(text, { empty = false, choices = [] } = {}) {
  const paragraph = document.createElement('p');
  paragraph.className = 'you__msg';
  paragraph.textContent = text;
  const nodes = [paragraph];
  if (choices.length) {
    const box = document.createElement('div');
    box.className = 'choices';
    for (const station of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = detailedLabel(station);
      button.addEventListener('click', () => select(station.id));
      box.append(button);
    }
    nodes.push(box);
  }
  youCard(nodes, { empty });
}

function select(id, { fly = true } = {}) {
  const station = state.stations.find((entry) => entry.id === id);
  if (!station) return;
  state.selectedId = id;
  if (fly) flyToStation(station);

  if (station.temperature === null) {
    /* 空の状態。ここは故障ではなく「そもそも気温を測っていない」ことがほとんど。 */
    const alternative = nearestStation(state.stations, station, { requireTemperature: true });
    const reason = station.hasThermometer
      ? `${placeLabel(station)}は、いまの気温が届いていません。`
      : `${placeLabel(station)}は雨量などだけを測っていて、気温は測っていません。`;
    const suffix = alternative
      ? `気温を測っているいちばん近い観測所は${placeLabel(alternative.station)}（${fixed(alternative.distance)}km）です。`
      : '';
    message(`${reason}${suffix}`, { empty: true, choices: alternative ? [alternative.station] : [] });
    renderLists();
    drawMap();
    return;
  }

  const summary = rankSummary(state.ranked, id);
  const hottest = state.ranked[0];
  const place = document.createElement('p');
  place.className = 'you__place';
  place.textContent = detailedLabel(station);

  const temperature = document.createElement('p');
  temperature.className = 'you__temp';
  temperature.textContent = `${fixed(summary.temperature)}℃`;

  const rank = document.createElement('p');
  rank.className = 'you__rank';
  const number = document.createElement('b');
  number.textContent = String(summary.rank);
  rank.append(
    document.createTextNode(`${summary.total}地点中 `),
    number,
    document.createTextNode(summary.tied > 1 ? `位（同じ気温が${summary.tied}地点）` : '位'),
  );

  const detail = document.createElement('p');
  detail.className = 'you__sub';
  detail.textContent = [
    summary.id === hottest.id
      ? 'いまの日本でいちばん暑いのはここです'
      : `1位の${hottest.name}とは ${fixed(Math.round((hottest.temperature - summary.temperature) * 10) / 10)}℃差`,
    Number.isFinite(station.altitude) ? `標高${station.altitude.toLocaleString('ja-JP')}m` : '',
    deltaText(id),
    state.origin ? `現在地から ${fixed(distanceKm(state.origin, station))}km` : '',
  ].filter(Boolean).join(' ／ ');

  youCard([place, temperature, rank, detail]);
  renderLists();
  drawMap();
}

function locate() {
  if (!navigator.geolocation) {
    message('この端末では現在地を取れませんでした。地図から選ぶか、地点名で探せます。', { empty: true });
    return;
  }
  message('現在地を確認しています…');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.origin = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const nearest = nearestStation(state.stations, state.origin);
      if (!nearest) {
        message('近くに観測所が見つかりませんでした。', { empty: true });
        return;
      }
      select(nearest.station.id);
    },
    (error) => {
      message(
        error?.code === 1
          ? '現在地の利用が許可されませんでした。地図から選ぶか、地点名で探せます。'
          : '現在地を取れませんでした。地図から選ぶか、地点名で探せます。',
        { empty: true },
      );
    },
    { timeout: 10_000, maximumAge: 60_000 },
  );
}

function search(event) {
  event.preventDefault();
  const query = dom.query.value;
  if (!normalizeQuery(query)) {
    message('地点名を入れてください。「秋田」「那覇」のように市町村名や地名で探せます。', { empty: true });
    return;
  }
  const hits = searchStations(state.stations, query);
  if (!hits.length) {
    message(`「${query.trim()}」という観測所は見つかりませんでした。市町村名より狭い地名のことが多いので、近くの地名でも試してみてください。`, { empty: true });
    return;
  }
  if (hits.length === 1) {
    select(hits[0].id);
    return;
  }
  message(`「${query.trim()}」に当てはまる観測所が${hits.length}か所あります。`, { choices: hits });
}

function renderYou() {
  if (state.selectedId) select(state.selectedId, { fly: false });
}

/* ---------- 起動 ---------- */

function boot() {
  Object.assign(dom, {
    loading: $('loading'), error: $('error'), errorDetail: $('error-detail'), retry: $('retry'),
    main: $('main'), stamp: $('stamp'), gap: $('gap'), measuredCount: $('measured-count'),
    hotTemp: $('hot-temp'), hotPlace: $('hot-place'), hotSub: $('hot-sub'),
    coldTemp: $('cold-temp'), coldPlace: $('cold-place'), coldSub: $('cold-sub'),
    groundNote: $('ground-note'), map: $('map'), regions: $('regions'),
    ramp: $('ramp'), rampLo: $('ramp-lo'), rampHi: $('ramp-hi'),
    top: $('top'), bottom: $('bottom'), you: $('you'), query: $('q'),
    totalCount: $('total-count'), thermometerCount: $('thermometer-count'),
  });

  dom.retry.addEventListener('click', () => load().catch(failed));
  $('locate').addEventListener('click', locate);
  $('search').addEventListener('submit', search);
  setUpRegions();
  setUpPointer();
  window.addEventListener('resize', () => {
    if (dom.main.hidden) return;
    layoutMap();
    drawMap();
  });

  load().catch(failed);
  setInterval(() => {
    if (document.hidden) return;
    load().catch(() => { /* 定期更新の失敗は、いま出ている値を残したまま黙って見送る */ });
  }, REFRESH_MS);
}

boot();
