import { indexBaths, loadBaths, loadStats } from './lib/data.js';
import { DEFAULT_METRIC, METRIC_IDS, headline, prefHeadline, sentoTrend, topLabels } from './lib/metrics.js';
import { buildPillars } from './lib/pillars.js';
import { MAIN_ISLAND_EDGES, inJapan, robustBounds } from './lib/geo.js';
import { filterByType, nearestBaths, sortBaths } from './lib/baths.js';
import { noticeText, readParams, writeParams } from './lib/url.js';
import { isVisited, loadVisited, removeVisited, safeStorage, saveVisited, toggleVisited } from './lib/visited.js';
import { createOnsenMap } from './lib/map.js';
import {
  renderBathCard, renderHeadline, renderMetricButtons, renderNearCard, renderPrefCard, renderPrefSelect, renderRanking,
  renderVisitedButton, renderVisitedCard, setAppState, showNotice, showTip,
} from './lib/render.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const PREF_CODES = Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, '0'));
const LIST_STEP = 50;
const NEAR_KM = 20;
const NEAR_LIMIT = 10;
// 全国の構図に収める点：主な4島の外形と、沖縄県を除く県庁所在地（沖縄は画面の端に入れば足りる）
const nationPoints = () => [...MAIN_ISLAND_EDGES, ...state.stats.prefectures.filter((pref) => pref.code !== '47').map((pref) => pref.capital)];

const state = {
  stats: null,
  baths: null,
  byPref: null,
  byId: null,
  bathsFailed: false,
  metric: DEFAULT_METRIC,
  // 段階は 全国(nation) → 県(pref) → お風呂(bath)。ほかに 近く(near) と 行った記録(visited)
  level: 'nation',
  pref: null,
  bath: null,
  // お風呂のカードをどこから開いたか（戻る先）：pref / near / visited
  context: 'pref',
  // 行った記録を閉じたときに戻る段階
  back: null,
  filter: 'all',
  limit: LIST_STEP,
  near: null,
  nearRows: [],
  storage: safeStorage(),
  visited: [],
  saveOk: true,
  map: null,
  cameraOnCapital: false,
};
state.visited = loadVisited(state.storage, PREF_CODES);

const prefOf = (code) => state.stats?.prefectures.find((pref) => pref.code === code) ?? null;
const visitedIds = () => new Set(state.visited.map((item) => item.id));
const storageOk = () => Boolean(state.storage) && state.saveOk;

// ---------------------------------------------------------------- 地図

// つまみの文言。お風呂の画面では「くわしく見る」（カードの続きを読む）、ほかは「一覧を広げる」
function sheetLabel() {
  if (app.dataset.sheet === 'open') return '地図を広く見る';
  return state.level === 'bath' ? 'くわしく見る' : '一覧を広げる';
}

function setSheet(open) {
  app.dataset.sheet = open ? 'open' : 'closed';
  $('sheet-toggle').setAttribute('aria-expanded', String(open));
  $('sheet-toggle-label').textContent = sheetLabel();
}

function mapFailed() {
  state.map = null;
  app.dataset.map = 'failed';
  $('map').replaceChildren();
  $('map-status').textContent = '地図を表示できませんでした。順位の表は使えます';
  $('map-status').hidden = false;
  showTip('');
  setSheet(false);
}

try {
  state.map = createOnsenMap($('map'), {
    onReady() {
      app.dataset.map = 'ready';
      $('map-status').hidden = true;
    },
    onFail: mapFailed,
    onPref: (code) => { showNotice(''); openPref(code); },
    onBath: (id) => {
      showNotice('');
      const near = state.level === 'near' || (state.level === 'bath' && state.context === 'near');
      openBath(id, { context: near ? 'near' : 'pref' });
    },
    onHover: showTip,
    onMoveEnd: () => updateOkinawa(),
    // 柱の根元のラベルは、左下の「沖縄県 ↙」から離す
    keepClear: () => ($('okinawa').hidden ? [] : [$('okinawa').getBoundingClientRect()]),
  }, { nearButton: $('near') });
} catch {
  mapFailed();
}

// ---------------------------------------------------------------- データ

