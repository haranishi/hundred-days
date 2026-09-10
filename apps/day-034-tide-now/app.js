import { fetchWindow, ShapeError } from './lib/jma.js';
import { dateWindow, eventsAround, stateOf, levelNow, dailyRange, rangeRank, tideName, HEADINGS, answerSub, remainingText, postText } from './lib/tide.js';
import { groupByPref, findByCode, nearest } from './lib/stations.js';
import { load, save, isAvailable } from './lib/store.js';
import { clockOf, dayOf } from './lib/time.js';
import { curveSvg, curveLabel } from './lib/curve.js';
const $ = (id) => document.getElementById(id);
const state = { station: null, mode: 'none', km: null, days: null, stations: null, loadingStations: null };
let loadingTimer, request = 0, locationRequest = 0;
function setState(next) {
  clearTimeout(loadingTimer);
  $('app').dataset.state = next;
  const show = () => {
    for (const name of ['pick', 'loading', 'ready', 'empty', 'error']) $(name).hidden = name !== next;
    $('tables').hidden = next !== 'ready';
    $('retry').hidden = !['empty', 'error'].includes(next);
  };
  if (next === 'loading') {
    for (const name of ['pick', 'ready', 'empty', 'error', 'tables', 'retry']) $(name).hidden = true;
    loadingTimer = setTimeout(show, 300);
  } else show();
}
function note(text) { $('geo-note').textContent = text; $('geo-note').hidden = !text; }
async function ensureStations() {
  if (state.stations) return state.stations;
  if (!state.loadingStations) state.loadingStations = fetch(new URL('./data/stations.json', import.meta.url))
    .then((response) => { if (!response.ok) throw new Error(); return response.json(); })
    .then((json) => { state.stations = json.stations; return state.stations; })
    .finally(() => { state.loadingStations = null; });
  return state.loadingStations;
}
function updatePlace() {
  $('app').dataset.place = state.mode;
  $('use-location').textContent = state.station ? '現在地' : '現在地でいまの潮を見る';
  $('pick-station').textContent = state.station ? '地点を変える' : '地点を選ぶ';
  $('station-name').hidden = !state.station;
  $('as-of-sep').hidden = !state.station;
  $('clear-station').hidden = !state.station;
  $('far-note').hidden = state.mode !== 'current' || state.km === null || state.km < 50;
  $('station-name').textContent = !state.station ? '' : state.mode === 'current'
    ? `現在地 → ${state.station.name}（${state.km === null ? '距離は現在地で再確認' : `${Math.round(state.km)}km`}）`
    : state.station.name;
}
async function chooseStation(station, mode, km = null, persist = true) {
  locationRequest++;
  $('use-location').disabled = false;
  state.station = station; state.mode = station ? mode : 'none'; state.km = km; state.days = null;
  note(''); updatePlace();
  if (persist && !save(station ? { code: station.code, mode } : {})) $('storage-notice').hidden = false;
  await check();
}
async function check() {
  const current = ++request;
  if (!state.station) { setState('pick'); return; }
  const code = state.station.code;
  $('retry').disabled = true;
  setState('loading');
  try {
    const days = await fetchWindow(code, Date.now());
    if (current !== request) return;
    state.days = days; render(true);
  } catch (error) {
    if (current !== request) return;
    showError(error, state.station.name);
    setState('error');
  } finally { if (current === request) $('retry').disabled = false; }
}
// 種別ごとに「何が起きたか」と「次に何をするか」を対にする。形の不一致だけは地点の問題ではない。
function showError(error, name) {
  const [text, note] = error instanceof ShapeError
    ? [error.message, '気象庁の配信が変わった可能性があります']
    : error.status === 404
      ? [`${name}の潮位表が見つかりません`, '別の地点を選んでください']
      : [`${name}の潮位表が取れません`, '通信を確かめて、もう一度読んでください'];
  $('error-text').textContent = text; $('error-note').textContent = note;
}
function fillTable(id, day, date, label) {
  const table = $(id);
  table.querySelector('caption').textContent = `${label}（${dayOf(`${date}T00:00:00+09:00`)}）の満潮・干潮`;
  const rows = [['満潮', day?.highs ?? []], ['干潮', day?.lows ?? []]].flatMap(([type, events]) => events.length
    ? events.map((event) => ({ type, time: event.time, cm: `${event.cm}cm` }))
    : [{ type, time: '予測なし', cm: '予測なし' }]);
  rows.sort((a, b) => a.time.localeCompare(b.time));
  table.querySelector('tbody').replaceChildren(...rows.map(({ type, time, cm }) => {
    const tr = document.createElement('tr');
    for (const text of [type, time, cm]) { const td = document.createElement('td'); td.textContent = text; tr.append(td); }
    return tr;
  }));
}
function render(animate = false) {
  if (!state.days || !state.station) return;
  const now = Date.now(), dates = dateWindow(now), day = state.days.get(dates[1]), tomorrow = state.days.get(dates[2]);
  if (!day) { setState('empty'); return; }
  const around = eventsAround(state.days, now), kind = stateOf({ ...around, now });
  // あす0時の値があれば23時台の線形補間にも使う。
  const hourly = [...day.hourly, tomorrow?.hourly[0]];
  const level = levelNow({ ...around, hourly, now });
  $('answer').textContent = HEADINGS[kind]; $('answer').dataset.kind = kind; $('headline').dataset.kind = kind;
  $('answer-sub').textContent = answerSub({ ...around, now });
  const remaining = remainingText({ ...around, now });
  $('remaining').textContent = remaining; $('remaining').hidden = !remaining;
  $('now-level').textContent = Number.isFinite(level) ? `いまの潮位 およそ${Math.round(level)}cm` : 'いまの潮位は推定できません';
  $('now-level-note').hidden = !Number.isFinite(level);
  $('tide-name').textContent = tideName(now);
  const range = dailyRange(day);
  $('range').textContent = Number.isFinite(range) ? `きょうの干満差 ${range}cm（${state.station.name}では${rangeRank(state.days, day.date)}）` : 'きょうの干満差は分かりません';
  setState('ready');
  const width = Math.max(280, $('curve').getBoundingClientRect().width);
  $('curve').setAttribute('viewBox', `0 0 ${width} 252`);
  $('curve').innerHTML = curveSvg(day, tomorrow, now, level, width);
  $('curve').setAttribute('aria-label', curveLabel(day, now, HEADINGS[kind]));
  $('as-of').textContent = `${clockOf(now)} 現在`;
  fillTable('events-today', day, dates[1], 'きょう'); fillTable('events-tomorrow', tomorrow, dates[2], 'あす');
  setState('ready');
  if (animate) { $('answer').classList.remove('appear'); void $('answer').offsetWidth; $('answer').classList.add('appear'); }
}
function fillStations() {
  $('station-select').replaceChildren(...state.stations.filter((station) => station.pref === $('pref-select').value).map((station) => new Option(station.name, station.code)));
}
async function openDialog() {
  try {
    const stations = await ensureStations();
    $('pref-select').replaceChildren(...groupByPref(stations).map((group) => new Option(group.pref, group.pref)));
    if (state.station) $('pref-select').value = state.station.pref;
    fillStations();
    if (state.station) $('station-select').value = state.station.code;
    if (!$('station-dialog').open) $('station-dialog').showModal();
  } catch { note('地点の一覧を読み込めませんでした。もう一度選んでください。'); }
}
function useLocation() {
  if (!navigator.geolocation) { note('この端末では現在地を取れません。地点を選んでください。'); return; }
  const current = ++locationRequest;
  $('use-location').disabled = true; note('');
  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      const stations = await ensureStations();
      if (current !== locationRequest) return;
      const found = nearest(stations, { lat: position.coords.latitude, lon: position.coords.longitude });
      await chooseStation(found.station, 'current', found.km);
    } catch { if (current === locationRequest) note('地点の一覧を読み込めませんでした。地点を選んでください。'); }
    finally { if (current === locationRequest) $('use-location').disabled = false; }
  }, (error) => {
    if (current !== locationRequest) return;
    $('use-location').disabled = false;
    note(error.code === 1 ? '現在地の利用が許可されませんでした。地点を選んでください。' : '現在地を取れませんでした。地点を選んでください。');
  }, { timeout: 10000, maximumAge: 300000 });
}
$('retry').addEventListener('click', check);
$('pick-station').addEventListener('click', openDialog);
$('use-location').addEventListener('click', useLocation);
$('clear-station').addEventListener('click', () => chooseStation(null, 'none'));
$('pref-select').addEventListener('change', fillStations);
$('station-cancel').addEventListener('click', () => $('station-dialog').close());
$('station-dialog').addEventListener('keydown', (event) => {
  if (event.code === 'Escape') { event.preventDefault(); $('station-dialog').close(); }
});
$('station-confirm').addEventListener('click', () => {
  const station = findByCode(state.stations, $('station-select').value);
  $('station-dialog').close(); chooseStation(station, 'picked');
});
$('post-result').addEventListener('click', () => {
  const now = Date.now();
  const text = postText({ station: state.station, ...eventsAround(state.days, now), now });
  const url = document.querySelector('link[rel="canonical"]')?.href || location.href;
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
});
async function boot() {
  $('storage-notice').hidden = isAvailable();
  const saved = load();
  if (saved.code) {
    const initial = request;
    try {
      const stations = await ensureStations();
      if (initial === request) await chooseStation(findByCode(stations, saved.code), saved.mode, null, false);
    } catch { note('保存した地点を読み込めませんでした。地点を選んでください。'); }
  }
  // 日付が変わっても取得しない。開いたときに取った年の範囲で計算し直す。
  setInterval(() => { if (['ready', 'empty'].includes($('app').dataset.state)) render(); }, 60000);
}
window.addEventListener('resize', () => { if ($('app').dataset.state === 'ready') render(); });
boot();
