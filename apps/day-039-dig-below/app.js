import { findRecords, getJSON } from './lib/pbdb.js';
import { inJapan } from './lib/geo.js';
import { layersFor } from './lib/geology.js';
import { renderColumn } from './lib/column.js';
import { createMap } from './lib/map.js';
import { answerFor, setState } from './lib/ui.js';
const $ = (id) => document.getElementById(id);
let selected, controller, revision = 0, map;
let tablesPromise;
function loadTables(signal) {
  if (!tablesPromise) tablesPromise = Promise.all(['geo-time', 'taxa-ja', 'env-ja'].map((name) =>
    getJSON(`./data/${name}.json`, { signal: signal || AbortSignal.timeout(25000) }))).then(([time, taxa, env]) => ({ time, taxa, env }))
    .catch((error) => { tablesPromise = null; throw error; });
  return tablesPromise;
}
async function search(point) {
  const run = ++revision;
  controller?.abort();
  controller = new AbortController();
  selected = point;
  if (!inJapan(point)) {
    setState('error', '日本の範囲で場所を選んでください。');
    return;
  }
  map?.select(point);
  setState('loading', '近くで見つかった化石の記録を探しています…');
  const activeController = controller;
  const timeout = setTimeout(() => activeController.abort(), 25000);
  try {
    // 辞書は地点に依存しないため、地点変更時も同じ読み込みを使う。
    const [data, tables] = await Promise.all([findRecords(point, { signal: controller.signal }), loadTables()]);
    if (run !== revision) return;
    if (!data.collections.length) { setState('none'); return; }
    const layers = layersFor(data.collections, data.occurrences, tables.time);
    $('answer-text').textContent = answerFor(data.collections[0], tables.env);
    $('column-count').textContent = `${data.collections.length}産地の記録を、${layers.length}層にまとめました`;
    $('truncated').hidden = !data.truncated;
    renderColumn($('column'), layers, tables);
    setState('ready');
  } catch {
    if (run === revision) setState('error', '記録を取得できませんでした。通信を確認して、もう一度おためしください。');
  } finally { clearTimeout(timeout); }
}
function locate() {
  const run = ++revision;
  controller?.abort();
  setState('loading', '現在地を確認しています…');
  if (!navigator.geolocation) { setState('error', 'この端末では現在地を取得できません。地図で場所を選んでください。'); return; }
  navigator.geolocation.getCurrentPosition((position) => {
    if (run === revision) search({ lat: position.coords.latitude, lng: position.coords.longitude });
  }, (error) => {
    if (run !== revision) return;
    setState('error', error.code === 1 ? '現在地の利用が許可されていません。地図で場所を選べます。'
      : '現在地を取得できませんでした。地図で場所を選ぶか、もう一度おためしください。');
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
}
$('locate').addEventListener('click', locate);
$('retry').addEventListener('click', () => selected ? search(selected) : locate());
$('pick-center').addEventListener('click', () => map && search(map.center()));
try { map = createMap(search, $('map-status')); }
catch {
  $('map-status').textContent = '地図を表示できません。現在地ボタンから探せます。';
  $('pick-center').hidden = true;
}