let bathsPromise = null;
function ensureBaths() {
  if (state.baths) return Promise.resolve(state.baths);
  if (!bathsPromise) {
    state.bathsFailed = false;
    bathsPromise = loadBaths().then((data) => {
      const { byPref, byId } = indexBaths(data.baths);
      Object.assign(state, { baths: data, byPref, byId, bathsFailed: false });
      return data;
    }).catch((error) => {
      bathsPromise = null;
      state.bathsFailed = true;
      throw error;
    });
  }
  return bathsPromise;
}

// ---------------------------------------------------------------- 描画

// 画面の外にある沖縄県を、地図の左下の案内で知らせる（全国の画面だけ）
function updateOkinawa() {
  const okinawa = state.stats ? prefOf('47') : null;
  $('okinawa').hidden = !(okinawa && state.map?.ready && state.level === 'nation' && !state.map.isOnScreen(okinawa.capital));
}

function render() {
  setAppState('ready', state.level);
  // 県とお風呂の画面では、見出しを県の文にする（お風呂の画面では帯ごと畳む）
  const shownPref = state.level === 'pref' || state.level === 'bath' ? prefOf(state.pref) : null;
  renderHeadline(
    shownPref ? prefHeadline(state.stats.prefectures, shownPref, state.metric) : headline(state.stats.prefectures, state.metric),
    !shownPref && state.metric === 'sento' ? sentoTrend(state.stats.national.sentoSeries) : '',
  );
  renderMetricButtons(state.metric);
  if (state.level === 'nation') renderRanking(state.stats.prefectures, state.metric);
  if (state.level === 'pref') renderPref();
  if (state.level === 'bath') renderBath();
  if (state.level === 'near') renderNearCard({ rows: state.nearRows, visitedIds: visitedIds(), maxKm: NEAR_KM });
  if (state.level === 'visited') renderVisited();
  renderVisitedButton(state.visited);
  $('sheet-toggle-label').textContent = sheetLabel();
  syncMap();
  updateOkinawa();
  writeUrl();
}

function renderPref() {
  const pref = prefOf(state.pref);
  renderPrefCard({
    stats: state.stats,
    pref,
    metricId: state.metric,
    counts: state.baths?.counts?.[pref.code] ?? null,
    baths: state.byPref ? sortBaths(filterByType(state.byPref.get(pref.code) ?? [], state.filter)) : null,
    filter: state.filter,
    limit: state.limit,
    visitedIds: visitedIds(),
    loading: !state.baths && !state.bathsFailed,
    failed: !state.baths && state.bathsFailed,
  });
}

function renderBath() {
  const bath = state.byId.get(state.bath);
  renderBathCard({
    bath, pref: prefOf(bath.pref), context: state.context,
    visited: isVisited(state.visited, bath.id), storageOk: storageOk(), items: state.visited,
  });
}

function renderVisited() {
  const names = new Map(state.stats.prefectures.map((pref) => [pref.code, pref.name]));
  const back = state.back ?? { level: 'nation' };
  const label = {
    nation: '← 全国の順位へ',
    pref: `← ${prefOf(back.pref)?.name ?? '県'}へ`,
    bath: '← お風呂のカードへ',
    near: '← 近くのお風呂へ',
  }[back.level] ?? '← 戻る';
  renderVisitedCard({ items: state.visited, prefNames: names, storageOk: storageOk(), backLabel: label });
}

// 行った記録を開いている間は、その前の地図のままにする
function syncMap() {
  const map = state.map;
  if (!map) return;
  const view = state.level === 'visited' ? state.back ?? { level: 'nation' } : state;
  const near = view.level === 'near' || (view.level === 'bath' && view.context === 'near');
  const level = view.level === 'nation' ? 'nation' : near ? 'near' : 'pref';
  map.setLevel(level);
  let baths = [];
  if (state.baths && level === 'near') baths = state.baths.baths;
  if (state.byPref && level === 'pref') {
    const selected = view.level === 'bath' ? state.byId.get(view.bath) : null;
    // 絞り込みの外のお風呂を開いたとき（行った記録から開いた等）は、選んだ点が消えないよう全部出す
    const filter = selected && state.filter !== 'all' && selected.t !== state.filter ? 'all' : state.filter;
    baths = filterByType(state.byPref.get(view.pref) ?? [], filter);
  }
  map.setBaths(baths, visitedIds());
  map.selectBath(view.level === 'bath' ? state.byId?.get(view.bath) ?? null : null);
}

