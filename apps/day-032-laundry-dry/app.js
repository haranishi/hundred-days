/* 画面の組み立て。計算は lib/ の純関数に任せ、ここは受け渡しと描画だけ。

   通信は「場所が変わったとき」だけ。干し方や干し場所の切り替えでは
   取得済みの予報から計算し直すので、外へは出ない（利用条件の上限に対しても誠実に）。 */

import { FABRICS, PLACES, SMELL_HOURS, predict, bestStart, tooLateToday, conditionsAt, VERDICTS } from './lib/dry.js';
import { fetchForecast } from './lib/weather.js';
import { groupByPref, findByCode, nearest, fullName } from './lib/places.js';
import { load as loadStore, save as saveStore, isAvailable as storageAvailable } from './lib/store.js';
import { nowWall, clockOf, humanDuration, relativeClock, parseWall } from './lib/time.js';

const $ = (id) => document.getElementById(id);
const app = $('app');

const state = {
  forecast: null,
  place: null, // { label, lat, lon }
  fabric: 'normal',
  placeKind: 'sun',
  places: null,
  loadingPlaces: null
};

/* ---------- 状態 ---------- */

let loadingTimer = null;
function setState(next) {
  clearTimeout(loadingTimer);
  const sections = { start: $('start'), loading: $('loading'), ready: $('ready'), error: $('error') };
  const show = (name) => {
    app.dataset.state = name;
    for (const [key, node] of Object.entries(sections)) node.hidden = key !== name;
  };
  if (next === 'loading') {
    // 一瞬で返るときにちらつかせない
    app.dataset.state = 'loading';
    loadingTimer = setTimeout(() => show('loading'), 300);
    return;
  }
  show(next);
}

/* ---------- 起動 ---------- */

function boot() {
  const saved = loadStore();
  state.fabric = saved.fabric;
  state.placeKind = saved.place;
  syncOptions();
  if (!storageAvailable()) $('storage-notice').hidden = false;

  $('use-location').addEventListener('click', useLocation);
  $('pick-place').addEventListener('click', openPlaceDialog);
  $('error-pick').addEventListener('click', openPlaceDialog);
  $('change-place').addEventListener('click', openPlaceDialog);
  $('retry').addEventListener('click', () => { if (state.place) loadPlace(state.place); });
  $('place-cancel').addEventListener('click', () => $('place-dialog').close());
  $('place-confirm').addEventListener('click', confirmPlace);
  $('pref-select').addEventListener('change', fillTowns);
  $('post-result').addEventListener('click', postResult);

  for (const button of document.querySelectorAll('[data-fabric]')) {
    button.addEventListener('click', () => choose('fabric', button.dataset.fabric));
  }
  for (const button of document.querySelectorAll('.option[data-place]')) {
    button.addEventListener('click', () => choose('place', button.dataset.place));
  }
  for (const group of document.querySelectorAll('.control__row')) {
    group.addEventListener('keydown', (event) => moveWithArrows(event, group));
  }

  if (saved.code) restoreSavedPlace(saved.code);
  else setState('start');
}

async function restoreSavedPlace(code) {
  setState('loading');
  const places = await ensurePlaces().catch(() => null);
  const place = places && findByCode(places, code);
  if (!place) { setState('start'); return; }
  loadPlace({ label: fullName(place), lat: place.lat, lon: place.lon, code: place.c });
}

/* ---------- 場所 ---------- */

function useLocation() {
  const note = $('geo-note');
  if (!navigator.geolocation) {
    note.hidden = false;
    note.textContent = 'この端末では現在地を取れません。市区町村から選んでください。';
    return;
  }
  note.hidden = true;
  setState('loading');
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const point = { lat: position.coords.latitude, lon: position.coords.longitude };
      const places = await ensurePlaces().catch(() => null);
      const near = places ? nearest(places, point) : null;
      const label = near && near.km < 30 ? `現在地（${near.place.n}あたり）` : '現在地';
      loadPlace({ ...point, label });
    },
    () => {
      setState('start');
      note.hidden = false;
      note.textContent = '現在地を取れませんでした。市区町村から選んでください。';
    },
    { timeout: 10000, maximumAge: 5 * 60 * 1000 }
  );
}

