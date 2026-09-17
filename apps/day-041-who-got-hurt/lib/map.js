/* 地図。事故は最大で1,700件ほど並ぶので、DOMのピンではなく
   MapLibre の記号レイヤーに載せる（絵は canvas で作って addImage で渡す）。
   形で分けるのは色覚に依存させないため。丸＝歩行者／ひし形＝自転車／小さな点＝そのほか、
   死亡事故はその外側に縁取りを足す */
import { circleRing } from './geo.js';
import { iconOf } from './query.js';

const TILE = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
const COLORS = { walker: '#0072B2', bike: '#D55E00', other: '#41443c' };
const RATIO = 2;
const BOX = 24;
const EMPTY = { type: 'FeatureCollection', features: [] };

function iconImage(shape, death) {
  const size = BOX * RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.scale(RATIO, RATIO);
  const c = BOX / 2;
  ctx.lineJoin = 'round';
  if (death) {
    ctx.beginPath();
    ctx.arc(c, c, 9.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.strokeStyle = '#16160f';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.fillStyle = COLORS[shape] ?? COLORS.other;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  if (shape === 'walker') {
    ctx.beginPath();
    ctx.arc(c, c, 5.6, 0, Math.PI * 2);
  } else if (shape === 'bike') {
    ctx.beginPath();
    ctx.moveTo(c, c - 6.6);
    ctx.lineTo(c + 6.6, c);
    ctx.lineTo(c, c + 6.6);
    ctx.lineTo(c - 6.6, c);
    ctx.closePath();
  } else {
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(c, c, 3.2, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  const pixels = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(pixels.data.buffer) };
}

const toFeatures = (records) => ({
  type: 'FeatureCollection',
  features: records.map((record) => ({
    type: 'Feature',
    properties: { icon: iconOf(record) },
    geometry: { type: 'Point', coordinates: [record.lng, record.lat] },
  })),
});

export function createMap(onPick, status) {
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        gsi: {
          type: 'raster',
          tiles: [TILE],
          tileSize: 256,
          maxzoom: 18,
          /* 帰属はソースに持たせる。ここに書いた文がそのまま地図の上に常時出る。
             customAttribution を足すと同じ文が2つ並ぶ（Day 039・040の教訓） */
          attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
        },
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#e6e6e0' } },
        { id: 'gsi', type: 'raster', source: 'gsi' },
      ],
    },
    center: [137.5, 36],
    zoom: 4.5,
    attributionControl: { compact: false },
    locale: { 'NavigationControl.ZoomIn': '拡大', 'NavigationControl.ZoomOut': '縮小', 'Map.Title': '事故の地図' },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('click', (event) => onPick({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
  map.on('error', () => { status.textContent = '地図を読み込めません。現在地か住所からも探せます。'; });

  let ready = false;
  let pending = null;
  let marker = null;

  map.on('load', () => {
    for (const shape of ['walker', 'bike', 'other']) {
      for (const death of [false, true]) {
        map.addImage(death ? `${shape}-death` : shape, iconImage(shape, death), { pixelRatio: RATIO });
      }
    }
    map.addSource('ring', { type: 'geojson', data: EMPTY });
    map.addSource('crashes', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'ring-line',
      type: 'line',
      source: 'ring',
      paint: { 'line-color': '#16160f', 'line-width': 2, 'line-dasharray': [3, 3], 'line-opacity': 0.75 },
    });
    map.addLayer({
      id: 'crashes',
      type: 'symbol',
      source: 'crashes',
      layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true },
    });
    ready = true;
    status.textContent = '地図を押すと、その場所の周りで数え直します。';
    if (pending) { const next = pending; pending = null; draw(next); }
  });

  function markSelf(point) {
    marker?.remove();
    const node = document.createElement('div');
    node.className = 'pin';
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', '選んだ場所');
    node.append(Object.assign(document.createElement('span'), { className: 'pin-face pin-self' }));
    marker = new maplibregl.Marker({ element: node }).setLngLat([point.lng, point.lat]).addTo(map);
  }

  function draw({ point, records, radiusM }) {
    markSelf(point);
    const ring = circleRing(point, radiusM);
    map.getSource('ring').setData({
      type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring },
    });
    map.getSource('crashes').setData(toFeatures(records));
    document.getElementById('map').dataset.pins = String(records.length);
    const box = new maplibregl.LngLatBounds(ring[0], ring[0]);
    for (const at of ring) box.extend(at);
    map.fitBounds(box, { padding: 28, maxZoom: 17, animate: false });
  }

  return {
    center() { const at = map.getCenter(); return { lat: at.lat, lng: at.lng }; },
    clear() {
      marker?.remove();
      marker = null;
      pending = null;
      document.getElementById('map').dataset.pins = '0';
      if (ready) {
        map.getSource('ring').setData(EMPTY);
        map.getSource('crashes').setData(EMPTY);
      }
    },
    show(point, records, radiusM) {
      if (ready) draw({ point, records, radiusM });
      else pending = { point, records, radiusM };
    },
  };
}