function writeUrl() {
  const view = state.level === 'visited' ? state.back ?? { level: 'nation' } : state;
  const pref = view.level === 'pref' || view.level === 'bath' ? view.pref : null;
  const bath = view.level === 'bath' ? view.bath : null;
  const next = `${location.pathname}${writeParams({ metric: state.metric, pref, bath })}${location.hash}`;
  if (next === `${location.pathname}${location.search}${location.hash}`) return;
  try { history.replaceState(null, '', next); } catch { /* URLが書けなくても画面は動かす */ }
}

function focusSoon(node, { center = false } = {}) {
  if (!node) return;
  requestAnimationFrame(() => {
    node.focus({ preventScroll: true });
    if (center) node.scrollIntoView({ block: 'center' });
  });
}
const scrollSheetTop = () => { $('sheet-body').scrollTop = 0; };

// ---------------------------------------------------------------- 段階の移動

function openNation({ focusPref = null, animate = true } = {}) {
  Object.assign(state, { level: 'nation', pref: null, bath: null });
  render();
  state.map?.showHere(null);
  state.map?.flyNation({ animate, points: nationPoints() });
  if (focusPref) focusSoon(document.querySelector(`#rank-list [data-pref="${focusPref}"]`), { center: true });
  else scrollSheetTop();
}

// 県のお風呂が収まるように寄る。離島などの外れ（緯度・経度の両端3%）は枠の計算から外す
function flyPref(pref, { animate = true } = {}) {
  const baths = state.byPref?.get(pref.code) ?? null;
  const bounds = baths?.length ? robustBounds(baths) : null;
  state.cameraOnCapital = !bounds;
  if (!bounds) {
    state.map?.flyPref({ center: pref.capital }, { animate });
    return;
  }
  const [[west, south], [east, north]] = bounds;
  const inside = baths.filter((bath) => bath.lng >= west && bath.lng <= east && bath.lat >= south && bath.lat <= north);
  state.map?.flyPref({ points: inside.length ? inside : baths }, { animate });
}

function openPref(code, { focus = true, animate = true, focusBath = null } = {}) {
  const pref = prefOf(code);
  if (!pref) return;
  if (state.pref !== code) state.limit = LIST_STEP;
  Object.assign(state, { level: 'pref', pref: code, bath: null });
  render();
  setSheet(false);
  state.map?.showHere(null);
  flyPref(pref, { animate });
  if (focusBath) focusSoon(document.querySelector(`#bath-list [data-id="${focusBath}"]`) ?? $('pref-title'), { center: true });
  else if (focus) { scrollSheetTop(); focusSoon($('pref-title')); }
  if (state.baths) return;
  ensureBaths().then(() => {
    if (state.level !== 'pref' || state.pref !== code) return;
    render();
    if (state.cameraOnCapital) flyPref(pref, { animate });
  }).catch(() => {
    if (state.level === 'pref' && state.pref === code) render();
  });
}

async function openBath(id, { context = 'pref', animate = true, focus = true } = {}) {
  try {
    await ensureBaths();
  } catch {
    showNotice('お風呂の位置データを読み込めませんでした。もう一度お試しください');
    return false;
  }
  const bath = state.byId.get(id);
  if (!bath) return false;
  Object.assign(state, { level: 'bath', bath: id, pref: bath.pref, context });
  render();
  setSheet(false);
  state.map?.flyBath(bath, { animate });
  if (focus) { scrollSheetTop(); focusSoon($('bath-title')); }
  return true;
}

function openNearView({ focusBath = null, fly = true } = {}) {
  Object.assign(state, { level: 'near', pref: null, bath: null });
  render();
  setSheet(false);
  state.map?.showHere(state.near);
  if (fly) state.map?.flyNear(state.near);
  if (focusBath) focusSoon(document.querySelector(`#near-list [data-id="${focusBath}"]`) ?? $('near-title'), { center: true });
  else { scrollSheetTop(); focusSoon($('near-title')); }
}