async function ensurePlaces() {
  if (state.places) return state.places;
  if (!state.loadingPlaces) {
    state.loadingPlaces = fetch(new URL('./data/places.json', import.meta.url))
      .then((response) => {
        if (!response.ok) throw new Error(`場所の一覧を読めませんでした (${response.status})`);
        return response.json();
      })
      .then((json) => {
        state.places = json.places;
        return state.places;
      })
      .finally(() => { state.loadingPlaces = null; });
  }
  return state.loadingPlaces;
}

async function openPlaceDialog() {
  const dialog = $('place-dialog');
  try {
    const places = await ensurePlaces();
    if (!$('pref-select').options.length) {
      const groups = groupByPref(places);
      $('pref-select').append(...groups.map((group) => new Option(group.pref, group.pref)));
      const saved = state.place?.code ? findByCode(places, state.place.code) : null;
      if (saved) $('pref-select').value = saved.p;
      fillTowns();
      if (saved) $('town-select').value = saved.c;
    }
    dialog.showModal();
  } catch {
    showError('場所の一覧を読み込めませんでした');
  }
}

function fillTowns() {
  const pref = $('pref-select').value;
  const towns = (state.places || []).filter((place) => place.p === pref);
  const select = $('town-select');
  select.replaceChildren(...towns.map((place) => new Option(place.n, place.c)));
}

function confirmPlace() {
  const place = findByCode(state.places || [], $('town-select').value);
  $('place-dialog').close();
  if (!place) return;
  saveStore({ code: place.c });
  loadPlace({ label: fullName(place), lat: place.lat, lon: place.lon, code: place.c });
}

async function loadPlace(place) {
  state.place = place;
  setState('loading');
  try {
    state.forecast = await fetchForecast({ lat: place.lat, lon: place.lon });
    setState('ready');
    render();
  } catch (error) {
    showError(error?.name === 'AbortError' ? '天気の取得に時間がかかりすぎました' : '天気を取れませんでした');
  }
}

function showError(message) {
  $('error-text').textContent = message;
  setState('error');
}

/* ---------- 切り替え ---------- */

function choose(kind, value) {
  if (kind === 'fabric') { state.fabric = value; saveStore({ fabric: value }); }
  else { state.placeKind = value; saveStore({ place: value }); }
  syncOptions();
  if (state.forecast) render(); // 再通信しない
}

function syncOptions() {
  app.dataset.fabric = state.fabric;
  app.dataset.place = state.placeKind;
  const fabric = FABRICS[state.fabric];
  const place = PLACES[state.placeKind];
  $('fabric-note').textContent = `${fabric.examples}くらい（含む水の量 ${fabric.water}mm）`;
  $('place-note').textContent = state.placeKind === 'sun'
    ? '日が当たる物干し。風も通る前提です'
    : '日射が無いぶん、日なたの6割の速さで見ています';
  for (const button of document.querySelectorAll('[data-fabric]')) {
    const on = button.dataset.fabric === state.fabric;
    button.setAttribute('aria-checked', String(on));
    button.tabIndex = on ? 0 : -1;
  }
  for (const button of document.querySelectorAll('.option[data-place]')) {
    const on = button.dataset.place === state.placeKind;
    button.setAttribute('aria-checked', String(on));
    button.tabIndex = on ? 0 : -1;
  }
}

function moveWithArrows(event, group) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  const step = keys[event.key];
  if (!step) return;
  event.preventDefault();
  const buttons = [...group.querySelectorAll('.option')];
  const current = buttons.findIndex((button) => button.getAttribute('aria-checked') === 'true');
  const next = buttons[(current + step + buttons.length) % buttons.length];
  next.click();
  next.focus();
}

