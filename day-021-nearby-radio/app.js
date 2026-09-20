import { prefectures, worldCities } from './lib/places.js';
import { MIRRORS, RADII_KM, searchWithExpansion } from './lib/stations.js';

const $ = (selector) => document.querySelector(selector);
const elements = {
  modeLabel: $('#mode-label'),
  locateButton: $('#locate-button'),
  prefectureSelect: $('#prefecture-select'),
  travelButton: $('#travel-button'),
  radiusOptions: $('#radius-options'),
  status: $('#status'),
  stationList: $('#station-list'),
  stationCount: $('#station-count'),
  expansionNote: $('#expansion-note'),
  player: $('#player'),
  playerState: $('#player-state'),
  playerName: $('#player-name'),
  playerDistance: $('#player-distance'),
  playButton: $('#play-button'),
  previousButton: $('#previous-button'),
  nextButton: $('#next-button'),
  volume: $('#volume'),
  audio: $('#audio'),
};

const state = {
  mode: readStorage('nearby-radio-mode', 'current'),
  place: null,
  radiusKm: normalizedRadius(readStorage('nearby-radio-radius', '25')),
  stations: [],
  failed: new Set(),
  currentIndex: -1,
  phase: 'idle',
  apiBase: MIRRORS[0],
  searchId: 0,
  playbackId: 0,
  playTimeout: null,
  lastTravelIndex: -1,
  reportedStations: new Set(),
  expansionNotice: '',
};

const STATUS_ICONS = {
  info: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 8v5m0-8h.01"/>',
  warn: '<path d="M12 3 2.8 20h18.4L12 3Zm0 6v5m0 3h.01"/>',
  error: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6 6 6m0-6-6 6"/>',
};

function readStorage(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* localStorageが無効でも動作を続ける */ }
}

function normalizedRadius(value) {
  const radius = Number(value);
  return RADII_KM.includes(radius) ? radius : 25;
}

function setMode(mode, label) {
  state.mode = mode;
  elements.modeLabel.textContent = label;
  writeStorage('nearby-radio-mode', mode);
}

