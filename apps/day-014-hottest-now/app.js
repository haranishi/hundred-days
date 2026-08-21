import {
  aliasOf, buildStations, coldestBelow, distanceKm, extremes, formatClock, histogram,
  nearestStation, normalizeQuery, rankByTemperature, rankSummary, searchStations,
  shiftStamp, stampFromIso,
} from './lib/amedas.js';

/* 気象庁の防災情報のファイルをそのまま読む。誰でも同じものが取れる静的ファイルで、
   access-control-allow-origin が * なので中継サーバーを挟まずに済む。 */
const BASE = 'https://www.jma.go.jp/bosai/amedas';
const REFRESH_MS = 5 * 60 * 1000;
const LIST_SIZE = 10;

const dom = {};
const state = {
  stations: [],
  ranked: [],
  stamp: '',
  previous: new Map(),
  selectedId: null,
  origin: null,
  animateHistogram: true,
  seenHistogram: false,
  drawToken: 0,
};

const $ = (id) => document.getElementById(id);
const fixed = (value) => value.toFixed(1);
const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${fixed(Math.abs(value))}`;

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
  render();
  watchHistogram();
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

/* ---------- 描画 ---------- */

function deltaText(id) {
  const now = state.ranked.find((station) => station.id === id) ?? state.stations.find((station) => station.id === id);
  const before = state.previous.get(id);
  if (!now || now.temperature === null || !Number.isFinite(before)) return '';
  return `1時間で ${signed(Math.round((now.temperature - before) * 10) / 10)}℃`;
}

function placeLabel(station) {
  return `${station.prefecture} ${station.name}`.trim();
}

/* 同じ名前の地点を選ばせるときと、選んだ地点を見せるときだけは、
   読みの欄に入っている別名（「雄和：秋田空港」の後ろ）も出す。 */
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

  renderLists();
  renderHistogram();
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

function mix(ratio) {
  const cold = [0, 114, 178];
  const hot = [213, 94, 0];
  const channel = (index) => Math.round(cold[index] + (hot[index] - cold[index]) * ratio);
  return `rgb(${channel(0)},${channel(1)},${channel(2)})`;
}

function renderHistogram() {
  /* 棒は「画面に入ってから」伸ばす。先に描いてしまうと、スクロールして辿り着いた頃には
     もう終わっていて、何がどれだけ多いのかが伝わらない。 */
  if (!state.seenHistogram) return;
  const canvas = dom.hist;
  const temperatures = state.ranked.map((station) => station.temperature);
  const bins = histogram(temperatures, 1);
  if (!bins.length) return;

  const lowest = bins[0].from;
  const highest = bins[bins.length - 1].to;
  const tallest = Math.max(...bins.map((bin) => bin.count), 1);
  const selected = state.selectedId ? state.ranked.find((station) => station.id === state.selectedId) : null;

  const coldest = state.ranked[state.ranked.length - 1];
  dom.distNote.textContent =
    coldest && Number.isFinite(coldest.altitude) && coldest.altitude >= 1000
      ? `左端に1本だけ離れているのは${placeLabel(coldest)}（標高${coldest.altitude.toLocaleString('ja-JP')}m）です。`
      : '';

  const context = canvas.getContext('2d');
  const start = performance.now();
  const duration = state.animateHistogram ? 700 : 0;
  state.animateHistogram = false;

  /* 起動時の描き込みは0.7秒かけて伸びる。その途中で地点が選ばれると、
     選んだ印を描いた上に、走り続けている古いコマが重ね書きして印を消してしまう。
     新しい描画が始まったら古いコマは降りる。 */
  const token = (state.drawToken += 1);

  const frame = (now) => {
    if (token !== state.drawToken) return;
    const ratio = duration ? Math.min(1, (now - start) / duration) : 1;
    const eased = 1 - (1 - ratio) ** 3;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth || 600;
    const height = canvas.clientHeight || 200;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);

    const padding = { left: 16, right: 16, top: 26, bottom: 22 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const barWidth = plotWidth / bins.length;
    const styles = getComputedStyle(document.body);
    const muted = styles.getPropertyValue('--muted').trim() || '#888';

    bins.forEach((bin, index) => {
      /* 富士山だけが入る本は1地点しかない。比率のままだと線にもならず、
         下の注記で名指ししているのに画面から消えてしまう。 */
      const raw = (bin.count / tallest) * plotHeight;
      const barHeight = (bin.count ? Math.max(2, raw) : 0) * eased;
      context.fillStyle = mix((index + 0.5) / bins.length);
      context.fillRect(
        padding.left + index * barWidth + 0.5,
        padding.top + plotHeight - barHeight,
        Math.max(1, barWidth - 1),
        barHeight,
      );
    });

    context.fillStyle = muted;
    context.font = '11px system-ui, sans-serif';
    context.textAlign = 'center';
    for (let value = Math.ceil(lowest / 5) * 5; value <= highest; value += 5) {
      const x = padding.left + ((value - lowest) / (highest - lowest)) * plotWidth;
      context.fillRect(x, padding.top + plotHeight, 1, 4);
      context.fillText(`${value}℃`, x, height - 6);
    }

    if (selected) {
      const x = padding.left + ((selected.temperature - lowest) / (highest - lowest)) * plotWidth;
      context.fillStyle = styles.getPropertyValue('--text').trim() || '#000';
      context.beginPath();
      context.moveTo(x, padding.top - 4);
      context.lineTo(x - 6, padding.top - 14);
      context.lineTo(x + 6, padding.top - 14);
      context.closePath();
      context.fill();
      context.textAlign = x > width - 60 ? 'right' : x < 60 ? 'left' : 'center';
      context.fillText(selected.name, Math.min(width - 4, Math.max(4, x)), padding.top - 18);
    }

    if (ratio < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function watchHistogram() {
  if (state.seenHistogram) return;
  if (!('IntersectionObserver' in window)) {
    state.seenHistogram = true;
    renderHistogram();
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    state.seenHistogram = true;
    renderHistogram();
  }, { threshold: 0.3 });
  observer.observe(dom.hist);
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

function select(id) {
  const station = state.stations.find((entry) => entry.id === id);
  if (!station) return;
  state.selectedId = id;

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
    renderHistogram();
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
    deltaText(id),
    state.origin ? `現在地から ${fixed(distanceKm(state.origin, station))}km` : '',
  ].filter(Boolean).join(' ／ ');

  youCard([place, temperature, rank, detail]);
  renderLists();
  renderHistogram();
}

function locate() {
  if (!navigator.geolocation) {
    message('この端末では現在地を取れませんでした。地点名で探せます。', { empty: true });
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
          ? '現在地の利用が許可されませんでした。地点名で探せます。'
          : '現在地を取れませんでした。地点名で探せます。',
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
  if (state.selectedId) select(state.selectedId);
}

/* ---------- 起動 ---------- */

function boot() {
  Object.assign(dom, {
    loading: $('loading'), error: $('error'), errorDetail: $('error-detail'), retry: $('retry'),
    main: $('main'), stamp: $('stamp'), gap: $('gap'), measuredCount: $('measured-count'),
    hotTemp: $('hot-temp'), hotPlace: $('hot-place'), hotSub: $('hot-sub'),
    coldTemp: $('cold-temp'), coldPlace: $('cold-place'), coldSub: $('cold-sub'),
    groundNote: $('ground-note'), distNote: $('dist-note'), hist: $('hist'),
    totalCount: $('total-count'), thermometerCount: $('thermometer-count'),
    top: $('top'), bottom: $('bottom'), you: $('you'), query: $('q'),
  });

  dom.retry.addEventListener('click', () => load().catch(failed));
  $('locate').addEventListener('click', locate);
  $('search').addEventListener('submit', search);
  window.addEventListener('resize', () => {
    if (!dom.main.hidden) renderHistogram();
  });

  load().catch(failed);
  setInterval(() => {
    if (document.hidden) return;
    load().catch(() => { /* 定期更新の失敗は、いま出ている値を残したまま黙って見送る */ });
  }, REFRESH_MS);
}

boot();
