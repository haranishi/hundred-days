const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const SOURCE_ID = 'cameras';
const WINDY_SOURCE_ID = 'windy-cameras';
/* 点を色だけで見分けさせると、リンク（灰）が暗い地図に沈んで見えない。色・形・記号の三重で描く。
   直径22px・縁取り2px。値は CSS の --video/--image/--page/--windy と揃える（page だけは
   暗い地図でも浮くよう CSS より明るい灰にする）。 */
const PIN_SIZE = 22;
const PIN_EDGE = '#07111b';
const PINS = {
  'pin-video': { fill: '#ff6577', mark: 'play' },
  'pin-image': { fill: '#ffd166', mark: 'frame' },
  'pin-page': { fill: '#cbd5e1', mark: 'arrow' },
  'pin-windy': { fill: '#5cc8ff', mark: 'ring' },
};
const PIN_ICON = ['match', ['get', 'kind'], 'yt', 'pin-video', 'hls', 'pin-video', 'img', 'pin-image', 'windy', 'pin-windy', 'pin-page'];
/* 選択中の点は他より大きくする（円のときの「半径10 対 6」と同じ差）。 */
const iconSize = (selectedId) => ['case', ['==', ['get', 'id'], selectedId], 1.35, 1];
/* 選択中の1点だけ。クラスタには id が無いので、まとまっている点は当たらない。 */
const selectedOnly = (selectedId) => ['==', ['get', 'id'], selectedId];
/* パネルを開いた側にある点は「大きい絵」だけでは見つけにくい。下に薄い輪を敷いて、
   周りの点と違うものが1つあることを離れていても分かるようにする。 */
const RING_LAYERS = { 'camera-selected': SOURCE_ID, 'windy-selected': WINDY_SOURCE_ID };
const ACCENT = { dark: '#70d2ff', light: '#006da0' };
/* クラスタの円。ライトの地図は明るく、紺の塗りだと「どこかの窓を開く」（主ボタン）と同じ見た目になって
   押せるボタンに見えていた。ライトは白地＋青の縁＋濃い数字にする。 */
const CLUSTER = {
  dark: { fill: '#294c66', stroke: '#8cddff', text: '#ffffff' },
  light: { fill: '#ffffff', stroke: '#006da0', text: '#0b3a55' },
};

/* MapLibre の addImage へ渡す ImageData を canvas で描く。ratio 2 で描いて pixelRatio 2 を申告すると、
   高解像度の画面でも縁がぼやけない。 */
function drawPin({ fill, mark }, ratio = 2) {
  const size = PIN_SIZE * ratio;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  const center = size / 2;
  context.beginPath();
  context.arc(center, center, center - ratio, 0, Math.PI * 2);
  context.fillStyle = fill; context.fill();
  context.lineWidth = 2 * ratio; context.strokeStyle = PIN_EDGE; context.stroke();
  context.lineCap = 'round'; context.lineJoin = 'round';
  const unit = size / 22;
  if (mark === 'play') {
    context.beginPath();
    context.moveTo(center - 3 * unit, center - 4.5 * unit);
    context.lineTo(center + 5 * unit, center);
    context.lineTo(center - 3 * unit, center + 4.5 * unit);
    context.closePath();
    context.fillStyle = '#ffffff'; context.fill();
  } else if (mark === 'frame') {
    context.fillStyle = '#ffffff';
    context.fillRect(center - 4 * unit, center - 4 * unit, 8 * unit, 8 * unit);
    context.fillStyle = fill;
    context.fillRect(center - 2 * unit, center - 2 * unit, 4 * unit, 4 * unit);
  } else if (mark === 'arrow') {
    context.strokeStyle = '#0f1720'; context.lineWidth = 2 * unit;
    context.beginPath();
    context.moveTo(center - 4 * unit, center + 4 * unit);
    context.lineTo(center + 4 * unit, center - 4 * unit);
    context.moveTo(center - 0.5 * unit, center - 4 * unit);
    context.lineTo(center + 4 * unit, center - 4 * unit);
    context.lineTo(center + 4 * unit, center + 0.5 * unit);
    context.stroke();
  } else {
    context.strokeStyle = '#ffffff'; context.lineWidth = 1.8 * unit;
    context.beginPath(); context.arc(center, center, 4.5 * unit, 0, Math.PI * 2); context.stroke();
    context.beginPath(); context.arc(center, center, 1.6 * unit, 0, Math.PI * 2);
    context.fillStyle = '#ffffff'; context.fill();
  }
  return { data: context.getImageData(0, 0, size, size), ratio };
}

