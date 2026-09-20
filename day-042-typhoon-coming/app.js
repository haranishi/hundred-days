/* 入口。状態（loading / error / none / ready）の持ち回りと配線だけを書く。
   取得は lib/jma.js、選び方は lib/probability.js、画面は lib/render.js が持つ。 */
import { fetchAll } from './lib/jma.js';
import { createTowns } from './lib/towns.js';
import { rankTyphoons, readArea, topAreas } from './lib/probability.js';
import { drawMap } from './lib/map.js';
import { currentIndex, jst, jstNow, startsDay } from './lib/time.js';
import {
  LOAD_FAILED, LOADING, NO_TYPHOON_NOTE, renderAnswer, renderBand, renderCandidates, renderNone,
  renderOthers, renderPlace, renderTop, renderTyphoon, setMapStatus, setState, setTownShown, showMessage,
} from './lib/render.js';

const $ = (id) => document.getElementById(id);
/* 覚えるのは市区町村の7桁コードだけ。現在地の座標は保存しない */
const STORE_KEY = 'day-042:town';

let towns = null;
let land = { polygons: [] };
let report = null;   /* { fetchedAt, typhoons } */
let town = null;
let revision = 0;
let mapReady = true;
/* 取得中かどうか。取得中に街を選ばれても、古い発表で答えを出して ready に戻さないため */
let loading = false;

const remember = (code) => { try { localStorage.setItem(STORE_KEY, code); } catch { /* 保存できなくても動く */ } };
const recall = () => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } };

/** 予報円に添える時刻。「20日15時」 */
const circleLabel = (step) => {
  const wall = jst(step.validtime);
  return wall ? `${wall.day}日${wall.hour}時` : '';
};

function paintMap(forecast, home) {
  if (!mapReady) return;
  try {
    const drawn = drawMap($('map'), {
      forecast,
      land,
      home: home ? { lat: home.lat, lng: home.lng } : null,
      homeName: home?.name ?? '',
      labelOf: circleLabel,
      ratio: Math.min(window.devicePixelRatio || 1, 2),
    });
    if (!drawn) throw new Error('描けません');
    setMapStatus('破線の円は予報円（台風の中心が入る範囲）です。薄い塗りは暴風警戒域で、この中は暴風域に入るおそれがあります。');
  } catch {
    mapReady = false;
    setMapStatus('地図を表示できません。答えと帯はそのまま読めます。');
  }
}

/** いま持っている発表と、選ばれている街から画面を作り直す。通信はしない */
function show() {
  if (!report) return;
  if (!report.typhoons.length) {
    /* 「◯時◯分時点」は画面を描いた時刻ではなく、気象庁を見に行った時刻 */
    renderNone(jstNow(report.fetchedAt ?? Date.now()));
    setState('none');
    renderPlace(town ? `${town.name}（${town.pref}）` : '', town ? NO_TYPHOON_NOTE : '');
    return;
  }
  const ranked = rankTyphoons(report.typhoons, town?.area ?? null);
  const main = ranked[0].typhoon;
  setState('ready');

  renderTyphoon(main.specifications, main.target.issue);
  renderTop(topAreas(main.through, (code) => towns.areaOrder(code)).map((row) => ({
    area: towns.area(row.area) ?? { name: row.area, pref: '' },
    value: row.value,
  })));
  paintMap(main.forecast, town);

  if (!town) { setTownShown(false); renderPlace(''); return; }
  const read = readArea(main, town.area);
  if (!read) { setTownShown(false); renderPlace(`${town.name}（${town.pref}）`, 'この地域の確率は発表されていません。'); return; }

  renderPlace(`${town.name}（${town.pref}）`);
  renderAnswer({
    townName: town.name,
    read,
    areaName: towns.area(town.area)?.name ?? town.areaName,
    number: main.specifications.number,
  });
  renderBand({
    series: read.series,
    validtime: read.validtime,
    nowIndex: currentIndex(read.validtime, Date.now()),
    peakIndex: read.peak.index,
    dayStarts: read.validtime.map((at) => startsDay(at)),
  });
  /* 出し入れの順番に意味がある。setTownShown は「街を選んだ欄」をまとめて開けるので、
     ほかの台風が無いときに閉じておく renderOthers は、そのあとに呼ぶ */
  setTownShown(true);
  renderOthers(ranked.slice(1).map((row) => ({ number: row.typhoon.specifications.number, total: row.total })));
}

function pick(next, { save = true } = {}) {
  town = next;
  if (save && next) remember(next.code);
  showMessage('');
  /* 取得中は選んだことだけを覚えておく。ここで show() を呼ぶと、
     まだ古い（あるいは失敗した）発表で答えを描いて ready に戻ってしまう。
     取得が終わったときの show() が、この town を使って答えを出す */
  if (loading) { renderPlace(next ? `${next.name}（${next.pref}）` : ''); return; }
  show();
}

async function load() {
  const run = ++revision;
  loading = true;
  /* 描き直す機会なので、前回描けなかった地図もここで一度あきらめを解く */
  mapReady = true;
  setState('loading', LOADING);
  try {
    const next = await fetchAll();
    /* 代入は revision の検査を通してから。追い越された取得の結果で上書きしない */
    if (run !== revision) return;
    report = next;
    loading = false;
    show();
  } catch {
    if (run !== revision) return;
    loading = false;
    report = null;
    setState('error', LOAD_FAILED);
  }
}

function locate() {
  if (!navigator.geolocation) { showMessage('現在地を使えません。市区町村名で探せます。'); return; }
  showMessage('現在地を確認しています…');
  navigator.geolocation.getCurrentPosition((position) => {
    const found = towns?.fromPoint({ lat: position.coords.latitude, lng: position.coords.longitude });
    if (!found) { showMessage('日本の市区町村を特定できませんでした。市区町村名で探してください。'); return; }
    pick(found);
  }, (error) => {
    showMessage(error?.code === 1
      ? '現在地の利用が許可されていません。市区町村名で探せます。'
      : '現在地を取得できませんでした。市区町村名で探すか、もう一度おためしください。');
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
}

function searchTown(event) {
  event.preventDefault();
  const query = $('town-input').value.trim();
  if (!query || !towns) return;
  const found = towns.search(query);
  if (!found.length) { showMessage(`「${query}」に当たる市区町村が見つかりませんでした。市名・区名・町村名か、その読みで探してください。`); return; }
  if (found.length === 1) { pick(found[0]); return; }
  renderCandidates(found, (item) => pick(item));
}

$('locate').addEventListener('click', locate);
$('retry').addEventListener('click', load);
$('town-form').addEventListener('submit', searchTown);

/* 画面の幅が変わると投影も変わるので描き直す。連打されても1回にまとめる */
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const ranked = report?.typhoons.length ? rankTyphoons(report.typhoons, town?.area ?? null) : [];
    if (ranked.length) paintMap(ranked[0].typhoon.forecast, town);
  }, 150);
});

async function boot() {
  const [townsJson, landJson] = await Promise.all([
    fetch('./data/towns.json').then((response) => (response.ok ? response.json() : Promise.reject(new Error('towns')))),
    /* 陸が無くても海だけの地図で動く。答えを止める理由にはしない */
    fetch('./data/land.json').then((response) => (response.ok ? response.json() : null)).catch(() => null),
  ]);
  towns = createTowns(townsJson);
  if (landJson?.polygons) land = landJson;
  const saved = recall();
  if (saved) town = towns.get(saved);
  await load();
}

boot().catch(() => setState('error', LOAD_FAILED));
