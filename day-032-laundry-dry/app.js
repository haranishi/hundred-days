/* 画面の組み立て。計算は lib/ の純関数に任せ、ここは受け渡しと描画だけ。

   通信は「場所が変わったとき」だけ。干す場所（日なた／日かげ）の切り替えでは
   取得済みの「いまの値」から計算し直すので、外へは出ない（利用条件の上限に対しても誠実に）。

   ⚠️ この画面に将来の時刻を書かない。書ける材料をそもそも取ってきていない（lib/weather.js）。 */

import { FABRICS, PLACES, SMELL_HOURS, MAX_SHOWN_HOURS, estimate, whyNotDrying, VERDICTS } from './lib/dry.js';
import { fetchCurrent } from './lib/weather.js';
import { groupByPref, findByCode, nearest, fullName } from './lib/places.js';
import { load as loadStore, save as saveStore, isAvailable as storageAvailable } from './lib/store.js';
import { clockOf, hoursSpan } from './lib/time.js';

const $ = (id) => document.getElementById(id);
const app = $('app');

const state = {
  current: null,
  place: null, // { label, lat, lon }
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

  for (const button of document.querySelectorAll('.option[data-place]')) {
    button.addEventListener('click', () => choose(button.dataset.place));
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
    state.current = await fetchCurrent({ lat: place.lat, lon: place.lon });
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

function choose(value) {
  state.placeKind = value;
  saveStore({ place: value });
  syncOptions();
  if (state.current) render(); // 再通信しない
}

function syncOptions() {
  app.dataset.place = state.placeKind;
  $('place-note').textContent = state.placeKind === 'sun'
    ? '日が当たる物干し。風も通る前提です'
    : '日射が無いぶん、日なたの6割の速さで見ています';
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
  const result = estimate({ current: state.current, place: state.placeKind });

  $('place-name').textContent = state.place.label;
  $('headline').dataset.verdict = result.verdict;
  $('observed-at').textContent = `（${clockOf(result.observedAt)}時点）`;
  $('verdict').textContent = VERDICTS[result.verdict].label;
  $('rate-line').textContent =
    `ET0 ${result.et0PerHour.toFixed(2)} mm/h（${result.placeLabel}）`;

  const noDry = $('no-dry');
  noDry.hidden = result.rate > 0;
  if (!noDry.hidden) noDry.textContent = whyNotDrying(result);

  const smell = $('smell');
  smell.hidden = !result.smell;
  if (result.smell) {
    smell.textContent = `ふつうの洗濯物でも${SMELL_HOURS}時間ぶんを超えます。濡れたままの時間が長いと生乾きのにおいが出やすいので、扇風機を当てるか、乾燥機を使うほうが確実です。`;
  }

  renderSpans(result);
  renderWhy(result);
}

/** 薄手・ふつう・厚手を同時に出す */
function renderSpans(result) {
  $('spans').hidden = result.rate <= 0;
  if (result.rate <= 0) return;

  $('dry-list').replaceChildren(...result.items.flatMap((item) => {
    const dt = document.createElement('dt');
    dt.textContent = item.label;
    const eg = document.createElement('span');
    eg.className = 'spans__eg';
    eg.textContent = item.examples;
    dt.append(eg);

    const dd = document.createElement('dd');
    const span = hoursSpan(item.hours, MAX_SHOWN_HOURS);
    if (span) {
      dd.textContent = span;
      const unit = document.createElement('span');
      unit.className = 'spans__unit';
      unit.textContent = 'ぶん';
      dd.append(unit);
    } else {
      dd.dataset.empty = 'true';
      dd.textContent = `${MAX_SHOWN_HOURS}時間ぶんでも足りません`;
    }
    return [dt, dd];
  }));
}

function renderWhy(result) {
  const place = PLACES[result.place];
  $('why-formula').textContent =
    `要る時間 ＝ 水の量(mm) ÷（いまのET0 ${result.et0PerHour.toFixed(2)} mm/h × ${place.label} ${place.factor}）`;
  const current = state.current;
  const rows = [
    ['いつの値か', `${clockOf(result.observedAt)}（直前${Math.round(current.intervalSec / 60)}分ぶん）`],
    ['干す場所', `${place.label}（倍率 ${place.factor}）`],
    ['ET0（大気の乾かす力）', `${result.et0PerHour.toFixed(2)} mm/h`],
    ['いまの乾く速さ', `${result.rate.toFixed(2)} mm/h`],
    ['気温', current.temp != null ? `${current.temp} ℃` : '—'],
    ['湿度', current.humidity != null ? `${current.humidity} %` : '—'],
    ['風速', current.wind != null ? `${current.wind} km/h` : '—'],
    ['日射', current.radiation != null ? `${current.radiation} W/m²` : '—'],
    ['いまの雨', `${result.precipPerHour.toFixed(1)} mm/h`],
    ['水の量', Object.values(FABRICS).map((f) => `${f.label} ${f.water}mm`).join('・')]
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
  const result = estimate({ current: state.current, place: state.placeKind });
  const where = state.place.label.replace(/^現在地（(.+)あたり）$/, '$1');
  const thin = result.items.find((item) => item.key === 'thin');
  const span = hoursSpan(thin.hours, MAX_SHOWN_HOURS);
  const text = span
    ? `${where}はいま「${VERDICTS[result.verdict].label}」。この勢いなら薄手で${span}ぶんです`
    : `${where}はいま「${VERDICTS[result.verdict].label}」`;
  const url = document.querySelector('link[rel="canonical"]')?.href || location.href;
  window.open(
    `https://x.com/intent/post?text=${encodeURIComponent(`${text}\n\n#いま干していい`)}&url=${encodeURIComponent(url)}`,
    '_blank',
    'noopener'
  );
}

boot();