const featureCollection = (cameras) => ({
  type: 'FeatureCollection',
  features: cameras.map((camera) => ({
    type: 'Feature', id: camera.id,
    geometry: { type: 'Point', coordinates: [camera.lon, camera.lat] },
    properties: { id: camera.id, kind: camera.kind, name: camera.name || '' },
  })),
});

const windyCollection = (cameras) => ({
  type: 'FeatureCollection',
  features: cameras.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon)).map((item) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
    properties: { id: String(item.id), kind: 'windy', name: item.title || '' },
  })),
});

export class CameraMap {
  constructor(container, options = {}) {
    if (!globalThis.maplibregl) throw new Error('MapLibreを読み込めませんでした');
    this.cameras = [];
    this.windyCameras = [];
    this.selectedId = '';
    this.dark = options.dark !== false;
    /* 地図の余白を測る相手（一覧・詳細のパネル）。同じ画面の相方なので参照だけ受け取る。 */
    this.panelElement = options.panel || null;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.callbacks = options;
    this.map = new maplibregl.Map({
      container, style: options.dark ? DARK_STYLE : LIGHT_STYLE,
      center: options.view?.center || [15, 25], zoom: options.view?.zoom ?? 1.4,
      attributionControl: false, fadeDuration: this.reducedMotion ? 0 : 300,
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    /* 属性表示は右下だと「現在地」ボタンの下に潜って読めなくなる。左下へ出し、
       パネルに隠れないよう位置は app.css 側で寄せる（表示は常時＝ODbLの条件）。 */
    this.map.addControl(new maplibregl.AttributionControl({
      compact: false,
      customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors (ODbL)</a> · <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>',
    }), 'bottom-left');
    this.map.on('load', () => { this.installLayers(); options.onReady?.(); });
    this.map.on('moveend', () => options.onMove?.(this.view()));
    this.map.on('idle', () => options.onIdle?.());
    if (globalThis.__E2E__) globalThis.__cameraMap = this.map;
  }

  /* スタイルを差し替える（テーマ切替）と登録した画像も消える。層を入れ直すこの場所で毎回登録し直す。 */
  installIcons() {
    for (const [id, pin] of Object.entries(PINS)) {
      if (this.map.hasImage(id)) continue;
      const { data, ratio } = drawPin(pin);
      this.map.addImage(id, data, { pixelRatio: ratio });
    }
  }

  installLayers() {
    this.installIcons();
    if (!this.map.getSource(SOURCE_ID)) this.map.addSource(SOURCE_ID, { type: 'geojson', data: featureCollection(this.cameras), cluster: true, clusterRadius: 60, clusterMaxZoom: 11 });
    if (!this.map.getSource(WINDY_SOURCE_ID)) this.map.addSource(WINDY_SOURCE_ID, { type: 'geojson', data: windyCollection(this.windyCameras) });
    const accent=ACCENT[this.dark?'dark':'light'];const cluster=CLUSTER[this.dark?'dark':'light'];
    for(const [id,source] of Object.entries(RING_LAYERS)) this.map.addLayer({ id,type:'circle',source,filter:selectedOnly(this.selectedId),paint:{
      'circle-radius':18,'circle-color':accent,'circle-opacity':.35,'circle-stroke-color':accent,'circle-stroke-width':2,'circle-stroke-opacity':.8,
    } });
    this.map.addLayer({ id:'camera-clusters',type:'circle',source:SOURCE_ID,filter:['has','point_count'],paint:{'circle-color':cluster.fill,'circle-radius':['step',['get','point_count'],18,100,23,1000,29],'circle-stroke-color':cluster.stroke,'circle-stroke-width':2} });
    // text-font を省くと MapLibre 既定の Open Sans を要求し、OpenFreeMap に無いので 404 警告が出る。両スタイル共通の Noto Sans を使う
    this.map.addLayer({ id:'camera-cluster-count',type:'symbol',source:SOURCE_ID,filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-size':12,'text-font':['Noto Sans Regular']},paint:{'text-color':cluster.text} });
    /* 単独の点はアイコン。重なっても間引かせない（allow-overlap）＝どの点も必ず押せる。 */
    this.map.addLayer({ id:'camera-points',type:'symbol',source:SOURCE_ID,filter:['!', ['has','point_count']],layout:{
      'icon-image':PIN_ICON,'icon-allow-overlap':true,'icon-ignore-placement':true,'icon-size':iconSize(this.selectedId),
    } });
    this.map.addLayer({ id:'windy-points',type:'symbol',source:WINDY_SOURCE_ID,layout:{
      'icon-image':'pin-windy','icon-allow-overlap':true,'icon-ignore-placement':true,'icon-size':iconSize(this.selectedId),
    } });
    this.bindLayerEvents();
    /* 層まで入って初めて地図は使える。isStyleLoaded() はテストが Math.random を差し替えると
       永久に false のままになるので、待ち合わせの目印はDOM側に出す（E2Eとデモ収録が使う）。 */
    this.map.getContainer().setAttribute('data-ready', 'true');
  }

  bindLayerEvents() {
    this.map.on('click', 'camera-clusters', async (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      try {
        const zoom = await this.map.getSource(SOURCE_ID)?.getClusterExpansionZoom(feature.properties.cluster_id);
        /* 展開ズームだけに従うと1段ずつしか寄らず、世界地図から点に届くまで10回押すことになる。
           押した手応えが出るよう、最低でも2.5段は寄せる。 */
        const target = Math.max(Number.isFinite(zoom) ? zoom : 0, this.map.getZoom() + 2.5);
        this.move(feature.geometry.coordinates, Math.min(target, this.map.getMaxZoom()), false);
      } catch { /* 地図データが更新された瞬間の古いcluster idは何もしない。 */ }
    });
    this.map.on('click', 'camera-points', (event) => this.callbacks.onSelect?.(event.features?.[0]?.properties?.id, event.originalEvent?.target));
    this.map.on('click', 'windy-points', (event) => this.callbacks.onWindySelect?.(event.features?.[0]?.properties?.id, event.originalEvent?.target));
    for (const layer of ['camera-clusters','camera-points','windy-points']) {
      this.map.on('mouseenter', layer, () => { this.map.getCanvas().style.cursor = 'pointer'; });
      this.map.on('mouseleave', layer, () => { this.map.getCanvas().style.cursor = ''; });
    }
  }

  setTheme(dark) {
    this.dark = dark;
    this.map.getContainer().removeAttribute('data-ready');
    this.map.setStyle(dark ? DARK_STYLE : LIGHT_STYLE);
    this.map.once('style.load', () => this.installLayers());
  }
  setCameras(cameras) { this.cameras = cameras; this.map.getSource(SOURCE_ID)?.setData(featureCollection(cameras)); }
  setWindy(cameras) { this.windyCameras = cameras; this.map.getSource(WINDY_SOURCE_ID)?.setData(windyCollection(cameras)); }
  select(id) {
    this.selectedId = String(id || '');
    for (const layer of ['camera-points','windy-points']) {
      if (this.map.getLayer(layer)) this.map.setLayoutProperty(layer,'icon-size',iconSize(this.selectedId));
    }
    for (const layer of Object.keys(RING_LAYERS)) {
      if (this.map.getLayer(layer)) this.map.setFilter(layer,selectedOnly(this.selectedId));
    }
  }

  /* 地図の中心は画面の中心。パネルは左（PC）か下（スマホ）を覆っているので、そのまま寄せると
     選んだカメラがパネルの縁に貼りつく。覆われている幅・高さを padding として渡し、
     「見えている側」の真ん中へ置く。寄せすぎて見える帯が無くならないよう7割で止める。 */
  padding() {
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    const panel = this.panelElement;
    if (!panel || panel.hidden) return none;
    const stage = this.map.getContainer().getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    if (!box.width || !box.height || !stage.width) return none;
    const limit = (value, size) => Math.max(0, Math.min(Math.round(value), Math.round(size * 0.7)));
    /* 画面幅いっぱいのパネル＝スマホの下シート。それ以外は地図の左に並ぶ列。 */
    return box.width >= stage.width - 4
      ? { ...none, bottom: limit(stage.bottom - box.top, stage.height) }
      : { ...none, left: limit(box.right + 24 - stage.left, stage.width) };
  }

  move(center, zoom, dramatic = true) {
    const options = { center, zoom, padding: this.padding() };
    if (this.reducedMotion) this.map.jumpTo(options);
    else if (dramatic) this.map.flyTo({ ...options, duration: 850, essential: false });
    else this.map.easeTo({ ...options, duration: 450, essential: false });
  }
  view() { const center=this.map.getCenter(); return { center:{lng:center.lng,lat:center.lat},zoom:this.map.getZoom() }; }
  bounds() { const b=this.map.getBounds(); return { north:b.getNorth(),east:b.getEast(),south:b.getSouth(),west:b.getWest() }; }
}
