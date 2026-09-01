const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const FEE_MARKS = { yes: '¥', no: '0', unknown: '?' };

export class ParkingMap {
  constructor(container, onMoved) {
    if (!globalThis.maplibregl) throw new Error('MapLibreを読み込めませんでした');
    this.map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [139.7671, 35.6812],
      zoom: 12,
      fadeDuration: 0,
      attributionControl: false,
    });
    this.markers = new Map();
    this.originMarker = null;
    this.suppressMove = false;
    this.map.on('moveend', () => {
      if (this.suppressMove) { this.suppressMove = false; return; }
      onMoved?.(this.getCenter());
    });
    // E2E（support.mjsのaddInitScript）が付ける印がある時だけ地図を外へ出す
    if (globalThis.__E2E__) globalThis.__parkingMap = this.map;
  }

  getCenter() {
    const center = this.map.getCenter();
    return { lat: center.lat, lng: center.lng };
  }

  moveTo(center, zoom = 15) {
    this.suppressMove = true;
    this.map.easeTo({ center: [center.lng, center.lat], zoom, duration: 0 });
  }

  showOrigin(center) {
    this.originMarker?.remove();
    const dot = document.createElement('div');
    dot.className = 'origin-marker';
    dot.setAttribute('aria-label', '検索地点');
    this.originMarker = new maplibregl.Marker({ element: dot }).setLngLat([center.lng, center.lat]).addTo(this.map);
  }

  setParkingMarkers(items, onSelect) {
    this.markers.forEach((marker) => marker.remove());
    this.markers.clear();
    items.forEach((item) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `parking-marker fee-${item.fee}`;
      element.dataset.id = item.id;
      element.textContent = FEE_MARKS[item.fee];
      element.setAttribute('aria-label', `${item.name || '名称不明の駐車場'}を選択`);
      element.addEventListener('click', (event) => { event.stopPropagation(); onSelect(item.id); });
      const marker = new maplibregl.Marker({ element }).setLngLat([item.lng, item.lat]).addTo(this.map);
      this.markers.set(item.id, marker);
    });
  }

  select(id) {
    this.markers.forEach((marker, markerId) => marker.getElement().classList.toggle('is-selected', markerId === id));
    const marker = this.markers.get(id);
    if (marker) {
      const point = marker.getLngLat();
      this.suppressMove = true;
      this.map.easeTo({ center: [point.lng, point.lat], duration: 0 });
    }
  }
}