function openVisited() {
  const fromVisitedBath = state.level === 'bath' && state.context === 'visited';
  if (state.level !== 'visited' && !fromVisitedBath) {
    state.back = { level: state.level, pref: state.pref, bath: state.bath, context: state.context };
  }
  state.level = 'visited';
  render();
  setSheet(true);
  scrollSheetTop();
  focusSoon($('visited-title'));
}

function closeVisited() {
  const back = state.back ?? { level: 'nation' };
  state.back = null;
  if (back.level === 'bath') return openBath(back.bath, { context: back.context });
  if (back.level === 'pref') return openPref(back.pref);
  if (back.level === 'near') return openNearView({ fly: false });
  return openNation();
}

function goBack() {
  if (state.level === 'bath') {
    const from = state.bath;
    if (state.context === 'near') return openNearView({ focusBath: from });
    if (state.context === 'visited') return openVisited();
    return openPref(state.pref, { focusBath: from });
  }
  if (state.level === 'pref') return openNation({ focusPref: state.pref });
  if (state.level === 'near') return openNation();
  if (state.level === 'visited') return closeVisited();
  return undefined;
}

// ---------------------------------------------------------------- 操作

function setMetric(id) {
  if (!state.stats || !METRIC_IDS.includes(id) || id === state.metric) return;
  state.metric = id;
  render();
  // 切り替えるたびに柱を地面から伸ばし直し、上位3県の文字も差し替える
  state.map?.setPillars(buildPillars(state.stats.prefectures, id), { animate: true });
  state.map?.setTopLabels(topLabels(state.stats.prefectures, id));
}

function setFilter(type) {
  if (type === state.filter) return;
  state.filter = type;
  state.limit = LIST_STEP;
  render();
  focusSoon(document.querySelector(`#type-filter [data-type="${type}"]`));
}

function toggleVisit() {
  const bath = state.byId?.get(state.bath);
  if (!bath) return;
  state.visited = toggleVisited(state.visited, bath);
  state.saveOk = saveVisited(state.storage, state.visited);
  render();
}

function removeVisit(id) {
  const list = [...$('visited-list').querySelectorAll('[data-open]')].map((node) => node.dataset.open);
  const next = list[list.indexOf(id) + 1] ?? list[list.indexOf(id) - 1] ?? null;
  state.visited = removeVisited(state.visited, id);
  state.saveOk = saveVisited(state.storage, state.visited);
  render();
  focusSoon((next && document.querySelector(`#visited-list [data-open="${next}"]`)) || $('visited-title'));
}

function locate() {
  if (!navigator.geolocation) {
    showNotice('この端末では位置情報を使えません。県の柱か順位の表から選べます');
    return;
  }
  showNotice('現在地を確かめています…');
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    const point = { lat: coords.latitude, lng: coords.longitude };
    if (!inJapan(point)) {
      showNotice('現在地が日本の外のようです。県の柱か順位の表から選べます');
      return;
    }
    try {
      await ensureBaths();
    } catch {
      showNotice('お風呂の位置データを読み込めませんでした。もう一度お試しください');
      return;
    }
    showNotice('');
    state.near = point;
    state.nearRows = nearestBaths(state.baths.baths, point, { limit: NEAR_LIMIT, maxKm: NEAR_KM });
    openNearView();
  }, (error) => {
    showNotice(error?.code === 1
      ? '位置情報の利用が許可されていません。県の柱か順位の表から選べます'
      : '現在地を取得できませんでした。少し待って、もう一度お試しください');
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
}

const on = (id, type, handler) => $(id).addEventListener(type, handler);
const ready = () => Boolean(state.stats) && app.dataset.state === 'ready';

