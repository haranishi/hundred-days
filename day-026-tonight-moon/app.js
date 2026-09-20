import {
  DAY_MS, bodyHorizontal, direction16, illumination, lunarCycle, riseSet
} from './lib/astro.js';
import {
  PLACES, addDays, clampOffset, dateKey, formatDate, formatTime,
  harvestMoonInfo, jstMidnight, lunarDayFor, moonName, nowFromSearch, phaseState
} from './lib/koyomi.js';
import { drawMoon, prepareCanvas } from './lib/draw.js';
import { addStamp, clear, load, save, setPlace } from './lib/store.js';

const $ = (id) => document.getElementById(id);
const now = nowFromSearch(location.search, Date.now());
const tonightKey = dateKey(now);
let offset = 0;
let storage = null;
try { storage = window.localStorage; } catch { /* 保存不可でも計算を続ける */ }
const loaded = load(storage);
let state = loaded.state;
let canSave = loaded.canSave;
let model = null;
let clearArmed = false;
let clearTimer = 0;
let renderFrame = 0;

function setHidden(node, hidden) {
  node.hidden = hidden;
}

function persist() {
  if (!canSave) return;
  if (!save(storage, state).saved) {
    canSave = false;
    renderStorageState();
  }
}

function renderStorageState() {
  setHidden($('storage-error'), canSave);
}

function fillPlaces() {
  const options = PLACES.map((place) => {
    const option = document.createElement('option');
    option.value = place.id;
    option.textContent = place.label;
    return option;
  });
  if (state.place.id === 'geo') {
    const geo = document.createElement('option');
    geo.value = 'geo';
    geo.textContent = '現在地';
    options.push(geo);
  }
  $('place-select').replaceChildren(...options);
  $('place-select').value = state.place.id;
  if (!$('place-select').value) {
    state = setPlace(state, PLACES.find(({ id }) => id === 'tokyo'));
    $('place-select').value = 'tokyo';
  }
}

function timeOrMissing(event, body, kind) {
  if (event) return formatTime(event.time);
  return `この日は${body}の${kind}がありません`;
}

function differenceText(moonrise, sunset) {
  if (!moonrise || !sunset) return '—';
  const minutes = Math.round((moonrise.time - sunset.time) / 60_000);
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  const amount = `${hours ? `${hours}時間` : ''}${rest ? `${rest}分` : ''}` || 'ほぼ同時';
  if (minutes === 0) return '±0分';
  return `${minutes > 0 ? '+' : '−'}${amount}${minutes < 0 ? '（先に出ています）' : ''}`;
}

function moonsetAfterRise(key, moonEvents) {
  if (!moonEvents.rise || (moonEvents.set && moonEvents.set.time > moonEvents.rise.time)) {
    return { event: moonEvents.set, nextDay: false };
  }
  const nextEvents = riseSet('moon', jstMidnight(addDays(key, 1)), state.place.lat, state.place.lon);
  return { event: nextEvents.set, nextDay: Boolean(nextEvents.set) };
}

function selectedTime() {
  return now + offset * DAY_MS;
}

function calculateModel() {
  const time = selectedTime();
  const key = addDays(tonightKey, offset);
  const cycle = lunarCycle(time);
  const lit = illumination(time);
  const start = jstMidnight(key);
  const moonEvents = riseSet('moon', start, state.place.lat, state.place.lon);
  const sunEvents = riseSet('sun', start, state.place.lat, state.place.lon);
  const displayMoonset = moonsetAfterRise(key, moonEvents);
  return {
    time, key, cycle, lit,
    lunarDay: lunarDayFor(key, cycle.previousNew),
    moonEvents, sunEvents, displayMoonset,
    harvest: harvestMoonInfo(key)
  };
}

function nextRiseForTonight() {
  const todayRise = model.moonEvents.rise;
  if (todayRise?.time > now) return todayRise;
  const tomorrow = riseSet('moon', jstMidnight(addDays(tonightKey, 1)), state.place.lat, state.place.lon);
  return tomorrow.rise;
}

