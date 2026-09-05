import { fetchDatasets } from './lib/data.js';
import { WifiMap } from './lib/map.js';
import { placeLabel, searchPlaces } from './lib/nominatim.js';
import {
  MAX_MARKERS, MAX_VISIBLE, createState, emptyReason, freeEligibleCount, matchedSpots,
} from './lib/state.js';
import { loadSettings, safeStorage, saveSettings } from './lib/storage.js';
import { createUI } from './lib/ui.js';

const store = safeStorage();
const saved = loadSettings(store);
const state = createState(saved);
let wifiMap = null;
let dataPromise = null;
let requestToken = 0;
let placeCandidates = [];
let selectedPlaceIndex = 0;

const ui = createUI({
  locate,
  searchPlace,
  filter(value) { state.onlyFree = value; persist(); redraw(); },
  layer(name, value) { state.layers[name] = value; persist(); redraw(); },
  widen() { changeRadius(3200); },
  radius() { changeRadius(state.radius === 800 ? 3200 : 800); },
  layersOn() {
    state.layers = { municipal: true, osm: true, chain: true };
    ui.setFilters(state.onlyFree, state.layers); persist(); redraw();
  },
  freeOff() {
    state.onlyFree = false; ui.setFilters(state.onlyFree, state.layers); persist(); redraw();
  },
  toPlace() {
    const behavior = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    ui.refs.place.scrollIntoView({ block: 'center', behavior }); ui.refs.place.focus({ preventScroll: true });
  },
  retry() { state.lastAction?.(); },
  searchLast() {
    const last = state.center
      ? { ...state.center, radius: state.radius, label: state.label }
      : saved.last;
    if (last) runSearch({ lat: last.lat, lng: last.lng }, last.radius, last.label);
  },
});

function persist() {
  const last = state.center ? { lat: state.center.lat, lng: state.center.lng, label: state.label, radius: state.radius } : saved.last;
  saveSettings(store, { last, onlyFree: state.onlyFree, layers: state.layers });
}

async function loadData() {
  if (state.datasets) return state.datasets;
  if (!dataPromise) dataPromise = fetchDatasets().then((datasets) => {
    state.datasets = datasets;
    ui.renderDataNotes(datasets);
    return datasets;
  }).catch((error) => { dataPromise = null; throw error; });
  return dataPromise;
}

function redraw({ fitMap = false } = {}) {
  if (!state.center || !state.datasets) return;
  const matched = matchedSpots(state);
  ui.setFreeCount(freeEligibleCount(state));
  if (!matched.length) {
    wifiMap?.setMarkers([], selectSpot);
    ui.setLegend([]);
    wifiMap?.moveTo(state.center, state.radius === 3200 ? 13 : 15);
    ui.showNone(emptyReason(state), state.radius);
    return false;
  }
  ui.render(matched.slice(0, MAX_VISIBLE), matched, state.radius, state.selectedId, selectSpot);
  const mapSpots = matched.slice(0, MAX_MARKERS);
  wifiMap?.setMarkers(mapSpots, selectSpot);
  ui.setLegend(mapSpots);
  if (fitMap) wifiMap?.fitTo(matched, state.center);
  if (state.selectedId) wifiMap?.select(state.selectedId);
  return true;
}

function selectSpot(id) {
  state.selectedId = id;
  redraw();
  const behavior = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  document.querySelector(`.spot[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior });
}

async function runSearch(center, radius = 800, label = '現在地') {
  const token = ++requestToken;
  state.lastAction = () => runSearch(center, radius, label);
  state.center = center; state.radius = radius; state.label = label; state.selectedId = null;
  ui.setBusy(true); wifiMap?.showOrigin(center);
  try {
    await loadData();
    if (token !== requestToken) return;
    const hasResults = redraw({ fitMap: true }); persist(); ui.showLast({ lat: center.lat, lng: center.lng, label, radius });
    if (hasResults) ui.scrollToResults();
  } catch {
    if (token !== requestToken) return;
    ui.showError('同梱データを読み込めませんでした。通信状態を確認してもう一度お試しください');
  } finally {
    if (token === requestToken) ui.setBusy(false);
  }
}

function changeRadius(radius) {
  if (!state.center || !state.datasets) return;
  state.radius = radius; state.selectedId = null;
  const hasResults = redraw({ fitMap: true }); persist();
  ui.showLast({ ...state.center, label: state.label, radius });
  if (hasResults) ui.scrollToResults();
}

function locate() {
  state.lastAction = locate;
  if (!navigator.geolocation) return ui.showError('位置情報が使えません。地名で探せます');
  ui.setBusy(true);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => runSearch({ lat: coords.latitude, lng: coords.longitude }, 800, '現在地'),
    () => { ui.setBusy(false); ui.showError('位置情報が使えません。地名で探せます'); },
    { enableHighAccuracy: false, timeout: 10000 },
  );
}

async function searchPlace(query) {
  const previousState = ui.refs.app.dataset.state;
  if (query.length < 2) return showPlaceError('地名は2文字以上で入力してください', previousState);
  state.lastAction = () => searchPlace(query); ui.setBusy(true);
  try {
    const places = await searchPlaces(query);
    if (!places.length) {
      ui.setBusy(false);
      return showPlaceError('その地名は見つかりませんでした', previousState);
    }
    placeCandidates = places.slice(0, 5); selectedPlaceIndex = 0;
    await selectPlace(0);
  } catch (error) {
    ui.setBusy(false);
    showPlaceError(error?.rateLimited ? '地名検索の提供元が混み合っています。30秒ほど待ってください' : '取得できませんでした。少し待ってもう一度', previousState);
  }
}

async function selectPlace(index) {
  selectedPlaceIndex = index;
  ui.showPlaces(placeCandidates, selectedPlaceIndex, selectPlace);
  const place = placeCandidates[index];
  await runSearch({ lat: place.lat, lng: place.lng }, 800, placeLabel(place.name));
  ui.showPlaces(placeCandidates, selectedPlaceIndex, selectPlace);
}

function showPlaceError(message, previousState) {
  ui.showMessage(message);
  ui.restoreState(previousState);
}

ui.setFilters(state.onlyFree, state.layers);
ui.setFreeCount(null);
ui.showLast(saved.last);
try { wifiMap = new WifiMap(document.querySelector('#map')); }
catch {
  const mapStatus = document.querySelector('#map-status');
  mapStatus.textContent = '地図を表示できません。候補リストは使えます';
  mapStatus.hidden = false;
}
