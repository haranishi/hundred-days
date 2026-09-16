import { HAZARDS, createTileStore, tileUrl, tilesNear } from './lib/tiles.js';
import { inJapan } from './lib/geo.js';
import { mergeTiles, rankPlaces } from './lib/rank.js';
import { addressUrl, candidateStem, notFoundText, rankCandidates, readAddressResults } from './lib/address.js';
import { createMap } from './lib/map.js';
import { issuedText, setState, unusablePinLabel, usablePinLabel } from './lib/ui.js';
import {
  renderAnswer, renderCandidates, renderHazardCounts, renderNoSites,
  renderPlaceName, renderUnusable, renderUsable, showMessage,
} from './lib/render.js';

const $ = (id) => document.getElementById(id);
const store = createTileStore();
let point = null;
let revision = 0;
let controller = null;
let map = null;

const hazard = () => Number(document.querySelector('input[name="hazard"]:checked').value);
// 選んだ災害だけ隣の区画まで見る。残り7種類は真ん中の区画だけ（通信量が4倍になるのを避ける）
const urlsFor = (at, chosen) => {
  const near = tilesNear(at);
  return HAZARDS.flatMap((h) => (h.id === chosen ? near : [near[0]]).map((tile) => tileUrl(h.id, tile)));
};

function show() {
  const chosen = hazard();
  const near = tilesNear(point);
  const entries = HAZARDS.map((h) => ({
    hazard: h.id,
    features: (h.id === chosen ? near : [near[0]]).flatMap((tile) => store.get(tileUrl(h.id, tile))?.features ?? []),
  }));
  // ラベルに添える件数は、どの種類も同じ条件で数えたいので真ん中の区画だけを見る
  renderHazardCounts(Object.fromEntries(HAZARDS.map((h) => [h.id, store.get(tileUrl(h.id, near[0]))?.features.length ?? 0])));
  $('data-date').textContent = issuedText(store.get(tileUrl(chosen, near[0]))?.issued ?? '');
  const result = rankPlaces(mergeTiles(entries), point, chosen);
  if (!result.usable.length) {
    renderNoSites(chosen);
    map?.mark(point);
    setState('none');
    return;
  }
  renderAnswer(chosen, result);
  renderUsable(chosen, result.usable);
  renderUnusable(chosen, result);
  map?.show(point, result.usable, result.unusable, {
    usable: (rank, place) => usablePinLabel(rank, place, chosen),
    unusable: (place) => unusablePinLabel(place, chosen),
  });
  setState('ready');
}

async function load() {
  const run = ++revision;
  controller?.abort();
  controller = new AbortController();
  const active = controller;
  setState('loading', '国土地理院の避難場所データを読み込んでいます…');
  const timer = setTimeout(() => active.abort(), 25000);
  try {
    await store.load(urlsFor(point, hazard()), { signal: active.signal });
    if (run !== revision) return;
    show();
  } catch {
    if (run === revision) setState('error', '避難場所データを取得できませんでした。通信を確認して、もう一度おためしください。');
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
  map?.mark(point);
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
$('hazards').addEventListener('change', () => {
  if (!point) return;
  // 取得済みの応答から組み直す。隣の区画がまだ無いときだけ、そこで取りに行く
  const urls = urlsFor(point, hazard());
  if (urls.every((url) => store.get(url))) show();
  else load();
});

try {
  map = createMap((picked) => search(picked, '地図で選んだ場所'), $('map-status'));
} catch {
  $('map-status').textContent = '地図を表示できません。現在地か住所から探せます。';
  $('pick-center').hidden = true;
}