function renderCurrentStatus() {
  const node = $('now-status');
  if (offset !== 0) {
    node.textContent = '時刻は選んだ日の日本時間です。';
    return;
  }
  const at = bodyHorizontal('moon', now, state.place.lat, state.place.lon);
  if (at.altitude >= 0) {
    node.textContent = `いま出ています（高度 ${Math.round(at.altitude)}°・${direction16(at.azimuth)}）`;
    return;
  }
  const rise = nextRiseForTonight();
  node.textContent = rise
    ? `いま地平線の下。${formatTime(rise.time)} に${direction16(rise.azimuth)}から出ます`
    : 'いま地平線の下。この日は月の出がありません';
}

function drawMainMoon() {
  const canvas = $('moon-canvas');
  const width = Math.max(1, Math.floor(canvas.parentElement.clientWidth));
  const height = Math.max(1, Math.floor(canvas.parentElement.clientHeight));
  const ctx = prepareCanvas(canvas, width, height);
  drawMoon(ctx, width, height, { illum: model.lit.fraction, waxing: model.cycle.waxing, glow: true });
}

function renderHarvest() {
  const info = model.harvest;
  const lead = $('harvest-lead');
  if (info.mode === 'missing') {
    lead.textContent = 'この年の名月の日付は未収録です';
    $('harvest-date').textContent = '';
    $('full-difference').textContent = '';
    return;
  }
  const countMatch = info.lead.match(/^(.*?あと )([0-9]+ 日)$/);
  if (countMatch) {
    const count = document.createElement('span');
    count.className = 'harvest-count';
    count.textContent = countMatch[2];
    lead.replaceChildren(document.createTextNode(countMatch[1]), count);
  } else {
    lead.textContent = info.lead;
  }
  $('harvest-date').textContent = formatDate(info.target, { year: info.mode === 'next' });
  $('full-difference').textContent = info.fullText;
}