/* ---------- 描画 ---------- */

function render() {
  const { hours, sunsets } = state.forecast;
  const now = nowWall();
  const result = predict({ hours, sunsets, startAt: now, fabric: state.fabric, place: state.placeKind });
  const late = tooLateToday({ startAt: now, sunsets });

  $('place-name').textContent = state.place.label;
  $('headline').dataset.verdict = result.verdict;
  $('headline').dataset.late = String(late || !result.driedAt);

  if (late) {
    $('dry-label').textContent = '今から干すと';
    $('dry-time').textContent = '乾きません';
    $('dry-sub').textContent = '日が沈むと乾かなくなります。明日の朝にしましょう。';
  } else if (!result.driedAt) {
    $('dry-label').textContent = '今から干すと';
    $('dry-time').textContent = '乾きません';
    $('dry-sub').textContent = 'この先2日ぶんの予報でも乾き切りませんでした。';
  } else {
    $('dry-label').textContent = '乾くのは';
    $('dry-time').textContent = relativeClock(result.driedAt, now);
    $('dry-sub').textContent = `あと${humanDuration(result.hoursToDry)}`;
  }

  $('verdict').textContent = VERDICTS[result.verdict].label;

  $('bring-in').textContent = result.bringInBy && result.driedAt
    ? `取り込みは ${relativeClock(result.bringInBy, now)} までに`
    : '';
  $('bring-in').hidden = !$('bring-in').textContent;

  const smell = $('smell');
  smell.hidden = !result.smell;
  if (result.smell) {
    smell.textContent = `乾くまで${SMELL_HOURS}時間を超えます。濡れたままの時間が長いと生乾きのにおいが出やすいので、扇風機を当てるか、乾燥機を使うほうが確実です。`;
  }

  renderTimeline(result, now);
  renderBest(result, now, late);
  renderWhy(result, now);
}

function renderTimeline(result, now) {
  const bar = $('timeline-bar');
  const axis = $('timeline-axis');
  const cells = result.timeline.slice(0, 24);
  const peak = Math.max(0.001, ...cells.map((cell) => cell.rate));

  bar.replaceChildren(...cells.map((cell) => {
    const node = document.createElement('div');
    node.className = 'timeline__cell';
    const kind = cell.raining ? 'rain' : !cell.isDay ? 'night' : cell.dried ? 'done' : 'dry';
    node.dataset.kind = kind;
    if (result.driedAt && cell.time === firstDriedHour(result)) node.dataset.dried = 'true';
    /* 乾いていく時間は「勢い」を高さで見せる。
       雨はコマ全体を塗る（乾く速さは0なので、高さに比例させると消えてしまう） */
    if (kind === 'dry') {
      const fill = document.createElement('span');
      fill.className = 'timeline__fill';
      fill.style.height = `${Math.round((cell.rate / peak) * 100)}%`;
      node.append(fill);
    }
    return node;
  }));

  axis.replaceChildren(...cells.map((cell, index) => {
    const node = document.createElement('span');
    node.textContent = index % 3 === 0 ? String(Number(cell.time.slice(11, 13))) : '';
    return node;
  }));

  const from = clockOf(cells[0]?.time || now);
  const rain = cells.find((cell) => cell.raining);
  const rainHours = cells.filter((cell) => cell.raining).length;
  $('timeline').setAttribute(
    'aria-label',
    `${from}から24時間の乾き具合。${result.driedAt ? `${relativeClock(result.driedAt, now)}に乾きます。` : '乾き切りません。'}` +
    `${rain ? `${relativeClock(rain.time, now)}から雨が降り、合わせて${rainHours}時間続きます。` : 'この24時間に雨はありません。'}`
  );
}

/** 乾き上がりを含む1時間（縦線を引く位置） */
function firstDriedHour(result) {
  const dried = result.timeline.find((cell) => cell.dried);
  return dried ? dried.time : null;
}