function setStatus(kind, title, detail = '', actions = []) {
  elements.status.className = 'status is-visible';
  elements.status.replaceChildren();

  if (kind === 'loading') {
    const skeletons = document.createElement('div');
    skeletons.className = 'skeleton-list';
    const loadingTitle = document.createElement('p');
    loadingTitle.className = 'loading-title';
    loadingTitle.textContent = title;
    skeletons.append(loadingTitle);
    for (let index = 0; index < 3; index += 1) {
      const skeleton = document.createElement('div');
      skeleton.className = 'skeleton';
      skeleton.setAttribute('aria-hidden', 'true');
      skeleton.innerHTML = '<i></i><i></i><i></i>';
      skeletons.append(skeleton);
    }
    elements.status.append(skeletons);
    return;
  }

  const message = document.createElement('div');
  const messageKind = STATUS_ICONS[kind] ? kind : 'info';
  message.className = `status-message status-${messageKind}`;
  message.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${STATUS_ICONS[messageKind]}</svg>`;
  const strong = document.createElement('strong');
  strong.textContent = title;
  message.append(strong);
  if (detail) {
    const paragraph = document.createElement('p');
    paragraph.textContent = detail;
    message.append(paragraph);
  }
  if (actions.length) {
    const actionRow = document.createElement('div');
    actionRow.className = 'status-actions';
    actions.forEach(({ label, onClick, primary = false, disabled = false, title = '' }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `button ${primary ? 'button-primary' : 'button-secondary'}`;
      button.textContent = label;
      button.disabled = disabled;
      if (title) button.title = title;
      button.addEventListener('click', onClick);
      actionRow.append(button);
    });
    message.append(actionRow);
  }
  elements.status.append(message);
}

function hideStatus() {
  elements.status.className = 'status';
  elements.status.replaceChildren();
}

function renderExpansionNotice() {
  elements.expansionNote.textContent = state.expansionNotice;
  elements.expansionNote.hidden = !state.expansionNotice;
}

function setControlsBusy(busy) {
  elements.locateButton.disabled = busy;
  elements.travelButton.disabled = busy;
  elements.prefectureSelect.disabled = busy;
}

function setRadius(radius, persist = true) {
  state.radiusKm = normalizedRadius(radius);
  const input = elements.radiusOptions.querySelector(`input[value="${state.radiusKm}"]`);
  if (input) input.checked = true;
  if (persist) writeStorage('nearby-radio-radius', state.radiusKm);
}

function safeWebUrl(value) {
  // 公開ページはHTTPSなので、httpの画像は混在コンテンツとして表示されない。httpsだけ通す
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function formatDistance(distance) {
  return distance.toFixed(1);
}

function renderStations() {
  elements.stationList.replaceChildren();
  elements.stationCount.textContent = `${state.stations.length} STATIONS`;

  state.stations.forEach((station, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'station-card';
    card.dataset.stationIndex = String(index);
    card.setAttribute('aria-label', `${station.name}、${formatDistance(station.distanceKm)}キロメートル、再生`);
    if (state.failed.has(index)) card.classList.add('is-failed');
    if (index === state.currentIndex && state.phase === 'playing') card.classList.add('is-playing');
    if (index === state.currentIndex && state.phase === 'buffering') card.classList.add('is-buffering');

    const logo = document.createElement('span');
    logo.className = 'station-logo';
    logo.setAttribute('aria-hidden', 'true');
    logo.textContent = station.name.trim().charAt(0).toLocaleUpperCase() || 'R';
    const favicon = safeWebUrl(station.favicon);
    if (favicon) {
      const image = document.createElement('img');
      image.src = favicon;
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => image.remove());
      logo.append(image);
    }

    const copy = document.createElement('span');
    copy.className = 'station-copy';
    const nameRow = document.createElement('span');
    nameRow.className = 'station-name-row';
    const name = document.createElement('strong');
    name.className = 'station-name';
    name.textContent = station.name;
    nameRow.append(name);
    if (state.failed.has(index)) {
      const failed = document.createElement('span');
      failed.className = 'failed-badge';
      failed.textContent = 'NG';
      nameRow.append(failed);
    }
    if (index === state.currentIndex && state.phase === 'buffering') {
      const tuning = document.createElement('span');
      tuning.className = 'tuning-badge';
      tuning.textContent = 'TUNING…';
      nameRow.append(tuning);
    }
    copy.append(nameRow);

    const meta = document.createElement('span');
    meta.className = 'station-meta';
    const tagText = station.tags.length ? station.tags.join(' / ') : 'ジャンル未登録';
    [tagText, station.codec || 'CODEC --', station.bitrate ? `${station.bitrate} kbps` : 'BITRATE --'].forEach((value) => {
      const item = document.createElement('span');
      item.textContent = value;
      meta.append(item);
    });
    copy.append(meta);

    const distance = document.createElement('span');
    distance.className = 'station-distance';
    distance.innerHTML = `${formatDistance(station.distanceKm)} <small>km</small>`;
    card.append(logo, copy, distance);
    card.addEventListener('click', () => playStation(index, true));
    elements.stationList.append(card);
  });
}

async function runSearch(place) {
  const searchId = ++state.searchId;
  const initialRadius = state.radiusKm;
  state.place = place;
  state.stations = [];
  state.failed.clear();
  state.expansionNotice = '';
  renderExpansionNotice();
  stopPlayback(true);
  updatePlayer();
  elements.stationList.replaceChildren();
  elements.stationCount.textContent = '-- STATIONS';
  setStatus('loading', `${place.label}の近くを走査中`);
  setControlsBusy(true);

  try {
    const result = await searchWithExpansion({
      lat: place.lat,
      lon: place.lon,
      radiusKm: state.radiusKm,
      onExpand: (_from, to) => {
        if (searchId !== state.searchId) return;
        setRadius(to);
        state.expansionNotice = `${initialRadius}kmでは0件 → ${to}kmに拡大`;
        setStatus('info', 'もう少し遠くまで電波を探しています', `範囲を ${to} km に広げて再走査中…`);
      },
    });
    if (searchId !== state.searchId) return;
    state.apiBase = result.baseUrl;
    setRadius(result.radiusKm);
    state.stations = result.stations;
    hideStatus();
    renderExpansionNotice();
    renderStations();
    elements.playButton.disabled = state.stations.length === 0;
    elements.previousButton.disabled = state.stations.length === 0;
    elements.nextButton.disabled = state.stations.length === 0;
    if (state.stations.length === 0) {
      setStatus('warn', 'この範囲では局が見つかりませんでした', '場所を変えるか、もう一度時間をおいて試してください。');
    }
  } catch (error) {
    if (searchId !== state.searchId) return;
    console.error(error);
    const offline = navigator.onLine === false;
    setStatus(
      'error',
      offline ? 'オフラインのようです' : '局データに接続できませんでした',
      offline ? 'ネットワーク接続を確認してください。' : '3つのAPIミラーすべてに接続できませんでした。',
      [{ label: 'もう一度試す', onClick: () => state.place && runSearch(state.place) }],
    );
    elements.stationCount.textContent = 'ERROR';
  } finally {
    if (searchId === state.searchId) setControlsBusy(false);
  }
}

function requestLocation() {
  setMode('current', '現在地');
  state.expansionNotice = '';
  renderExpansionNotice();
  setControlsBusy(true);
  elements.stationList.replaceChildren();
  elements.stationCount.textContent = '-- STATIONS';
  setStatus('loading', 'ブラウザの位置情報の許可を押してください');

  if (!navigator.geolocation) {
    showLocationFallback('このブラウザでは位置情報を利用できません。');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      setMode('current', '現在地');
      runSearch({ label: '現在地', lat: coords.latitude, lon: coords.longitude });
    },
    () => showLocationFallback('位置情報を使わず、都道府県から探せます。'),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
}

function showLocationFallback(detail) {
  setControlsBusy(false);
  setStatus('warn', '都道府県を選んでください', detail);
  elements.prefectureSelect.focus();
}

function chooseTravelCity() {
  let index;
  do { index = Math.floor(Math.random() * worldCities.length); } while (worldCities.length > 1 && index === state.lastTravelIndex);
  state.lastTravelIndex = index;
  const city = worldCities[index];
  const label = `${city.name}（${city.country}）`;
  setMode('travel', label);
  elements.prefectureSelect.value = '';
  runSearch({ label, lat: city.lat, lon: city.lon });
}

function reportClick(station) {
  if (!station.stationuuid || state.reportedStations.has(station.stationuuid)) return;
  state.reportedStations.add(station.stationuuid);
  fetch(`${state.apiBase}/json/url/${encodeURIComponent(station.stationuuid)}`).catch(() => {});
}

function updatePlayer() {
  const station = state.stations[state.currentIndex];
  elements.player.classList.toggle('is-playing', state.phase === 'playing');
  elements.player.classList.toggle('is-buffering', state.phase === 'buffering');
  elements.playerState.textContent = state.phase === 'playing' ? 'ON AIR' : state.phase === 'buffering' ? 'TUNING…' : 'STANDBY';
  elements.playerName.textContent = station?.name || '▶で最寄りの局から再生';
  elements.playerDistance.textContent = station ? `${formatDistance(station.distanceKm)} km` : '--.- km';
  elements.playButton.disabled = !station && state.stations.length === 0;
  elements.previousButton.disabled = state.stations.length === 0;
  elements.nextButton.disabled = state.stations.length === 0;
  elements.playButton.setAttribute('aria-label', ['playing', 'buffering'].includes(state.phase) ? '停止' : '再生');
  renderStations();
}

async function playStation(index, userInitiated = false) {
  const station = state.stations[index];
  if (!station) return;

  clearTimeout(state.playTimeout);
  const playbackId = ++state.playbackId;
  state.currentIndex = index;
  state.failed.delete(index);
  state.phase = 'buffering';
  hideStatus();
  elements.audio.pause();
  elements.audio.src = station.url;
  elements.audio.load();
  updatePlayer();
  reportClick(station);

  state.playTimeout = setTimeout(() => failPlayback(index, playbackId), 4000);

  try {
    await elements.audio.play();
    if (playbackId !== state.playbackId) return;
    clearTimeout(state.playTimeout);
    state.phase = 'playing';
    updatePlayer();
  } catch {
    // ユーザー操作前のplayは行わない。操作後の失敗だけ次局へ送る。
    if (userInitiated || state.currentIndex >= 0) failPlayback(index, playbackId);
  }

  const activeCard = elements.stationList.querySelector(`[data-station-index="${index}"]`);
  if (activeCard) {
    const scrollOptions = { block: 'nearest' };
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) scrollOptions.behavior = 'smooth';
    activeCard.scrollIntoView(scrollOptions);
  }
}

function failPlayback(index, playbackId = state.playbackId) {
  if (playbackId !== state.playbackId || state.failed.has(index)) return;
  clearTimeout(state.playTimeout);
  state.failed.add(index);
  elements.audio.pause();

  const next = findNextPlayable(index);
  if (next === -1) {
    state.phase = 'idle';
    renderStations();
    elements.previousButton.disabled = true;
    elements.nextButton.disabled = true;
    elements.playerState.textContent = 'NO SIGNAL';
    elements.playerName.textContent = '再生できる局がありません';
    elements.player.classList.remove('is-playing', 'is-buffering');
    const widerRadius = RADII_KM.find((radius) => radius > state.radiusKm);
    setStatus('error', 'この範囲の局に接続できませんでした', '別の局を探すか、同じ局をもう一度試せます。', [
      {
        label: '範囲を広げる',
        primary: true,
        disabled: widerRadius === undefined,
        title: widerRadius === undefined ? 'すでに最大範囲です' : '',
        onClick: () => {
          if (widerRadius === undefined || !state.place) return;
          setRadius(widerRadius);
          runSearch(state.place);
        },
      },
      {
        label: '再試行',
        onClick: () => {
          state.failed.clear();
          playStation(0, true);
        },
      },
    ]);
    return;
  }
  playStation(next);
}

function findNextPlayable(fromIndex) {
  if (!state.stations.length) return -1;
  for (let offset = 1; offset <= state.stations.length; offset += 1) {
    const index = (fromIndex + offset + state.stations.length) % state.stations.length;
    if (!state.failed.has(index)) return index;
  }
  return -1;
}

function findPreviousPlayable(fromIndex) {
  if (!state.stations.length) return -1;
  if (fromIndex < 0) return findNextPlayable(-1);
  for (let offset = 1; offset <= state.stations.length; offset += 1) {
    const index = (fromIndex - offset + state.stations.length) % state.stations.length;
    if (!state.failed.has(index)) return index;
  }
  return -1;
}

function stopPlayback(clearSelection = false) {
  ++state.playbackId;
  clearTimeout(state.playTimeout);
  elements.audio.pause();
  state.phase = 'idle';
  if (clearSelection) state.currentIndex = -1;
  elements.player.classList.remove('is-playing', 'is-buffering');
  if (state.stations.length) updatePlayer();
}

function togglePlayback() {
  if (!state.stations.length) return;
  if (state.phase === 'playing' || state.phase === 'buffering') {
    stopPlayback(false);
    updatePlayer();
  } else {
    playStation(state.currentIndex >= 0 ? state.currentIndex : 0, true);
  }
}

function initialize() {
  prefectures.forEach((place) => {
    const option = document.createElement('option');
    option.value = place.name;
    option.textContent = place.name;
    elements.prefectureSelect.append(option);
  });
  setRadius(state.radiusKm, false);
  elements.audio.volume = Number(elements.volume.value);

  elements.locateButton.addEventListener('click', requestLocation);
  elements.travelButton.addEventListener('click', chooseTravelCity);
  elements.prefectureSelect.addEventListener('change', () => {
    const place = prefectures.find(({ name }) => name === elements.prefectureSelect.value);
    if (!place) return;
    setMode('prefecture', place.name);
    runSearch({ label: place.name, lat: place.lat, lon: place.lon });
  });
  elements.radiusOptions.addEventListener('change', (event) => {
    if (event.target.name !== 'radius') return;
    setRadius(event.target.value);
    if (state.place) runSearch(state.place);
  });
  elements.playButton.addEventListener('click', togglePlayback);
  elements.previousButton.addEventListener('click', () => {
    const previous = findPreviousPlayable(state.currentIndex);
    if (previous >= 0) playStation(previous, true);
  });
  elements.nextButton.addEventListener('click', () => {
    const next = findNextPlayable(state.currentIndex);
    if (next >= 0) playStation(next, true);
  });
  elements.volume.addEventListener('input', () => { elements.audio.volume = Number(elements.volume.value); });
  elements.audio.addEventListener('playing', () => {
    clearTimeout(state.playTimeout);
    state.phase = 'playing';
    updatePlayer();
  });
  elements.audio.addEventListener('error', () => {
    if (state.currentIndex >= 0 && state.phase === 'buffering') failPlayback(state.currentIndex);
  });

  if (state.mode === 'travel') chooseTravelCity();
  else if (state.mode === 'prefecture') {
    setMode('prefecture', '都道府県');
    showLocationFallback('前回のモードです。都道府県を選んでください。');
  } else requestLocation();
}

initialize();
