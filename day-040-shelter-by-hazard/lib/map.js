import { mapTileUrl } from './tiles.js';

export function createMap(onPick, status) {
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        gsi: {
          type: 'raster', tiles: [mapTileUrl], tileSize: 256, maxzoom: 18,
          /* 帰属はソースに持たせる。ここに書いた文がそのまま地図の上に常時出る。
             customAttribution を足すと同じ文が2つ並ぶ（Day 039の教訓） */
          attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
        },
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#e4e6e0' } },
        { id: 'gsi', type: 'raster', source: 'gsi' },
      ],
    },
    center: [137.5, 36],
    zoom: 4.5,
    attributionControl: { compact: false },
    locale: { 'NavigationControl.ZoomIn': '拡大', 'NavigationControl.ZoomOut': '縮小', 'Map.Title': '場所を選ぶ地図' },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('click', (event) => onPick({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
  map.on('error', () => { status.textContent = '地図を読み込めません。現在地か住所からも探せます。'; });
  map.on('load', () => { status.textContent = '地図を押すと、その場所の近くの避難場所を探します。'; });

  let pins = [];
  const drop = () => { for (const pin of pins) pin.remove(); pins = []; };
  const add = (spot, kind, label, mark) => {
    const node = document.createElement('div');
    node.className = 'pin';
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', label);
    const face = document.createElement('span');
    face.className = `pin-face ${kind}`;
    if (mark) face.textContent = mark;
    node.append(face);
    pins.push(new maplibregl.Marker({ element: node }).setLngLat([spot.lng, spot.lat]).addTo(map));
  };

  return {
    center() { const at = map.getCenter(); return { lat: at.lat, lng: at.lng }; },
    clear() { drop(); },
    mark(point) {
      drop();
      add(point, 'pin-self', '選んだ場所');
    },
    show(point, usable, unusable, label) {
      drop();
      add(point, 'pin-self', '選んだ場所');
      usable.forEach((place, i) => add(place, 'pin-usable', label.usable(i + 1, place), String(i + 1)));
      for (const place of unusable) add(place, 'pin-unusable', label.unusable(place));
      const box = new maplibregl.LngLatBounds([point.lng, point.lat], [point.lng, point.lat]);
      for (const place of [...usable, ...unusable]) box.extend([place.lng, place.lat]);
      map.fitBounds(box, { padding: 48, maxZoom: 16, animate: false });
    },
  };
}
