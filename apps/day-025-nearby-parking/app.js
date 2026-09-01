import { searchNearby } from './lib/api.js';
import { searchPlaces } from './lib/nominatim.js';
import { addDistances } from './lib/geo.js';
import { createState, matchedResults, RADII, visibleResults } from './lib/state.js';
import { loadSettings, safeStorage, saveSettings } from './lib/storage.js';
import { ParkingMap } from './lib/map.js';
import { createUI } from './lib/ui.js';

const store = safeStorage('localStorage');
const saved = loadSettings(store);
const state = createState(saved);
let movedCenter = null;
let parkingMap = null;
let searchToken = 0;

const persist = () => saveSettings(store, {
  theme: document.documentElement.dataset.theme || 'auto',
  showRestricted: state.showRestricted,
  lastCenter: state.center ?? saved.lastCenter ?? null, // 起動時のpersistで前回地点を消さない
});

const ui = createUI({
  locate: () => locate(),
  searchPlace: (query) => findPlace(query),
  filter: (filter) => { state.filter = filter; redraw(); },
  showRestricted: (value) => { state.showRestricted = value; persist(); redraw(); },
  research: () => movedCenter && runSearch(movedCenter),
  returnToCenter: () => state.center && parkingMap?.moveTo(state.center),
});

function redraw() {
  const visible = visibleResults(state);
  ui.render(visible, state.results.length, state.selectedId, selectResult, matchedResults(state).length);
  parkingMap?.setParkingMarkers(visible, selectResult);
  if (state.selectedId) parkingMap?.select(state.selectedId);
}

function selectResult(id) {
  state.selectedId = id;
  redraw();
  document.querySelector(`.parking-card[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
}

async function runSearch(center) {
  const token = (searchToken += 1); // 後から始まった検索だけを採用する（候補クリック等の二重実行対策）
  const current = () => token === searchToken;
  state.center = center;
  state.selectedId = null;
  movedCenter = null;
  ui.setCompact(true);
  ui.showResearch(false);
  ui.enableReturn(true);
  ui.banner('');
  ui.busy(true);
  parkingMap?.moveTo(center);
  parkingMap?.showOrigin(center);
  try {
    const response = await searchNearby(center, {
      onExpand: (_from, to) => current() && ui.banner(`近くに少ないため、半径${to}mまで広げています…`),
    });
    if (!current()) return;
    const expanded = response.radius > RADII[0];
    state.radius = response.radius;
    state.results = addDistances(response.results, center);
    ui.banner(expanded ? `検索範囲を半径${response.radius}mまで広げました。` : '');
    ui.note(expanded ? `近い順・半径${response.radius}m` : '近い順');
    redraw();
    persist();
  } catch (error) {
    if (!current()) return;
    state.results = [];
    ui.note('');
    redraw();
    // 地図データの提供元はボランティア運営で、混雑と取得上限が実際に起きる。起きたことをそのまま出す
    ui.banner(error?.rateLimited
      ? '地図データの取得が一時的に上限に達しました。30秒ほど待ってから、もう一度お試しください。'
      : '地図データを取得できませんでした。少し待ってから、もう一度お試しください。', 'error');
  } finally {
    if (current()) {
      ui.refs.locate.disabled = false;
      ui.refs.submit.disabled = false;
    }
  }
}

function locate() {
  if (!navigator.geolocation) {
    ui.banner('位置情報を利用できません。地名で検索してください。', 'error');
    return;
  }
  ui.note('現在地を確認しています…');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => runSearch({ lat: coords.latitude, lng: coords.longitude }),
    () => { ui.note(''); ui.banner('位置情報を取得できませんでした。地名で検索してください。', 'error'); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  );
}

async function findPlace(query) {
  if (!query) return;
  ui.refs.submit.disabled = true;
  ui.note('地名を検索しています…');
  try {
    const places = await searchPlaces(query);
    ui.showCandidates(places, (place) => runSearch({ lat: place.lat, lng: place.lng }));
    ui.note(places.length ? '候補から場所を選んでください' : '');
    if (!places.length) ui.banner('地名の候補が見つかりませんでした。', 'error');
  } catch (error) {
    ui.note('');
    ui.banner(error?.rateLimited
      ? '地名検索が一時的に上限に達しました。30秒ほど待ってからお試しください。'
      : '地名検索に失敗しました。少し待って再試行してください。', 'error');
  }
  finally { ui.refs.submit.disabled = false; }
}

function setupTheme() {
  const button = document.querySelector('#theme-toggle');
  const label = document.querySelector('#theme-label');
  const initial = saved.theme === 'dark' || saved.theme === 'light' ? saved.theme : null;
  const apply = (theme) => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    const isDark = theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches);
    button.setAttribute('aria-pressed', String(isDark));
    label.textContent = isDark ? 'ライト' : 'ダーク';
    persist();
  };
  apply(initial);
  button.addEventListener('click', () => apply(button.getAttribute('aria-pressed') === 'true' ? 'light' : 'dark'));
}

setupTheme();
ui.setRestricted(state.showRestricted);
try {
  parkingMap = new ParkingMap(document.querySelector('#map'), (center) => {
    if (!state.center) return;
    movedCenter = center;
    ui.showResearch(true);
  });
} catch {
  document.querySelector('#map').replaceChildren(Object.assign(document.createElement('p'), { className: 'map-unavailable', textContent: '地図を読み込めませんでした。候補リストは利用できます。' }));
}