function renderJournal() {
  const list = $('stamp-list');
  list.replaceChildren();
  setHidden($('journal-empty'), state.stamps.length > 0);
  for (const stamp of state.stamps) {
    const item = document.createElement('li');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${stamp.date} 月齢${stamp.age.toFixed(1)}`);
    const ctx = prepareCanvas(canvas, 48);
    drawMoon(ctx, 48, { illum: stamp.illum, waxing: stamp.waxing, glow: false });
    const label = document.createElement('span');
    label.textContent = `${Number(stamp.date.slice(5, 7))}/${Number(stamp.date.slice(8, 10))}`;
    item.append(canvas, label);
    list.append(item);
  }
  const seenButton = $('seen-button');
  const recorded = offset === 0 && state.stamps.some(({ date }) => date === tonightKey);
  seenButton.classList.toggle('is-recorded', recorded);
  if (recorded) {
    seenButton.disabled = true;
    seenButton.textContent = '✓ 記録済み';
  } else if (offset !== 0) {
    seenButton.disabled = true;
    seenButton.textContent = '今夜だけ記録できます';
  } else {
    seenButton.disabled = false;
    seenButton.textContent = '今夜の月を見た';
  }
}

function render() {
  model = calculateModel();
  const age = model.cycle.age.toFixed(1);
  const name = moonName(model.lunarDay);
  const percent = Math.round(model.lit.fraction * 100);
  $('date-label').textContent = `${formatDate(model.key)}${offset === 0 ? '・今夜' : ''}`;
  $('place-heading').textContent = `${state.place.label}の空`;
  $('moon-age').textContent = age;
  $('moon-name').textContent = name;
  $('moon-state').textContent = phaseState({ fraction: model.lit.fraction, waxing: model.cycle.waxing });
  $('illumination').textContent = `${percent}%`;
  $('moon-canvas').setAttribute('aria-label', `月齢 ${age}、${name}、輝面 ${percent}%`);

  $('date-range').value = String(offset);
  $('date-prev').disabled = offset <= -30;
  $('date-next').disabled = offset >= 30;
  $('offset-label').textContent = offset === 0 ? '今夜' : `今夜から${offset > 0 ? '+' : ''}${offset}日`;
  setHidden($('today-button'), offset === 0);

  const rise = model.moonEvents.rise;
  const { event: set, nextDay: moonsetIsNextDay } = model.displayMoonset;
  $('moonrise').textContent = timeOrMissing(rise, '月', '出');
  if (set && moonsetIsNextDay) {
    const badge = document.createElement('span');
    badge.className = 'next-day-badge';
    badge.textContent = '翌';
    $('moonset').replaceChildren(badge, document.createTextNode(` ${formatTime(set.time)}`));
  } else {
    $('moonset').textContent = timeOrMissing(set, '月', '入り');
  }
  $('sunset').textContent = timeOrMissing(model.sunEvents.set, '日', '入り');
  const riseDirection = rise ? direction16(rise.azimuth) : '';
  $('moonrise-direction').textContent = riseDirection;
  $('moonset-direction').textContent = set ? direction16(set.azimuth) : '';
  $('hero-rise').textContent = rise ? `月の出 ${formatTime(rise.time)}・${riseDirection}` : 'この日は月の出がありません';
  $('sunset-difference').textContent = differenceText(rise, model.sunEvents.set);
  renderCurrentStatus();
  renderHarvest();
  renderJournal();
  drawMainMoon();
}

function scheduleRender() {
  cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(render);
}

$('date-range').addEventListener('input', (event) => {
  offset = clampOffset(event.target.value);
  scheduleRender();
});
$('date-prev').addEventListener('click', () => { offset = clampOffset(offset - 1); render(); });
$('date-next').addEventListener('click', () => { offset = clampOffset(offset + 1); render(); });
$('today-button').addEventListener('click', () => { offset = 0; render(); });

$('place-select').addEventListener('change', (event) => {
  if (event.target.value === 'geo' && state.place.id === 'geo') return;
  const place = PLACES.find(({ id }) => id === event.target.value);
  if (!place) return;
  state = setPlace(state, place);
  $('geo-status').textContent = '';
  persist();
  render();
});

$('geo-button').addEventListener('click', () => {
  const button = $('geo-button');
  if (!navigator.geolocation) {
    $('geo-status').textContent = '現在地を取得できませんでした。地点を選んでください';
    return;
  }
  button.disabled = true;
  button.textContent = '現在地を取得中…';
  $('geo-status').textContent = '';
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const place = {
        id: 'geo', label: '現在地',
        lat: Math.round(coords.latitude * 100) / 100,
        lon: Math.round(coords.longitude * 100) / 100
      };
      state = setPlace(state, place);
      fillPlaces();
      persist();
      button.disabled = false;
      button.textContent = '現在地を使う';
      render();
    },
    () => {
      $('geo-status').textContent = '現在地を取得できませんでした。地点を選んでください';
      button.disabled = false;
      button.textContent = '現在地を使う';
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
  );
});

$('seen-button').addEventListener('click', () => {
  if (offset !== 0) return;
  const result = addStamp(state, {
    date: tonightKey,
    age: Number(model.cycle.age.toFixed(1)),
    illum: Number(model.lit.fraction.toFixed(4)),
    waxing: model.cycle.waxing
  });
  if (!result.added) {
    $('seen-status').textContent = '今夜はもう記録済み';
    return;
  }
  state = result.state;
  persist();
  $('seen-status').textContent = canSave ? '今夜の月を帳に残しました' : '画面を閉じるまで帳に残します';
  renderJournal();
});

$('clear-journal').addEventListener('click', () => {
  const button = $('clear-journal');
  if (!clearArmed) {
    clearArmed = true;
    button.textContent = 'もう一度押すと消えます';
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      clearArmed = false;
      button.textContent = '帳を消す';
    }, 3000);
    return;
  }
  clearTimeout(clearTimer);
  clearArmed = false;
  state = { ...state, stamps: [] };
  if (canSave && !clear(storage).cleared) {
    canSave = false;
    renderStorageState();
  } else if (canSave) persist();
  button.textContent = '帳を消す';
  $('seen-status').textContent = '見た月帳を消しました';
  renderJournal();
});

window.addEventListener('resize', scheduleRender);

fillPlaces();
renderStorageState();
render();
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  requestAnimationFrame(() => $('moon-canvas').classList.add('is-rising'));
}