function renderBest(result, now, late) {
  const { hours, sunsets } = state.forecast;
  const best = bestStart({ hours, sunsets, from: now, fabric: state.fabric, place: state.placeKind });
  const node = $('best-start');
  const tomorrow = $('tomorrow');

  if (best && (late || !result.driedAt || best.hoursToDry < result.hoursToDry - 0.5)) {
    node.hidden = false;
    node.innerHTML = `いちばん早く乾くのは <strong>${relativeClock(best.startAt, now)}に干したとき</strong>（${humanDuration(best.hoursToDry)}で乾きます）`;
  } else {
    node.hidden = true;
  }

  // 明日の朝9時に干した場合の見通し
  const tomorrowStart = nextMorning(now);
  const forecastEnd = hours.length ? hours[hours.length - 1].time : null;
  if (forecastEnd && parseWall(tomorrowStart) <= parseWall(forecastEnd)) {
    const next = predict({ hours, sunsets, startAt: tomorrowStart, fabric: state.fabric, place: state.placeKind });
    tomorrow.hidden = false;
    tomorrow.textContent = next.driedAt && next.driedToday
      ? `明日9時に干すなら ${humanDuration(next.hoursToDry)} で乾きます。`
      : '明日9時に干しても、日が沈むまでには乾かなさそうです。';
  } else {
    tomorrow.hidden = true;
  }
}

function nextMorning(now) {
  const date = new Date(Date.UTC(
    Number(now.slice(0, 4)), Number(now.slice(5, 7)) - 1, Number(now.slice(8, 10)) + 1
  ));
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T09:00`;
}

function renderWhy(result, now) {
  const hour = conditionsAt({ hours: state.forecast.hours, startAt: now });
  const fabric = FABRICS[state.fabric];
  const place = PLACES[state.placeKind];
  $('why-formula').textContent =
    `乾くまでの時間 ＝ 水の量 ${fabric.water}mm ÷（ET0 × ${place.factor}）`;
  const rows = [
    ['干すもの', `${fabric.label}（水の量 ${fabric.water}mm）`],
    ['干す場所', `${place.label}（倍率 ${place.factor}）`],
    ['ET0（大気の乾かす力）', hour ? `${hour.et0} mm/h` : '—'],
    ['気温', hour?.temp != null ? `${hour.temp} ℃` : '—'],
    ['湿度', hour?.humidity != null ? `${hour.humidity} %` : '—'],
    ['風速', hour?.wind != null ? `${hour.wind} km/h` : '—'],
    ['日射', hour?.radiation != null ? `${hour.radiation} W/m²` : '—'],
    ['干している間の降水確率', `最大 ${Math.round(result.rainRisk)} %`]
  ];
  $('why-values').replaceChildren(...rows.flatMap(([term, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    return [dt, dd];
  }));
}

/* ---------- 結果の投稿 ---------- */

function postResult() {
  const now = nowWall();
  const result = predict({
    hours: state.forecast.hours, sunsets: state.forecast.sunsets,
    startAt: now, fabric: state.fabric, place: state.placeKind
  });
  const where = state.place.label.replace(/^現在地（(.+)あたり）$/, '$1');
  const text = result.driedAt && !tooLateToday({ startAt: now, sunsets: state.forecast.sunsets })
    ? `${where}でいま${FABRICS[state.fabric].label}を干すと、${relativeClock(result.driedAt, now)}に乾きます（${VERDICTS[result.verdict].label}）`
    : `${where}はいま干しても乾きません。明日にします`;
  const url = document.querySelector('link[rel="canonical"]')?.href || location.href;
  window.open(
    `https://x.com/intent/post?text=${encodeURIComponent(`${text}\n\n#いま干していい`)}&url=${encodeURIComponent(url)}`,
    '_blank',
    'noopener'
  );
}

boot();
