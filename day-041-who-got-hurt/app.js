import { inJapan } from './lib/geo.js';
import { filesForCircle, yearSpan } from './lib/mesh.js';
import { createPackStore } from './lib/store.js';
import { clusterSpots, filterWho, hourBand, summarize, withinRadius } from './lib/query.js';
import { createMap } from './lib/map.js';
import { addressUrl, candidateStem, notFoundText, rankCandidates, readAddressResults } from './lib/address.js';
import {
  renderAnswer, renderCandidates, renderHours, renderPlaceName,
  renderSpots, renderZero, setState, showMessage,
} from './lib/render.js';

const $ = (id) => document.getElementById(id);
const store = createPackStore();
let index = null;
let indexPromise = null;
let point = null;
let revision = 0;
let controller = null;
let map = null;

const radius = () => Number(document.querySelector('input[name="radius"]:checked').value);
const who = () => document.querySelector('input[name="who"]:checked').value;

async function getIndex() {
  if (index) return index;
  indexPromise ??= fetch('./data/index.json').then((response) => {
    if (!response.ok) throw new Error('索引を取得できません');
    return response.json();
  });
  index = await indexPromise;
  return index;
}

/* 取得済みのメッシュから、いま選ばれている半径と「誰が」で数え直す。通信はしない */
function show() {
  const reach = radius();
  const codes = filesForCircle(index, point, reach);
  const picked = filterWho(withinRadius(store.records(codes), point, reach), who());
  const summary = summarize(picked);
  map?.show(point, picked, reach);
  if (!summary.total) {
    renderZero(who());
    setState('none');
    return;
  }
  renderAnswer(reach, yearSpan(index), who(), summary);
  renderSpots(clusterSpots(picked, point));
  renderHours(hourBand(picked));
  setState('ready');
}

async function load() {
  const run = ++revision;
  controller?.abort();
  controller = new AbortController();
  const active = controller;
  setState('loading', '事故の記録を読み込んでいます…');
  const timer = setTimeout(() => active.abort(), 25000);
  try {
    await getIndex();
    if (run !== revision) return;
    await store.load(filesForCircle(index, point, radius()), { signal: active.signal });
    if (run !== revision) return;
    show();
  } catch {
    if (run === revision) setState('error', '事故の記録を読み込めませんでした。通信を確認して、もう一度おためしください。');
  } finally {
    clearTimeout(timer);
  }
}

function search(next, label) {
  renderPlaceName(label);
  if (!inJapan(next)) {
    point = null;
    map?.clear();
    setState('error', '日本の範囲で場所を選んでください。');
    return;
  }
  point = next;
  map?.show(point, [], radius());
  load();
}

function locate() {
  const run = ++revision;
  controller?.abort();
  setState('loading', '現在地を確認しています…');
  if (!navigator.geolocation) {
    setState('error', '現在地の利用が許可されていません。住所か地図で場所を選べます。');
    return;
  }
  navigator.geolocation.getCurrentPosition((position) => {
    if (run === revision) search({ lat: position.coords.latitude, lng: position.coords.longitude }, '現在地');
  }, (error) => {
    if (run !== revision) return;
    setState('error', error?.code === 1
      ? '現在地の利用が許可されていません。住所か地図で場所を選べます。'
      : '現在地を取得できませんでした。住所か地図で場所を選ぶか、もう一度おためしください。');
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
}

async function searchAddress(event) {
  event.preventDefault();
  const query = $('address').value.trim();
  if (!query) return;
  showMessage('住所を探しています…');
  try {
    const response = await fetch(addressUrl(query), { signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error('住所を探せません');
    const found = readAddressResults(await response.json());
    if (found.kind === 'none') { showMessage(notFoundText(query)); return; }
    if (found.kind === 'one') {
      showMessage('');
      search({ lat: found.items[0].lat, lng: found.items[0].lng }, `選んだ場所：${found.items[0].title}`);
      return;
    }
    renderCandidates(rankCandidates(found.items, query), (item) => {
      showMessage('');
      search({ lat: item.lat, lng: item.lng }, `選んだ場所：${item.title}`);
    }, candidateStem(query));
  } catch {
    showMessage('住所を探せませんでした。通信を確認して、もう一度おためしください。');
  }
}

$('locate').addEventListener('click', locate);
$('retry').addEventListener('click', () => (point ? load() : locate()));
$('pick-center').addEventListener('click', () => map && search(map.center(), '地図で選んだ場所'));
$('address-form').addEventListener('submit', searchAddress);
/* いま必要なメッシュを全部持っているか。持っていれば通信なしで数え直せる。
   読み込みの最中に絞り込みを触られたときも、ここで弾いて取得の完了に任せる */
const held = () => Boolean(index) && filesForCircle(index, point, radius()).every((code) => store.has(code));

// 半径を広げたときだけ、まだ持っていないメッシュを足しに行く。同じ場所での取り直しはしない
$('radius-set').addEventListener('change', () => {
  if (!point) return;
  if (held()) show();
  else load();
});
$('who-set').addEventListener('change', () => { if (point && held()) show(); });

try {
  map = createMap((picked) => search(picked, '地図で選んだ場所'), $('map-status'));
} catch {
  $('map-status').textContent = '地図を表示できません。現在地か住所から探せます。';
  $('pick-center').hidden = true;
}

getIndex().catch(() => {});
