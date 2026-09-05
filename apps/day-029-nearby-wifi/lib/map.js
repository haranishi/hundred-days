const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const FEE_MARKS = { free: '無料', customers: '来店客向け', paid: '有料', unknown: '不明', estimated: '推定' };
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export class WifiMap {
  constructor(container) {
    if (!globalThis.maplibregl) throw new Error('MapLibre unavailable');
    this.status = container.closest('.map-card')?.querySelector('#map-status') || null;
    this.hasError = false;
    this.map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [137, 37.5],
      zoom: 4.2,
      fadeDuration: 0,
      attributionControl: {
        compact: true,
        customAttribution: '© OpenStreetMap contributors',
      },
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    this.map.on('load', () => { if (this.status && !this.hasError) this.status.hidden = true; });
    this.map.on('error', () => {
      if (!this.status) return;
      this.hasError = true;
      this.status.textContent = '地図を表示できません。候補リストは使えます';
      this.status.hidden = false;
    });
    this.markers = new Map();
    this.originMarker = null;
    if (globalThis.__E2E__) globalThis.__wifiMap = this.map;
  }

  moveTo(point, zoom = 15) {
    this.map.easeTo({ center: [point.lng, point.lat], zoom, duration: reducedMotion() ? 0 : 300 });
  }

  fitTo(spots, center) {
    const points = [center, ...spots].filter(Boolean);
    if (!points.length) return;
    if (points.length === 1) return this.moveTo(center, 16);
    const bounds = new maplibregl.LngLatBounds();
    for (const point of points) bounds.extend([point.lng, point.lat]);
    this.map.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: reducedMotion() ? 0 : 300 });
  }

  showOrigin(point) {
    this.originMarker?.remove();
    const dot = document.createElement('div');
    dot.className = 'origin-marker';
    dot.setAttribute('aria-label', '検索地点');
    this.originMarker = new maplibregl.Marker({ element: dot }).setLngLat([point.lng, point.lat]).addTo(this.map);
  }

  setMarkers(spots, onSelect) {
    this.markers.forEach((marker) => marker.remove());
    this.markers.clear();
    const farthestFirst = [...spots].sort((left, right) => right.distance - left.distance);
    for (const spot of farthestFirst) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'wifi-marker';
      element.dataset.fee = spot.fee;
      element.dataset.layer = spot.layer;
      element.dataset.id = spot.id;
      element.textContent = FEE_MARKS[spot.fee];
      element.setAttribute('aria-label', `${spot.name}を選択`);
      element.addEventListener('click', (event) => { event.stopPropagation(); onSelect(spot.id); });
      const marker = new maplibregl.Marker({ element }).setLngLat([spot.lng, spot.lat]).addTo(this.map);
      this.markers.set(spot.id, marker);
    }
  }

  select(id) {
    this.markers.forEach((marker, markerId) => marker.getElement().classList.toggle('is-selected', markerId === id));
    const marker = this.markers.get(id);
    if (marker) this.moveTo({ lat: marker.getLngLat().lat, lng: marker.getLngLat().lng }, this.map.getZoom());
  }
}
