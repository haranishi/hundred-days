export function createMap(onPick, status) {
  const map = new maplibregl.Map({
    container: 'map', style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [137.5, 36], zoom: 4.5,
    /* 帰属の文言は足さない。タイルの TileJSON が
       「OpenFreeMap © OpenMapTiles Data from OpenStreetMap」をリンク付きで持っているので、
       自前でも指定すると同じ文が2つ並ぶ。提供元の文をそのまま出すのが正しい */
    attributionControl: { compact: false },
    locale: { 'NavigationControl.ZoomIn': '拡大', 'NavigationControl.ZoomOut': '縮小', 'Map.Title': '場所を選ぶ地図' },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  let marker;
  map.on('click', (event) => onPick({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
  map.on('error', () => { status.textContent = '地図を読み込めません。現在地ボタンからも探せます。'; });
  map.on('load', () => { status.textContent = '地図を押すと、その場所の近くの記録を探します。'; });
  return {
    select(point) {
      marker?.remove();
      marker = new maplibregl.Marker({ color: '#292d24' }).setLngLat([point.lng, point.lat]).addTo(map);
    },
    center() { const p = map.getCenter(); return { lat: p.lat, lng: p.lng }; },
  };
}
