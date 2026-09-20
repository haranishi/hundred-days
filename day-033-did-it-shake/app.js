/* 画面の組み立て。場所を変えても、取得済みの一覧から計算し直すだけ。 */
import { groupEvents, answer, todayCount, strip, lastAtYourTown, recentList, townText, postText, INTENSITIES, intensityLabel, maxIntensity } from './lib/quakes.js';
import { fetchList, ShapeError } from './lib/jma.js';
import { groupByPref, findByCode, nearest, fullName } from './lib/places.js';
import { load, save, isAvailable } from './lib/store.js';
import { clockOf, absoluteTime } from './lib/time.js';
const $ = (id) => document.getElementById(id);
const state = { list: null, fetchedAt: null, place: null, mode: 'none', places: null, loadingPlaces: null, busy: false };
let loadingTimer;
function setState(next) {
  clearTimeout(loadingTimer);
  $('app').dataset.state = next;
  const show = () => {
    for (const name of ['loading', 'ready', 'empty', 'error']) $(name).hidden = name !== next;
  };
  if (next === 'loading') loadingTimer = setTimeout(show, 300);
  else show();
}
async function check() {
  if (state.busy) return;
  if (state.fetchedAt !== null && Date.now() - state.fetchedAt < 20000) {
    render();
    return;
  }
  state.busy = true;
  for (const id of ['check', 'retry', 'empty-retry']) $(id).disabled = true;
  $('check').textContent = '確かめています…';
  // 初回だけ読み込み中の画面。答えが出たあとの押し直しでは、画面を消さずボタンの文字だけ変える
  if (!state.list) setState('loading');
  try {
    Object.assign(state, await fetchList());
    render();
  } catch (error) {
    $('error-text').textContent = error instanceof ShapeError ? error.message : error.name === 'AbortError' ? '取得に時間がかかりすぎました' : '少し待って、もう一度押してください';
    setState('error');
  } finally {
    state.busy = false;
    for (const id of ['check', 'retry', 'empty-retry']) $(id).disabled = false;
    $('check').textContent = 'いま揺れた？';
  }
}
function render() {
  if (!state.list) return;
  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - state.fetchedAt) / 1000));
  if (!state.list.length) {
    $('empty-checked').textContent = `${seconds}秒前に確認`;
    setState('empty');
    return;
  }
  const events = groupEvents(state.list, now);
  const result = answer({ events, now, place: state.place, places: state.places || [] });
  // 折り返しは <wbr> の位置だけ（CSS の word-break: keep-all）。2〜3文字だけ次の行に落ちるのを防ぐ
  $('answer').replaceChildren(...result.headingParts.flatMap((part, index) => index ? [document.createElement('wbr'), part] : [part]));
  $('answer').dataset.kind = result.kind;
  $('headline').dataset.kind = result.kind;
  const withBreaks = (parts) => parts.flatMap((part, index) => index ? [document.createElement('wbr'), part] : [part]);
  $('answer-sub').replaceChildren(...withBreaks(result.subParts));
  $('answer-note').replaceChildren(...withBreaks(result.noteParts));
  $('answer-note').hidden = !result.note;
  $('place-hint').hidden = Boolean(state.place);
  $('your-intensity').hidden = !result.intensity;
  $('your-intensity').textContent = result.intensity ? `あなたの街は震度${intensityLabel(result.intensity)}` : '';
  $('your-intensity').dataset.intensity = result.intensity || '';
  // 震度が出ているときは要らない。「観測されていません」「発表はありません」のときだけ添える
  $('fine-print').hidden = !state.place || Boolean(result.intensity) || result.kind === 'shook-pref';
  const published = state.list.map((row) => Date.parse(row.rdt)).filter((at) => at <= now);
  $('checked-at').textContent = `${seconds}秒前に確認${published.length ? `（発表 ${clockOf(Math.max(...published))}）` : ''}`;
  $('today-count').textContent = todayCount(events, now);
  const cells = strip(events, now);
  $('strip').replaceChildren(...cells.map((cell) => {
    // コマは「色の棒＋数字」の2段。文字を色の上に載せないので、どの震度でも読める
    const node = document.createElement('span');
    node.className = 'strip-cell';
    const bar = document.createElement('span');
    bar.className = 'strip-cell__bar';
    bar.dataset.intensity = cell.maxi || '';
    const num = document.createElement('span');
    num.className = 'strip-cell__num';
    num.textContent = cell.maxi ? intensityLabel(cell.maxi)[0] : '';
    node.append(bar, num);
    node.title = `${clockOf(cell.hourStart)}台 ${cell.count}回${cell.maxi ? `・最大震度${intensityLabel(cell.maxi)}` : ''}`;
    node.setAttribute('aria-hidden', 'true');
    return node;
  }));
  $('strip-axis').replaceChildren(...cells.map((cell, index) => {
    const node = document.createElement('span');
    node.textContent = index % 6 === 0 || index === 23 ? clockOf(cell.hourStart).slice(0, 2) : '';
    return node;
  }));
  const peak = maxIntensity(cells.map((cell) => cell.maxi));
  const peakEvent = events.find((event) => event.at >= cells[0].hourStart && event.maxi === peak);
  $('strip').setAttribute('aria-label', `24時間で${cells.reduce((sum, cell) => sum + cell.count, 0)}回。${peakEvent ? `最大は${clockOf(peakEvent.at)}の震度${intensityLabel(peak)}` : '震度1以上の発表はありません'}`);
  $('strip-peak').textContent = peakEvent ? `この24時間の最大：震度${intensityLabel(peak)}（${clockOf(peakEvent.at)}）` : 'この24時間、震度1以上の発表はありません';
  $('your-town').hidden = !state.place;
  $('your-town').textContent = state.place ? townText(lastAtYourTown(events, state.place, state.places, { skipEid: result.intensity ? result.event.eid : null })) : '';
  const rows = recentList(events);
  $('recent').querySelector('summary').textContent = `直近の地震（${rows.length}件）`;
  $('recent-body').replaceChildren(...rows.map((event) => {
    const row = document.createElement('tr');
    for (const text of [absoluteTime(event.at, now), `${event.anm}${event.mag ? ` M${event.mag}` : ''}${event.provisional ? '（第一報）' : ''}`, intensityLabel(event.maxi)]) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    return row;
  }));
  setState('ready');
  $('answer').classList.remove('appear');
  void $('answer').offsetWidth;
  $('answer').classList.add('appear');
}
async function ensurePlaces() {
  if (state.places) return state.places;
  if (!state.loadingPlaces) state.loadingPlaces = fetch(new URL('./data/places.json', import.meta.url))
    .then((response) => { if (!response.ok) throw new Error(); return response.json(); })
    .then((json) => { state.places = json.places; return state.places; })
    .finally(() => { state.loadingPlaces = null; });
  return state.loadingPlaces;
}
function note(text) { $('geo-note').textContent = text; $('geo-note').hidden = false; }
function choosePlace(place, mode, persist = true) {
  state.place = place; state.mode = place ? mode : 'none';
  $('app').dataset.place = state.mode;
  $('place-name').textContent = !place ? '場所' : mode === 'current' ? `現在地（${place.n}あたり）` : fullName(place);
  $('clear-place').hidden = !place;
  if (persist && !save(place ? { code: place.c, mode } : { code: null })) $('storage-notice').hidden = false;
  if (!state.busy) render();
}
async function openPlaceDialog() {
  try {
    const places = await ensurePlaces();
    $('pref-select').replaceChildren(...groupByPref(places).map((group) => new Option(group.pref, group.pref)));
    if (state.place) $('pref-select').value = state.place.p;
    fillTowns();
    if (state.place) $('town-select').value = state.place.c;
    $('place-dialog').showModal();
  } catch { note('場所の一覧を読み込めませんでした。もう一度選んでください。'); }
}
function fillTowns() {
  $('town-select').replaceChildren(...state.places.filter((place) => place.p === $('pref-select').value).map((place) => new Option(place.n, place.c)));
}
let placeRequest = 0;
function useLocation() {
  if (!navigator.geolocation) { note('この端末では現在地を取れません。市区町村から選んでください。'); return; }
  const request = ++placeRequest;
  $('geo-note').hidden = true;
  $('use-location').disabled = true;
  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      const places = await ensurePlaces();
      if (request !== placeRequest) return;
      const found = nearest(places, { lat: position.coords.latitude, lon: position.coords.longitude });
      choosePlace(found.place, 'current');
    } catch { note('場所の一覧を読み込めませんでした。市区町村から選んでください。'); }
    finally { $('use-location').disabled = false; }
  }, (error) => {
    $('use-location').disabled = false;
    if (request !== placeRequest) return;
    note(error.code === 1 ? '現在地の利用が許可されませんでした。市区町村から選んでください。' : '現在地を取れませんでした。市区町村から選んでください。');
  }, { timeout: 10000, maximumAge: 300000 });
}
async function boot() {
  for (const id of ['check', 'retry', 'empty-retry']) $(id).addEventListener('click', check);
  $('pick-place').addEventListener('click', openPlaceDialog);
  $('use-location').addEventListener('click', useLocation);
  $('clear-place').addEventListener('click', () => { placeRequest++; choosePlace(null, 'none'); });
  $('pref-select').addEventListener('change', fillTowns);
  $('place-cancel').addEventListener('click', () => $('place-dialog').close());
  // select に焦点があるとき Escape がダイアログまで届かないブラウザがあるので、自分でも閉じる
  $('place-dialog').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); $('place-dialog').close(); }
  });
  $('place-confirm').addEventListener('click', () => {
    placeRequest++;
    choosePlace(findByCode(state.places, $('town-select').value), 'picked');
    $('place-dialog').close();
    $('geo-note').hidden = true;
  });
  $('post-result').addEventListener('click', () => {
    const now = Date.now();
    const events = groupEvents(state.list, now);
    const text = postText({ count: todayCount(events, now), result: answer({ events, now, place: state.place, places: state.places || [] }) });
    const url = document.querySelector('link[rel="canonical"]')?.href || location.href;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
  });
  $('legend').append(...INTENSITIES.map((intensity) => {
    // 色の四角と文字を分ける。文字は白地に置くので、どの色でも読める
    const item = document.createElement('span'); item.className = 'legend__item';
    const swatch = document.createElement('i'); swatch.className = 'swatch'; swatch.dataset.intensity = intensity; swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, intensityLabel(intensity)); return item;
  }));
  $('storage-notice').hidden = isAvailable();
  const saved = load();
  const fetching = check();
  if (saved.code) {
    try { choosePlace(findByCode(await ensurePlaces(), saved.code), saved.mode, false); }
    catch { note('保存した場所を読み込めませんでした。市区町村から選んでください。'); }
  }
  await fetching;
}
boot();