document.querySelector('.metrics').addEventListener('click', (event) => {
  const button = event.target.closest('[data-metric]');
  if (!button || !ready()) return;
  showNotice('');
  setMetric(button.dataset.metric);
});
// 「県を選ぶ」。選んだら県の画面へ移り、選び直せるよう見出しの表示に戻す
on('pref-select', 'change', (event) => {
  const code = event.target.value;
  event.target.value = '';
  if (!code || !ready()) return;
  showNotice('');
  openPref(code);
});
on('okinawa', 'click', () => { if (ready()) { showNotice(''); openPref('47'); } });
on('rank-list', 'click', (event) => {
  const row = event.target.closest('[data-pref]');
  if (!row) return;
  showNotice('');
  openPref(row.dataset.pref);
});
on('type-filter', 'click', (event) => {
  const chip = event.target.closest('[data-type]');
  if (chip) setFilter(chip.dataset.type);
});
// 「銭湯の多くは『種類の登録なし』に入っています」を押すと、そのチップを選ぶ
on('sento-note', 'click', () => setFilter('other'));
on('bath-list', 'click', (event) => {
  const row = event.target.closest('[data-id]');
  if (row) openBath(row.dataset.id, { context: 'pref' });
});
on('near-list', 'click', (event) => {
  const row = event.target.closest('[data-id]');
  if (row) openBath(row.dataset.id, { context: 'near' });
});
on('visited-list', 'click', (event) => {
  const open = event.target.closest('[data-open]');
  const remove = event.target.closest('[data-remove]');
  if (open) openBath(open.dataset.open, { context: 'visited' });
  if (remove) removeVisit(remove.dataset.remove);
});
on('bath-more', 'click', () => {
  const before = state.limit;
  state.limit += LIST_STEP;
  render();
  focusSoon(document.querySelector(`#bath-list li:nth-child(${before + 1}) button`));
});
for (const id of ['pref-back', 'bath-back', 'near-back', 'visited-back']) on(id, 'click', () => { showNotice(''); goBack(); });
on('bath-visit', 'click', toggleVisit);
on('visited-open', 'click', () => {
  if (!ready()) return;
  showNotice('');
  if (state.level === 'visited') focusSoon($('visited-title'));
  else openVisited();
});
on('near', 'click', () => { if (ready()) locate(); });
on('retry', 'click', () => start());
on('baths-retry', 'click', () => {
  state.bathsFailed = false;
  render();
  ensureBaths().then(() => {
    if (state.level === 'pref') flyPref(prefOf(state.pref));
    render();
  }).catch(() => render());
});
on('sheet-toggle', 'click', () => setSheet(app.dataset.sheet !== 'open'));
// 出典の帯の「詳しく」（スマホ）と「注意と詳しい出典」（PC）は、どちらも出典と注意の節へ移る
for (const link of document.querySelectorAll('.about-link')) {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    setSheet(true);
    $('about').scrollIntoView({ block: 'start' });
    focusSoon($('about-title'));
  });
}
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented || !ready() || state.level === 'nation') return;
  event.preventDefault();
  showNotice('');
  goBack();
});

// ---------------------------------------------------------------- 起動

async function start() {
  setAppState('loading', 'nation');
  try {
    state.stats = await loadStats();
  } catch {
    setAppState('error', 'nation');
    return;
  }
  const params = readParams(location.search, PREF_CODES);
  state.metric = params.metric;
  const where = params.pref ? prefOf(params.pref).name : '全国';
  const notices = params.notices.map((kind) => noticeText(kind, where));
  showNotice(notices.join('。'));
  renderPrefSelect(state.stats.prefectures);
  state.map?.setPillars(buildPillars(state.stats.prefectures, state.metric), { animate: true });
  state.map?.setTopLabels(topLabels(state.stats.prefectures, state.metric));
  if (params.pref) openPref(params.pref, { focus: false, animate: false });
  else openNation({ animate: false });

  if (params.bath) {
    try {
      await ensureBaths();
      const bath = state.byId.get(params.bath);
      if (bath) await openBath(bath.id, { context: 'pref', animate: false, focus: false });
      else showNotice([...notices, noticeText('bath', where)].join('。'));
    } catch {
      // 読めなければ県（か全国）の表示のまま。県のカードにやり直しのボタンが出る
    }
  }
  // お風呂の位置（653KB）は最初の描画のあとで読んでおく。県を先に押したらそちらが先に読む
  setTimeout(() => { ensureBaths().catch(() => {}); }, 800);
}

start();
